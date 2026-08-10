import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteProject,
  listProjectSummaries,
  loadProject,
  projectExists,
  saveProject,
} from './projects';
import { getDatabase, PROJECTS_STORE } from './db';
import { InvalidProjectDataError, ProjectNotFoundError } from './errors';
import { buildTestProject, clearAllStores } from './test-helpers';

beforeEach(async () => {
  await clearAllStores();
});

describe('saveProject / loadProject', () => {
  it('round-trips a project unchanged', async () => {
    const project = buildTestProject();
    await saveProject(project);
    const loaded = await loadProject(project.metadata.id);
    expect(loaded).toEqual(project);
  });

  it('overwrites the existing record on repeated saves (update semantics, not duplication)', async () => {
    const project = buildTestProject();
    await saveProject(project);
    const renamed = { ...project, metadata: { ...project.metadata, name: 'Renamed' } };
    await saveProject(renamed);

    const loaded = await loadProject(project.metadata.id);
    expect(loaded.metadata.name).toBe('Renamed');

    const summaries = await listProjectSummaries();
    expect(summaries).toHaveLength(1);
  });

  it('throws ProjectNotFoundError for a missing id', async () => {
    await expect(loadProject('does-not-exist')).rejects.toThrow(ProjectNotFoundError);
  });

  it('throws InvalidProjectDataError for corrupt data and leaves the record in place', async () => {
    const project = buildTestProject();
    await saveProject(project);

    // Directly corrupt the stored record's payload (saveProject itself has
    // no validation to bypass — it trusts the typed Project it's given) to
    // simulate data written by an older/buggy build, or corrupted on disk.
    const db = await getDatabase();
    const record = await db.get(PROJECTS_STORE, project.metadata.id);
    if (!record) throw new Error('expected a record');
    await db.put(PROJECTS_STORE, {
      ...record,
      project: { ...(record.project as object), garmentColor: { hex: 'not-a-color' } },
    });

    await expect(loadProject(project.metadata.id)).rejects.toThrow(InvalidProjectDataError);

    // The corrupt record must still exist — a failed load never deletes data.
    expect(await projectExists(project.metadata.id)).toBe(true);
  });

  it('rejects a schema version newer than this build understands, without altering the record', async () => {
    const project = buildTestProject();
    await saveProject(project);

    const db = await getDatabase();
    const record = await db.get(PROJECTS_STORE, project.metadata.id);
    if (!record) throw new Error('expected a record');
    await db.put(PROJECTS_STORE, {
      ...record,
      project: { ...(record.project as object), schemaVersion: 999 },
    });

    await expect(loadProject(project.metadata.id)).rejects.toThrow(InvalidProjectDataError);
    expect(await projectExists(project.metadata.id)).toBe(true);
  });
});

describe('listProjectSummaries', () => {
  it('orders most-recently-updated first', async () => {
    const older = buildTestProject('Older');
    const newer = buildTestProject('Newer');
    newer.metadata.updatedAt = new Date(
      Date.parse(older.metadata.updatedAt) + 10_000,
    ).toISOString();

    await saveProject(older);
    await saveProject(newer);

    const summaries = await listProjectSummaries();
    expect(summaries.map((s) => s.name)).toEqual(['Newer', 'Older']);
  });

  it('returns an empty list when nothing is saved', async () => {
    expect(await listProjectSummaries()).toEqual([]);
  });
});

describe('deleteProject', () => {
  it('removes the record', async () => {
    const project = buildTestProject();
    await saveProject(project);
    await deleteProject(project.metadata.id);
    expect(await projectExists(project.metadata.id)).toBe(false);
    await expect(loadProject(project.metadata.id)).rejects.toThrow(ProjectNotFoundError);
  });

  it('is a no-op for a missing id', async () => {
    await expect(deleteProject('does-not-exist')).resolves.toBeUndefined();
  });
});

describe('projectExists', () => {
  it('reflects presence accurately', async () => {
    const project = buildTestProject();
    expect(await projectExists(project.metadata.id)).toBe(false);
    await saveProject(project);
    expect(await projectExists(project.metadata.id)).toBe(true);
  });
});
