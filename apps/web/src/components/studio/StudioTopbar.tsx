import Link from 'next/link';
import { buttonStyles } from '@threadform/ui';

export function StudioTopbar({ projectName }: { projectName: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/" className="shrink-0 text-sm font-semibold tracking-wide text-primary">
          ThreadForm
        </Link>
        <span className="h-4 w-px bg-border" aria-hidden="true" />
        <span className="truncate text-sm text-secondary">{projectName}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-disabled="true"
          title="Available once a garment is loaded"
          className={buttonStyles('secondary', 'sm', 'cursor-not-allowed opacity-40')}
        >
          Export
        </button>
        <button
          type="button"
          aria-disabled="true"
          title="Accounts are not part of this milestone yet"
          className={buttonStyles('ghost', 'sm', 'cursor-not-allowed opacity-40')}
        >
          Sign in
        </button>
      </div>
    </header>
  );
}
