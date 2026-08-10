import Link from 'next/link';
import { buttonStyles } from '@threadform/ui';
import type { Project } from '@threadform/types';
import type { SaveStatus } from '@/hooks/useStudioProject';

const SAVE_STATUS_LABEL: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Save failed',
};

export interface StudioTopbarProps {
  project: Project | null;
  saveStatus: SaveStatus;
  onRename: (name: string) => void;
  onNewProject: () => void;
}

export function StudioTopbar({ project, saveStatus, onRename, onNewProject }: StudioTopbarProps) {
  const statusLabel = SAVE_STATUS_LABEL[saveStatus];

  return (
    <header className="border-border bg-surface flex h-14 shrink-0 items-center justify-between border-b px-3 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Link href="/" className="text-primary shrink-0 text-sm font-semibold tracking-wide">
          ThreadForm
        </Link>
        {project && (
          <>
            <span className="bg-border h-4 w-px shrink-0" aria-hidden="true" />
            <input
              type="text"
              value={project.metadata.name}
              onChange={(event) => onRename(event.target.value)}
              aria-label="Project name"
              className="text-secondary focus-visible:ring-accent-strong min-w-0 max-w-[8rem] flex-1 truncate rounded-sm bg-transparent text-sm focus-visible:outline-none focus-visible:ring-2 sm:max-w-xs"
            />
            {statusLabel && (
              <span
                role="status"
                className={`hidden shrink-0 text-xs sm:inline ${saveStatus === 'error' ? 'text-danger' : 'text-tertiary'}`}
              >
                {statusLabel}
              </span>
            )}
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {project && (
          <button
            type="button"
            onClick={onNewProject}
            className={buttonStyles('ghost', 'sm', 'shrink-0 whitespace-nowrap')}
          >
            New Project
          </button>
        )}
        {/* Inert placeholders — hidden below `sm` so the one real action (New Project) always has room. */}
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
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
      </div>
    </header>
  );
}
