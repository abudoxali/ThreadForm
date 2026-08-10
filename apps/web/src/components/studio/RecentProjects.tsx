'use client';

import { useState } from 'react';
import type { SVGProps } from 'react';
import type { ProjectSummary } from '@threadform/local-storage';
import { IconButton } from '@threadform/ui';
import { formatRelativeTime } from '@/lib/formatRelativeTime';

export interface RecentProjectsProps {
  projects: ProjectSummary[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7" />
    </svg>
  );
}

export function RecentProjects({ projects, onOpen, onDelete }: RecentProjectsProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  if (projects.length === 0) return null;

  return (
    <div className="mx-auto mt-10 w-full max-w-lg text-left">
      <h3 className="text-secondary text-sm font-medium">Continue a project</h3>
      <ul className="divide-border border-border mt-3 divide-y overflow-hidden rounded-md border">
        {projects.map((project) => (
          <li
            key={project.id}
            className="bg-surface flex items-center justify-between gap-3 px-3 py-2.5"
          >
            {pendingDeleteId === project.id ? (
              <div className="flex w-full items-center justify-between gap-3">
                <span className="text-secondary text-sm">Delete &ldquo;{project.name}&rdquo;?</span>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className="text-danger focus-visible:ring-accent-strong rounded-md px-2 py-1 text-xs font-medium hover:brightness-110 focus-visible:outline-none focus-visible:ring-2"
                    onClick={() => {
                      setPendingDeleteId(null);
                      onDelete(project.id);
                    }}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="text-secondary hover:text-primary focus-visible:ring-accent-strong rounded-md px-2 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2"
                    onClick={() => setPendingDeleteId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onOpen(project.id)}
                  className="text-primary hover:text-accent-strong focus-visible:ring-accent-strong min-w-0 flex-1 truncate text-left text-sm focus-visible:outline-none focus-visible:ring-2"
                >
                  {project.name}
                  <span className="text-tertiary ml-2 text-xs">
                    {formatRelativeTime(project.updatedAt)}
                  </span>
                </button>
                <IconButton
                  icon={<TrashIcon className="h-4 w-4" />}
                  aria-label={`Delete ${project.name}`}
                  onClick={() => setPendingDeleteId(project.id)}
                  className="h-8 w-8 shrink-0"
                />
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
