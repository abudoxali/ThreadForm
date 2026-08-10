import { clearAllDataForTests } from '@threadform/local-storage';

/** Wipes persisted project data between tests so they don't leak into each other. */
export const resetLocalStorage = clearAllDataForTests;
