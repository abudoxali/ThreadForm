import type { GarmentReference } from '@threadform/types';
import { createProject } from '@threadform/project-engine';
import { clearAllDataForTests } from './db';

const stubGarment: GarmentReference = {
  garmentId: 'classic-tee',
  garmentVersion: '1.0.0',
  category: 't-shirt',
};

export function buildTestProject(name = 'Test Project') {
  return createProject(stubGarment, { name });
}

/** fake-indexeddb's global database persists across `it()` blocks in the same file — clear it between tests. */
export const clearAllStores = clearAllDataForTests;
