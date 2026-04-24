import { useState, useEffect, useRef, useCallback } from 'react';
import {
  clearPreJoinStream,
  closeCallHistoryEntry,
  consumePreJoinStream,
  getPreJoinMediaState,
  getPreferredMediaConstraints,
  savePreJoinMediaState,
  upsertCallHistoryEntry,
} from '../utils/meetingUtils';
import { buildWebSocketUrl, getIceServerConfig } from '../utils/api';
import { getCurrentUser } from '../utils/currentUser';

const ICE_SERVERS = getIceServerConfig();

function getStableClientId(roomId) {
  const storageKey = `meeting_client_${roomId}`;
  const existingId = sessionStorage.getItem(storageKey);

  if (existingId) {
    return existingId;
  }

  const nextId = crypto.randomUUID();
  sessionStorage.setItem(storageKey, nextId);
  return nextId;
}

function getDisplayName(roomId, isHost) {
  const currentUser = getCurrentUser();
  const storageKey = `meeting_name_${roomId}`;
  const existingName = sessionStorage.getItem(storageKey);

  if (existingName) {
    return existingName;
  }

  const generatedName = currentUser?.name || (isHost ? 'Host' : `Participant ${getStableClientId(roomId).slice(-4).toUpperCase()}`);
  sessionStorage.setItem(storageKey, generatedName);
  return generatedName;
}

