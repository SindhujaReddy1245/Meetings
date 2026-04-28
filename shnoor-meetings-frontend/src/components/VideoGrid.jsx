import { useEffect, useMemo, useRef, useState } from 'react';
import { MicOff } from 'lucide-react';
import { getCurrentUser } from '../utils/currentUser';
import ProfileAvatar from './ProfileAvatar';
import SpeakerHighlight from './SpeakerHighlight';
import useActiveSpeaker from '../hooks/useActiveSpeaker';

function SpeakerBackdrop({ active = false, featured = false }) {
  if (!active) {
    return null;
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <div
        className={`rounded-full border border-emerald-200/35 bg-emerald-300/10 ${
          featured ? 'h-72 w-72' : 'h-44 w-44'
        }`}
        style={{ animation: 'speakerGlow 1.25s ease-in-out infinite' }}
      />
      <div
        className={`absolute rounded-full bg-emerald-300/18 ${
          featured ? 'h-56 w-56' : 'h-32 w-32'
        }`}
        style={{ animation: 'speakerPulse 1.25s ease-in-out infinite' }}
      />
    </div>
  );
}

function VideoPlayer({
  stream,
  label,
  picture,
  isLocal = false,
  isHandRaised = false,
  isSpeaking = false,
  isDominantSpeaker = false,
  audioLevel = 0,
  isVideoEnabled = true,
  isAudioEnabled = true,
  featured = false,
}) {
  const videoRef = useRef(null);
  const [videoReady, setVideoReady] = useState(false);
  const [isVideoRendering, setIsVideoRendering] = useState(false);
  const [hasLiveVideoTrackState, setHasLiveVideoTrackState] = useState(false);
  const loggedInUser = getCurrentUser();
  const resolvedPicture = isLocal ? (picture || loggedInUser?.picture || null) : picture;
  const resolvedLabel = isLocal ? (label || loggedInUser?.name || loggedInUser?.email || 'You') : label;

  const shouldShowVideo = Boolean(isVideoEnabled) && hasLiveVideoTrackState;
  const ringStrength = Math.max(0, Math.min(audioLevel * 18, 1));
  const showVideo = shouldShowVideo && videoReady && isVideoRendering;
  const shouldRenderVideoElement = shouldShowVideo;

  useEffect(() => {
    const videoTrack = stream?.getVideoTracks?.()[0] || null;

    if (!videoTrack) {
      setHasLiveVideoTrackState(false);
      setIsVideoRendering(false);
      return undefined;
    }

    const syncTrackState = () => {
      const hasLiveTrack = isLocal
        ? (
          videoTrack.readyState === 'live'
          && videoTrack.enabled !== false
          && videoTrack.muted !== true
        )
        : (
          videoTrack.readyState === 'live'
        );

      setHasLiveVideoTrackState(hasLiveTrack);
      if (!hasLiveTrack) {
        setIsVideoRendering(false);
      }
    };

    syncTrackState();
    videoTrack.addEventListener('mute', syncTrackState);
    videoTrack.addEventListener('unmute', syncTrackState);
    videoTrack.addEventListener('ended', syncTrackState);
    const intervalId = window.setInterval(syncTrackState, 500);

    return () => {
      videoTrack.removeEventListener('mute', syncTrackState);
      videoTrack.removeEventListener('unmute', syncTrackState);
      videoTrack.removeEventListener('ended', syncTrackState);
      window.clearInterval(intervalId);
    };
  }, [isLocal, stream]);

  useEffect(() => {
    setVideoReady(false);
    setIsVideoRendering(false);

    if (videoRef.current && stream) {
      const element = videoRef.current;
      element.srcObject = stream;
      element.defaultMuted = true;
      element.muted = true;
      element.playsInline = true;
      element.play().then(() => {
        setVideoReady(true);
      }).catch((error) => {
        console.warn('Video autoplay failed for stream', error);
      });
    }
  }, [isVideoEnabled, stream]);

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
    let intervalId = null;

    // Simple check to ensure the video actually has dimensions and is playing
    intervalId = window.setInterval(() => {
      if (cancelled) return;
      const hasDims = element.videoWidth > 0 && element.videoHeight > 0;
      if (hasDims) {
        setIsVideoRendering(true);
      } else {
        setIsVideoRendering(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [shouldShowVideo]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) {
      return undefined;
    }

    const handlePlaybackIssue = () => {
      setIsVideoRendering(false);
      element.play().catch(() => {});
    };

    element.addEventListener('stalled', handlePlaybackIssue);
    element.addEventListener('waiting', handlePlaybackIssue);
    element.addEventListener('emptied', handlePlaybackIssue);

    return () => {
      element.removeEventListener('stalled', handlePlaybackIssue);
      element.removeEventListener('waiting', handlePlaybackIssue);
      element.removeEventListener('emptied', handlePlaybackIssue);
    };
  }, [stream]);

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
        {shouldRenderVideoElement && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={() => setVideoReady(true)}
            onLoadedData={() => setVideoReady(true)}
            onCanPlay={() => setVideoReady(true)}
            className={`absolute inset-0 w-full h-full ${featured ? 'object-contain' : 'object-cover'} ${isLocal ? 'transform -scale-x-100' : ''}`}
            style={{
              opacity: showVideo ? 1 : 0,
              transition: 'opacity 180ms ease-out',
              backgroundColor: 'transparent',
              pointerEvents: showVideo ? 'auto' : 'none',
            }}
          />
        )}

        {!showVideo && (
          <div className="absolute inset-0 flex items-center justify-center">
            <SpeakerBackdrop active={isSpeaking} featured={featured} />
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

        {!isAudioEnabled && (
          <div className="absolute top-4 right-4 rounded-full bg-black/55 p-2 text-white shadow-lg z-10">
            <MicOff size={16} />
          </div>
        )}

        {isHandRaised && (
          <div className="absolute top-20 right-4 bg-yellow-500 text-white p-2 rounded-full shadow-lg border-2 border-yellow-400 z-10">
            <span className="text-xs font-bold">RH</span>
          </div>
        )}

        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
          <div className={`bg-black/60 backdrop-blur-md rounded-lg text-white font-semibold tracking-wide border border-white/10 shadow-lg ${'px-4 py-1.5 text-sm'}`}>
            {resolvedLabel}
          </div>

          {isSpeaking && (
            <div className="flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-100">
              <span
                className="h-2 w-2 rounded-full bg-emerald-300"
                style={{ boxShadow: `0 0 ${10 + (ringStrength * 16)}px rgba(110, 231, 183, 0.9)` }}
              />
              Speaking
            </div>
          )}
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
      </div>
    </SpeakerHighlight>
  );
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

export default function VideoGrid({
  localStream,
  remoteStreams,
  participantsMetadata = {},
  localClientId = null,
  localHandRaised = false,
  localParticipantName = 'You',
  localParticipantPicture = null,
  localIsHost = false,
  isSharingScreen = false,
  isAudioEnabled = true,
  isVideoEnabled = true,
  getPeerConnection,
}) {
  const [selectedTile, setSelectedTile] = useState(null);

  const remoteTiles = useMemo(() => {
    // Collect all remote peer IDs from BOTH remoteStreams and participantsMetadata.
    // This is critical: a participant who has been admitted but whose WebRTC stream
    // hasn't arrived yet must still appear as an avatar tile.
    const remoteIds = new Set([
      ...Object.keys(remoteStreams || {}),
      ...Object.keys(participantsMetadata || {}),
    ]);

    // Remove the local client's own ID from the remote set
    if (localClientId) remoteIds.delete(localClientId);
    // Remove the generic 'local' key used by the local stream
    remoteIds.delete('local');

    return Array.from(remoteIds).map((peerId) => {
      const meta = participantsMetadata[peerId] || {};
      const stream = remoteStreams?.[peerId] || null;

      return {
        id: peerId,
        stream,
        label: meta.name || 'Participant',
        picture: meta.picture || null,
        isHandRaised: meta.isHandRaised ?? false,
        isSharingScreen: meta.isSharingScreen ?? false,
        isHost: meta.role === 'host',
        isAudioEnabled: meta.isAudioEnabled ?? true,
        // Only show video if the participant has signalled they have published media
        // AND their video is enabled. If hasPublishedMediaState is absent (older
        // signalling path) fall back to true so we don't permanently hide their tile.
        isVideoEnabled: meta.hasPublishedMediaState != null
          ? (meta.hasPublishedMediaState ? (meta.isVideoEnabled ?? false) : false)
          : (meta.isVideoEnabled ?? true),
        hasPublishedMediaState: meta.hasPublishedMediaState ?? false,
        isLocal: false,
      };
    });
  }, [localClientId, participantsMetadata, remoteStreams]);

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

  // ─── FIXED FILTER ───────────────────────────────────────────────────────────
  // Old filter: tile.isLocal ? tile.stream : tile.label
  //   → Remote tiles were shown only if they had a label, but the sort/grid
  //     calculation was inconsistent with which tiles actually rendered.
  //
  // New filter:
  //   • Local tile: must have a stream (camera/mic initialised).
  //   • Remote tile: always show — even without a stream — so the participant's
  //     avatar tile is visible immediately after they are admitted, before their
  //     WebRTC media arrives. A name fallback ('Participant') guarantees the tile
  //     is always meaningful.
  // ────────────────────────────────────────────────────────────────────────────
  const orderedStandardTiles = useMemo(() => (
    [localTile, ...remoteTiles]
      .filter((tile) => {
        if (tile.isLocal) {
          // Only render the local tile once we have a media stream
          return Boolean(tile.stream);
        }
        // Always render remote participants — show avatar if stream not yet ready
        return true;
      })
      .sort((left, right) => {
        const leftLevel = audioLevels[left.id] || 0;
        const rightLevel = audioLevels[right.id] || 0;
        return rightLevel - leftLevel;
      })
  ), [audioLevels, localTile, remoteTiles]);

  const gridColsClass = useMemo(() => {
    const count = orderedStandardTiles.length;
    if (count <= 1) return 'grid-cols-1 max-w-4xl';
    if (count === 2) return 'grid-cols-1 sm:grid-cols-2 max-w-6xl';
    if (count <= 4) return 'grid-cols-1 sm:grid-cols-2 max-w-6xl';
    return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-7xl';
  }, [orderedStandardTiles.length]);

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

      {/* Invisible audio elements for all remote streams */}
      {remoteTiles.map((tile) => (
        tile.stream ? <RemoteAudio key={`audio-${tile.id}`} stream={tile.stream} /> : null
      ))}

      <div className={`grid gap-6 w-full ${gridColsClass} mx-auto items-center justify-items-center`}>
        {orderedStandardTiles.map((tile) => (
          <button
            key={tile.id}
            onClick={() => setSelectedTile(tile.id)}
            className="w-full"
          >
            <VideoPlayer
              stream={tile.stream}
              label={tile.label}
              picture={tile.picture}
              isLocal={tile.isLocal}
              isHandRaised={tile.isHandRaised}
              isSpeaking={speakingParticipantIds.has(tile.id)}
              isDominantSpeaker={dominantSpeakerId === tile.id}
              audioLevel={audioLevels[tile.id] || 0}
              isAudioEnabled={tile.isAudioEnabled}
              isVideoEnabled={tile.isVideoEnabled}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
