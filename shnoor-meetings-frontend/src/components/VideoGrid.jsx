import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, MicOff, Minimize2, X } from 'lucide-react';
import { getCurrentUser } from '../utils/currentUser';
import ProfileAvatar from './ProfileAvatar';
import SpeakerHighlight from './SpeakerHighlight';
import useActiveSpeaker from '../hooks/useActiveSpeaker';

function hasUsableVideo(stream) {
  return Boolean(
    stream?.getVideoTracks?.().some((track) => track.readyState === 'live')
  );
}

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
  isHost = false,
  isLocal = false,
  isHandRaised = false,
  isSpeaking = false,
  audioLevel = 0,
  isVideoEnabled = true,
  isAudioEnabled = true,
  featured = false,
  compact = false,
}) {
  const videoRef = useRef(null);
  const [videoReady, setVideoReady] = useState(false);
  const loggedInUser = getCurrentUser();
  const resolvedPicture = isLocal ? (picture || loggedInUser?.picture || null) : picture;
  const resolvedLabel = isLocal ? (label || loggedInUser?.name || loggedInUser?.email || 'You') : label;
  const hasLiveVideoTrack = hasUsableVideo(stream);
  const shouldShowVideo = Boolean(isVideoEnabled) && hasLiveVideoTrack;
  const ringStrength = Math.max(0, Math.min(audioLevel * 18, 1));

  useEffect(() => {
    setVideoReady(false);

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
  }, [hasLiveVideoTrack, isVideoEnabled, stream]);

  return (
    <SpeakerHighlight active={isSpeaking} featured={featured}>
      <div
        className={`relative overflow-hidden border group flex items-center justify-center transition-all duration-500 ${
          featured ? 'w-full h-full rounded-3xl bg-black' : 'w-full aspect-video rounded-2xl bg-gray-800'
        } ${
          isSpeaking
            ? 'border-white/20 shadow-[0_0_0_1px_rgba(255,255,255,0.14)]'
            : 'border-gray-700/50 shadow-2xl'
        }`}
      >
        {shouldShowVideo ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={() => setVideoReady(true)}
            onLoadedData={() => setVideoReady(true)}
            onCanPlay={() => setVideoReady(true)}
            className={`w-full h-full ${featured ? 'object-contain bg-black' : 'object-cover'} ${isLocal ? 'transform -scale-x-100' : ''}`}
            style={{ visibility: videoReady ? 'visible' : 'visible' }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_top,#31445f_0%,#1f2d44_45%,#142033_100%)]">
            <SpeakerBackdrop active={isSpeaking} featured={featured} />
            <div className="relative z-10 flex items-center justify-center">
              {isSpeaking && (
                <div
                  className={`pointer-events-none absolute rounded-full border-2 border-white/85 ${
                    featured ? 'h-44 w-44 sm:h-52 sm:w-52' : compact ? 'h-20 w-20' : 'h-32 w-32'
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
                className={featured ? 'h-36 w-36 sm:h-44 sm:w-44' : compact ? 'h-16 w-16' : 'h-24 w-24'}
                textClass={featured ? 'text-6xl' : compact ? 'text-2xl' : 'text-4xl'}
                ringClassName="border-2 border-white/60"
              />
            </div>
          </div>
        )}

        {isHost && (
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
            <span className="rounded-full bg-black/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/85 backdrop-blur-md">
              Host
            </span>
          </div>
        )}

        {!isAudioEnabled && (
          <div className="absolute top-4 right-4 rounded-full bg-black/55 p-2 text-white shadow-lg z-10">
            <MicOff size={compact ? 14 : 16} />
          </div>
        )}

        {isHandRaised && (
          <div className="absolute top-20 right-4 bg-yellow-500 text-white p-2 rounded-full shadow-lg border-2 border-yellow-400 z-10">
            <span className="text-xs font-bold">RH</span>
          </div>
        )}

        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
          <div className={`bg-black/60 backdrop-blur-md rounded-lg text-white font-semibold tracking-wide border border-white/10 shadow-lg ${
            compact ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm'
          }`}>
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
  const [hideLocalThumbnail, setHideLocalThumbnail] = useState(false);

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

  const {
    dominantSpeakerId,
    speakingIds: speakingParticipantIds,
    audioLevels,
  } = useActiveSpeaker([localTile, ...remoteTiles], getPeerConnection);

  const prioritizedSpeakerTile = useMemo(() => {
    const allTiles = [localTile, ...remoteTiles];
    return allTiles.find((tile) => tile.id === dominantSpeakerId) || null;
  }, [dominantSpeakerId, localTile, remoteTiles]);

  const featuredTile = useMemo(() => {
    if (selectedTile) {
      if (selectedTile === 'local') {
        return localTile;
      }

      return remoteTiles.find((tile) => tile.id === selectedTile) || null;
    }

    if (isSharingScreen) {
      return localTile;
    }

    const remotePresenter = remoteTiles.find((tile) => tile.isSharingScreen);
    if (remotePresenter) {
      return remotePresenter;
    }

    if (prioritizedSpeakerTile && speakingParticipantIds.size > 0) {
      return prioritizedSpeakerTile;
    }

    return null;
  }, [isSharingScreen, localTile, prioritizedSpeakerTile, remoteTiles, selectedTile, speakingParticipantIds]);

  const thumbnailTiles = useMemo(() => {
    const tiles = [localTile, ...remoteTiles];
    return tiles.filter((tile) => tile.stream && tile.id !== featuredTile?.id);
  }, [featuredTile?.id, localTile, remoteTiles]);

  const standardGridTiles = useMemo(() => {
    const tiles = [localTile, ...remoteTiles]
      .filter((tile) => tile.stream)
      .sort((left, right) => {
        const leftLevel = audioLevels[left.id] || 0;
        const rightLevel = audioLevels[right.id] || 0;
        return rightLevel - leftLevel;
      });
    if (tiles.length <= 1) return 'grid-cols-1 max-w-4xl';
    if (tiles.length === 2) return 'grid-cols-2 max-w-6xl';
    if (tiles.length <= 4) return 'grid-cols-2 max-w-6xl';
    return 'grid-cols-2 lg:grid-cols-3 max-w-7xl';
  }, [audioLevels, localTile, remoteTiles]);

  const orderedStandardTiles = useMemo(() => (
    [localTile, ...remoteTiles]
      .filter((tile) => tile.stream)
      .sort((left, right) => {
        const leftLevel = audioLevels[left.id] || 0;
        const rightLevel = audioLevels[right.id] || 0;
        return rightLevel - leftLevel;
      })
  ), [audioLevels, localTile, remoteTiles]);

  if (featuredTile) {
    return (
      <div className="w-full h-full flex flex-col gap-4 p-2">
        {remoteTiles.map((tile) => (
          <RemoteAudio key={`audio-${tile.id}`} stream={tile.stream} />
        ))}
        <div className="flex-1 min-h-0">
          <VideoPlayer
            stream={featuredTile.stream}
            label={featuredTile.isSharingScreen ? `${featuredTile.label} (Presenting)` : featuredTile.label}
            picture={featuredTile.picture}
            isHost={featuredTile.isHost}
            isLocal={featuredTile.isLocal}
            isHandRaised={featuredTile.isHandRaised}
            isSpeaking={speakingParticipantIds.has(featuredTile.id)}
            audioLevel={audioLevels[featuredTile.id] || 0}
            isAudioEnabled={featuredTile.isAudioEnabled}
            isVideoEnabled={featuredTile.isVideoEnabled}
            featured
          />
        </div>

        {thumbnailTiles.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {thumbnailTiles.map((tile) => {
              if (tile.isLocal && hideLocalThumbnail) {
                return null;
              }

              return (
                <div key={tile.id} className="relative w-48 flex-shrink-0">
                  <button
                    onClick={() => setSelectedTile(tile.id)}
                    className="absolute top-2 left-2 z-10 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80 transition-colors"
                    title="Maximize"
                  >
                    <Maximize2 size={14} />
                  </button>

                  {tile.isLocal && (
                    <button
                      onClick={() => setHideLocalThumbnail(true)}
                      className="absolute top-2 right-2 z-10 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80 transition-colors"
                      title="Hide my thumbnail"
                    >
                      <X size={14} />
                    </button>
                  )}

                  <VideoPlayer
                    stream={tile.stream}
                    label={tile.label}
                    picture={tile.picture}
                    isHost={tile.isHost}
                    isLocal={tile.isLocal}
                    isHandRaised={tile.isHandRaised}
                    isSpeaking={speakingParticipantIds.has(tile.id)}
                    audioLevel={audioLevels[tile.id] || 0}
                    isAudioEnabled={tile.isAudioEnabled}
                    isVideoEnabled={tile.isVideoEnabled}
                    compact
                  />
                </div>
              );
            })}

            {hideLocalThumbnail && (
              <button
                onClick={() => setHideLocalThumbnail(false)}
                className="w-20 h-28 flex-shrink-0 rounded-2xl border border-dashed border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 transition-colors flex items-center justify-center"
                title="Show my thumbnail again"
              >
                <Minimize2 size={18} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

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
      {remoteTiles.map((tile) => (
        <RemoteAudio key={`audio-${tile.id}`} stream={tile.stream} />
      ))}
      <div className={`grid gap-6 w-full ${standardGridTiles} mx-auto items-center justify-items-center`}>
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
              isHost={tile.isHost}
              isLocal={tile.isLocal}
              isHandRaised={tile.isHandRaised}
              isSpeaking={speakingParticipantIds.has(tile.id)}
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
