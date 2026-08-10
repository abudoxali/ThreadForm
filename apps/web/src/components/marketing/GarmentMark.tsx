/**
 * Original abstract mark: a garment silhouette with its print-zone grid
 * exposed as line art. Deliberately not a photoreal mockup — no rendered
 * garment exists yet, and pretending otherwise would misrepresent the
 * product's current state.
 */
export function GarmentMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 360"
      fill="none"
      className={className}
      role="img"
      aria-label="Abstract garment silhouette showing front, chest and sleeve print zones"
    >
      <path
        d="M110 40 L130 20 L190 20 L210 40 L270 70 L250 120 L215 105 L215 320 L105 320 L105 105 L70 120 L50 70 Z"
        stroke="var(--tf-color-border-strong)"
        strokeWidth="1.5"
      />
      <rect
        x="128"
        y="90"
        width="64"
        height="80"
        rx="2"
        stroke="var(--tf-color-accent)"
        strokeWidth="1.5"
        strokeDasharray="4 4"
      />
      <rect
        x="142"
        y="65"
        width="22"
        height="18"
        rx="2"
        stroke="var(--tf-color-accent)"
        strokeWidth="1.5"
        strokeDasharray="4 4"
      />
      <circle cx="160" cy="30" r="10" stroke="var(--tf-color-border-strong)" strokeWidth="1.5" />
    </svg>
  );
}
