import { describe, expect, it } from 'vitest';
import type { GarmentManifest } from './types';
import { defaultPrintZone, findPrintZone, printZoneMeshName } from './printZones';

const manifest: GarmentManifest = {
  garmentId: 'threadform-essential-tee',
  slug: 'threadform-essential-tee',
  version: '1.1.0',
  name: 'ThreadForm Essential Tee',
  category: 't-shirt',
  readiness: 'development',
  model: {
    reference: '/garments/threadform-essential-tee/model.glb',
    format: 'glb',
    scale: 1,
    orientationDegrees: { x: 0, y: 0, z: 0 },
    meshNaming: {
      front: 'Mesh_Torso',
      back: 'Mesh_Torso',
      leftSleeve: 'Mesh_Sleeve_L',
      rightSleeve: 'Mesh_Sleeve_R',
    },
  },
  defaultColor: '#f5f5f0',
  printZones: [
    {
      id: 'front',
      label: 'Front',
      maxWidth: 0.5,
      maxHeight: 0.55,
      uvRect: { x: 0.17, y: 0.4, width: 0.16, height: 0.42 },
      aspectRatio: 1,
    },
    {
      id: 'back',
      label: 'Back',
      maxWidth: 0.5,
      maxHeight: 0.55,
      uvRect: { x: 0.67, y: 0.4, width: 0.16, height: 0.42 },
      aspectRatio: 1,
    },
  ],
  supportedMaterials: ['cotton'],
  supportedEffects: ['screen-print'],
  compatibleAnimations: ['idle'],
  cameraPresets: ['front', 'back'],
  provenance: {
    source: 'threadform-original',
    createdBy: 'ThreadForm',
    license: 'Original asset. All rights reserved to ThreadForm.',
  },
};

describe('findPrintZone', () => {
  it('returns the declared zone', () => {
    expect(findPrintZone(manifest, 'back')?.label).toBe('Back');
  });

  it('returns undefined for a zone this garment does not declare', () => {
    expect(findPrintZone(manifest, 'hood')).toBeUndefined();
  });
});

describe('defaultPrintZone', () => {
  it('is the garment first declared zone', () => {
    expect(defaultPrintZone(manifest)?.id).toBe('front');
  });
});

describe('printZoneMeshName', () => {
  // The Essential Tee is one lathe torso: front and back are separated by
  // their UV rectangles, not by geometry. Anything that assumed one mesh per
  // zone would render both prints on top of each other.
  it('maps front and back to the same torso mesh for a single-mesh garment', () => {
    expect(printZoneMeshName(manifest, 'front')).toBe('Mesh_Torso');
    expect(printZoneMeshName(manifest, 'back')).toBe('Mesh_Torso');
  });

  it('maps chest and pocket zones onto the front surface', () => {
    expect(printZoneMeshName(manifest, 'left-chest')).toBe('Mesh_Torso');
    expect(printZoneMeshName(manifest, 'right-chest')).toBe('Mesh_Torso');
    expect(printZoneMeshName(manifest, 'pocket')).toBe('Mesh_Torso');
  });

  it('maps sleeve zones to their own meshes', () => {
    expect(printZoneMeshName(manifest, 'left-sleeve')).toBe('Mesh_Sleeve_L');
    expect(printZoneMeshName(manifest, 'right-sleeve')).toBe('Mesh_Sleeve_R');
  });

  // Better to render nothing than to guess a surface the manifest never named.
  it('returns undefined for a zone whose surface the manifest cannot name', () => {
    expect(printZoneMeshName(manifest, 'hood')).toBeUndefined();
    expect(printZoneMeshName(manifest, 'leg-front')).toBeUndefined();
  });

  it('returns undefined when the manifest omits the surface a zone would use', () => {
    const sleeveless: GarmentManifest = {
      ...manifest,
      model: { ...manifest.model, meshNaming: { front: 'Mesh_Torso' } },
    };
    expect(printZoneMeshName(sleeveless, 'left-sleeve')).toBeUndefined();
    expect(printZoneMeshName(sleeveless, 'back')).toBeUndefined();
  });
});
