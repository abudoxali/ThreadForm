import { CURRENT_PROJECT_SCHEMA_VERSION } from '@threadform/types';

/**
 * Upgrades a raw persisted project object to the current schema version.
 * Each entry migrates from its key version to key + 1. There are no prior
 * versions yet — this exists so the first breaking schema change has a
 * concrete place to land its migration instead of inventing the pattern
 * under deadline pressure.
 */
const migrations: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  // 1: (raw) => ({ ...raw, schemaVersion: 2, /* ...upgrade shape... */ }),
};

export class UnknownSchemaVersionError extends Error {
  constructor(version: unknown) {
    super(`Cannot migrate project: unknown schemaVersion "${String(version)}"`);
    this.name = 'UnknownSchemaVersionError';
  }
}

export function migrateProject(raw: Record<string, unknown>): Record<string, unknown> {
  const initialVersion = raw.schemaVersion;
  if (typeof initialVersion !== 'number' || initialVersion > CURRENT_PROJECT_SCHEMA_VERSION) {
    throw new UnknownSchemaVersionError(initialVersion);
  }

  let current = raw;
  let version = initialVersion;

  while (version < CURRENT_PROJECT_SCHEMA_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      throw new UnknownSchemaVersionError(version);
    }
    current = migrate(current);
    const nextVersion = current.schemaVersion;
    if (typeof nextVersion !== 'number' || nextVersion <= version) {
      throw new UnknownSchemaVersionError(nextVersion);
    }
    version = nextVersion;
  }

  return current;
}
