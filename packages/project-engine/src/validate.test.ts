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

/**
 * M04 removed `MaterialConfiguration.color` — a second, never-read copy of
 * `Project.garmentColor` — and added an optional `ArtworkLayer.effectId`.
 * Neither needed a schema version bump, and these are the tests that say so:
 * a document saved by M03 has to keep opening, unchanged, with its colour
 * and artwork intact.
 */
describe('validateProject — projects saved before M04', () => {
  function m03Project(): Record<string, unknown> {
    const project = createProject(garment) as unknown as Record<string, unknown>;
    return {
      ...project,
      // Exactly what M03 wrote: a material carrying its own colour.
      material: {
        materialId: 'cotton',
        color: { hex: '#f5f5f0', label: 'Natural' },
        propertyOverrides: {},
      },
      garmentColor: { hex: '#2c3550', label: 'Navy' },
    };
  }

  it('opens an M03 project and keeps its garment colour', () => {
    const result = validateProject(m03Project());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.project.garmentColor.hex).toBe('#2c3550');
    expect(result.project.material.materialId).toBe('cotton');
  });

  // The duplicate is dropped at the boundary rather than migrated, which is
  // what makes this a no-op rather than a migration.
  it('sheds the duplicate material colour instead of carrying two sources', () => {
    const result = validateProject(m03Project());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.project.material).not.toHaveProperty('color');
  });

  it('opens an M03 artwork layer, which has no effect', () => {
    const project = m03Project();
    project.artworks = [
      {
        id: 'artwork_1',
        name: 'Chest mark',
        source: {
          kind: 'local-blob',
          blobId: 'blob_1',
          fileKind: 'png',
          pixelWidth: 400,
          pixelHeight: 400,
          byteSize: 2048,
        },
        printZoneId: 'front',
        transform: { position: { x: 0.5, y: 0.5 }, rotationDegrees: 0, scale: { x: 0.5, y: 0.5 } },
        opacity: 1,
        visible: true,
        locked: false,
        lockAspectRatio: true,
        order: 0,
      },
    ];

    const result = validateProject(project);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.project.artworks[0]!.effectId).toBeUndefined();
    expect(result.project.artworks[0]!.source.kind).toBe('local-blob');
  });

  it('accepts an M04 layer carrying an effect link', () => {
    const project = m03Project();
    project.effects = [
      { id: 'effect_1', kind: 'embroidery', intensity: 0.6, parameters: { stitchAngle: 45 } },
    ];
    project.artworks = [
      {
        id: 'artwork_1',
        name: 'Chest mark',
        source: {
          kind: 'local-blob',
          blobId: 'blob_1',
          fileKind: 'png',
          pixelWidth: 400,
          pixelHeight: 400,
          byteSize: 2048,
        },
        printZoneId: 'front',
        transform: { position: { x: 0.5, y: 0.5 }, rotationDegrees: 0, scale: { x: 0.5, y: 0.5 } },
        opacity: 1,
        visible: true,
        locked: false,
        lockAspectRatio: true,
        order: 0,
        effectId: 'effect_1',
      },
    ];

    const result = validateProject(project);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.project.artworks[0]!.effectId).toBe('effect_1');
  });

  // A material override that drifted out of range must not cost the user
  // their project — `material-engine` pulls it back into bounds at use.
  it('accepts an out-of-range material override rather than losing the project', () => {
    const project = m03Project();
    project.material = { materialId: 'cotton', propertyOverrides: { roughness: 40 } };
    expect(validateProject(project).success).toBe(true);
  });

  it('still rejects a non-finite material override', () => {
    const project = m03Project();
    project.material = {
      materialId: 'cotton',
      propertyOverrides: { roughness: Number.POSITIVE_INFINITY },
    };
    expect(validateProject(project).success).toBe(false);
  });
});
