import { describe, expect, it } from 'vitest';
import type { GarmentReference, MaterialId } from '@threadform/types';
import { createProject } from './factory';
import { reconcileGarmentMaterial, setGarmentMaterial } from './material';

const garment: GarmentReference = {
  garmentId: 'threadform-essential-tee',
  garmentVersion: '1.1.0',
  category: 't-shirt',
};

const ALLOWED: readonly MaterialId[] = ['cotton', 'jersey'];

describe('setGarmentMaterial', () => {
  it('sets a supported material', () => {
    const project = setGarmentMaterial(createProject(garment), 'jersey', ALLOWED);
    expect(project.material.materialId).toBe('jersey');
  });

  it('touches updatedAt on a real change', () => {
    const before = createProject(garment);
    const after = setGarmentMaterial(before, 'jersey', ALLOWED);
    expect(after).not.toBe(before);
    expect(after.metadata.updatedAt >= before.metadata.updatedAt).toBe(true);
  });

  // Re-clicking the active fabric must not churn autosave.
  it('is a no-op when the material is already selected', () => {
    const project = createProject(garment);
    expect(setGarmentMaterial(project, project.material.materialId, ALLOWED)).toBe(project);
  });

  // Enforced here, not only by hiding the option: a persisted project can
  // name anything.
  it('refuses a material outside the allow-list', () => {
    const project = createProject(garment);
    expect(setGarmentMaterial(project, 'denim', ALLOWED)).toBe(project);
    expect(setGarmentMaterial(project, 'fleece', ALLOWED)).toBe(project);
  });

  it('refuses everything when nothing is allowed', () => {
    const project = createProject(garment);
    expect(setGarmentMaterial(project, 'cotton', [])).toBe(project);
  });

  // A cotton override describes cotton. Carrying it onto jersey would
  // silently misrepresent both fabrics.
  it('drops property overrides when the fabric changes', () => {
    let project = createProject(garment);
    project = {
      ...project,
      material: { ...project.material, propertyOverrides: { roughness: 0.2 } },
    };
    const switched = setGarmentMaterial(project, 'jersey', ALLOWED);
    expect(switched.material.propertyOverrides).toEqual({});
  });

  it('leaves the garment colour alone', () => {
    const before = createProject(garment);
    const after = setGarmentMaterial(before, 'jersey', ALLOWED);
    expect(after.garmentColor).toEqual(before.garmentColor);
  });
});

describe('reconcileGarmentMaterial', () => {
  it('leaves a valid material untouched, so opening a project does not mark it dirty', () => {
    const project = createProject(garment);
    expect(reconcileGarmentMaterial(project, ALLOWED)).toBe(project);
  });

  it('replaces a material the garment no longer offers', () => {
    const project = { ...createProject(garment) };
    project.material = { materialId: 'denim', propertyOverrides: { roughness: 0.1 } };
    const reconciled = reconcileGarmentMaterial(project, ALLOWED);
    expect(reconciled.material.materialId).toBe('cotton');
    expect(reconciled.material.propertyOverrides).toEqual({});
  });

  it('leaves the project alone when there is nothing to replace it with', () => {
    const project = { ...createProject(garment) };
    project.material = { materialId: 'denim', propertyOverrides: {} };
    expect(reconcileGarmentMaterial(project, [])).toBe(project);
  });
});
