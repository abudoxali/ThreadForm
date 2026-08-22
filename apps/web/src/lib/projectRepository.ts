import { createId, createProject } from '@threadform/project-engine';
import type { CreateProjectOptions } from '@threadform/project-engine';
import type { ArtworkSource, GarmentReference, Project } from '@threadform/types';
import { importArtworkFile } from '@threadform/artwork-engine';
import type { DecodedArtwork } from '@threadform/artwork-engine';
import {
  clearLastOpenedProjectId,
  deleteArtworkBlob,
  deleteProject as deleteStoredProject,
  getLastOpenedProjectId,
  listProjectSummaries,
  loadArtworkBlob,
  loadProject,
  saveArtworkBlob,
  saveProject,
  setLastOpenedProjectId,
} from '@threadform/local-storage';
import type { ProjectSummary, StoredArtworkBlob } from '@threadform/local-storage';

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

/**
 * Deletes a project and the artwork blobs only it referenced. Artwork lives
 * in its own store precisely so project documents stay small, which means
 * deleting a project would otherwise strand every image it used in the
 * user's storage quota forever, invisible and unreachable.
 *
 * The project's own record is deleted regardless of whether its blob list
 * could be read: a project that fails to load is exactly the kind the user
 * is most likely to be deleting, and refusing to remove it would leave them
 * stuck with an entry they cannot open or discard.
 */
export async function deleteProjectById(id: string): Promise<void> {
  let blobIds: string[] = [];
  try {
    const project = await loadProject(id);
    blobIds = project.artworks
      .map((layer) => (layer.source.kind === 'local-blob' ? layer.source.blobId : null))
      .filter((blobId): blobId is string => blobId !== null);
  } catch {
    blobIds = [];
  }

  await deleteStoredProject(id);
  await Promise.all(blobIds.map(discardArtworkBlob));

  const lastOpened = await getLastOpenedProjectId();
  if (lastOpened === id) {
    await clearLastOpenedProjectId();
  }
}

export async function listRecentProjects(): Promise<ProjectSummary[]> {
  return listProjectSummaries();
}

export interface ArtworkImportOutcome {
  /** Ready to hand to `project-engine`'s artwork mutators. */
  source: Extract<ArtworkSource, { kind: 'local-blob' }>;
  /** Already decoded, so the canvas can print it without a second round-trip through storage. */
  decoded: DecodedArtwork;
}

export type ImportArtworkResult =
  { ok: true; artwork: ArtworkImportOutcome } | { ok: false; error: string };

/**
 * The one place a user-selected file becomes persisted artwork: validate and
 * sanitize it (`artwork-engine`), write the *sanitized* bytes to storage
 * (`local-storage`), and hand back the `ArtworkSource` a `Project` should
 * reference. Nothing is written until the file has passed every check and
 * proved it decodes, so a project can never come to reference a blob that
 * will not render.
 *
 * `decoded` is deliberately returned rather than discarded: the caller
 * already paid for the decode, and reading the blob straight back out of
 * IndexedDB to decode it a second time would make every import flash an
 * avoidable loading state.
 */
export async function importArtworkForProject(file: File): Promise<ImportArtworkResult> {
  const imported = await importArtworkFile(file);
  if (!imported.ok) return imported;

  const blobId = createId('artwork-blob');
  try {
    await saveArtworkBlob(blobId, imported.artwork.blob, imported.artwork.fileKind);
  } catch {
    // Nothing referenced this blob yet, so there is nothing to clean up —
    // but the decode did allocate an object URL that now has no owner.
    imported.artwork.decoded.release();
    return { ok: false, error: "Couldn't save that artwork to this browser's local storage." };
  }

  return {
    ok: true,
    artwork: {
      source: {
        kind: 'local-blob',
        blobId,
        fileKind: imported.artwork.fileKind,
        pixelWidth: imported.artwork.pixelWidth,
        pixelHeight: imported.artwork.pixelHeight,
        byteSize: imported.artwork.byteSize,
      },
      decoded: imported.artwork.decoded,
    },
  };
}

export async function readArtworkBlob(blobId: string): Promise<StoredArtworkBlob | null> {
  return loadArtworkBlob(blobId);
}

/**
 * Removes an artwork blob once no layer references it. Failure is
 * swallowed on purpose: the user's actual intent (removing or replacing a
 * layer) already succeeded in the project document, and surfacing "the
 * orphaned file could not be deleted" would be noise about something they
 * cannot act on. The blob is unreferenced either way.
 */
export async function discardArtworkBlob(blobId: string): Promise<void> {
  try {
    await deleteArtworkBlob(blobId);
  } catch {
    // Intentionally ignored — see above.
  }
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
