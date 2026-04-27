import { useEffect, useMemo, useRef, useState } from 'react';

const LEVEL_THRESHOLD = 0.04;
const SPEAKING_HANG_MS = 600;
const DOMINANT_HOLD_MS = 800;
const TICK_MS = 300; // Throttled to 300ms as requested

function getStatsLevel(reports) {
  let maxLevel = 0;
  reports.forEach((report) => {
    if (typeof report.audioLevel === 'number') {
      maxLevel = Math.max(maxLevel, report.audioLevel);
    }
    if (typeof report.totalAudioEnergy === 'number' && typeof report.totalSamplesDuration === 'number' && report.totalSamplesDuration > 0) {
      const normalized = Math.min(report.totalAudioEnergy / report.totalSamplesDuration, 1);
      maxLevel = Math.max(maxLevel, normalized);
    }
  });
  return maxLevel;
}

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
    timer: null,
    isProcessing: false
  });

  const monitoredTiles = useMemo(
    () => tiles.filter((tile) => tile?.id && tile?.stream),
    [tiles]
  );

  useEffect(() => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass || !monitoredTiles.length) {
      setState({ dominantSpeakerId: null, speakingIds: [], audioLevels: {} });
      return;
    }

    const audioContext = new AudioContextClass();
    const analysers = new Map();
    const buffers = new Map();

    monitoredTiles.forEach((tile) => {
      const audioTracks = tile.stream?.getAudioTracks?.() || [];
      if (!audioTracks.length) return;

      try {
        const source = audioContext.createMediaStreamSource(new MediaStream([audioTracks[0]]));
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256; // Reduced for performance
        analyser.smoothingTimeConstant = 0.4; // Faster response for throttled tick
        source.connect(analyser);
        analysers.set(tile.id, { analyser, source });
        buffers.set(tile.id, new Uint8Array(analyser.frequencyBinCount));
      } catch (error) {
        console.warn('Unable to initialize active speaker monitoring for', tile.id, error);
      }
    });

    const tick = async () => {
      if (refs.current.isProcessing) return;
      refs.current.isProcessing = true;

      const now = Date.now();
      const levels = {};
      const newLastSpokeAt = { ...refs.current.lastSpokeAt };

      try {
        await Promise.all(monitoredTiles.map(async (tile) => {
          if (tile.isAudioEnabled === false) {
            levels[tile.id] = 0;
            return;
          }

          const analyserEntry = analysers.get(tile.id);
          let analyserLevel = 0;

          if (analyserEntry) {
            const buffer = buffers.get(tile.id);
            analyserEntry.analyser.getByteFrequencyData(buffer);
            const sum = buffer.reduce((a, b) => a + b, 0);
            analyserLevel = sum / (buffer.length * 255);
          }

          let statsLevel = 0;
          if (!tile.isLocal) {
            const pc = getPeerConnection?.(tile.id);
            if (pc?.getStats) {
              const stats = await pc.getStats();
              statsLevel = getStatsLevel(stats);
            }
          }

          const rawLevel = Math.max(analyserLevel, statsLevel);
          const prev = refs.current.smoothedLevels[tile.id] || 0;
          const smoothed = (prev * 0.4) + (rawLevel * 0.6);
          
          refs.current.smoothedLevels[tile.id] = smoothed;
          levels[tile.id] = smoothed;

          if (smoothed > LEVEL_THRESHOLD) {
            newLastSpokeAt[tile.id] = now;
          }
        }));

        refs.current.lastSpokeAt = newLastSpokeAt;

        const speakingIds = monitoredTiles
          .filter((tile) => {
            const last = refs.current.lastSpokeAt[tile.id] || 0;
            return levels[tile.id] > LEVEL_THRESHOLD || (now - last) < SPEAKING_HANG_MS;
          })
          .sort((a, b) => (levels[b.id] || 0) - (levels[a.id] || 0))
          .map((t) => t.id);

        const topId = speakingIds[0] || null;
        let nextDominant = refs.current.dominantSpeakerId;

        if (!topId) {
          if ((now - refs.current.dominantSince) > DOMINANT_HOLD_MS) nextDominant = null;
        } else if (nextDominant === topId) {
          refs.current.dominantSince = now;
        } else {
          const currentLevel = levels[nextDominant] || 0;
          const candidateLevel = levels[topId] || 0;
          if (!nextDominant || candidateLevel > (currentLevel * 1.2) || (now - refs.current.dominantSince) > DOMINANT_HOLD_MS) {
            nextDominant = topId;
            refs.current.dominantSince = now;
          }
        }

        const changedDominant = refs.current.dominantSpeakerId !== nextDominant;
        const changedSpeaking = JSON.stringify(state.speakingIds) !== JSON.stringify(speakingIds);

        if (changedDominant || changedSpeaking) {
          refs.current.dominantSpeakerId = nextDominant;
          setState({
            dominantSpeakerId: nextDominant,
            speakingIds,
            audioLevels: levels
          });
        } else {
          setState(prev => ({ ...prev, audioLevels: levels }));
        }
      } catch (err) {
        console.error('Tick error', err);
      } finally {
        refs.current.isProcessing = false;
      }
    };

    audioContext.resume().catch(() => {});
    const intervalId = setInterval(tick, TICK_MS);

    return () => {
      clearInterval(intervalId);
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
