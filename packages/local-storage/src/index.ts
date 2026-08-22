export {
  saveProject,
  loadProject,
  listProjectSummaries,
  deleteProject,
  projectExists,
} from './projects';
export {
  saveArtworkBlob,
  loadArtworkBlob,
  deleteArtworkBlob,
  listArtworkBlobIds,
} from './artworks';
export type { StoredArtworkBlob } from './artworks';
export {
  getLastOpenedProjectId,
  setLastOpenedProjectId,
  clearLastOpenedProjectId,
} from './lastOpened';
export {
  StorageUnavailableError,
  ProjectNotFoundError,
  InvalidProjectDataError,
  StorageOperationError,
} from './errors';
export type { ProjectSummary } from './types';
export { DATABASE_NAME, DATABASE_VERSION } from './db';
export { resetDatabaseConnectionForTests, clearAllDataForTests } from './db';
