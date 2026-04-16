import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, X, Minimize2 } from 'lucide-react';

function VideoPlayer({
  stream,
  label,
  isLocal = false,
  isHandRaised = false,
  featured = false,
  compact = false,
}) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className={`relative overflow-hidden shadow-2xl border border-gray-700/50 group flex items-center justify-center ${
      featured ? 'w-full h-full rounded-3xl bg-black' : 'w-full aspect-video rounded-2xl bg-gray-800'
    }`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full ${featured ? 'object-contain bg-black' : 'object-cover'} ${isLocal ? 'transform -scale-x-100' : ''}`}
      />

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

export default function VideoGrid({
  localStream,
  remoteStreams,
  participantsMetadata = {},
  localHandRaised = false,
  localParticipantName = 'You',
  isSharingScreen = false,
}) {
  const [selectedTile, setSelectedTile] = useState(null);
  const [hideLocalThumbnail, setHideLocalThumbnail] = useState(false);

  const remoteTiles = useMemo(() => (
    Object.entries(remoteStreams).map(([peerId, stream]) => ({
      id: peerId,
      stream,
      label: participantsMetadata[peerId]?.name || 'Participant',
      isHandRaised: participantsMetadata[peerId]?.isHandRaised,
      isSharingScreen: participantsMetadata[peerId]?.isSharingScreen,
      isLocal: false,
    }))
  ), [participantsMetadata, remoteStreams]);

  const localTile = useMemo(() => ({
    id: 'local',
    stream: localStream,
    label: localParticipantName,
    isHandRaised: localHandRaised,
    isSharingScreen,
    isLocal: true,
  }), [isSharingScreen, localHandRaised, localParticipantName, localStream]);

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
        <div className="flex-1 min-h-0">
          <VideoPlayer
            stream={featuredTile.stream}
            label={featuredTile.isLocal ? `${featuredTile.label} (Presenting)` : `${featuredTile.label} (Presenting)`}
            isLocal={featuredTile.isLocal}
            isHandRaised={featuredTile.isHandRaised}
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
                    isLocal={tile.isLocal}
                    isHandRaised={tile.isHandRaised}
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
      <div className={`grid gap-6 w-full ${standardGridTiles} mx-auto items-center justify-items-center`}>
        <VideoPlayer
          stream={localStream}
          label={localParticipantName}
          isLocal
          isHandRaised={localHandRaised}
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
              isHandRaised={tile.isHandRaised}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
