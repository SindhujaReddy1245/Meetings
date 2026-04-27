export default function SpeakerHighlight({
  active = false,
  featured = false,
  pulseTarget = 'none',
  children,
}) {
  const pulseClass = active && pulseTarget === 'avatar'
    ? 'animate-[speakerAvatarPulse_1.15s_ease-in-out_infinite]'
    : '';

  return (
    <div className={`relative ${pulseClass}`}>
      {active && (
        <>
          <div
            className={`pointer-events-none absolute inset-0 rounded-[inherit] border ${
              featured ? 'border-white/20' : 'border-white/18'
            } shadow-[0_0_0_1px_rgba(255,255,255,0.10)]`}
          />
          <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-white/5" />
        </>
      )}
      {children}
    </div>
  );
}
