/** IndexedDB is unavailable (unsupported browser, private-browsing restrictions, or a Node/SSR context). */
export class StorageUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Local project storage is unavailable in this browser.');
    this.name = 'StorageUnavailableError';
    if (cause !== undefined) this.cause = cause;
  }
}

/** No project record exists for the given id. */
export class ProjectNotFoundError extends Error {
  constructor(public readonly projectId: string) {
    super(`No local project found with id "${projectId}".`);
    this.name = 'ProjectNotFoundError';
  }
}

/**
 * A stored record failed schema migration or runtime validation. The record
 * itself is left untouched in storage — this error means "cannot open," not
 * "was deleted."
 */
export class InvalidProjectDataError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly reason: string,
  ) {
    super(`Local project "${projectId}" could not be loaded: ${reason}`);
    this.name = 'InvalidProjectDataError';
  }
}

/** A read or write transaction against IndexedDB failed (e.g. quota exceeded, connection closed). */
export class StorageOperationError extends Error {
  constructor(operation: string, cause?: unknown) {
    super(`Local storage operation failed: ${operation}`);
    this.name = 'StorageOperationError';
    if (cause !== undefined) this.cause = cause;
  }
}
