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
  forceAvatarOnly = false,
}) {
  const videoRef = useRef(null);
  const [videoReady, setVideoReady] = useState(false);
  const [isVideoRendering, setIsVideoRendering] = useState(false);
  const [hasLiveVideoTrackState, setHasLiveVideoTrackState] = useState(false);
  const [isRemoteVideoSuppressed, setIsRemoteVideoSuppressed] = useState(false);
  const [showRemoteAvatarShield, setShowRemoteAvatarShield] = useState(false);
  const lastVideoTrackIdRef = useRef(null);
  const loggedInUser = getCurrentUser();
  const resolvedPicture = isLocal ? (picture || loggedInUser?.picture || null) : picture;
  const resolvedLabel = isLocal ? (label || loggedInUser?.name || loggedInUser?.email || 'You') : label;
  const shouldShowVideo = !forceAvatarOnly && Boolean(isVideoEnabled) && hasLiveVideoTrackState && (isLocal || !isRemoteVideoSuppressed);
  const ringStrength = Math.max(0, Math.min(audioLevel * 18, 1));
  const showVideo = shouldShowVideo && videoReady && isVideoRendering;
  // Remote video element should mount only when frames are actually rendering;
  // this avoids black tiles on host view while the stream is still warming up.
  const shouldRenderVideoElement = !forceAvatarOnly && (isLocal ? shouldShowVideo : showVideo);

  useEffect(() => {
    const videoTrack = stream?.getVideoTracks?.()[0] || null;

    if (!videoTrack) {
      setHasLiveVideoTrackState(false);
      setIsVideoRendering(false);
      if (!isLocal) {
        setIsRemoteVideoSuppressed(false);
      }
      lastVideoTrackIdRef.current = null;
      return undefined;
    }

    if (lastVideoTrackIdRef.current !== videoTrack.id) {
      lastVideoTrackIdRef.current = videoTrack.id;
      if (!isLocal) {
        // New remote track means peer likely restarted camera; allow video again.
        setIsRemoteVideoSuppressed(false);
      }
    }

    const syncTrackState = () => {
      // For remote tracks, browser sets `muted = true` when no data has arrived yet —
      // this is a network/buffering state, NOT the user's camera-off state.
      // Only local tracks should use the muted flag as a signal.
      const hasLiveTrack = isLocal
        ? (
          videoTrack.readyState === 'live'
          && videoTrack.enabled !== false
          && videoTrack.muted !== true
        )
        : (
          videoTrack.readyState === 'live'
          && videoTrack.enabled !== false
        );
      setHasLiveVideoTrackState(hasLiveTrack);
      if (!hasLiveTrack) {
        // Immediately fall back to avatar tile instead of leaving a black video layer.
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
    if (isLocal || !stream) {
      setShowRemoteAvatarShield(false);
      return undefined;
    }

    // Keep avatar above remote tile briefly after join/track changes to prevent black flashes.
    setShowRemoteAvatarShield(true);
    const timeoutId = window.setTimeout(() => {
      setShowRemoteAvatarShield(false);
    }, 4000);

    return () => {
      window.clearTimeout(timeoutId);
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
    let lastTime = element.currentTime || 0;
    let stableTicks = 0;
    let stalledTicks = 0;
    let blackFrameTicks = 0;
    let consecutiveHealthyFrames = 0;
    let intervalId = null;
    let alreadyRendering = false;
    // For remote tiles: allow a generous startup window before enforcing black-frame checks.
    // This prevents the probe from triggering on the first few frames before the video
    // stream has fully warmed up, which caused remote tiles to go black immediately.
    let startupGraceTicks = isLocal ? 0 : 12; // 12 × 250ms = 3 seconds grace
    const probeCanvas = document.createElement('canvas');
    const probeContext = probeCanvas.getContext('2d', { willReadFrequently: true });
    probeCanvas.width = 24;
    probeCanvas.height = 14;

    const markRendering = () => {
      if (cancelled) return;
      alreadyRendering = true;
      if (!isLocal) {
        setIsRemoteVideoSuppressed(false);
      }
      setIsVideoRendering(true);
    };

    const unmarkRendering = () => {
      if (cancelled) return;
      alreadyRendering = false;
      if (!isLocal) {
        // Keep remote tiles on avatar fallback until healthy frames are confirmed.
        setIsRemoteVideoSuppressed(true);
      }
      setIsVideoRendering(false);
    };

    // Detect playback health and only render when frames are healthy.
    intervalId = window.setInterval(() => {
      if (cancelled) return;

      const hasDims = element.videoWidth > 0 && element.videoHeight > 0;
      const timeNow = element.currentTime || 0;
      const advanced = timeNow > lastTime + 0.08;

      if (advanced) {
        lastTime = timeNow;
        stalledTicks = 0;
        stableTicks += 1;
      } else if (hasDims) {
        stalledTicks += 1;
        stableTicks = 0;
      }

      // Count down the startup grace period before enforcing any black-frame checks.
      if (startupGraceTicks > 0) {
        startupGraceTicks -= 1;
        // During grace period, keep remote tiles on avatar to avoid brief black flashes.
        // Local tile can render immediately once frames advance.
        if (isLocal && hasDims && advanced) {
          markRendering();
        } else if (!isLocal) {
          unmarkRendering();
        }
        return;
      }

      // If frames stop advancing for ~2s (8 × 250ms), treat video as stalled → avatar fallback.
      if (stalledTicks >= 8) {
        consecutiveHealthyFrames = 0;
        unmarkRendering();
        return;
      }

      // Probe frames for black/corrupt content.
      if (hasDims && probeContext) {
        try {
          probeContext.drawImage(element, 0, 0, probeCanvas.width, probeCanvas.height);
          const frameData = probeContext.getImageData(0, 0, probeCanvas.width, probeCanvas.height).data;
          let total = 0;
          let totalSq = 0;
          let darkPixels = 0;
          let pixels = 0;

          for (let i = 0; i < frameData.length; i += 4) {
            const luminance = (0.2126 * frameData[i]) + (0.7152 * frameData[i + 1]) + (0.0722 * frameData[i + 2]);
            total += luminance;
            totalSq += luminance * luminance;
            if (luminance < 18) darkPixels += 1;
            pixels += 1;
          }

          const avg = pixels ? total / pixels : 0;
          const variance = pixels ? (totalSq / pixels) - (avg * avg) : 0;
          const darkRatio = pixels ? darkPixels / pixels : 1;
          const looksBlack = (avg < 16 && variance < 28) || darkRatio > 0.92;

          if (looksBlack) {
            consecutiveHealthyFrames = 0;
            blackFrameTicks += 1;
            // Only fall back to avatar after several consecutive black frames (not just 1-2)
            // to avoid falsely hiding a valid dark scene.
            if ((!isLocal && blackFrameTicks >= 1) || (isLocal && blackFrameTicks >= 6)) {
              unmarkRendering();
            }
          } else {
            blackFrameTicks = 0;
            consecutiveHealthyFrames += 1;
            // Require at least 2 consecutive healthy frames before marking as rendering,
            // for both local and remote tiles.
            if (consecutiveHealthyFrames >= 2) {
              markRendering();
            }
          }
        } catch {
          // Canvas probe failed (cross-origin or GPU issue). Don't aggressively hide
          // the video — leave current state as-is to avoid flickering to black.
          if (isLocal && !alreadyRendering && hasDims && advanced) {
            markRendering();
          }
        }
      } else if (hasDims && advanced) {
        // No probe context available but we have real frames advancing — show the video.
        if (isLocal) {
          markRendering();
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [isLocal, shouldShowVideo]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) {
      return undefined;
    }

    const handlePlaybackIssue = () => {
      setIsVideoRendering(false);
      element.play().catch(() => {
        // Keep avatar fallback visible if autoplay/playback can't recover immediately.
      });
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
            className={`absolute inset-0 w-full h-full ${featured ? 'object-contain bg-black' : 'object-cover'} ${isLocal ? 'transform -scale-x-100' : ''}`}
            style={{
              opacity: showVideo ? 1 : 0,
              transition: 'opacity 180ms ease-out',
              backgroundColor: 'transparent',
            }}
          />
        )}

        {(!showVideo || showRemoteAvatarShield) && (
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
          <div className={`bg-black/60 backdrop-blur-md rounded-lg text-white font-semibold tracking-wide border border-white/10 shadow-lg ${
            'px-4 py-1.5 text-sm'
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

function AvatarOnlyTile({
  label,
  picture,
  isHandRaised = false,
  isSpeaking = false,
  isDominantSpeaker = false,
  featured = false,
  audioLevel = 0,
}) {
  const ringStrength = Math.max(0, Math.min(audioLevel * 18, 1));

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
              name={label}
              picture={picture}
              className={featured ? 'h-36 w-36 sm:h-44 sm:w-44' : 'h-24 w-24'}
              textClass={featured ? 'text-6xl' : 'text-4xl'}
              ringClassName="border-2 border-white/60"
            />
          </div>
        </div>

        {isHandRaised && (
          <div className="absolute top-20 right-4 bg-yellow-500 text-white p-2 rounded-full shadow-lg border-2 border-yellow-400 z-10">
            <span className="text-xs font-bold">RH</span>
          </div>
        )}

        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
          <div className="bg-black/60 backdrop-blur-md rounded-lg text-white font-semibold tracking-wide border border-white/10 shadow-lg px-4 py-1.5 text-sm">
            {label}
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
  forceRemoteAvatarOnly = false,
  getPeerConnection,
}) {
  // kept for future interactions (e.g. pin), but the UI stays in grid mode always
  const [selectedTile, setSelectedTile] = useState(null);

  const remoteTiles = useMemo(() => (
    Object.entries(remoteStreams).map(([peerId, stream]) => ({
      hasPublishedMediaState: participantsMetadata[peerId]?.hasPublishedMediaState ?? false,
      id: peerId,
      stream,
      label: participantsMetadata[peerId]?.name || 'Participant',
      picture: participantsMetadata[peerId]?.picture || null,
      isHandRaised: participantsMetadata[peerId]?.isHandRaised,
      isSharingScreen: participantsMetadata[peerId]?.isSharingScreen,
      isHost: participantsMetadata[peerId]?.role === 'host',
      isAudioEnabled: participantsMetadata[peerId]?.isAudioEnabled ?? true,
      // Do not render remote video unless that peer explicitly published media state.
      isVideoEnabled: (participantsMetadata[peerId]?.hasPublishedMediaState ?? false)
        ? (participantsMetadata[peerId]?.isVideoEnabled ?? false)
        : false,
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

  const orderedStandardTiles = useMemo(() => (
    [localTile, ...remoteTiles]
      .filter((tile) => tile.stream)
      .sort((left, right) => {
        const leftLevel = audioLevels[left.id] || 0;
        const rightLevel = audioLevels[right.id] || 0;
        return rightLevel - leftLevel;
      })
  ), [audioLevels, localTile, remoteTiles]);

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
            {!tile.isLocal && forceRemoteAvatarOnly ? (
              <AvatarOnlyTile
                label={tile.label}
                picture={tile.picture}
                isHandRaised={tile.isHandRaised}
                isSpeaking={speakingParticipantIds.has(tile.id)}
                isDominantSpeaker={dominantSpeakerId === tile.id}
                audioLevel={audioLevels[tile.id] || 0}
              />
            ) : (
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
                forceAvatarOnly={!tile.isLocal && forceRemoteAvatarOnly}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
