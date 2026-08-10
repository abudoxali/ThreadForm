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
}

export const DATABASE_NAME = 'threadform';
export const DATABASE_VERSION = 1;
export const PROJECTS_STORE = 'projects';
export const META_STORE = 'meta';
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
      upgrade(db) {
        const projects = db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
        projects.createIndex(UPDATED_AT_INDEX, 'updatedAt');
        db.createObjectStore(META_STORE, { keyPath: 'key' });
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
}
