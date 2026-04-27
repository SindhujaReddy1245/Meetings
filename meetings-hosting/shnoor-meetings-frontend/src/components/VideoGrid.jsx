import { useEffect, useMemo, useRef, useState } from 'react';
import { MicOff } from 'lucide-react';
import { getCurrentUser } from '../utils/currentUser';
import ProfileAvatar from './ProfileAvatar';
import SpeakerHighlight from './SpeakerHighlight';
import useActiveSpeaker from '../hooks/useActiveSpeaker';

function hasUsableVideo(stream) {
  const tracks = stream?.getVideoTracks?.() || [];
  return tracks.some((track) => (
    track.readyState === 'live'
    && track.enabled !== false
    && track.muted !== true
  ));
}

function RemoteAudio({ stream }) {
  const audioRef = useRef(null);
  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
      audioRef.current.play().catch((error) => {
        console.warn('Audio autoplay failed for remote stream', error);
      });
    }
  }, [stream]);
  return <audio ref={audioRef} autoPlay playsInline />;
}

function VideoPlayer({
  stream,
  label,
  picture,
  isLocal = false,
  isHandRaised = false,
  isSpeaking = false,
  isDominantSpeaker = false,
  isVideoEnabled = true,
  isAudioEnabled = true,
  featured = false,
  audioLevel = 0,
}) {
  const videoRef = useRef(null);
  const [videoReady, setVideoReady] = useState(false);
  const [isVideoRendering, setIsVideoRendering] = useState(false);

  const loggedInUser = getCurrentUser();
  const resolvedPicture = isLocal ? (picture || loggedInUser?.picture || null) : picture;
  const resolvedLabel  = isLocal ? (label  || loggedInUser?.name  || loggedInUser?.email || 'You') : label;

  const hasLiveVideoTrack = hasUsableVideo(stream);
  const shouldShowVideo = Boolean(isVideoEnabled) && hasLiveVideoTrack;
  const showVideo = shouldShowVideo && videoReady && isVideoRendering;
  const ringStrength = Math.max(0, Math.min(audioLevel * 18, 1));

  useEffect(() => {
    setVideoReady(false);
    setIsVideoRendering(false);
    if (videoRef.current && stream) {
      const el = videoRef.current;
      el.srcObject     = stream;
      el.defaultMuted  = true;
      el.muted         = true;
      el.playsInline   = true;
      el.play()
        .then(() => setVideoReady(true))
        .catch((error) => {
          console.warn('Video autoplay failed for stream', error);
        });
    }
  }, [hasLiveVideoTrack, isVideoEnabled, stream]);

  useEffect(() => {
    if (!shouldShowVideo) {
      setIsVideoRendering(false);
      return undefined;
    }

    const element = videoRef.current;
    if (!element) {
      return undefined;
    }

    let cancelled = false;
    let lastTime = element.currentTime || 0;
    let stableTicks = 0;
    let intervalId = null;

    const markRendering = () => {
      if (cancelled) return;
      setIsVideoRendering(true);
    };

    if (typeof element.requestVideoFrameCallback === 'function') {
      const onFrame = () => {
        if (cancelled) return;
        if (element.videoWidth > 0 && element.videoHeight > 0) {
          markRendering();
          return;
        }
        element.requestVideoFrameCallback(onFrame);
      };
      element.requestVideoFrameCallback(onFrame);
    }

    intervalId = window.setInterval(() => {
      if (cancelled) return;
      const hasDims = element.videoWidth > 0 && element.videoHeight > 0;
      const timeNow = element.currentTime || 0;
      const advanced = timeNow > lastTime + 0.08;
      if (advanced) {
        lastTime = timeNow;
      }
      stableTicks = advanced ? stableTicks + 1 : 0;
      if (hasDims && stableTicks >= 2) {
        markRendering();
      }
    }, 250);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [shouldShowVideo]);

  return (
    <SpeakerHighlight active={isSpeaking} featured={featured}>
      <div
        className={`relative overflow-hidden border group flex items-center justify-center transition-all duration-500 ${
          featured ? 'w-full h-full rounded-3xl bg-black' : 'w-full aspect-video rounded-2xl bg-[radial-gradient(circle_at_top,#31445f_0%,#1f2d44_45%,#142033_100%)]'
        } ${
          isSpeaking
            ? 'border-white/20 shadow-[0_0_0_1px_rgba(255,255,255,0.14)]'
            : 'border-gray-700/50 shadow-2xl'
        }`}
      >
        {shouldShowVideo && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={() => setVideoReady(true)}
          onLoadedData={() => setVideoReady(true)}
          onCanPlay={() => setVideoReady(true)}
          className={`absolute inset-0 w-full h-full ${featured ? 'object-contain bg-black' : 'object-cover'} ${isLocal ? 'transform -scale-x-100' : ''}`}
          style={{
            opacity: showVideo ? 1 : 0,
            transition: 'opacity 180ms ease-out',
            backgroundColor: 'transparent',
          }}
        />
      )}

      {!showVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative z-10 flex items-center justify-center">
            {isDominantSpeaker && (
              <div
                className={`pointer-events-none absolute rounded-full border-2 border-white/85 ${
                  featured ? 'h-44 w-44 sm:h-52 sm:w-52' : 'h-32 w-32'
                }`}
                style={{
                  animation: 'meetSpeakerRing 1.25s ease-in-out infinite',
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.22)',
                }}
              />
            )}
              <ProfileAvatar
                name={resolvedLabel}
                picture={resolvedPicture}
              className={featured ? 'h-36 w-36 sm:h-44 sm:w-44' : 'h-24 w-24'}
              textClass={featured ? 'text-6xl' : 'text-4xl'}
              ringClassName="border-2 border-white/60"
              />
          </div>
        </div>
      )}

      {/* ── mic-off icon ── */}
      {!isAudioEnabled && (
        <div className="absolute top-4 right-4 rounded-full bg-black/55 p-2 text-white shadow-lg z-10">
          <MicOff size={16} />
        </div>
      )}

      {/* ── raise-hand ── */}
      {isHandRaised && (
        <div className="absolute top-20 right-4 bg-yellow-500 text-white p-2 rounded-full shadow-lg border-2 border-yellow-400 z-10">
          <span className="text-xs font-bold">RH</span>
        </div>
      )}

      {/* ── bottom bar: name + speaking pill ── */}
        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
          <div className="bg-black/60 backdrop-blur-md rounded-lg text-white font-semibold tracking-wide border border-white/10 shadow-lg px-4 py-1.5 text-sm">
          {resolvedLabel}
        </div>

        {isSpeaking && (
          <div className="flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-100">
            <span className="h-2 w-2 rounded-full bg-[#4CAF50] animate-pulse" />
            Speaking
          </div>
        )}
      </div>

      {/* subtle gradient for readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
      </div>
    </SpeakerHighlight>
  );
}

export default function VideoGrid({
  localStream,
  remoteStreams,
  participantsMetadata = {},
  localHandRaised = false,
  localParticipantName = 'You',
  localParticipantPicture = null,
  localIsHost = false,
  isSharingScreen = false,
  isAudioEnabled = true,
  isVideoEnabled = true,
  getPeerConnection,
}) {
  // kept for future interactions (e.g. pin), but the UI stays in grid mode always
  const [selectedTile, setSelectedTile] = useState(null);

  const remoteTiles = useMemo(() => (
    Object.entries(remoteStreams).map(([peerId, stream]) => ({
      id: peerId,
      stream,
      label: participantsMetadata[peerId]?.name || 'Participant',
      picture: participantsMetadata[peerId]?.picture || null,
      isHandRaised: participantsMetadata[peerId]?.isHandRaised,
      isSharingScreen: participantsMetadata[peerId]?.isSharingScreen,
      isHost: participantsMetadata[peerId]?.role === 'host',
      isAudioEnabled: participantsMetadata[peerId]?.isAudioEnabled ?? true,
      isVideoEnabled: participantsMetadata[peerId]?.isVideoEnabled ?? true,
      isLocal: false,
    }))
  ), [participantsMetadata, remoteStreams]);

  const localTile = useMemo(() => ({
    id: 'local',
    stream: localStream,
    label: localParticipantName,
    picture: localParticipantPicture,
    isHandRaised: localHandRaised,
    isSharingScreen,
    isHost: localIsHost,
    isAudioEnabled,
    isVideoEnabled,
    isLocal: true,
  }), [isAudioEnabled, isSharingScreen, isVideoEnabled, localHandRaised, localIsHost, localParticipantName, localParticipantPicture, localStream]);

  const tilesForSpeaker = useMemo(() => [localTile, ...remoteTiles], [localTile, remoteTiles]);

  const {
    dominantSpeakerId,
    speakingIds: speakingParticipantIds,
    audioLevels,
  } = useActiveSpeaker(tilesForSpeaker, getPeerConnection);

  const orderedTiles = useMemo(() => (
    [localTile, ...remoteTiles]
      .filter((t) => t.stream)
      .sort((a, b) => (audioLevels[b.id] || 0) - (audioLevels[a.id] || 0))
  ), [audioLevels, localTile, remoteTiles]);

  const standardGridTiles = useMemo(() => {
    const tiles = [localTile, ...remoteTiles]
      .filter((tile) => tile.stream)
      .sort((left, right) => {
        const leftLevel = audioLevels[left.id] || 0;
        const rightLevel = audioLevels[right.id] || 0;
        return rightLevel - leftLevel;
      });
    if (tiles.length <= 1) return 'grid-cols-1 max-w-4xl';
    if (tiles.length === 2) return 'grid-cols-1 sm:grid-cols-2 max-w-6xl';
    if (tiles.length <= 4) return 'grid-cols-1 sm:grid-cols-2 max-w-6xl';
    return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-7xl';
  }, [audioLevels, localTile, remoteTiles]);

  return (
    <div className="w-full h-full flex items-center justify-center p-4 overflow-y-auto">
      <style>{`
        @keyframes speakerPulse {
          0%, 100% { transform: scale(0.92); opacity: 0.35; }
          50% { transform: scale(1.08); opacity: 0.9; }
        }
        @keyframes speakerAvatarPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes speakerGlow {
          0%, 100% { transform: scale(0.96); opacity: 0.2; }
          50% { transform: scale(1.14); opacity: 0.55; }
        }
        @keyframes speakerTilePulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.018); }
        }
        @keyframes speakerRing {
          0%, 100% { opacity: 0.35; transform: scale(0.99); }
          50% { opacity: 0.95; transform: scale(1.01); }
        }
        @keyframes meetSpeakerRing {
          0%, 100% { transform: scale(0.96); opacity: 0.55; }
          50% { transform: scale(1.10); opacity: 0.95; }
        }
      `}</style>
      {remoteTiles.map((t) => <RemoteAudio key={`audio-${t.id}`} stream={t.stream} />)}
      <div className={`grid gap-6 w-full ${standardGridTiles} mx-auto items-center justify-items-center`}>
        {orderedTiles.map((tile) => (
          <button key={tile.id} onClick={() => setSelectedTile(tile.id)} className="w-full">
            <VideoPlayer
              stream={tile.stream}
              label={tile.label}
              picture={tile.picture}
              isLocal={tile.isLocal}
              isHandRaised={tile.isHandRaised}
              isSpeaking={speakingParticipantIds.has(tile.id)}
              isDominantSpeaker={dominantSpeakerId === tile.id}
              isAudioEnabled={tile.isAudioEnabled}
              isVideoEnabled={tile.isVideoEnabled}
              audioLevel={audioLevels[tile.id] || 0}
            />
          </button>
        ))}
      </div>
    </div>
  );
}