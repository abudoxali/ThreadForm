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
    <header className="border-border bg-surface flex h-12 shrink-0 items-center justify-between border-b px-3 sm:px-4">
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
                className={`shrink-0 text-xs ${saveStatus === 'error' ? 'text-danger' : 'text-tertiary'}`}
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
      </div>
    </header>
  );
}
