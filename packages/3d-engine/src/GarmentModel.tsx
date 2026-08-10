'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { GarmentManifest } from '@threadform/garment-runtime';
import type { GarmentBounds } from './frameGarment';

export interface GarmentModelProps {
  manifest: GarmentManifest;
  colorHex: string;
  onBoundsReady: (bounds: GarmentBounds) => void;
}

function isMesh(node: THREE.Object3D): node is THREE.Mesh {
  return (node as THREE.Mesh).isMesh === true;
}

/**
 * `useGLTF` caches the loaded scene by URL and is meant to be reused across
 * mounts/instances — the geometry and the original materials it returns are
 * shared, cached resources, never owned by a single instance. This
 * component clones the scene graph (cheap — Object3D.clone doesn't deep
 * copy geometry) and additionally clones each mesh's *material* (so this
 * instance's color changes never leak into the shared cache or a future
 * second instance of the same garment). Only what was cloned here is
 * disposed on unmount/manifest change — the cached geometry is left alone.
 */
export function GarmentModel({ manifest, colorHex, onBoundsReady }: GarmentModelProps) {
  const { scene } = useGLTF(manifest.model.reference);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  // Every mesh gets its own cloned material instance below (even meshes that
  // shared one material in the source GLB), so recoloring the garment means
  // updating every "Fabric" clone here — not just whichever mesh happened to
  // be traversed last.
  const fabricMaterialsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const fabrics: THREE.MeshStandardMaterial[] = [];

    cloned.traverse((node) => {
      if (!isMesh(node)) return;
      const original = node.material;
      const owned = Array.isArray(original) ? original.map((m) => m.clone()) : original.clone();
      node.material = owned;
      for (const candidate of Array.isArray(owned) ? owned : [owned]) {
        if (candidate?.name === 'Fabric') fabrics.push(candidate as THREE.MeshStandardMaterial);
      }
    });

    fabricMaterialsRef.current = fabrics;

    const box = new THREE.Box3().setFromObject(cloned);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    onBoundsReady({ center: sphere.center, radius: sphere.radius });
    invalidate();

    return () => {
      cloned.traverse((node) => {
        if (!isMesh(node)) return;
        if (Array.isArray(node.material)) {
          node.material.forEach((m) => m.dispose());
        } else {
          node.material.dispose();
        }
      });
    };
    // Intentionally keyed on `cloned` only: `onBoundsReady` is expected to be
    // a stable callback for the lifetime of this component instance, and
    // this effect must run exactly once per manifest/scene change, not on
    // every render.
  }, [cloned]);

  useEffect(() => {
    // `frameloop="demand"` only redraws on an explicit `invalidate()` (or a
    // drei control's own internal change event) — a raw material mutation
    // here is otherwise invisible until something else happens to trigger a
    // frame (e.g. an orbit drag).
    for (const material of fabricMaterialsRef.current) material.color.set(colorHex);
    invalidate();
    // `cloned` is included so a manifest/scene change re-applies the current
    // color to the new clone's materials instead of leaving it at the new
    // GLB's baked-in default — the effect above rebuilds
    // `fabricMaterialsRef` on every `cloned` change, so this one must too.
  }, [colorHex, invalidate, cloned]);

  return (
    <primitive
      object={cloned}
      scale={manifest.model.scale}
      rotation={[
        THREE.MathUtils.degToRad(manifest.model.orientationDegrees.x),
        THREE.MathUtils.degToRad(manifest.model.orientationDegrees.y),
        THREE.MathUtils.degToRad(manifest.model.orientationDegrees.z),
      ]}
    />
  );
}
