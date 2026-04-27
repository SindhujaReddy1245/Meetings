import { useEffect, useMemo, useRef, useState } from 'react';

// RMS levels from getByteTimeDomainData are typically small; keep this low for reliable speech detection.
const LEVEL_THRESHOLD = 0.01;
const SPEAKING_HANG_MS = 360;
const DOMINANT_HOLD_MS = 520;
const TICK_MS = 200;

export default function useActiveSpeaker(tiles, getPeerConnection) {
  const [state, setState] = useState({
    dominantSpeakerId: null,
    speakingIds: [],
    audioLevels: {},
  });
  const refs = useRef({
    lastSpokeAt: {},
    dominantSpeakerId: null,
    dominantSince: 0,
    smoothedLevels: {},
  });

  const monitoredTiles = useMemo(
    () => tiles.filter((tile) => tile?.id && tile?.stream),
    [tiles]
  );

  useEffect(() => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass || !monitoredTiles.length) {
      setState({ dominantSpeakerId: null, speakingIds: [], audioLevels: {} });
      refs.current = {
        lastSpokeAt: {},
        dominantSpeakerId: null,
        dominantSince: 0,
        smoothedLevels: {},
      };
      return undefined;
    }

    const audioContext = new AudioContextClass();
    const analysers = new Map();
    const buffers = new Map();

    monitoredTiles.forEach((tile) => {
      const audioTracks = tile.stream?.getAudioTracks?.() || [];
      if (!audioTracks.length) {
        return;
      }

      try {
        const source = audioContext.createMediaStreamSource(new MediaStream(audioTracks));
        const analyser = audioContext.createAnalyser();
        // Time-domain RMS tends to be more stable for speech detection than frequency averages.
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        analysers.set(tile.id, { analyser, source });
        buffers.set(tile.id, new Uint8Array(analyser.fftSize));
      } catch (error) {
        console.warn('Unable to initialize active speaker monitoring for', tile.id, error);
      }
    });

    let isCancelled = false;

    const tick = () => {
      const now = Date.now();
      const levels = {};

      monitoredTiles.forEach((tile) => {
        if (tile.isAudioEnabled === false) {
          levels[tile.id] = 0;
          return;
        }

        const analyserEntry = analysers.get(tile.id);
        let analyserLevel = 0;

        if (analyserEntry) {
          const buffer = buffers.get(tile.id);
          analyserEntry.analyser.getByteTimeDomainData(buffer);
          // Compute RMS around 128 (silence). Normalized to 0..1-ish.
          let sumSquares = 0;
          for (let i = 0; i < buffer.length; i += 1) {
            const centered = (buffer[i] - 128) / 128;
            sumSquares += centered * centered;
          }
          analyserLevel = Math.sqrt(sumSquares / buffer.length);
        }

        const rawLevel = analyserLevel;
        const previousSmoothed = refs.current.smoothedLevels[tile.id] || 0;
        const smoothedLevel = (previousSmoothed * 0.68) + (rawLevel * 0.32);
        refs.current.smoothedLevels[tile.id] = smoothedLevel;
        levels[tile.id] = smoothedLevel;

        if (smoothedLevel > LEVEL_THRESHOLD) {
          refs.current.lastSpokeAt[tile.id] = now;
        }
      });

      const speakingIds = monitoredTiles
        .filter((tile) => {
          const lastSpokeAt = refs.current.lastSpokeAt[tile.id] || 0;
          return levels[tile.id] > LEVEL_THRESHOLD || (now - lastSpokeAt) < SPEAKING_HANG_MS;
        })
        .sort((left, right) => (levels[right.id] || 0) - (levels[left.id] || 0))
        .map((tile) => tile.id);

      const topSpeakerId = speakingIds[0] || null;
      let nextDominantSpeakerId = refs.current.dominantSpeakerId;

      if (!topSpeakerId) {
        if ((now - refs.current.dominantSince) > DOMINANT_HOLD_MS) {
          nextDominantSpeakerId = null;
        }
      } else if (nextDominantSpeakerId === topSpeakerId) {
        refs.current.dominantSince = now;
      } else {
        const currentLevel = levels[nextDominantSpeakerId] || 0;
        const candidateLevel = levels[topSpeakerId] || 0;
        const shouldSwitch = !nextDominantSpeakerId
          || candidateLevel > (currentLevel * 1.18)
          || (now - refs.current.dominantSince) > DOMINANT_HOLD_MS;

        if (shouldSwitch) {
          nextDominantSpeakerId = topSpeakerId;
          refs.current.dominantSince = now;
        }
      }

      refs.current.dominantSpeakerId = nextDominantSpeakerId;

      if (!isCancelled) {
        setState((current) => {
          const sameDominant = current.dominantSpeakerId === nextDominantSpeakerId;
          const sameSpeakingIds = current.speakingIds.length === speakingIds.length
            && current.speakingIds.every((id, index) => id === speakingIds[index]);

          if (sameDominant && sameSpeakingIds) {
            return { ...current, audioLevels: levels };
          }

          return {
            dominantSpeakerId: nextDominantSpeakerId,
            speakingIds,
            audioLevels: levels,
          };
        });
      }
    };

    audioContext.resume().catch(() => {});
    tick();
    const intervalId = window.setInterval(tick, TICK_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
      analysers.forEach(({ source }) => source.disconnect());
      audioContext.close().catch(() => {});
    };
  }, [getPeerConnection, monitoredTiles]);

  return {
    dominantSpeakerId: state.dominantSpeakerId,
    speakingIds: new Set(state.speakingIds),
    audioLevels: state.audioLevels,
  };
}
