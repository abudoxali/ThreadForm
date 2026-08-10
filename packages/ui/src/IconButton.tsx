import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  /** Required — icon-only controls must still announce their purpose. */
  'aria-label': string;
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, active, className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex h-9 w-9 items-center justify-center rounded-md text-secondary transition-colors',
        'duration-[var(--tf-duration-fast)] ease-[var(--tf-ease-standard)] hover:bg-surface-raised hover:text-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        'disabled:opacity-40 disabled:pointer-events-none',
        active && 'bg-surface-raised text-accent-strong',
        className,
      )}
      aria-pressed={active}
      {...props}
    >
      {icon}
    </button>
  );
});
