import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors ' +
  'duration-[var(--tf-duration-fast)] ease-[var(--tf-ease-standard)] disabled:opacity-40 disabled:pointer-events-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-offset-2 focus-visible:ring-offset-canvas';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-strong active:bg-accent-strong',
  secondary:
    'bg-surface-raised text-primary border border-border hover:border-border-strong active:bg-surface',
  ghost: 'bg-transparent text-secondary hover:bg-surface-raised hover:text-primary',
  danger: 'bg-danger text-accent-ink hover:brightness-110',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
};

/**
 * Shared visual style for the `Button` element and non-`<button>` controls
 * (e.g. a `next/link` styled as a CTA) that must not nest inside a real
 * `<button>` — interactive content can't contain interactive content.
 */
export function buttonStyles(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return cx(base, variants[variant], sizes[size], className);
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, type = 'button', ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonStyles(variant, size, className)} {...props} />
  );
});