export function useWebRTC(roomId, options = {}) {
  const {
    acquireMedia = true,
    autoJoin = true,
    initialRole,
  } = options;

  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [messages, setMessages] = useState([]);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [participantsMetadata, setParticipantsMetadata] = useState({});
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [mediaError, setMediaError] = useState(null);
  const [activeJoinRequests, setActiveJoinRequests] = useState([]);
  const initialMediaState = useRef(getPreJoinMediaState(roomId));
  const [isAudioEnabled, setIsAudioEnabled] = useState(initialMediaState.current.audioEnabled);
  const [isVideoEnabled, setIsVideoEnabled] = useState(initialMediaState.current.videoEnabled);
  const normalizedCurrentEmail = (getCurrentUser()?.email || '').trim().toLowerCase();
  const storedHostEmail = (localStorage.getItem(`meeting_host_${roomId}`) || '').trim().toLowerCase();
  const hasStoredHostAccess = Boolean(
    normalizedCurrentEmail &&
    storedHostEmail &&
    storedHostEmail === normalizedCurrentEmail
  );

  const computeIsHost = useCallback(() => (
    initialRole === 'host' ||
    (
      initialRole !== 'participant' &&
      sessionStorage.getItem(`meeting_role_${roomId}`) === 'host'
    ) ||
    (
      initialRole !== 'participant' &&
      !sessionStorage.getItem(`meeting_role_${roomId}`) &&
      hasStoredHostAccess
    )
  ), [hasStoredHostAccess, initialRole, roomId]);
  const [isHostState, setIsHostState] = useState(() => computeIsHost());
  const isHost = useRef(isHostState);
  const clientId = useRef(getStableClientId(roomId));
  const displayName = useRef(getDisplayName(roomId, isHostState));
  const currentUser = useRef(getCurrentUser());
  const ws = useRef(null);
  const peerConnections = useRef({});
  const originalStream = useRef(null);
  const localStreamRef = useRef(null);
  const activeStreamsRef = useRef([]);
  const joinedRoomRef = useRef(false);
  const activeSessionIdsRef = useRef({});
  const pendingIceCandidatesRef = useRef({});
  const joinRoomCallbackRef = useRef(null);
  const handleSignalingDataRef = useRef(null);
  const pendingMessagesRef = useRef([]);

  const addMessage = useCallback((msg) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const getSessionId = useCallback((participantId) => activeSessionIdsRef.current[participantId], []);

  const startSessionTracking = useCallback((participantId, name, role = 'participant') => {
    if (activeSessionIdsRef.current[participantId]) {
      return;
    }

    const sessionId = `${roomId}-${participantId}-${Date.now()}`;
    activeSessionIdsRef.current[participantId] = sessionId;

    upsertCallHistoryEntry({
      sessionId,
      roomId,
      participantId,
      name,
      role,
      entryTime: new Date().toISOString(),
    });
  }, [roomId]);

  const endSessionTracking = useCallback((participantId) => {
    const sessionId = getSessionId(participantId);

    if (!sessionId) {
      return;
    }

    closeCallHistoryEntry(sessionId);
    delete activeSessionIdsRef.current[participantId];
  }, [getSessionId]);

  const sendSignalingMessage = useCallback((msg) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg));
      return;
    }

    pendingMessagesRef.current.push(msg);
  }, []);

  const cleanupPeerConnection = useCallback((peerId) => {
    const existingConnection = peerConnections.current[peerId];
    if (existingConnection) {
      existingConnection.onicecandidate = null;
      existingConnection.ontrack = null;
      existingConnection.onconnectionstatechange = null;
      existingConnection.oniceconnectionstatechange = null;
      existingConnection.close();
      delete peerConnections.current[peerId];
    }

    delete pendingIceCandidatesRef.current[peerId];

    setRemoteStreams((prev) => {
      if (!prev[peerId]) {
        return prev;
      }

      const nextStreams = { ...prev };
      delete nextStreams[peerId];
      return nextStreams;
    });
  }, []);

  const syncParticipantState = useCallback((extraState = {}) => {
    if (!joinedRoomRef.current) {
      return;
    }

    sendSignalingMessage({
      type: 'participant-update',
      name: displayName.current,
      picture: currentUser.current?.picture || null,
      role: isHost.current ? 'host' : 'participant',
      isHandRaised,
      isSharingScreen,
      isAudioEnabled,
      isVideoEnabled,
      ...extraState,
    });
  }, [isAudioEnabled, isHandRaised, isSharingScreen, isVideoEnabled, sendSignalingMessage]);

  const joinRoom = useCallback(() => {
    if (joinedRoomRef.current || !ws.current || ws.current.readyState !== WebSocket.OPEN) {
      return;
    }

    joinedRoomRef.current = true;
    sessionStorage.setItem(`meeting_admitted_${roomId}`, 'true');

    setParticipantsMetadata((prev) => ({
      ...prev,
      [clientId.current]: {
        ...prev[clientId.current],
        name: displayName.current,
        picture: currentUser.current?.picture || null,
        role: isHost.current ? 'host' : 'participant',
        isHandRaised: false,
        isSharingScreen: false,
        isAudioEnabled,
        isVideoEnabled,
      },
    }));

    startSessionTracking(clientId.current, displayName.current, isHost.current ? 'host' : 'participant');

    sendSignalingMessage({
      type: 'join-room',
      user_id: currentUser.current?.meetingUserId || clientId.current,
      firebase_uid: currentUser.current?.firebaseUid || null,
      email: currentUser.current?.email || null,
      name: displayName.current,
      picture: currentUser.current?.picture || null,
      role: isHost.current ? 'host' : 'participant',
      joined_at: new Date().toISOString(),
      isAudioEnabled,
      isVideoEnabled,
    });
  }, [isAudioEnabled, isVideoEnabled, roomId, sendSignalingMessage, startSessionTracking]);

  const createPeerConnection = useCallback((peerId, stream) => {
    if (!peerId || !stream) {
      return null;
    }

    const existingConnection = peerConnections.current[peerId];
    if (
      existingConnection &&
      existingConnection.connectionState !== 'failed' &&
      existingConnection.connectionState !== 'closed' &&
      existingConnection.signalingState !== 'closed'
    ) {
      return peerConnections.current[peerId];
    }

    cleanupPeerConnection(peerId);

    const pc = new RTCPeerConnection(ICE_SERVERS);

    const audioTracks = stream.getAudioTracks();
    const videoTracks = stream.getVideoTracks();

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    if (!audioTracks.length) {
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    if (!videoTracks.length) {
      pc.addTransceiver('video', { direction: 'recvonly' });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignalingMessage({
          type: 'ice-candidate',
          target: peerId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStreams((prev) => {
        const nextStream = prev[peerId] ? new MediaStream(prev[peerId].getTracks()) : new MediaStream();

        event.streams.forEach((incomingStream) => {
          incomingStream.getTracks().forEach((track) => {
            const alreadyPresent = nextStream.getTracks().some((existingTrack) => existingTrack.id === track.id);
            if (!alreadyPresent) {
              nextStream.addTrack(track);
            }
          });
        });

        if (!event.streams.length && event.track) {
          const alreadyPresent = nextStream.getTracks().some((existingTrack) => existingTrack.id === event.track.id);
          if (!alreadyPresent) {
            nextStream.addTrack(event.track);
          }
        }

        return {
          ...prev,
          [peerId]: nextStream,
        };
      });

      event.track?.addEventListener('ended', () => {
        setRemoteStreams((prev) => {
          const existingStream = prev[peerId];
          if (!existingStream) {
            return prev;
          }

          const nextStream = new MediaStream(
            existingStream.getTracks().filter((track) => track.id !== event.track.id)
          );

          if (!nextStream.getTracks().length) {
            const nextStreams = { ...prev };
            delete nextStreams[peerId];
            return nextStreams;
          }

          return {
            ...prev,
            [peerId]: nextStream,
          };
        });
      }, { once: true });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        cleanupPeerConnection(peerId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        cleanupPeerConnection(peerId);
      }
    };

    peerConnections.current[peerId] = pc;
    return pc;
  }, [cleanupPeerConnection, sendSignalingMessage]);

  const flushPendingIceCandidates = useCallback(async (peerId) => {
    const pc = peerConnections.current[peerId];
    const queuedCandidates = pendingIceCandidatesRef.current[peerId];

    if (!pc?.remoteDescription || !queuedCandidates?.length) {
      return;
    }

    while (pendingIceCandidatesRef.current[peerId]?.length) {
      const candidate = pendingIceCandidatesRef.current[peerId].shift();

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('Error applying queued ICE candidate', error);
      }
    }
  }, []);

  const createAndSendOffer = useCallback(async (peerId, stream, metadata = {}) => {
    if (!peerId || peerId === clientId.current || !stream) {
      return;
    }

    const existingConnection = peerConnections.current[peerId];
    if (existingConnection && existingConnection.signalingState !== 'stable') {
      return;
    }

    const pc = createPeerConnection(peerId, stream);
    if (!pc) {
      return;
    }

    setParticipantsMetadata((prev) => ({
      ...prev,
      [peerId]: {
        ...prev[peerId],
        name: metadata.name || prev[peerId]?.name || 'Participant',
        picture: metadata.picture || prev[peerId]?.picture || null,
        role: metadata.role || prev[peerId]?.role || 'participant',
        isHandRaised: typeof metadata.isHandRaised === 'boolean'
          ? metadata.isHandRaised
          : prev[peerId]?.isHandRaised || false,
        isSharingScreen: typeof metadata.isSharingScreen === 'boolean'
          ? metadata.isSharingScreen
          : prev[peerId]?.isSharingScreen || false,
        isAudioEnabled: typeof metadata.isAudioEnabled === 'boolean'
          ? metadata.isAudioEnabled
          : prev[peerId]?.isAudioEnabled ?? true,
        isVideoEnabled: typeof metadata.isVideoEnabled === 'boolean'
          ? metadata.isVideoEnabled
          : prev[peerId]?.isVideoEnabled ?? true,
      },
    }));

    startSessionTracking(peerId, metadata.name || 'Participant', metadata.role || 'participant');

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignalingMessage({ type: 'offer', target: peerId, offer });
    syncParticipantState();
  }, [createPeerConnection, sendSignalingMessage, startSessionTracking, syncParticipantState]);

  const handleSignalingData = useCallback(async (data, stream) => {
    const { type, sender, target } = data;
    const peerId = sender || data.client_id;

    if (peerId === clientId.current) {
      return;
    }

    if (target && target !== clientId.current) {
      return;
    }

    switch (type) {
      case 'user-joined': {
        if (!stream) {
          return;
        }
        await createAndSendOffer(peerId, stream, {
          name: data.name,
          role: data.role,
          picture: data.picture,
        });
        break;
      }

      case 'offer': {
        if (!stream) {
          return;
        }

        const pcOffer = createPeerConnection(peerId, stream);
        if (!pcOffer) {
          return;
        }

        setParticipantsMetadata((prev) => ({
          ...prev,
          [peerId]: {
            ...prev[peerId],
            name: data.name || prev[peerId]?.name || 'Participant',
            picture: data.picture || prev[peerId]?.picture || null,
            role: data.role || prev[peerId]?.role || 'participant',
            isHandRaised: prev[peerId]?.isHandRaised || false,
            isSharingScreen: prev[peerId]?.isSharingScreen || false,
            isAudioEnabled: prev[peerId]?.isAudioEnabled ?? true,
            isVideoEnabled: prev[peerId]?.isVideoEnabled ?? true,
          },
        }));

        await pcOffer.setRemoteDescription(new RTCSessionDescription(data.offer));
        await flushPendingIceCandidates(peerId);
        const answer = await pcOffer.createAnswer();
        await pcOffer.setLocalDescription(answer);
        sendSignalingMessage({ type: 'answer', target: peerId, answer });
        break;
      }

      case 'answer': {
        const pcAnswer = peerConnections.current[peerId];
        if (pcAnswer && pcAnswer.signalingState !== 'stable') {
          await pcAnswer.setRemoteDescription(new RTCSessionDescription(data.answer));
          await flushPendingIceCandidates(peerId);
        }
        break;
      }

      case 'ice-candidate': {
        const pcIce = peerConnections.current[peerId];
        if (pcIce) {
          if (!pcIce.remoteDescription) {
            pendingIceCandidatesRef.current[peerId] = [
              ...(pendingIceCandidatesRef.current[peerId] || []),
              data.candidate,
            ];
            break;
          }

          try {
            await pcIce.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (error) {
            console.error('Error adding received ice candidate', error);
          }
        }
        break;
      }

      case 'user-left': {
        cleanupPeerConnection(peerId);

        setParticipantsMetadata((prev) => {
          const nextMetadata = { ...prev };
          delete nextMetadata[peerId];
          return nextMetadata;
        });

        endSessionTracking(peerId);
        break;
      }

      case 'chat':
        addMessage({ sender: data.sender, text: data.text });
        break;

      case 'raise-hand':
        setParticipantsMetadata((prev) => ({
          ...prev,
          [peerId]: { ...prev[peerId], isHandRaised: true },
        }));
        break;

      case 'lower-hand':
        setParticipantsMetadata((prev) => ({
          ...prev,
          [peerId]: { ...prev[peerId], isHandRaised: false },
        }));
        break;

      case 'participant-update':
        setParticipantsMetadata((prev) => ({
          ...prev,
          [peerId]: {
            ...prev[peerId],
            name: data.name || prev[peerId]?.name || 'Participant',
            picture: data.picture || prev[peerId]?.picture || null,
            role: data.role || prev[peerId]?.role || 'participant',
            isHandRaised: typeof data.isHandRaised === 'boolean' ? data.isHandRaised : prev[peerId]?.isHandRaised,
            isSharingScreen: typeof data.isSharingScreen === 'boolean' ? data.isSharingScreen : prev[peerId]?.isSharingScreen,
            isAudioEnabled: typeof data.isAudioEnabled === 'boolean' ? data.isAudioEnabled : prev[peerId]?.isAudioEnabled ?? true,
            isVideoEnabled: typeof data.isVideoEnabled === 'boolean' ? data.isVideoEnabled : prev[peerId]?.isVideoEnabled ?? true,
          },
        }));
        break;

      case 'participant-roster':
        if (Array.isArray(data.participants)) {
          setParticipantsMetadata((prev) => {
            const nextMetadata = {
              [clientId.current]: {
                ...prev[clientId.current],
                name: displayName.current,
                picture: currentUser.current?.picture || null,
                role: isHost.current ? 'host' : 'participant',
                isHandRaised,
                isSharingScreen,
                isAudioEnabled,
                isVideoEnabled,
              },
            };

            data.participants.forEach((participant) => {
              if (!participant?.id || participant.id === clientId.current) {
                return;
              }

              nextMetadata[participant.id] = {
                ...prev[participant.id],
                name: participant.name || prev[participant.id]?.name || 'Participant',
                picture: participant.picture || prev[participant.id]?.picture || null,
                role: participant.role || prev[participant.id]?.role || 'participant',
                isHandRaised: typeof participant.isHandRaised === 'boolean'
                  ? participant.isHandRaised
                  : prev[participant.id]?.isHandRaised || false,
                isSharingScreen: typeof participant.isSharingScreen === 'boolean'
                  ? participant.isSharingScreen
                  : prev[participant.id]?.isSharingScreen || false,
                isAudioEnabled: typeof participant.isAudioEnabled === 'boolean'
                  ? participant.isAudioEnabled
                  : prev[participant.id]?.isAudioEnabled ?? true,
                isVideoEnabled: typeof participant.isVideoEnabled === 'boolean'
                  ? participant.isVideoEnabled
                  : prev[participant.id]?.isVideoEnabled ?? true,
              };
            });

            return nextMetadata;
          });

        }
        break;

      case 'join-request':
      case 'join_request':
        isHost.current = true;
        setIsHostState(true);
        setActiveJoinRequests((prev) => {
          if (prev.find((request) => request.id === peerId)) {
            return prev;
          }

          return [
            ...prev,
            {
              id: peerId,
              name: data.name || 'Participant',
              picture: data.picture || null,
            },
          ];
        });
        break;

      case 'waiting-room-sync':
        isHost.current = true;
        setIsHostState(true);
        setActiveJoinRequests(Array.isArray(data.requests) ? data.requests : []);
        break;

      case 'admit':
      case 'accepted':
        sessionStorage.setItem(`meeting_admitted_${roomId}`, 'true');
        window.dispatchEvent(new CustomEvent('meeting-admitted', { detail: { roomId } }));
        break;

      case 'deny':
        window.dispatchEvent(new CustomEvent('meeting-denied', { detail: { roomId } }));
        break;

      case 'join-blocked':
        sessionStorage.removeItem(`meeting_admitted_${roomId}`);
        window.dispatchEvent(new CustomEvent('meeting-denied', { detail: { roomId } }));
        break;

      default:
        break;
    }
  }, [
    addMessage,
    createAndSendOffer,
    endSessionTracking,
    flushPendingIceCandidates,
    roomId,
    sendSignalingMessage,
  ]);

  useEffect(() => {
    localStreamRef.current = localStream || originalStream.current;
  }, [localStream]);

  useEffect(() => {
    joinRoomCallbackRef.current = joinRoom;
  }, [joinRoom]);

  useEffect(() => {
    const nextIsHost = computeIsHost();
    const wasHost = isHost.current;
    isHost.current = nextIsHost;
    setIsHostState(nextIsHost);

    if (!wasHost && nextIsHost && ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({
          type: 'host_join',
          user_id: currentUser.current?.meetingUserId || clientId.current,
          email: currentUser.current?.email || null,
          name: displayName.current,
          picture: currentUser.current?.picture || null,
        }));
    }
  }, [computeIsHost]);

  useEffect(() => {
    handleSignalingDataRef.current = handleSignalingData;
  }, [handleSignalingData]);

  useEffect(() => {
    let isMounted = true;

    const startConnection = async () => {
      let stream = new MediaStream();

      try {
        if (acquireMedia) {
          try {
            const cachedStream = consumePreJoinStream(roomId);

            if (cachedStream) {
              stream = cachedStream;
            } else {
              const constraints = getPreferredMediaConstraints();
              const wantsAudio = constraints.audio !== false;
              const wantsVideo = constraints.video !== false;

              if (wantsAudio || wantsVideo) {
                stream = await navigator.mediaDevices.getUserMedia(constraints);
              }
            }

            const audioTrack = stream.getAudioTracks()[0];
            const videoTrack = stream.getVideoTracks()[0];

            if (audioTrack) {
              audioTrack.enabled = initialMediaState.current.audioEnabled;
            }
            if (videoTrack) {
              videoTrack.enabled = initialMediaState.current.videoEnabled;
            }

            originalStream.current = stream;
            activeStreamsRef.current.push(stream);

            if (isMounted) {
              setLocalStream(stream);
              setIsAudioEnabled(audioTrack ? audioTrack.enabled : false);
              setIsVideoEnabled(videoTrack ? videoTrack.enabled : false);
            }
          } catch (mediaAcquisitionError) {
            console.error('Error accessing media devices.', mediaAcquisitionError);
            originalStream.current = stream;
            activeStreamsRef.current.push(stream);

            if (isMounted) {
              setLocalStream(stream);
              setIsAudioEnabled(false);
              setIsVideoEnabled(false);
              setMediaError(mediaAcquisitionError.name === 'NotAllowedError' ? 'Permission Denied' : 'Media Device Error');
            }
          }
        } else {
          originalStream.current = stream;
        }

        ws.current = new WebSocket(buildWebSocketUrl(`/ws/${roomId}/${clientId.current}`));

        ws.current.onopen = () => {
          pendingMessagesRef.current.forEach((message) => {
            ws.current?.send(JSON.stringify(message));
          });
          pendingMessagesRef.current = [];

          if (isHost.current) {
            ws.current?.send(JSON.stringify({
              type: 'host_join',
              user_id: currentUser.current?.meetingUserId || clientId.current,
              email: currentUser.current?.email || null,
              name: displayName.current,
              picture: currentUser.current?.picture || null,
            }));
          }

          if (autoJoin) {
            joinRoomCallbackRef.current?.();
          }
        };

        ws.current.onmessage = async (event) => {
          const message = JSON.parse(event.data);
          await handleSignalingDataRef.current?.(
            message,
            localStreamRef.current || stream || originalStream.current
          );
        };
      } catch (error) {
        console.error('Error starting WebRTC connection.', error);
        if (isMounted) {
          setMediaError((current) => current || (error.name === 'NotAllowedError' ? 'Permission Denied' : 'Media Device Error'));
        }
      }
    };

    startConnection();

    return () => {
      isMounted = false;

      if (ws.current) {
        ws.current.close();
      }

      Object.values(peerConnections.current).forEach((pc) => pc.close());
      peerConnections.current = {};
      pendingIceCandidatesRef.current = {};

      activeStreamsRef.current.forEach((stream) => {
        stream?.getTracks().forEach((track) => track.stop());
      });
      activeStreamsRef.current = [];
      clearPreJoinStream(roomId);

      Object.keys(activeSessionIdsRef.current).forEach((participantId) => {
        endSessionTracking(participantId);
      });

      joinedRoomRef.current = false;
    };
  }, [acquireMedia, autoJoin, roomId, endSessionTracking]);

  const admitParticipant = useCallback((participantId) => {
    sendSignalingMessage({ type: 'accept_user', target: participantId });
    setActiveJoinRequests((prev) => prev.filter((request) => request.id !== participantId));
  }, [sendSignalingMessage]);

  const denyParticipant = useCallback((participantId) => {
    sendSignalingMessage({ type: 'deny', target: participantId });
    setActiveJoinRequests((prev) => prev.filter((request) => request.id !== participantId));
  }, [sendSignalingMessage]);

  const requestToJoin = useCallback((name = displayName.current) => {
    sessionStorage.setItem(`meeting_name_${roomId}`, name);
    displayName.current = name;
    sendSignalingMessage({
      type: 'ask_to_join',
      user_id: currentUser.current?.meetingUserId || clientId.current,
      firebase_uid: currentUser.current?.firebaseUid || null,
      email: currentUser.current?.email || null,
      name,
      picture: currentUser.current?.picture || null,
      requested_at: new Date().toISOString(),
    });
  }, [roomId, sendSignalingMessage]);

  const toggleVideo = useCallback(() => {
    if (!localStream) {
      setIsVideoEnabled((prev) => {
        const nextValue = !prev;
        savePreJoinMediaState(roomId, { videoEnabled: nextValue });
        return nextValue;
      });
      return;
    }

    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoEnabled(videoTrack.enabled);
      savePreJoinMediaState(roomId, { videoEnabled: videoTrack.enabled });
      syncParticipantState({ isVideoEnabled: videoTrack.enabled });
      return;
    }

    setIsVideoEnabled((prev) => {
      const nextValue = !prev;
      savePreJoinMediaState(roomId, { videoEnabled: nextValue });
      syncParticipantState({ isVideoEnabled: nextValue });
      return nextValue;
    });
  }, [localStream, roomId, syncParticipantState]);

  const toggleAudio = useCallback(() => {
    if (!localStream) {
      setIsAudioEnabled((prev) => {
        const nextValue = !prev;
        savePreJoinMediaState(roomId, { audioEnabled: nextValue });
        return nextValue;
      });
      return;
    }

    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioEnabled(audioTrack.enabled);
      savePreJoinMediaState(roomId, { audioEnabled: audioTrack.enabled });
      syncParticipantState({ isAudioEnabled: audioTrack.enabled });
      return;
    }

    setIsAudioEnabled((prev) => {
      const nextValue = !prev;
      savePreJoinMediaState(roomId, { audioEnabled: nextValue });
      syncParticipantState({ isAudioEnabled: nextValue });
      return nextValue;
    });
  }, [localStream, roomId, syncParticipantState]);

  const stopScreenShare = useCallback((screenTrack) => {
    if (screenTrack) {
      screenTrack.stop();
    }

    const cameraTrack = originalStream.current?.getVideoTracks?.()[0];

    Object.values(peerConnections.current).forEach((pc) => {
      const videoSender = pc.getSenders().find((sender) => sender.track?.kind === 'video');
      if (videoSender && cameraTrack) {
        videoSender.replaceTrack(cameraTrack);
      }
    });

    setLocalStream(originalStream.current);
    setIsSharingScreen(false);

    setParticipantsMetadata((prev) => ({
      ...prev,
      [clientId.current]: {
        ...prev[clientId.current],
        isSharingScreen: false,
      },
    }));

    sendSignalingMessage({
      type: 'participant-update',
      name: displayName.current,
      picture: currentUser.current?.picture || null,
      role: isHost.current ? 'host' : 'participant',
      isHandRaised,
      isSharingScreen: false,
      isAudioEnabled,
      isVideoEnabled,
    });
  }, [isAudioEnabled, isHandRaised, isVideoEnabled, sendSignalingMessage]);

  const toggleScreenShare = useCallback(async () => {
    try {
      if (!isSharingScreen) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        activeStreamsRef.current.push(screenStream);

        const screenTrack = screenStream.getVideoTracks()[0];

        Object.values(peerConnections.current).forEach((pc) => {
          const videoSender = pc.getSenders().find((sender) => sender.track?.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(screenTrack);
          }
        });

        screenTrack.onended = () => {
          stopScreenShare(screenTrack);
        };

        setLocalStream(screenStream);
        setIsSharingScreen(true);

        setParticipantsMetadata((prev) => ({
          ...prev,
          [clientId.current]: {
            ...prev[clientId.current],
            isSharingScreen: true,
          },
        }));

        sendSignalingMessage({
          type: 'participant-update',
          name: displayName.current,
          picture: currentUser.current?.picture || null,
          role: isHost.current ? 'host' : 'participant',
          isHandRaised,
          isSharingScreen: true,
          isAudioEnabled,
          isVideoEnabled,
        });
      } else {
        const screenTrack = localStream?.getVideoTracks?.()[0];
        stopScreenShare(screenTrack);
      }
    } catch (error) {
      console.error('Error sharing screen:', error);
    }
  }, [isHandRaised, isSharingScreen, localStream, sendSignalingMessage, stopScreenShare]);

  const toggleRaiseHand = useCallback(() => {
    const nextState = !isHandRaised;
    setIsHandRaised(nextState);

    setParticipantsMetadata((prev) => ({
      ...prev,
      [clientId.current]: {
        ...prev[clientId.current],
        isHandRaised: nextState,
      },
    }));

    sendSignalingMessage({
      type: nextState ? 'raise-hand' : 'lower-hand',
      name: displayName.current,
      picture: currentUser.current?.picture || null,
    });

    sendSignalingMessage({
      type: 'participant-update',
      name: displayName.current,
      picture: currentUser.current?.picture || null,
      role: isHost.current ? 'host' : 'participant',
      isHandRaised: nextState,
      isSharingScreen,
      isAudioEnabled,
      isVideoEnabled,
    });
  }, [isAudioEnabled, isHandRaised, isSharingScreen, isVideoEnabled, sendSignalingMessage]);

  const sendChatMessage = useCallback((text) => {
    sendSignalingMessage({
      type: 'chat',
      text,
      sent_at: new Date().toISOString(),
    });
    addMessage({ sender: 'Me', text });
  }, [addMessage, sendSignalingMessage]);

  return {
    localStream,
    remoteStreams,
    messages,
    participantsMetadata,
    isSharingScreen,
    isHandRaised,
    toggleVideo,
    toggleAudio,
    toggleScreenShare,
    toggleRaiseHand,
    sendChatMessage,
    admitParticipant,
    denyParticipant,
    requestToJoin,
    activeJoinRequests,
    isHost: isHostState,
    mediaError,
    joinRoom,
    displayName: displayName.current,
    isAudioEnabled,
    isVideoEnabled,
    localClientId: clientId.current,
  };
}
