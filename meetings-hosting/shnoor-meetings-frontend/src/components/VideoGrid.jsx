import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, MicOff, Minimize2, X } from 'lucide-react';
import { getCurrentUser } from '../utils/currentUser';
import ProfileAvatar from './ProfileAvatar';
import useActiveSpeaker from '../hooks/useActiveSpeaker';

/* ─── helpers ─────────────────────────────────────────── */
function hasUsableVideo(stream) {
  return Boolean(stream?.getVideoTracks?.().some((t) => t.readyState === 'live'));
}

/* ─── RemoteAudio ──────────────────────────────────────── */
function RemoteAudio({ stream }) {
  const audioRef = useRef(null);
  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
      audioRef.current.play().catch(() => {});
    }
  }, [stream]);
  return <audio ref={audioRef} autoPlay playsInline />;
}

/* ─── VideoPlayer ──────────────────────────────────────── */
function VideoPlayer({
  stream,
  label,
  picture,
  isHost = false,
  isLocal = false,
  isHandRaised = false,
  isSpeaking = false,
  isVideoEnabled = true,
  isAudioEnabled = true,
  featured = false,
  compact = false,
}) {
  const videoRef = useRef(null);
  const [videoReady, setVideoReady] = useState(false);

  const loggedInUser = getCurrentUser();
  const resolvedPicture = isLocal ? (picture || loggedInUser?.picture || null) : picture;
  const resolvedLabel  = isLocal ? (label  || loggedInUser?.name  || loggedInUser?.email || 'You') : label;

  const hasLiveVideo   = hasUsableVideo(stream);
  const shouldShowVideo = Boolean(isVideoEnabled) && hasLiveVideo;

  useEffect(() => {
    setVideoReady(false);
    if (videoRef.current && stream) {
      const el = videoRef.current;
      el.srcObject     = stream;
      el.defaultMuted  = true;
      el.muted         = true;
      el.playsInline   = true;
      el.play()
        .then(() => setVideoReady(true))
        .catch(() => {});
    }
  }, [hasLiveVideo, isVideoEnabled, stream]);

  /* ── tile border: only a colour change, no scale ── */
  const tileBorder = isSpeaking
    ? 'border-[3px] border-[#4CAF50] shadow-[0_0_0_1px_rgba(76,175,80,0.3)]'
    : 'border border-gray-700/50';

  const tileBase = featured
    ? `relative overflow-hidden flex items-center justify-center w-full h-full rounded-3xl bg-black`
    : `relative overflow-hidden flex items-center justify-center w-full aspect-video rounded-2xl`;

  return (
    /* NO scale / transform on the wrapper — ever */
    <div
      className={`${tileBase} ${tileBorder} transition-[border-color,box-shadow] duration-200`}
    >

      {/* ── VIDEO ON ── */}
      {shouldShowVideo && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={() => setVideoReady(true)}
          onCanPlay={() => setVideoReady(true)}
          className={`w-full h-full ${featured ? 'object-contain bg-black' : 'object-cover'} ${isLocal ? '-scale-x-100' : ''}`}
        />
      )}

      
      
      {/* ── VIDEO OFF ── */}
      {!shouldShowVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
          <div className="avatar-wrapper">
            {isSpeaking && <div className="avatar-ripple" />}
            <div className="avatar-content">
              <ProfileAvatar
                name={resolvedLabel}
                picture={resolvedPicture}
                className={featured ? 'h-36 w-36 sm:h-44 sm:w-44' : compact ? 'h-16 w-16' : 'h-24 w-24'}
                textClass={featured ? 'text-6xl' : compact ? 'text-2xl' : 'text-4xl'}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── top-left: small avatar + HOST badge ── */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <ProfileAvatar
          name={resolvedLabel}
          picture={resolvedPicture}
          className={compact ? 'h-8 w-8' : 'h-10 w-10'}
          textClass={compact ? 'text-xs' : 'text-sm'}
          ringClassName={isSpeaking ? 'ring-2 ring-[#4CAF50]' : 'ring-2 ring-white/60'}
        />
        {isHost && (
          <span className="rounded-full bg-black/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/85 backdrop-blur-md">
            Host
          </span>
        )}
      </div>

      {/* ── mic-off icon ── */}
      {!isAudioEnabled && (
        <div className="absolute top-3 right-3 z-10 rounded-full bg-black/55 p-2 text-white">
          <MicOff size={compact ? 14 : 16} />
        </div>
      )}

      {/* ── raise-hand ── */}
      {isHandRaised && (
        <div className="absolute top-14 right-3 z-10 rounded-full bg-yellow-500 border-2 border-yellow-400 p-2 text-white text-xs font-bold">
          ✋
        </div>
      )}

      {/* ── bottom bar: name + speaking pill ── */}
      <div className="absolute bottom-3 left-3 right-3 z-10 flex items-end justify-between">
        <div className={`rounded-lg bg-black/60 backdrop-blur-md text-white font-semibold border border-white/10 shadow ${compact ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'}`}>
          {resolvedLabel}
        </div>

        {isSpeaking && (
          <div className="flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-[#81C784]">
            <span className="h-2 w-2 rounded-full bg-[#4CAF50] animate-pulse" />
            Speaking
          </div>
        )}
      </div>

      {/* subtle gradient for readability */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
    </div>
  );
}

/* ─── VideoGrid (main export) ──────────────────────────── */
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

  /* build tile descriptors */
  const remoteTiles = useMemo(() => (
    Object.entries(remoteStreams).map(([peerId, stream]) => ({
      id: peerId,
      stream,
      label:          participantsMetadata[peerId]?.name          || 'Participant',
      picture:        participantsMetadata[peerId]?.picture        || null,
      isHandRaised:   participantsMetadata[peerId]?.isHandRaised  || false,
      isSharingScreen:participantsMetadata[peerId]?.isSharingScreen || false,
      isHost:         participantsMetadata[peerId]?.role === 'host',
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

  /* speaker detection */
  const { dominantSpeakerId, speakingIds, audioLevels } = useActiveSpeaker(
    [localTile, ...remoteTiles],
    getPeerConnection
  );

  /* featured tile logic */
  const prioritizedSpeakerTile = useMemo(() => {
    const all = [localTile, ...remoteTiles];
    return all.find((t) => t.id === dominantSpeakerId) || null;
  }, [dominantSpeakerId, localTile, remoteTiles]);

  const featuredTile = useMemo(() => {
    if (selectedTile) return selectedTile === 'local' ? localTile : remoteTiles.find((t) => t.id === selectedTile) || null;
    if (isSharingScreen) return localTile;
    const remotePresenter = remoteTiles.find((t) => t.isSharingScreen);
    if (remotePresenter) return remotePresenter;
    if (prioritizedSpeakerTile && speakingIds.size > 0) return prioritizedSpeakerTile;
    return null;
  }, [isSharingScreen, localTile, prioritizedSpeakerTile, remoteTiles, selectedTile, speakingIds]);

  const thumbnailTiles = useMemo(() => (
    [localTile, ...remoteTiles].filter((t) => t.stream && t.id !== featuredTile?.id)
  ), [featuredTile?.id, localTile, remoteTiles]);

  const gridClass = useMemo(() => {
    const count = [localTile, ...remoteTiles].filter((t) => t.stream).length;
    if (count <= 1) return 'grid-cols-1 max-w-4xl';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2 max-w-6xl';
    if (count <= 4) return 'grid-cols-2 max-w-6xl';
    return 'grid-cols-2 lg:grid-cols-3 max-w-7xl';
  }, [localTile, remoteTiles]);

  const orderedTiles = useMemo(() => (
    [localTile, ...remoteTiles]
      .filter((t) => t.stream)
      .sort((a, b) => (audioLevels[b.id] || 0) - (audioLevels[a.id] || 0))
  ), [audioLevels, localTile, remoteTiles]);

  /* ── CSS for ripple effect only ── */
  const styles = `
    .avatar-wrapper {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .avatar-content {
      position: relative;
      z-index: 1;
    }
    .avatar-ripple {
      position: absolute;
      width: 130%;
      height: 130%;
      background: rgba(255, 255, 255, 0.25);
      border-radius: 50%;
      z-index: 0;
      animation: ripple 0.8s ease-in-out infinite;
    }
    @keyframes ripple {
      0%   { transform: scale(1);    opacity: 0.6; }
      50%  { transform: scale(1.15); opacity: 0.2;  }
      100% { transform: scale(1);    opacity: 0.6; }
    }
  `;

  /* ── FEATURED layout ── */
  if (featuredTile) {
    return (
      <div className="w-full h-full flex flex-col gap-4 p-2">
        <style>{styles}</style>
        {remoteTiles.map((t) => <RemoteAudio key={`audio-${t.id}`} stream={t.stream} />)}

        <div className="flex-1 min-h-0">
          <VideoPlayer
            stream={featuredTile.stream}
            label={featuredTile.isSharingScreen ? `${featuredTile.label} (Presenting)` : featuredTile.label}
            picture={featuredTile.picture}
            isHost={featuredTile.isHost}
            isLocal={featuredTile.isLocal}
            isHandRaised={featuredTile.isHandRaised}
            isSpeaking={speakingIds.has(featuredTile.id)}
            isAudioEnabled={featuredTile.isAudioEnabled}
            isVideoEnabled={featuredTile.isVideoEnabled}
            featured
          />
        </div>

        {thumbnailTiles.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {thumbnailTiles.map((tile) => {
              if (tile.isLocal && hideLocalThumbnail) return null;
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
                      title="Hide"
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
                    isSpeaking={speakingIds.has(tile.id)}
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
              >
                <Minimize2 size={18} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ── GRID layout ── */
  return (
    <div className="w-full h-full flex items-center justify-center p-4 overflow-y-auto">
      <style>{styles}</style>
      {remoteTiles.map((t) => <RemoteAudio key={`audio-${t.id}`} stream={t.stream} />)}
      <div className={`grid gap-6 w-full ${gridClass} mx-auto items-center justify-items-center`}>
        {orderedTiles.map((tile) => (
          <button key={tile.id} onClick={() => setSelectedTile(tile.id)} className="w-full">
            <VideoPlayer
              stream={tile.stream}
              label={tile.label}
              picture={tile.picture}
              isHost={tile.isHost}
              isLocal={tile.isLocal}
              isHandRaised={tile.isHandRaised}
              isSpeaking={speakingIds.has(tile.id)}
              isAudioEnabled={tile.isAudioEnabled}
              isVideoEnabled={tile.isVideoEnabled}
            />
          </button>
        ))}
      </div>
    </div>
  );
}