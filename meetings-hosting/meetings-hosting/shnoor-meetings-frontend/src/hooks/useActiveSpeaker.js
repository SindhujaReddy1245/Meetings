import { useEffect, useMemo, useRef, useState } from 'react';

const LEVEL_THRESHOLD = 0.04;
const SPEAKING_HANG_MS = 420;
const DOMINANT_HOLD_MS = 650;
const TICK_MS = 300;

function getStatsLevel(reports) {
  let maxLevel = 0;
  reports.forEach((report) => {
    if (typeof report.audioLevel === 'number') {
      maxLevel = Math.max(maxLevel, report.audioLevel);
    }
    if (
      typeof report.totalAudioEnergy === 'number' &&
      typeof report.totalSamplesDuration === 'number' &&
      report.totalSamplesDuration > 0
    ) {
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
  });

  const monitoredTiles = useMemo(
    () => tiles.filter((tile) => tile?.id && tile?.stream),
    [tiles]
  );

  useEffect(() => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass || !monitoredTiles.length) {
      setState({ dominantSpeakerId: null, speakingIds: [], audioLevels: {} });
      refs.current = { lastSpokeAt: {}, dominantSpeakerId: null, dominantSince: 0, smoothedLevels: {} };
      return undefined;
    }

    const audioContext = new AudioContextClass();
    const analysers = new Map();
    const buffers = new Map();

    monitoredTiles.forEach((tile) => {
      const audioTracks = tile.stream?.getAudioTracks?.() || [];
      if (!audioTracks.length) return;
      try {
        const source = audioContext.createMediaStreamSource(new MediaStream(audioTracks));
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.82;
        source.connect(analyser);
        analysers.set(tile.id, { analyser, source });
        buffers.set(tile.id, new Uint8Array(analyser.frequencyBinCount));
      } catch (err) {
        console.warn('Active speaker init failed for', tile.id, err);
      }
    });

    let isCancelled = false;

    const tick = async () => {
      const now = Date.now();
      const levels = {};

      await Promise.all(
        monitoredTiles.map(async (tile) => {
          if (tile.isAudioEnabled === false) { levels[tile.id] = 0; return; }

          const entry = analysers.get(tile.id);
          let analyserLevel = 0;
          if (entry) {
            const buf = buffers.get(tile.id);
            entry.analyser.getByteFrequencyData(buf);
            analyserLevel = buf.reduce((s, v) => s + v, 0) / (buf.length * 255);
          }

          let statsLevel = 0;
          if (!tile.isLocal) {
            const pc = getPeerConnection?.(tile.id);
            if (pc?.getStats && pc.connectionState=='connected') {
              try { statsLevel = getStatsLevel(await pc.getStats()); } catch (_) {}
            }
          }

          const raw = Math.max(analyserLevel, statsLevel);
          const prev = refs.current.smoothedLevels[tile.id] || 0;
          const smoothed = prev * 0.58 + raw * 0.42;
          refs.current.smoothedLevels[tile.id] = smoothed;
          levels[tile.id] = smoothed;
          if (smoothed > LEVEL_THRESHOLD) refs.current.lastSpokeAt[tile.id] = now;
        })
      );

      const speakingIds = monitoredTiles
        .filter((tile) => {
          const last = refs.current.lastSpokeAt[tile.id] || 0;
          return levels[tile.id] > LEVEL_THRESHOLD || now - last < SPEAKING_HANG_MS;
        })
        .sort((a, b) => (levels[b.id] || 0) - (levels[a.id] || 0))
        .map((t) => t.id);

      const top = speakingIds[0] || null;
      let next = refs.current.dominantSpeakerId;

      if (!top) {
        if (now - refs.current.dominantSince > DOMINANT_HOLD_MS) next = null;
      } else if (next === top) {
        refs.current.dominantSince = now;
      } else {
        const cur = levels[next] || 0;
        const cand = levels[top] || 0;
        if (!next || cand > cur * 1.18 || now - refs.current.dominantSince > DOMINANT_HOLD_MS) {
          next = top;
          refs.current.dominantSince = now;
        }
      }

      refs.current.dominantSpeakerId = next;

      if (!isCancelled) {
        setState((cur) => {
          const sameDom = cur.dominantSpeakerId === next;
          const sameIds = cur.speakingIds.length === speakingIds.length &&
            cur.speakingIds.every((id, i) => id === speakingIds[i]);
          if (sameDom && sameIds) return { ...cur, audioLevels: levels };
          return { dominantSpeakerId: next, speakingIds, audioLevels: levels };
        });
      }
    };

    audioContext.resume().catch(() => {});
    let isRunning = false;
    const id = setInterval(async () => {
        if (isRunning) return;
        isRunning = true;
        try { await tick(); } finally { isRunning = false; }
    }, TICK_MS);

    return () => {
      isCancelled = true;
      clearInterval(id);
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