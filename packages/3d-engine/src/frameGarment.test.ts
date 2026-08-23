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
    // sin(20deg) ≈ 0.342 → expected ≈ 1 / 0.342 * 1.06 ≈ 3.10
    expect(distance).toBeGreaterThan(2.95);
    expect(distance).toBeLessThan(3.25);
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

/**
 * Framing from the garment's actual bounding box rather than its bounding
 * sphere. Added in M05: a sphere around a t-shirt is more than twice the
 * garment's depth in every direction, and fitting *that* to a 9:16 export's
 * tight horizontal field of view left the product occupying a third of the
 * frame. Optional, so everything above still exercises the sphere path.
 */
describe('frameGarment — bounding-box fit', () => {
  // Roughly the Essential Tee: wide, tall-ish, and very shallow.
  const halfExtents = new THREE.Vector3(0.477, 0.378, 0.206);
  const boxed = { center: new THREE.Vector3(), radius: 0.62, halfExtents };
  const sphereOnly = { center: new THREE.Vector3(), radius: 0.62 };

  it('frames a flat garment closer than its bounding sphere would', () => {
    const box = frameGarment(boxed, frontPreset, 26, 1);
    const sphere = frameGarment(sphereOnly, frontPreset, 26, 1);
    expect(box.distance).toBeLessThan(sphere.distance);
  });

  /**
   * The gain is real at every shape an export can be, and largest where the
   * sphere over-stated the garment most.
   *
   * For this garment the sphere is 1.30x its width but 1.64x its height, so
   * the biggest gain is where the *vertical* field of view is the tight one
   * — landscape. (An earlier version of this test asserted the opposite on
   * the assumption that portrait would gain most; it does gain, just less.)
   */
  it('frames meaningfully closer at every export shape', () => {
    for (const aspect of [9 / 16, 4 / 5, 1, 16 / 9]) {
      const box = frameGarment(boxed, frontPreset, 26, aspect);
      const sphere = frameGarment(sphereOnly, frontPreset, 26, aspect);
      expect(sphere.distance / box.distance, `aspect ${aspect}`).toBeGreaterThan(1.2);
    }
  });

  it('gains most where the sphere over-stated the garment most', () => {
    const gain = (aspect: number) =>
      frameGarment(sphereOnly, frontPreset, 26, aspect).distance /
      frameGarment(boxed, frontPreset, 26, aspect).distance;
    // Vertical is the tight axis on a landscape frame, and height is where
    // this garment's sphere is loosest.
    expect(gain(16 / 9)).toBeGreaterThan(gain(9 / 16));
  });

  /**
   * The guarantee that matters: whatever the aspect, the garment's projected
   * silhouette must fit inside the frustum. Checked by projecting all eight
   * box corners through the resulting camera and confirming every one lands
   * inside normalized device coordinates.
   */
  it('keeps every corner of the garment inside the frame, across extreme aspects', () => {
    for (const aspect of [0.3, 0.5625, 0.8, 1, 1.5, 16 / 9, 3]) {
      for (const preset of [
        frontPreset,
        { ...frontPreset, azimuthDegrees: 35, polarDegrees: 78 },
      ]) {
        const framed = frameGarment(boxed, preset, 26, aspect);
        const camera = new THREE.PerspectiveCamera(26, aspect, 0.05, 20);
        camera.position.copy(framed.position);
        camera.lookAt(framed.target);
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();

        for (const sx of [-1, 1]) {
          for (const sy of [-1, 1]) {
            for (const sz of [-1, 1]) {
              const corner = new THREE.Vector3(
                boxed.center.x + sx * halfExtents.x,
                boxed.center.y + sy * halfExtents.y,
                boxed.center.z + sz * halfExtents.z,
              ).project(camera);
              expect(Math.abs(corner.x), `aspect ${aspect} corner x`).toBeLessThanOrEqual(1);
              expect(Math.abs(corner.y), `aspect ${aspect} corner y`).toBeLessThanOrEqual(1);
            }
          }
        }
      }
    }
  });

  it('actually fills the frame rather than leaving the old margin', () => {
    // At square, the garment's widest axis should span most of the frame.
    const aspect = 1;
    const framed = frameGarment(boxed, frontPreset, 26, aspect);
    const camera = new THREE.PerspectiveCamera(26, aspect, 0.05, 20);
    camera.position.copy(framed.position);
    camera.lookAt(framed.target);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    const right = new THREE.Vector3(halfExtents.x, 0, 0).project(camera);
    expect(Math.abs(right.x)).toBeGreaterThan(0.85);
  });

  it('is deterministic and does not mutate the bounds it reads', () => {
    const snapshot = halfExtents.clone();
    const a = frameGarment(boxed, frontPreset, 26, 9 / 16);
    const b = frameGarment(boxed, frontPreset, 26, 9 / 16);
    expect(a.distance).toBe(b.distance);
    expect(a.position.toArray()).toEqual(b.position.toArray());
    expect(halfExtents.equals(snapshot)).toBe(true);
  });

  it('still never exceeds the orbit maximum it reports', () => {
    for (const aspect of [0.3, 0.5625, 1, 2, 3]) {
      const framed = frameGarment(boxed, frontPreset, 26, aspect);
      expect(framed.distance).toBeLessThanOrEqual(framed.maxDistance);
    }
  });
});
