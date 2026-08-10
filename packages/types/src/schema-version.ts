/**
 * Schema version of a persisted {@link import('./project').Project}.
 *
 * Bump this whenever a change to the domain model would make an older
 * `Project` value fail to load or behave incorrectly. `project-engine`
 * migrations key off this number to upgrade older projects on load.
 */
export const CURRENT_PROJECT_SCHEMA_VERSION = 1 as const;

export type ProjectSchemaVersion = typeof CURRENT_PROJECT_SCHEMA_VERSION;
