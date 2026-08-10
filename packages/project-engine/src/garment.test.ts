import { describe, expect, it } from 'vitest';
import type { GarmentReference } from '@threadform/types';
import { createProject } from './factory';
import { setCameraPreset, setGarmentColor } from './garment';

const garmentRef: GarmentReference = {
  garmentId: 'threadform-essential-tee',
  garmentVersion: '1.0.0',
  category: 't-shirt',
};

describe('setGarmentColor', () => {
  it('updates the garment color hex', () => {
    const project = createProject(garmentRef);
    const updated = setGarmentColor(project, '#1a1a1a');
    expect(updated.garmentColor.hex).toBe('#1a1a1a');
  });

  it('preserves the color label', () => {
    const project = createProject(garmentRef, {
      garmentColor: { hex: '#f5f5f0', label: 'Natural' },
    });
    const updated = setGarmentColor(project, '#1a1a1a');
    expect(updated.garmentColor.label).toBe('Natural');
  });

  it('is a no-op for an invalid hex value', () => {
    const project = createProject(garmentRef);
    const updated = setGarmentColor(project, 'not-a-color');
    expect(updated).toBe(project);
  });
});

describe('setCameraPreset', () => {
  const backPreset = { azimuthDegrees: 180, polarDegrees: 80, distance: 1.9 };

  it('applies the preset id and framing angles', () => {
    const project = createProject(garmentRef);
    const updated = setCameraPreset(project, 'back', backPreset);
    expect(updated.camera.presetId).toBe('back');
    expect(updated.camera.azimuthDegrees).toBe(180);
    expect(updated.camera.polarDegrees).toBe(80);
    expect(updated.camera.distance).toBe(1.9);
  });
});
