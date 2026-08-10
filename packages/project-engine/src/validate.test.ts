import { describe, expect, it } from 'vitest';
import type { GarmentReference } from '@threadform/types';
import { createProject } from './factory';
import { validateProject } from './validate';

const garment: GarmentReference = {
  garmentId: 'classic-tee',
  garmentVersion: '1.0.0',
  category: 't-shirt',
};

describe('validateProject', () => {
  it('accepts a well-formed project', () => {
    const project = createProject(garment);
    const result = validateProject(project);
    expect(result.success).toBe(true);
  });

  it('rejects non-object input', () => {
    const result = validateProject('not a project');
    expect(result.success).toBe(false);
  });

  it('rejects an unknown future schema version', () => {
    const project = createProject(garment) as unknown as Record<string, unknown>;
    const result = validateProject({ ...project, schemaVersion: 999 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('999');
    }
  });

  it('rejects a project with an invalid hex color', () => {
    const project = createProject(garment) as unknown as Record<string, unknown>;
    const result = validateProject({ ...project, garmentColor: { hex: 'not-a-color' } });
    expect(result.success).toBe(false);
  });
});
