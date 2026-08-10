import { getDatabase, LAST_OPENED_PROJECT_KEY, META_STORE } from './db';
import { StorageOperationError } from './errors';

/**
 * A pointer to the most recently opened/created project, so the Studio can
 * restore it on the next visit. This is convenience state, not a source of
 * truth — if it points at a missing or invalid project, callers must recover
 * gracefully (see `restoreLastOpenedProject` in the app-level repository)
 * rather than treating a stale pointer as an error.
 */
export async function getLastOpenedProjectId(): Promise<string | null> {
  const db = await getDatabase();
  const record = await db.get(META_STORE, LAST_OPENED_PROJECT_KEY).catch((cause: unknown) => {
    throw new StorageOperationError('read last-opened project pointer', cause);
  });
  return record?.value ?? null;
}

export async function setLastOpenedProjectId(id: string): Promise<void> {
  const db = await getDatabase();
  try {
    await db.put(META_STORE, { key: LAST_OPENED_PROJECT_KEY, value: id });
  } catch (cause) {
    throw new StorageOperationError('set last-opened project pointer', cause);
  }
}

export async function clearLastOpenedProjectId(): Promise<void> {
  const db = await getDatabase();
  try {
    await db.delete(META_STORE, LAST_OPENED_PROJECT_KEY);
  } catch (cause) {
    throw new StorageOperationError('clear last-opened project pointer', cause);
  }
}
