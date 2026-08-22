import { getDatabase, ARTWORKS_STORE } from './db';
import type { ArtworkBlobRecord } from './db';
import { StorageOperationError } from './errors';

/**
 * Artwork blob persistence, kept deliberately separate from project
 * persistence. A `Project` document references artwork only by `blobId`,
 * which is what keeps a debounced autosave cheap no matter how large the
 * imported images are.
 *
 * Nothing here validates image content: that belongs to
 * `@threadform/artwork-engine`, which runs on the way in *and* on the way
 * back out. This module's only job is to store and return bytes, and to
 * report failures honestly instead of resolving to `undefined`.
 */

export interface StoredArtworkBlob {
  id: string;
  blob: Blob;
  fileKind: string;
  byteSize: number;
  createdAt: string;
}

export async function saveArtworkBlob(id: string, blob: Blob, fileKind: string): Promise<void> {
  const db = await getDatabase();
  const record: ArtworkBlobRecord = {
    id,
    bytes: await blob.arrayBuffer(),
    mimeType: blob.type,
    fileKind,
    byteSize: blob.size,
    createdAt: new Date().toISOString(),
  };
  try {
    await db.put(ARTWORKS_STORE, record);
  } catch (cause) {
    throw new StorageOperationError(`save artwork blob "${id}"`, cause);
  }
}

/**
 * Returns `null` when no blob is stored under `id`. A missing blob is an
 * expected state, not an exception: a project can outlive its artwork (a
 * half-finished import, storage eviction, a record removed by "clear site
 * data"), and the Studio surfaces that as a replaceable layer rather than
 * refusing to open the project.
 */
export async function loadArtworkBlob(id: string): Promise<StoredArtworkBlob | null> {
  const db = await getDatabase();
  const record = await db.get(ARTWORKS_STORE, id).catch((cause: unknown) => {
    throw new StorageOperationError(`load artwork blob "${id}"`, cause);
  });
  if (!record) return null;
  return {
    id: record.id,
    blob: new Blob([record.bytes], { type: record.mimeType }),
    fileKind: record.fileKind,
    byteSize: record.byteSize,
    createdAt: record.createdAt,
  };
}

/** Deletes an artwork blob. Not an error if it doesn't exist. */
export async function deleteArtworkBlob(id: string): Promise<void> {
  const db = await getDatabase();
  try {
    await db.delete(ARTWORKS_STORE, id);
  } catch (cause) {
    throw new StorageOperationError(`delete artwork blob "${id}"`, cause);
  }
}

export async function listArtworkBlobIds(): Promise<string[]> {
  const db = await getDatabase();
  const keys = await db.getAllKeys(ARTWORKS_STORE).catch((cause: unknown) => {
    throw new StorageOperationError('list artwork blobs', cause);
  });
  return keys.map(String);
}
