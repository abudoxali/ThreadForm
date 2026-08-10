import type { HTMLAttributes } from 'react';

/** Renders children for assistive tech only — visually hidden but not `display: none`. */
export function VisuallyHidden(props: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className="absolute h-px w-px overflow-hidden whitespace-nowrap border-0 p-0"
      style={{ clip: 'rect(0, 0, 0, 0)' }}
      {...props}
    />
  );
}
