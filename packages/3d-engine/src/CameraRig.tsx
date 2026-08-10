'use client';

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import type { CameraPresetDefinition } from '@threadform/garment-runtime';
import { frameGarment } from './frameGarment';
import type { GarmentBounds } from './frameGarment';

export interface CameraRigProps {
  preset: CameraPresetDefinition;
  bounds: GarmentBounds | null;
  /** Bumped by the caller (even for a re-selection of the already-active preset) to force a re-frame — otherwise clicking the active preset again is a no-op, since `preset` is referentially unchanged. Acts as a "reset view" trigger. */
  resetToken: number;
}

/**
 * Applies a camera preset once the garment's bounds are known, and owns the
 * orbit constraints (min/max distance derived from the garment's own size,
 * polar-angle clamp so the camera can't flip upside down or dive under the
 * floor). Framing math lives in `frameGarment` (plain, testable); this
 * component is just the R3F wiring.
 */
export function CameraRig({ preset, bounds, resetToken }: CameraRigProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera, size, invalidate } = useThree();
  const aspect = size.width / size.height;

  // Full preset framing (position + target + orbit angle) — applied only
  // when the user picks a preset (or re-picks the active one, via
  // `resetToken`) or the garment's bounds become known/change. Deliberately
  // NOT re-run on aspect/resize alone: re-snapping the camera every time the
  // canvas resizes (e.g. the mobile Inspector `<details>` expanding, or the
  // window resizing) would silently discard whatever the user had orbited
  // to. See the effect below for what a resize *does* need to do.
  useEffect(() => {
    if (!bounds) return;
    const perspective = camera as THREE.PerspectiveCamera;
    const framed = frameGarment(bounds, preset, perspective.fov ?? 32, aspect);

    camera.position.copy(framed.position);
    camera.lookAt(framed.target);

    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(framed.target);
      controls.minDistance = framed.minDistance;
      controls.maxDistance = framed.maxDistance;
      controls.update();
    }
    invalidate();
    // `aspect` is read above but intentionally excluded from this dependency
    // list — see the dedicated effect below, which owns aspect-only changes.
  }, [preset, bounds, camera, resetToken, invalidate]);

  // A resize (window resize, or the mobile Inspector sheet expanding/
  // collapsing) only needs the orbit *constraints* refreshed for the new
  // aspect ratio, and only needs to dolly the camera in if the user's
  // current distance would now clip the garment — it must never reset the
  // angle the user has orbited to.
  useEffect(() => {
    if (!bounds) return;
    const controls = controlsRef.current;
    if (!controls) return;
    const perspective = camera as THREE.PerspectiveCamera;
    const framed = frameGarment(bounds, preset, perspective.fov ?? 32, aspect);

    controls.minDistance = framed.minDistance;
    controls.maxDistance = framed.maxDistance;

    const currentDistance = camera.position.distanceTo(controls.target);
    if (currentDistance > framed.maxDistance) {
      const direction = camera.position.clone().sub(controls.target).normalize();
      camera.position.copy(controls.target).add(direction.multiplyScalar(framed.maxDistance));
    }
    controls.update();
    invalidate();
    // `preset`/`resetToken`/`bounds`/`camera` are read above but intentionally
    // excluded — a preset change is handled by the effect above, and this
    // effect must run only when the canvas is actually resized.
  }, [aspect]);

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minPolarAngle={THREE.MathUtils.degToRad(12)}
      maxPolarAngle={THREE.MathUtils.degToRad(168)}
      makeDefault
    />
  );
}
