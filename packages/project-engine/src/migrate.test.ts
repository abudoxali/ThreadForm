import { describe, expect, it } from 'vitest';
import { migrateProject, UnknownSchemaVersionError } from './migrate';

describe('migrateProject', () => {
  it('passes through a project already at the current version', () => {
    const raw = { schemaVersion: 1, foo: 'bar' };
    expect(migrateProject(raw)).toEqual(raw);
  });

  it('throws for a schema version newer than this build understands', () => {
    expect(() => migrateProject({ schemaVersion: 999 })).toThrow(UnknownSchemaVersionError);
  });

  it('throws for a missing or non-numeric schema version', () => {
    expect(() => migrateProject({})).toThrow(UnknownSchemaVersionError);
    expect(() => migrateProject({ schemaVersion: 'v1' })).toThrow(UnknownSchemaVersionError);
  });
});
