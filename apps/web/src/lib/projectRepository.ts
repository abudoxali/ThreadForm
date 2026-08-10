import { createProject } from '@threadform/project-engine';
import type { CreateProjectOptions } from '@threadform/project-engine';
import type { GarmentReference, Project } from '@threadform/types';
import {
  clearLastOpenedProjectId,
  deleteProject as deleteStoredProject,
  getLastOpenedProjectId,
  listProjectSummaries,
  loadProject,
  saveProject,
  setLastOpenedProjectId,
} from '@threadform/local-storage';
import type { ProjectSummary } from '@threadform/local-storage';

/**
 * Application-facing project operations. This is the only place `apps/web`
 * combines `project-engine` (domain logic) with `local-storage`
 * (persistence) — components and hooks call through here, never the two
 * packages' raw APIs directly, so there is one place that knows what
 * "creating," "opening," and "deleting" a project actually involve.
 */

export async function createAndPersistProject(
  garment: GarmentReference,
  options: CreateProjectOptions,
): Promise<Project> {
  const project = createProject(garment, options);
  await saveProject(project);
  await setLastOpenedProjectId(project.metadata.id);
  return project;
}

export async function openProject(id: string): Promise<Project> {
  const project = await loadProject(id);
  await setLastOpenedProjectId(id);
  return project;
}

export async function saveProjectChanges(project: Project): Promise<void> {
  await saveProject(project);
}

export async function deleteProjectById(id: string): Promise<void> {
  await deleteStoredProject(id);
  const lastOpened = await getLastOpenedProjectId();
  if (lastOpened === id) {
    await clearLastOpenedProjectId();
  }
}

export async function listRecentProjects(): Promise<ProjectSummary[]> {
  return listProjectSummaries();
}

/**
 * Attempts to restore whichever project was open last. Returns `null` (never
 * throws) if there is no pointer, or if the pointed-at project is missing or
 * fails validation — a stale pointer is cleared so it doesn't keep failing on
 * every future visit, and the caller falls back to the Studio's start state.
 */
export async function restoreLastOpenedProject(): Promise<Project | null> {
  const id = await getLastOpenedProjectId();
  if (!id) return null;

  try {
    return await loadProject(id);
  } catch {
    await clearLastOpenedProjectId();
    return null;
  }
}
