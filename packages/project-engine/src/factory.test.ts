import { describe, expect, it } from 'vitest';
import type { GarmentReference } from '@threadform/types';
import { createProject } from './factory';
import { validateProject } from './validate';

const garment: GarmentReference = {
  garmentId: 'classic-tee',
  garmentVersion: '1.0.0',
  category: 't-shirt',
};

describe('createProject', () => {
  it('produces a project that passes runtime validation', () => {
    const project = createProject(garment, { name: 'My Tee' });
    const result = validateProject(project);
    expect(result.success).toBe(true);
  });

  it('defaults to the 3d studio mode and an empty artwork stack', () => {
    const project = createProject(garment);
    expect(project.metadata.studioMode).toBe('3d');
    expect(project.artworks).toEqual([]);
    expect(project.schemaVersion).toBe(1);
  });

  it('assigns a unique project id per call', () => {
    const a = createProject(garment);
    const b = createProject(garment);
    expect(a.metadata.id).not.toBe(b.metadata.id);
  });

  it('defaults garmentColor to natural off-white when no override is given', () => {
    const project = createProject(garment);
    expect(project.garmentColor.hex).toBe('#f5f5f0');
  });

  it('uses a provided garmentColor override (e.g. a garment manifest default) instead', () => {
    const project = createProject(garment, { garmentColor: { hex: '#1a1a1a', label: 'Black' } });
    expect(project.garmentColor).toEqual({ hex: '#1a1a1a', label: 'Black' });
  });
});
