import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { CameraPresetDefinition } from '@threadform/garment-runtime';
import { frameGarment } from './frameGarment';

const frontPreset: CameraPresetDefinition = {
  id: 'front',
  label: 'Front',
  azimuthDegrees: 0,
  polarDegrees: 90,
  distance: 1.9,
};

describe('frameGarment', () => {
  it('places the camera at the target-relative distance derived from the bounding radius', () => {
    const bounds = { center: new THREE.Vector3(0, 0, 0), radius: 1 };
    const result = frameGarment(bounds, frontPreset, 40, 1);

    const distance = result.position.distanceTo(result.target);
    // sin(20deg) ≈ 0.342 → expected ≈ 1 / 0.342 * 1.15 ≈ 3.36
    expect(distance).toBeGreaterThan(3.2);
    expect(distance).toBeLessThan(3.5);
  });

  it('scales distance with the garment size, independent of absolute scale', () => {
    const small = frameGarment({ center: new THREE.Vector3(), radius: 0.5 }, frontPreset, 40, 1);
    const large = frameGarment({ center: new THREE.Vector3(), radius: 2 }, frontPreset, 40, 1);

    const smallDistance = small.position.distanceTo(small.target);
    const largeDistance = large.position.distanceTo(large.target);
    expect(largeDistance / smallDistance).toBeCloseTo(4, 1); // 4x radius → ~4x distance
  });

  it('targets the garment bounds center, not the origin', () => {
    const center = new THREE.Vector3(0.1, 0.4, -0.05);
    const result = frameGarment({ center, radius: 1 }, frontPreset, 40, 1);
    expect(result.target.equals(center)).toBe(true);
  });

  it('positions the camera along the preset azimuth/polar angle', () => {
    const bounds = { center: new THREE.Vector3(0, 0, 0), radius: 1 };
    const back: CameraPresetDefinition = { ...frontPreset, id: 'back', azimuthDegrees: 180 };

    const front = frameGarment(bounds, frontPreset, 40, 1);
    const rear = frameGarment(bounds, back, 40, 1);

    // Front looks from +Z-ish, back from -Z-ish at the same polar angle — opposite Z sign.
    expect(Math.sign(front.position.z)).not.toBe(Math.sign(rear.position.z));
  });

  it('derives min/max orbit distance from the bounding radius', () => {
    const result = frameGarment({ center: new THREE.Vector3(), radius: 1 }, frontPreset, 40, 1);
    expect(result.minDistance).toBeCloseTo(1.3, 5);
    expect(result.maxDistance).toBeCloseTo(6, 5);
  });

  it('pulls the camera back further on a narrow/portrait canvas so a wide garment is not clipped', () => {
    const bounds = { center: new THREE.Vector3(), radius: 1 };
    const square = frameGarment(bounds, frontPreset, 40, 1);
    const portrait = frameGarment(bounds, frontPreset, 40, 0.5);

    const squareDistance = square.position.distanceTo(square.target);
    const portraitDistance = portrait.position.distanceTo(portrait.target);
    expect(portraitDistance).toBeGreaterThan(squareDistance);
  });

  it('does not move the camera closer than the vertical-FOV fit on a wide/landscape canvas', () => {
    const bounds = { center: new THREE.Vector3(), radius: 1 };
    const square = frameGarment(bounds, frontPreset, 40, 1);
    const landscape = frameGarment(bounds, frontPreset, 40, 2);

    const squareDistance = square.position.distanceTo(square.target);
    const landscapeDistance = landscape.position.distanceTo(landscape.target);
    expect(landscapeDistance).toBeCloseTo(squareDistance, 5);
  });

  it('never returns a position OrbitControls would immediately clamp back in, across extreme aspects', () => {
    // OrbitControls.update() clamps the spherical radius to `maxDistance` —
    // if the framed distance ever exceeded it, the aspect-ratio correction
    // above would be silently undone the moment the camera rig applies it.
    const bounds = { center: new THREE.Vector3(0.1, -0.2, 0), radius: 1 };
    for (const aspect of [0.3, 0.45, 0.5, 0.65, 0.8, 1, 1.5, 2, 3]) {
      const result = frameGarment(bounds, frontPreset, 32, aspect);
      const distance = result.position.distanceTo(result.target);
      expect(distance).toBeLessThanOrEqual(result.maxDistance);
    }
  });
});
