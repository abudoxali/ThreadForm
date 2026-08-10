import type { HTMLAttributes } from 'react';
import { cx } from './cx';

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  raised?: boolean;
}

/** A bounded surface — the base container for rails, inspectors and cards. */
export function Panel({ raised, className, ...props }: PanelProps) {
  return (
    <div
      className={cx(
        'rounded-lg border border-border',
        raised ? 'bg-surface-raised' : 'bg-surface',
        className,
      )}
      {...props}
    />
  );
}
