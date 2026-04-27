export default function SpeakerHighlight({
  active = false,
  featured = false,
  pulseTarget = 'tile',
  children,
}) {
  if (!active) {
    return children;
  }

  const targetClass = pulseTarget === 'avatar'
    ? 'animate-[speakerAvatarPulse_1.25s_ease-in-out_infinite]'
    : featured
      ? 'animate-[speakerTilePulse_1.25s_ease-in-out_infinite]'
      : 'animate-[speakerRing_1.25s_ease-in-out_infinite]';

  return (
    <div className={targetClass}>
      {children}
    </div>
  );
}
