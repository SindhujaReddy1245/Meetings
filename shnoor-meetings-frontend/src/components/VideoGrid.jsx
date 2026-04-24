import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, MicOff, Minimize2, X } from 'lucide-react';

function getDisplayInitial(name = 'P') {
  return `${name}`.trim().charAt(0).toUpperCase() || 'P';
}

function hasUsableVideo(stream) {
  return Boolean(
    stream?.getVideoTracks?.().some((track) => (
      track.readyState === 'live' && track.muted !== true
    ))
  );
}

function AvatarBadge({ name, picture, sizeClass = 'h-24 w-24', textClass = 'text-4xl' }) {
  const [imageFailed, setImageFailed] = useState(false);
  const shouldShowImage = Boolean(picture && !imageFailed);

  return (
    <div className={`${sizeClass} overflow-hidden rounded-full border border-white/30 bg-sky-700/90 shadow-xl`}>
      {shouldShowImage ? (
        <img
          src={picture}
          alt={name || 'Participant'}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sky-600 to-blue-900 text-white">
          <span className={`font-light ${textClass}`}>{getDisplayInitial(name)}</span>
        </div>
      )}
    </div>
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

function useSpeakingParticipants(tiles) {
  const [speakingIds, setSpeakingIds] = useState([]);

  useEffect(() => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass || !tiles.length) {
      setSpeakingIds([]);
      return undefined;
    }

    const audioContext = new AudioContextClass();
    const monitoredSources = [];
    const sampleBuffer = new Uint8Array(512);

    const isSameIds = (left, right) => (
      left.length === right.length && left.every((item, index) => item === right[index])
    );

    tiles.forEach((tile) => {
      const audioTracks = tile.stream?.getAudioTracks?.() || [];
      if (!audioTracks.length || tile.isAudioEnabled === false) {
        return;
      }

      try {
        const stream = new MediaStream(audioTracks);
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);

        monitoredSources.push({
          id: tile.id,
          analyser,
          source,
        });
      } catch (error) {
        console.warn('Unable to monitor speaking activity for participant', tile.id, error);
      }
    });

    const tick = () => {
      const activeSpeakers = monitoredSources
        .filter(({ analyser }) => {
          analyser.getByteTimeDomainData(sampleBuffer);

          let total = 0;
          for (let index = 0; index < sampleBuffer.length; index += 1) {
            const normalized = (sampleBuffer[index] - 128) / 128;
            total += normalized * normalized;
          }

          const rms = Math.sqrt(total / sampleBuffer.length);
          return rms > 0.045;
        })
        .map(({ id }) => id)
        .sort();

      setSpeakingIds((current) => (isSameIds(current, activeSpeakers) ? current : activeSpeakers));
    };

    audioContext.resume().catch(() => {});
    tick();
    const intervalId = window.setInterval(tick, 160);

    return () => {
      window.clearInterval(intervalId);
      monitoredSources.forEach(({ source }) => source.disconnect());
      audioContext.close().catch(() => {});
    };
  }, [tiles]);

  return new Set(speakingIds);
}

