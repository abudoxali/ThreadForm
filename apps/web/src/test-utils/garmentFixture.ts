import type { GarmentManifest } from '@threadform/garment-runtime';

/** A valid manifest fixture matching the real ThreadForm Essential Tee shape, for tests that mock `loadManifest`. */
export const ESSENTIAL_TEE_MANIFEST: GarmentManifest = {
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
      maxWidth: 1,
      maxHeight: 1,
      uvRect: { x: 0.17, y: 0.4, width: 0.16, height: 0.42 },
      aspectRatio: 1,
    },
    {
      id: 'back',
      label: 'Back',
      maxWidth: 1,
      maxHeight: 1,
      uvRect: { x: 0.67, y: 0.4, width: 0.16, height: 0.42 },
      aspectRatio: 1,
    },
  ],
  supportedMaterials: ['cotton', 'jersey'],
  supportedEffects: ['screen-print', 'embroidery'],
  compatibleAnimations: ['idle', 'slow-rotate', 'turntable-360'],
  cameraPresets: ['front', 'back', 'three-quarter'],
  provenance: {
    source: 'threadform-original',
    createdBy: 'ThreadForm',
    license: 'Original asset. All rights reserved to ThreadForm.',
  },
};
