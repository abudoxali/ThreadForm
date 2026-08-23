'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { GarmentManifest } from '@threadform/garment-runtime';
import { printZoneMeshName } from '@threadform/garment-runtime';
import type { ResolvedMaterial } from '@threadform/material-engine';
import type { GarmentBounds } from './frameGarment';
import { ArtworkZoneOverlay } from './ArtworkZoneOverlay';
import type { ArtworkRenderLayer } from './ArtworkZoneOverlay';
import { createSurfaceNormalTexture } from './surfaceTextures';
import { groupLayersIntoEffectRuns } from './effectRuns';

export interface GarmentModelProps {
  manifest: GarmentManifest;
  colorHex: string;
  /** The garment's fabric, already resolved and clamped by `@threadform/material-engine`. */
  material: ResolvedMaterial;
  artworkLayers: ArtworkRenderLayer[];
  onBoundsReady: (bounds: GarmentBounds) => void;
}

function isMesh(node: THREE.Object3D): node is THREE.Mesh {
  return (node as THREE.Mesh).isMesh === true;
}

/** Stable empty list for zones with no artwork, so those zones don't see a new array identity each render. */
const NO_RUNS: ReturnType<typeof groupLayersIntoEffectRuns> = [];

interface ZoneTarget {
  zoneId: string;
  zone: GarmentManifest['printZones'][number];
  geometry: THREE.BufferGeometry;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
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
export function GarmentModel({
  manifest,
  colorHex,
  material,
  artworkLayers,
  onBoundsReady,
}: GarmentModelProps) {
  const { scene } = useGLTF(manifest.model.reference);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  // Every mesh gets its own cloned material instance below (even meshes that
  // shared one material in the source GLB), so recoloring the garment means
  // updating every "Fabric" clone here — not just whichever mesh happened to
  // be traversed last.
  const fabricMaterialsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const invalidate = useThree((state) => state.invalidate);
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());

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
    // The box as well as the sphere: `frameGarment` fits the box's projected
    // silhouette, which is far tighter than a sphere for something as flat
    // and wide as a garment. The sphere is still what the orbit distance
    // limits are derived from.
    const halfExtents = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    onBoundsReady({ center: sphere.center, radius: sphere.radius, halfExtents });
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
    // Named `fabric`, not `material` — the latter is now a prop, and a loop
    // variable shadowing it here would read as applying the resolved fabric.
    for (const fabric of fabricMaterialsRef.current) fabric.color.set(colorHex);
    invalidate();
    // `cloned` is included so a manifest/scene change re-applies the current
    // color to the new clone's materials instead of leaving it at the new
    // GLB's baked-in default — the effect above rebuilds
    // `fabricMaterialsRef` on every `cloned` change, so this one must too.
  }, [colorHex, invalidate, cloned]);

  /**
   * Applies the resolved fabric to every cloned garment material.
   *
   * Keyed on the material's *values* rather than the object it arrived in:
   * `resolveMaterial` is pure but its callers rebuild the result whenever
   * the project changes, so depending on identity would regenerate the weave
   * texture on every unrelated edit — a rename, a slider drag — and hand the
   * GPU a new upload each time.
   *
   * The texture created here is owned by this effect and disposed with it.
   * Only its *pixels* are shared (see `surfaceTextures`), so a second
   * garment instance or a second project never inherits this one's texture
   * state, and repeatedly switching fabrics cannot accumulate GPU memory.
   */
  const materialKey = `${material.materialId}:${material.roughness}:${material.metalness}:${material.normalScale}:${material.weave}:${material.weaveRepeat.u}x${material.weaveRepeat.v}:${material.detail.fabric}:${material.detail.wrinkle}:${material.detail.fiber}`;

  useEffect(() => {
    const normalMap = createSurfaceNormalTexture({
      kind: material.weave,
      detail: material.detail,
      repeatU: material.weaveRepeat.u,
      repeatV: material.weaveRepeat.v,
      anisotropy: Math.min(8, maxAnisotropy),
    });

    for (const fabric of fabricMaterialsRef.current) {
      fabric.roughness = material.roughness;
      fabric.metalness = material.metalness;
      fabric.normalMap = normalMap;
      fabric.normalScale.set(material.normalScale, material.normalScale);
      // Attaching a map that wasn't there before changes the shader's
      // defines, so the program has to be rebuilt — without this the
      // garment keeps rendering with the previous, map-less shader.
      fabric.needsUpdate = true;
    }
    invalidate();

    return () => {
      for (const fabric of fabricMaterialsRef.current) {
        if (fabric.normalMap === normalMap) {
          fabric.normalMap = null;
          fabric.needsUpdate = true;
        }
      }
      normalMap.dispose();
    };
    // `material` is read above but deliberately excluded in favour of
    // `materialKey`, which changes only when a value the GPU cares about
    // does. `cloned` is included because a new scene clone has new material
    // instances that have never had the weave applied.
  }, [materialKey, cloned, maxAnisotropy, invalidate]);

  /**
   * Locates the mesh each declared print zone lives on, and the transform
   * that mesh has *relative to the garment root*.
   *
   * The relative transform matters because a GLB is free to put its meshes
   * under nested, transformed nodes. Reading it off the cloned graph rather
   * than assuming an identity transform means the overlay lands exactly on
   * the surface it is printing onto, for any garment — not just one whose
   * exporter happened to write flat nodes.
   *
   * Zones sharing a mesh (the Essential Tee's front and back both live on
   * `Mesh_Torso`) each get their own entry; what separates them is the
   * `uvRect` in the manifest, not the geometry.
   */
  const zoneTargets = useMemo<ZoneTarget[]>(() => {
    cloned.updateMatrixWorld(true);
    const rootInverse = new THREE.Matrix4().copy(cloned.matrixWorld).invert();

    return manifest.printZones.flatMap((zone) => {
      const meshName = printZoneMeshName(manifest, zone.id);
      if (!meshName) return [];
      const target = cloned.getObjectByName(meshName);
      if (!target || !isMesh(target)) return [];

      const relative = new THREE.Matrix4().multiplyMatrices(rootInverse, target.matrixWorld);
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      relative.decompose(position, quaternion, scale);

      return [{ zoneId: zone.id, zone, geometry: target.geometry, position, quaternion, scale }];
    });
  }, [cloned, manifest]);

  // Grouped once per artwork change, not per render: each overlay repaints
  // a full-resolution canvas and re-uploads it to the GPU when its layer
  // list changes identity, so handing it a freshly-built array on every
  // render would turn an idle Studio into a texture-upload loop.
  const runsByZone = useMemo(() => {
    const grouped = new Map<string, ArtworkRenderLayer[]>();
    for (const layer of artworkLayers) {
      const existing = grouped.get(layer.zoneId);
      if (existing) existing.push(layer);
      else grouped.set(layer.zoneId, [layer]);
    }

    const runs = new Map<string, ReturnType<typeof groupLayersIntoEffectRuns>>();
    for (const [zoneId, zoneLayers] of grouped) {
      runs.set(zoneId, groupLayersIntoEffectRuns(zoneLayers));
    }
    return runs;
  }, [artworkLayers]);

  return (
    <group
      scale={manifest.model.scale}
      rotation={[
        THREE.MathUtils.degToRad(manifest.model.orientationDegrees.x),
        THREE.MathUtils.degToRad(manifest.model.orientationDegrees.y),
        THREE.MathUtils.degToRad(manifest.model.orientationDegrees.z),
      ]}
    >
      <primitive object={cloned} />
      {zoneTargets.map((target) =>
        (runsByZone.get(target.zoneId) ?? NO_RUNS).map((run, index) => (
          <ArtworkZoneOverlay
            key={`${target.zoneId}:${run.key}`}
            zone={target.zone}
            geometry={target.geometry}
            position={target.position}
            quaternion={target.quaternion}
            scale={target.scale}
            layers={run.layers}
            effect={run.effect}
            material={material}
            // Runs draw in stack order, after the garment itself.
            renderOrder={2 + index}
          />
        )),
      )}
    </group>
  );
}
