import * as THREE from 'three';
import type { CameraPresetDefinition } from '@threadform/garment-runtime';

export interface GarmentBounds {
  center: THREE.Vector3;
  radius: number;
}

export interface FramedCamera {
  position: THREE.Vector3;
  target: THREE.Vector3;
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
export function frameGarment(
  bounds: GarmentBounds,
  preset: CameraPresetDefinition,
  verticalFovDegrees: number,
  aspect: number,
): FramedCamera {
  const verticalHalfFovRadians = THREE.MathUtils.degToRad(verticalFovDegrees) / 2;
  const horizontalHalfFovRadians = Math.atan(Math.tan(verticalHalfFovRadians) * aspect);
  const constrainingHalfFovRadians = Math.min(verticalHalfFovRadians, horizontalHalfFovRadians);
  const fitMargin = 1.15;
  const distance = (bounds.radius / Math.sin(constrainingHalfFovRadians)) * fitMargin;

  const azimuth = THREE.MathUtils.degToRad(preset.azimuthDegrees);
  const polar = THREE.MathUtils.degToRad(preset.polarDegrees);
  const offset = new THREE.Vector3().setFromSpherical(
    new THREE.Spherical(distance, polar, azimuth),
  );

  return {
    position: bounds.center.clone().add(offset),
    target: bounds.center.clone(),
    minDistance: Math.max(bounds.radius * 1.3, 0.1),
    // Must never be less than `distance` itself — OrbitControls.update()
    // clamps the camera to this radius, which would silently undo the
    // aspect-ratio correction above on a narrow/portrait canvas.
    maxDistance: Math.max(bounds.radius * 6, distance * 1.5),
  };
}
