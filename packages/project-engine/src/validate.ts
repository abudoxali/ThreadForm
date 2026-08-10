import type { Project } from '@threadform/types';
import { migrateProject, UnknownSchemaVersionError } from './migrate';
import { projectSchema } from './schema';

export type ProjectValidationResult =
  | { success: true; project: Project }
  | { success: false; error: string };

/** Migrates and validates a raw, untrusted value into a `Project`. Never throws. */
export function validateProject(raw: unknown): ProjectValidationResult {
  if (typeof raw !== 'object' || raw === null) {
    return { success: false, error: 'Project payload must be an object.' };
  }

  let migrated: Record<string, unknown>;
  try {
    migrated = migrateProject(raw as Record<string, unknown>);
  } catch (error) {
    if (error instanceof UnknownSchemaVersionError) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  const result = projectSchema.safeParse(migrated);
  if (!result.success) {
    return { success: false, error: result.error.issues.map((issue) => issue.message).join('; ') };
  }

  return { success: true, project: result.data };
}
