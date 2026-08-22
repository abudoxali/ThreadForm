import type { MaterialId, Project } from '@threadform/types';

/**
 * Garment material as a pure `Project` transformation.
 *
 * The allow-list is passed in rather than looked up: which fabrics exist is
 * a garment-manifest fact and which are implemented is a renderer fact, and
 * `project-engine` depends on neither. Enforcing it here as well as in the
 * UI is the point — hiding an option in a component does nothing about a
 * persisted project that names a fabric the garment never offered.
 */

function touch(): Pick<Project['metadata'], 'updatedAt'> {
  return { updatedAt: new Date().toISOString() };
}

/**
 * Sets the garment's fabric. A no-op (returns `project` unchanged) when the
 * material is already selected or is not one the caller says is allowed —
 * never persists a choice the renderer would then have to substitute away.
 */
export function setGarmentMaterial(
  project: Project,
  materialId: MaterialId,
  allowedMaterialIds: readonly MaterialId[],
): Project {
  if (!allowedMaterialIds.includes(materialId)) return project;
  if (project.material.materialId === materialId) return project;
  return {
    ...project,
    // `propertyOverrides` is deliberately reset: overrides are authored
    // against a specific fabric's defaults, and carrying a cotton override
    // onto jersey would silently misrepresent both.
    material: { ...project.material, materialId, propertyOverrides: {} },
    metadata: { ...project.metadata, ...touch() },
  };
}

/**
 * Brings a project's material into a state the given garment can render,
 * used when opening a project whose stored fabric the garment no longer
 * offers. Returns the project unchanged when nothing needs correcting, so
 * merely opening a valid project never marks it dirty.
 */
export function reconcileGarmentMaterial(
  project: Project,
  allowedMaterialIds: readonly MaterialId[],
): Project {
  if (allowedMaterialIds.includes(project.material.materialId)) return project;
  const replacement = allowedMaterialIds[0];
  if (!replacement) return project;
  return {
    ...project,
    material: { ...project.material, materialId: replacement, propertyOverrides: {} },
    metadata: { ...project.metadata, ...touch() },
  };
}