function VideoPlayer({
  stream,
  label,
  picture,
  isLocal = false,
  isHandRaised = false,
  isSpeaking = false,
  isVideoEnabled = true,
  isAudioEnabled = true,
  featured = false,
  compact = false,
}) {
  const videoRef = useRef(null);
  const shouldShowVideo = Boolean(isVideoEnabled) && hasUsableVideo(stream);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((error) => {
        console.warn('Video autoplay failed for stream', error);
      });
    }
  }, [stream]);

  return (
    <div
      className={`relative overflow-hidden border group flex items-center justify-center transition-all duration-200 ${
        featured ? 'w-full h-full rounded-3xl bg-black' : 'w-full aspect-video rounded-2xl bg-gray-800'
      } ${
        isSpeaking
          ? 'border-emerald-300 shadow-[0_0_0_4px_rgba(52,211,153,0.28),0_0_35px_rgba(52,211,153,0.25)]'
          : 'border-gray-700/50 shadow-2xl'
      }`}
      style={isSpeaking ? { animation: 'speakerTile 1.15s ease-in-out infinite' } : undefined}
    >
      {shouldShowVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`w-full h-full ${featured ? 'object-contain bg-black' : 'object-cover'} ${isLocal ? 'transform -scale-x-100' : ''}`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_top,#1f5f8b_0%,#174d76_40%,#103754_100%)]">
          <SpeakerBackdrop active={isSpeaking} featured={featured} />
          <div style={isSpeaking ? { animation: 'speakerAvatar 1.25s ease-in-out infinite' } : undefined}>
            <AvatarBadge
              name={label}
              picture={picture}
              sizeClass={featured ? 'h-36 w-36 sm:h-44 sm:w-44' : compact ? 'h-16 w-16' : 'h-24 w-24'}
              textClass={featured ? 'text-6xl' : compact ? 'text-2xl' : 'text-4xl'}
            />
          </div>
        </div>
      )}

      {!isAudioEnabled && (
        <div className="absolute top-4 left-4 rounded-full bg-black/55 p-2 text-white shadow-lg">
          <MicOff size={compact ? 14 : 16} />
        </div>
      )}

      {isHandRaised && (
        <div className="absolute top-4 right-4 bg-yellow-500 text-white p-2 rounded-full shadow-lg border-2 border-yellow-400 z-10">
          <span className="text-xs font-bold">RH</span>
        </div>
      )}

      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
        <div className={`bg-black/60 backdrop-blur-md rounded-lg text-white font-semibold tracking-wide border border-white/10 shadow-lg ${
          compact ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm'
        }`}>
          {label}
        </div>
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
    </div>
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
  isSharingScreen = false,
  isAudioEnabled = true,
  isVideoEnabled = true,
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
    isAudioEnabled,
    isVideoEnabled,
    isLocal: true,
  }), [isAudioEnabled, isSharingScreen, isVideoEnabled, localHandRaised, localParticipantName, localParticipantPicture, localStream]);

  const speakingParticipantIds = useSpeakingParticipants([localTile, ...remoteTiles]);

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

    return remoteTiles.find((tile) => tile.isSharingScreen) || null;
  }, [isSharingScreen, localTile, remoteTiles, selectedTile]);

  const thumbnailTiles = useMemo(() => {
    const tiles = [localTile, ...remoteTiles];
    return tiles.filter((tile) => tile.stream && tile.id !== featuredTile?.id);
  }, [featuredTile?.id, localTile, remoteTiles]);

  const standardGridTiles = useMemo(() => {
    const tiles = [localTile, ...remoteTiles].filter((tile) => tile.stream);
    if (tiles.length <= 1) return 'grid-cols-1 max-w-4xl';
    if (tiles.length === 2) return 'grid-cols-1 md:grid-cols-2 max-w-6xl';
    if (tiles.length <= 4) return 'grid-cols-2 max-w-6xl';
    return 'grid-cols-2 lg:grid-cols-3 max-w-7xl';
  }, [localTile, remoteTiles]);

  if (featuredTile) {
    return (
      <div className="w-full h-full flex flex-col gap-4 p-2">
        {remoteTiles.map((tile) => (
          <RemoteAudio key={`audio-${tile.id}`} stream={tile.stream} />
        ))}
        <div className="flex-1 min-h-0">
          <VideoPlayer
            stream={featuredTile.stream}
            label={`${featuredTile.label} (Presenting)`}
            picture={featuredTile.picture}
            isLocal={featuredTile.isLocal}
            isHandRaised={featuredTile.isHandRaised}
            isSpeaking={speakingParticipantIds.has(featuredTile.id)}
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
                    isLocal={tile.isLocal}
                    isHandRaised={tile.isHandRaised}
                    isSpeaking={speakingParticipantIds.has(tile.id)}
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
        @keyframes speakerAvatar {
          0%, 100% { transform: scale(0.98); }
          50% { transform: scale(1.05); }
        }
        @keyframes speakerGlow {
          0%, 100% { transform: scale(0.96); opacity: 0.2; }
          50% { transform: scale(1.14); opacity: 0.55; }
        }
        @keyframes speakerTile {
          0%, 100% { transform: scale(0.99); }
          50% { transform: scale(1.025); }
        }
      `}</style>
      {remoteTiles.map((tile) => (
        <RemoteAudio key={`audio-${tile.id}`} stream={tile.stream} />
      ))}
      <div className={`grid gap-6 w-full ${standardGridTiles} mx-auto items-center justify-items-center`}>
        <VideoPlayer
          stream={localStream}
          label={localParticipantName}
          picture={localParticipantPicture}
          isLocal
          isHandRaised={localHandRaised}
          isSpeaking={speakingParticipantIds.has('local')}
          isAudioEnabled={isAudioEnabled}
          isVideoEnabled={isVideoEnabled}
        />

        {remoteTiles.map((tile) => (
          <button
            key={tile.id}
            onClick={() => setSelectedTile(tile.id)}
            className="w-full"
          >
            <VideoPlayer
              stream={tile.stream}
              label={tile.label}
              picture={tile.picture}
              isHandRaised={tile.isHandRaised}
              isSpeaking={speakingParticipantIds.has(tile.id)}
              isAudioEnabled={tile.isAudioEnabled}
              isVideoEnabled={tile.isVideoEnabled}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
