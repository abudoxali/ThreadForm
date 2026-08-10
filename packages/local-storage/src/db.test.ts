import { afterEach, describe, expect, it } from 'vitest';
import {
  DATABASE_NAME,
  META_STORE,
  PROJECTS_STORE,
  getDatabase,
  resetDatabaseConnectionForTests,
} from './db';
import { StorageUnavailableError } from './errors';

describe('getDatabase', () => {
  it('creates both object stores on first open', async () => {
    const db = await getDatabase();
    expect(db.name).toBe(DATABASE_NAME);
    expect(Array.from(db.objectStoreNames)).toEqual(
      expect.arrayContaining([PROJECTS_STORE, META_STORE]),
    );
  });

  it('reuses the same connection on subsequent calls', async () => {
    const first = await getDatabase();
    const second = await getDatabase();
    expect(first).toBe(second);
  });
});

describe('getDatabase when IndexedDB is unavailable', () => {
  const originalIndexedDB = globalThis.indexedDB;

  afterEach(() => {
    globalThis.indexedDB = originalIndexedDB;
    resetDatabaseConnectionForTests();
  });

  it('rejects with StorageUnavailableError instead of throwing a raw ReferenceError', async () => {
    // @ts-expect-error simulating an environment with no IndexedDB support
    delete globalThis.indexedDB;
    resetDatabaseConnectionForTests();

    await expect(getDatabase()).rejects.toThrow(StorageUnavailableError);
  });
});
