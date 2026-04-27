import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  closeCallHistoryEntry,
  getPreJoinMediaState,
  getPreferredMediaConstraints,
  upsertCallHistoryEntry,
} from '../utils/meetingUtils';
import { buildWebSocketUrl, getIceServerConfig } from '../utils/api';
import { getCurrentUser } from '../utils/currentUser';

const ICE_SERVERS = getIceServerConfig();

function getStableClientId(roomId) {
  const storageKey = `meeting_client_${roomId}`;
  const existingId = sessionStorage.getItem(storageKey);
  if (existingId) return existingId;
  const nextId = crypto.randomUUID();
  sessionStorage.setItem(storageKey, nextId);
  return nextId;
}

function getDisplayName(roomId, isHost) {
  const currentUser = getCurrentUser();
  const storageKey = `meeting_name_${roomId}`;
  const existingName = sessionStorage.getItem(storageKey);
  if (existingName) return existingName;
  const generatedName = currentUser?.name || (isHost ? 'Host' : `Participant ${getStableClientId(roomId).slice(-4).toUpperCase()}`);
  sessionStorage.setItem(storageKey, generatedName);
  return generatedName;
}

export function useWebRTC(roomId, options = {}) {
  const { acquireMedia = true, autoJoin = true, initialRole } = options;

  // Optimized States - Only things that MUST trigger re-renders
  const [remoteStreams, setRemoteStreams] = useState({});
  const [messages, setMessages] = useState([]);
  const [participantsMetadata, setParticipantsMetadata] = useState({});
  const [activeJoinRequests, setActiveJoinRequests] = useState([]);
  const [mediaError, setMediaError] = useState(null);
  
  // Internal UI State (Tracked locally to avoid global ripple)
  const [isAudioEnabled, setIsAudioEnabled] = useState(() => getPreJoinMediaState(roomId).audioEnabled);
  const [isVideoEnabled, setIsVideoEnabled] = useState(() => getPreJoinMediaState(roomId).videoEnabled);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);

  // Production Refs - Essential for keeping media and peer logic off the render cycle
  const localStreamRef = useRef(null);
  const peerConnections = useRef({});
  const ws = useRef(null);
  const clientId = useRef(getStableClientId(roomId));
  const joinedRoomRef = useRef(false);
  const activeSessionIdsRef = useRef({});
  const pendingIceCandidatesRef = useRef({});
  const isHost = useRef(false);
  const [isHostState, setIsHostState] = useState(false);

  // Optimization: Metadata Batching
  const metadataQueue = useRef({});
  const metadataTimer = useRef(null);

  const processMetadataBatch = useCallback(() => {
    if (Object.keys(metadataQueue.current).length === 0) return;
    setParticipantsMetadata(prev => ({
      ...prev,
      ...metadataQueue.current
    }));
    metadataQueue.current = {};
  }, []);

  const queueMetadataUpdate = useCallback((peerId, data) => {
    metadataQueue.current[peerId] = {
      ...(metadataQueue.current[peerId] || {}), // Check current queue first
      ...data
    };
    if (metadataTimer.current) clearTimeout(metadataTimer.current);
    metadataTimer.current = setTimeout(processMetadataBatch, 100); // Batch updates every 100ms
  }, [processMetadataBatch]);

  const sendSignalingMessage = useCallback((msg) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg));
    }
  }, []);

  const syncParticipantState = useCallback((extra = {}) => {
    if (!joinedRoomRef.current) return;
    sendSignalingMessage({
      type: 'participant-update',
      name: getDisplayName(roomId, isHost.current),
      picture: getCurrentUser()?.picture || null,
      role: isHost.current ? 'host' : 'participant',
      isHandRaised,
      isSharingScreen,
      isAudioEnabled,
      isVideoEnabled,
      ...extra,
    });
  }, [isAudioEnabled, isHandRaised, isSharingScreen, isVideoEnabled, roomId, sendSignalingMessage]);

  // Track-based toggling (Production requirement)
  const toggleVideo = useCallback(() => {
    const next = !isVideoEnabled;
    setIsVideoEnabled(next);
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => t.enabled = next);
    }
    syncParticipantState({ isVideoEnabled: next });
  }, [isVideoEnabled, syncParticipantState]);

  const toggleAudio = useCallback(() => {
    const next = !isAudioEnabled;
    setIsAudioEnabled(next);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => t.enabled = next);
    }
    syncParticipantState({ isAudioEnabled: next });
  }, [isAudioEnabled, syncParticipantState]);

  const toggleRaiseHand = useCallback(() => {
    const next = !isHandRaised;
    setIsHandRaised(next);
    syncParticipantState({ isHandRaised: next });
  }, [isHandRaised, syncParticipantState]);

  const createPeerConnection = useCallback((peerId) => {
    if (peerConnections.current[peerId]) return peerConnections.current[peerId];

    const pc = new RTCPeerConnection(ICE_SERVERS);
    
    // Add local tracks if available
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignalingMessage({ type: 'ice-candidate', target: peerId, candidate: e.candidate });
    };

    pc.ontrack = (e) => {
      setRemoteStreams(prev => ({
        ...prev,
        [peerId]: e.streams[0]
      }));
    };

    peerConnections.current[peerId] = pc;
    return pc;
  }, [sendSignalingMessage]);

  const handleSignalingData = useCallback(async (data) => {
    const { type, sender } = data;
    const peerId = sender || data.client_id;
    if (peerId === clientId.current) return;

    switch (type) {
      case 'user-joined': {
        const pc = createPeerConnection(peerId);
        queueMetadataUpdate(peerId, { ...data, role: data.role || 'participant' });
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignalingMessage({ type: 'offer', target: peerId, offer });
        break;
      }
      case 'offer': {
        const pc = createPeerConnection(peerId);
        queueMetadataUpdate(peerId, { ...data });
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignalingMessage({ type: 'answer', target: peerId, answer });
        break;
      }
      case 'answer': {
        const pc = peerConnections.current[peerId];
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        break;
      }
      case 'ice-candidate': {
        const pc = peerConnections.current[peerId];
        if (pc) await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        break;
      }
      case 'participant-update':
        queueMetadataUpdate(peerId, data);
        break;
      case 'chat':
        setMessages(prev => [...prev, { sender: data.sender, text: data.text }]);
        break;
      case 'user-left':
        if (peerConnections.current[peerId]) {
          peerConnections.current[peerId].close();
          delete peerConnections.current[peerId];
        }
        setRemoteStreams(prev => {
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
        setParticipantsMetadata(prev => {
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
        break;
      case 'join-request':
        setActiveJoinRequests(prev => [...prev, { id: peerId, name: data.name }]);
        break;
      default: break;
    }
  }, [createPeerConnection, queueMetadataUpdate, sendSignalingMessage]);

  useEffect(() => {
    let isMounted = true;
    const start = async () => {
      try {
        if (acquireMedia && !localStreamRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia(getPreferredMediaConstraints());
          localStreamRef.current = stream;
          stream.getAudioTracks().forEach(t => t.enabled = isAudioEnabled);
          stream.getVideoTracks().forEach(t => t.enabled = isVideoEnabled);
        }

        ws.current = new WebSocket(buildWebSocketUrl(`/ws/${roomId}/${clientId.current}`));
        ws.current.onmessage = (e) => handleSignalingData(JSON.parse(e.data));
        ws.current.onopen = () => {
          if (autoJoin) {
            joinedRoomRef.current = true;
            sendSignalingMessage({ type: 'join-room', name: getDisplayName(roomId, isHost.current), isAudioEnabled, isVideoEnabled });
          }
        };
      } catch (err) {
        if (isMounted) setMediaError(err.name);
      }
    };
    start();
    return () => {
      isMounted = false;
      if (ws.current) ws.current.close();
      Object.values(peerConnections.current).forEach(pc => pc.close());
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      if (metadataTimer.current) clearTimeout(metadataTimer.current);
    };
  }, [acquireMedia, autoJoin, handleSignalingData, isAudioEnabled, isVideoEnabled, roomId, sendSignalingMessage]);

  const sendChatMessage = useCallback((text) => {
    sendSignalingMessage({ type: 'chat', text });
    setMessages(prev => [...prev, { sender: 'Me', text }]);
  }, [sendSignalingMessage]);

  const admitParticipant = useCallback((participantId) => {
    sendSignalingMessage({ type: 'accept_user', target: participantId });
    setActiveJoinRequests(prev => prev.filter(r => r.id !== participantId));
  }, [sendSignalingMessage]);

  const denyParticipant = useCallback((participantId) => {
    sendSignalingMessage({ type: 'deny', target: participantId });
    setActiveJoinRequests(prev => prev.filter(r => r.id !== participantId));
  }, [sendSignalingMessage]);

  const value = useMemo(() => ({
    localStream: localStreamRef.current,
    remoteStreams,
    messages,
    participantsMetadata,
    isSharingScreen,
    isHandRaised,
    isAudioEnabled,
    isVideoEnabled,
    toggleVideo,
    toggleAudio,
    toggleRaiseHand,
    sendChatMessage,
    admitParticipant,
    denyParticipant,
    activeJoinRequests,
    isHost: isHostState,
    mediaError,
    localClientId: clientId.current,
    getPeerConnection: (id) => peerConnections.current[id]
  }), [remoteStreams, messages, participantsMetadata, isSharingScreen, isHandRaised, isAudioEnabled, isVideoEnabled, toggleVideo, toggleAudio, toggleRaiseHand, sendChatMessage, admitParticipant, denyParticipant, activeJoinRequests, isHostState, mediaError]);

  return value;
}
