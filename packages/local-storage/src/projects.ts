import { validateProject } from '@threadform/project-engine';
import type { Project } from '@threadform/types';
import { getDatabase, PROJECTS_STORE, UPDATED_AT_INDEX } from './db';
import type { ProjectRecord } from './db';
import { InvalidProjectDataError, ProjectNotFoundError, StorageOperationError } from './errors';
import type { ProjectSummary } from './types';

function toRecord(project: Project): ProjectRecord {
  return {
    id: project.metadata.id,
    schemaVersion: project.schemaVersion,
    name: project.metadata.name,
    createdAt: project.metadata.createdAt,
    updatedAt: project.metadata.updatedAt,
    project,
  };
}

function toSummary(record: ProjectRecord): ProjectSummary {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** Persists a project, overwriting any existing record with the same id. */
export async function saveProject(project: Project): Promise<void> {
  const db = await getDatabase();
  try {
    await db.put(PROJECTS_STORE, toRecord(project));
  } catch (cause) {
    throw new StorageOperationError(`save project "${project.metadata.id}"`, cause);
  }
}

/**
 * Loads a project by id. The stored payload is untrusted: it is migrated to
 * the current schema version and validated before being returned. A record
 * that fails either step throws `InvalidProjectDataError` — it is left
 * exactly as stored, never deleted or silently overwritten.
 */
export async function loadProject(id: string): Promise<Project> {
  const db = await getDatabase();
  const record = await db.get(PROJECTS_STORE, id).catch((cause: unknown) => {
    throw new StorageOperationError(`load project "${id}"`, cause);
  });

  if (!record) {
    throw new ProjectNotFoundError(id);
  }

  // validateProject already migrates internally and handles non-object /
  // unknown-schema-version input by returning a failure result rather than
  // throwing — no need to duplicate that here.
  const result = validateProject(record.project);
  if (!result.success) {
    throw new InvalidProjectDataError(id, result.error);
  }

  return result.project;
}

/** Lists project summaries ordered most-recently-updated first. Does not validate each project's full payload. */
export async function listProjectSummaries(): Promise<ProjectSummary[]> {
  const db = await getDatabase();
  const records = await db
    .getAllFromIndex(PROJECTS_STORE, UPDATED_AT_INDEX)
    .catch((cause: unknown) => {
      throw new StorageOperationError('list projects', cause);
    });
  return records.map(toSummary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Deletes a project record. Not an error if it doesn't exist. */
export async function deleteProject(id: string): Promise<void> {
  const db = await getDatabase();
  try {
    await db.delete(PROJECTS_STORE, id);
  } catch (cause) {
    throw new StorageOperationError(`delete project "${id}"`, cause);
  }
}

export async function projectExists(id: string): Promise<boolean> {
  const db = await getDatabase();
  const key = await db.getKey(PROJECTS_STORE, id).catch((cause: unknown) => {
    throw new StorageOperationError(`check project "${id}"`, cause);
  });
  return key !== undefined;
}
