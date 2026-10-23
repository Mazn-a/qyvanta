export function WifaqMark({ size = 34 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="4 0 56 56" aria-hidden="true">
      <circle cx="16" cy="24" r="6" />
      <circle className="mark-gold" cx="32" cy="16" r="6" />
      <circle cx="48" cy="24" r="6" />
      <path d="M8 44h48" />
    </svg>
  );
}
