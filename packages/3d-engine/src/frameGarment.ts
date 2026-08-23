import * as THREE from 'three';
import type { CameraPresetDefinition } from '@threadform/garment-runtime';

export interface GarmentBounds {
  center: THREE.Vector3;
  radius: number;
  /**
   * Half the garment's axis-aligned size. Optional: without it, framing
   * falls back to the bounding sphere, which is correct but loose.
   *
   * A sphere around a t-shirt is a poor fit — the Essential Tee is 0.95 wide
   * and 0.41 deep, so its bounding sphere is more than twice the garment's
   * depth in every direction. Fitting that sphere wastes the most frame
   * exactly where it hurts most: on a tall export, the *horizontal* field of
   * view is the tight one, so the camera pulls back to fit a sphere far
   * wider than the garment actually is and the product ends up a third of
   * the frame. Found in M05 export QA on a 9:16 render.
   */
  halfExtents?: THREE.Vector3;
}

export interface FramedCamera {
  position: THREE.Vector3;
  target: THREE.Vector3;
  /** How far from `target` the garment fits the current canvas. Exposed so a resize can re-fit distance without disturbing the orbit angle. */
  distance: number;
  minDistance: number;
  maxDistance: number;
}

/**
 * Pure framing math, kept separate from the R3F component tree so it's
 * testable without pretending jsdom can render WebGL. Computes a camera
 * position that fits the garment's bounding sphere fully in view at the
 * given vertical field of view, at the preset's azimuth/polar angle —
 * independent of the garment's absolute scale, so it generalizes to future
 * garments without per-garment magic numbers.
 *
 * `aspect` (canvas width / height) matters because a t-shirt is wider than
 * it is tall: on a narrow/portrait canvas the *horizontal* FOV is the
 * tighter constraint, not the vertical one the camera is actually
 * configured with — fitting only to vertical FOV clips the sleeves on
 * mobile. We derive the horizontal half-FOV from the aspect ratio and fit
 * to whichever of the two is smaller (i.e. whichever demands more distance).
 */
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * The distance at which every corner of the garment's box just fits the frame.
 *
 * Solved per corner rather than from the box's overall projected extent,
 * because a perspective frustum widens with depth: a corner nearer the
 * camera than the box's centre subtends a *larger* angle than its
 * centre-plane extent suggests. Fitting the flat extent looks right
 * head-on and clips the near shoulder at an oblique angle — which is
 * exactly what an early version of this did, caught by the corner test in
 * `frameGarment.test.ts` at a 35-degree azimuth.
 *
 * For a camera at `center + direction * d`, a corner offset `c` from the
 * centre sits `d - dot(c, direction)` in front of it, so it stays inside the
 * horizontal field of view when
 *
 *   |dot(c, right)| <= (d - dot(c, direction)) * tan(halfFovH)
 *
 * which rearranges to a minimum `d` for that corner and axis. The largest
 * such `d` over all eight corners and both axes fits all of them.
 *
 * Still conservative: an axis-aligned box is larger than the garment's true
 * silhouette, so this can only ever leave more room than strictly needed.
 */
function fitProjectedBox(
  halfExtents: THREE.Vector3,
  direction: THREE.Vector3,
  verticalHalfFov: number,
  horizontalHalfFov: number,
): number {
  const forward = direction.clone().negate();
  let right = new THREE.Vector3().crossVectors(forward, WORLD_UP);
  // Degenerate when looking straight down or up. No current preset does,
  // but a top-down one would, and silently producing a NaN camera is not an
  // acceptable way to find that out.
  if (right.lengthSq() < 1e-8) right = new THREE.Vector3(1, 0, 0);
  right.normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();

  const tanH = Math.tan(horizontalHalfFov);
  const tanV = Math.tan(verticalHalfFov);
  const corner = new THREE.Vector3();
  let distance = 0;

  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        corner.set(sx * halfExtents.x, sy * halfExtents.y, sz * halfExtents.z);
        const depth = corner.dot(direction);
        distance = Math.max(
          distance,
          depth + Math.abs(corner.dot(right)) / tanH,
          depth + Math.abs(corner.dot(up)) / tanV,
        );
      }
    }
  }

  return distance;
}

export function frameGarment(
  bounds: GarmentBounds,
  preset: CameraPresetDefinition,
  verticalFovDegrees: number,
  aspect: number,
): FramedCamera {
  const verticalHalfFovRadians = THREE.MathUtils.degToRad(verticalFovDegrees) / 2;
  const horizontalHalfFovRadians = Math.atan(Math.tan(verticalHalfFovRadians) * aspect);
  const constrainingHalfFovRadians = Math.min(verticalHalfFovRadians, horizontalHalfFovRadians);
  // A tight-but-safe margin around the bounding sphere — the garment should
  // read as the hero of the canvas, not a small object adrift in it. 1.15
  // (M02) left a very generous gap on every side; 1.06 still guarantees no
  // clipping (the sphere itself is a conservative bound — see frameGarment.test.ts)
  // while making far better use of the available canvas.
  const fitMargin = 1.06;

  const azimuth = THREE.MathUtils.degToRad(preset.azimuthDegrees);
  const polar = THREE.MathUtils.degToRad(preset.polarDegrees);
  const direction = new THREE.Vector3().setFromSpherical(new THREE.Spherical(1, polar, azimuth));

  const distance = bounds.halfExtents
    ? fitProjectedBox(
        bounds.halfExtents,
        direction,
        verticalHalfFovRadians,
        horizontalHalfFovRadians,
      ) * fitMargin
    : (bounds.radius / Math.sin(constrainingHalfFovRadians)) * fitMargin;

  const offset = direction.clone().multiplyScalar(distance);

  return {
    position: bounds.center.clone().add(offset),
    target: bounds.center.clone(),
    distance,
    minDistance: Math.max(bounds.radius * 1.3, 0.1),
    // Must never be less than `distance` itself — OrbitControls.update()
    // clamps the camera to this radius, which would silently undo the
    // aspect-ratio correction above on a narrow/portrait canvas.
    maxDistance: Math.max(bounds.radius * 6, distance * 1.5),
  };
}
