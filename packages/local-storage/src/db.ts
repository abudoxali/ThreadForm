import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import { StorageUnavailableError } from './errors';

/**
 * Raw persisted shape of a project record. `id`/`schemaVersion`/`name`/
 * `createdAt`/`updatedAt` are denormalized out of `project` purely so the
 * "projects" store can be listed/sorted/indexed without deserializing and
 * validating every full project document — the `project` field remains the
 * single source of truth and is re-validated on every read.
 */
export interface ProjectRecord {
  id: string;
  schemaVersion: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Untrusted until it passes `migrateProject` + `validateProject`. */
  project: unknown;
}

export interface MetaRecord {
  key: string;
  value: string;
}

/**
 * An imported artwork's bytes, kept out of the project document on purpose.
 * A `Project` holds only an `ArtworkSource.blobId` pointing here, so
 * project records stay small enough to read, validate and re-write on every
 * debounced autosave — embedding a multi-megabyte image as base64 inside
 * the document would make every keystroke-triggered save re-serialize it.
 *
 * Stored as a raw `ArrayBuffer` plus its MIME type rather than as a `Blob`.
 * Both are valid IndexedDB values, but `Blob` support has historically been
 * the shakier of the two across engines, and an `ArrayBuffer` is a plain
 * structured-cloneable value that survives any storage or test environment
 * unchanged. The `Blob` the rest of the app wants is reconstructed on read.
 *
 * The bytes are untrusted on read (`@threadform/artwork-engine` re-validates
 * and re-sanitizes them) exactly like `ProjectRecord.project`.
 */
export interface ArtworkBlobRecord {
  id: string;
  bytes: ArrayBuffer;
  mimeType: string;
  /** What the file's own signature said at import — re-checked against the bytes on read. */
  fileKind: string;
  byteSize: number;
  createdAt: string;
}

interface ThreadFormDBSchema extends DBSchema {
  projects: {
    key: string;
    value: ProjectRecord;
    indexes: { 'by-updatedAt': string };
  };
  meta: {
    key: string;
    value: MetaRecord;
  };
  artworks: {
    key: string;
    value: ArtworkBlobRecord;
  };
}

export const DATABASE_NAME = 'threadform';
/** v2 (M03) adds the `artworks` store. Existing v1 databases keep their projects — the upgrade is additive. */
export const DATABASE_VERSION = 2;
export const PROJECTS_STORE = 'projects';
export const META_STORE = 'meta';
export const ARTWORKS_STORE = 'artworks';
export const UPDATED_AT_INDEX = 'by-updatedAt';
export const LAST_OPENED_PROJECT_KEY = 'lastOpenedProjectId';

let dbPromise: Promise<IDBPDatabase<ThreadFormDBSchema>> | null = null;

/**
 * Opens (and caches) the ThreadForm IndexedDB connection. Every consumer in
 * this package should go through this function rather than calling
 * `indexedDB.open` directly, so there is exactly one place that knows the
 * database name/version/upgrade path.
 */
export function getDatabase(): Promise<IDBPDatabase<ThreadFormDBSchema>> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new StorageUnavailableError());
  }

  if (!dbPromise) {
    dbPromise = openDB<ThreadFormDBSchema>(DATABASE_NAME, DATABASE_VERSION, {
      // Stepwise and additive: a browser that already holds a v1 database
      // full of the user's projects must gain the new store without those
      // projects being dropped and re-created, so each version's changes are
      // guarded by the version that introduced them rather than assuming a
      // fresh database.
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const projects = db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
          projects.createIndex(UPDATED_AT_INDEX, 'updatedAt');
          db.createObjectStore(META_STORE, { keyPath: 'key' });
        }
        if (oldVersion < 2) {
          db.createObjectStore(ARTWORKS_STORE, { keyPath: 'id' });
        }
      },
      // The browser can close a connection out from under us (storage
      // eviction, "Clear site data," a backing-store error). Without this,
      // the cached promise keeps resolving to a dead handle and every
      // save/load fails forever until a full page reload — drop the cache
      // so the next call reopens instead.
      terminated() {
        dbPromise = null;
      },
      // Fires if a future version bump can't apply because this connection
      // is still open in another tab. Closing it lets that tab's upgrade
      // proceed instead of deadlocking; the next call here reopens fresh.
      blocking() {
        void dbPromise?.then((db) => db.close());
        dbPromise = null;
      },
    }).catch((cause: unknown) => {
      dbPromise = null;
      throw new StorageUnavailableError(cause);
    });
  }

  return dbPromise;
}

/** Test-only: forces the next `getDatabase()` call to reopen the connection. */
export function resetDatabaseConnectionForTests(): void {
  dbPromise = null;
}

/**
 * Test-only: wipes both object stores using the existing connection. Prefer
 * this over closing/deleting the database between tests — `deleteDatabase`
 * blocks on any still-open connection (there usually is one, since consumers
 * are expected to hold a single long-lived connection), which makes it a
 * slow and flaky way to reset state in a test suite.
 */
export async function clearAllDataForTests(): Promise<void> {
  const db = await getDatabase();
  await db.clear(PROJECTS_STORE);
  await db.clear(META_STORE);
  await db.clear(ARTWORKS_STORE);
}
