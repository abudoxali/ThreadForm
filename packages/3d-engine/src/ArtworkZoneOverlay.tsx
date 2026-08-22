'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import type { PrintZoneDefinition, PrintZoneId, Transform2D } from '@threadform/types';
import type { ResolvedEffect } from '@threadform/effects-engine';
import type { ResolvedMaterial } from '@threadform/material-engine';
import { artworkDrawRect, zoneTextureMapping, zoneTextureSize } from './artworkPlacement';
import { createSurfaceNormalTexture, resolveOverlaySurface } from './surfaceTextures';

/**
 * A single artwork layer, ready to draw. The image is already decoded and
 * validated by the time it reaches the renderer (see
 * `@threadform/artwork-engine`) — nothing in this package fetches, parses
 * or sanitizes artwork, it only puts pixels on a garment.
 */
export interface ArtworkRenderLayer {
  id: string;
  zoneId: PrintZoneId;
  image: CanvasImageSource;
  transform: Transform2D;
  opacity: number;
  visible: boolean;
  order: number;
  /** How this print is physically applied, resolved by `@threadform/effects-engine`. `null` is an untreated print. */
  effect: ResolvedEffect | null;
}

export interface ArtworkZoneOverlayProps {
  zone: PrintZoneDefinition;
  /** The garment mesh this zone lives on. Shared, never mutated — the overlay only reads its vertices. */
  geometry: THREE.BufferGeometry;
  /** The target mesh's transform relative to the garment root, so the overlay sits exactly on it. */
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  layers: ArtworkRenderLayer[];
  /** The treatment shared by every layer in this run — see `groupLayersIntoEffectRuns`. */
  effect: ResolvedEffect | null;
  /** The fabric underneath, which screen-printed ink borrows its surface from. */
  material: ResolvedMaterial;
  /** Runs within a zone draw in ascending order so the stack composites correctly. */
  renderOrder: number;
}

/**
 * Renders one print zone's artwork onto the garment.
 *
 * The approach is a second mesh that reuses the garment mesh's own
 * geometry, drawn with a transparent, UV-mapped texture containing only
 * that zone. Because it *is* the garment's surface, the print curves with
 * the body, is lit by the same rig, is occluded correctly when the garment
 * is rotated away, and needs no per-frame work — orbiting, zooming,
 * resizing and recoloring all leave it alone. Front and back stay
 * independent for free: the far side's triangles are back-facing and
 * culled, so back artwork simply isn't there when you look at the front.
 *
 * Two details keep it from fighting the garment it sits on:
 *
 * - `polygonOffset` biases the overlay's depth toward the camera. Without
 *   it two exactly coincident surfaces z-fight into a shimmering mess.
 * - `depthWrite: false` keeps the transparent majority of the overlay from
 *   punching a hole in the depth buffer that later geometry would fail
 *   against.
 *
 * The garment's base color lives on the *garment's* material, not this one,
 * so recoloring a shirt never tints the ink printed on it.
 */
export function ArtworkZoneOverlay({
  zone,
  geometry,
  position,
  quaternion,
  scale,
  layers,
  effect,
  material,
  renderOrder,
}: ArtworkZoneOverlayProps) {
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);

  const visibleLayers = useMemo(
    () =>
      layers
        .filter((layer) => layer.visible && layer.opacity > 0)
        .sort((a, b) => a.order - b.order),
    [layers],
  );

  // One canvas and one texture per zone for the lifetime of the overlay —
  // repainting an existing canvas is far cheaper than allocating a new
  // texture (and re-uploading it to the GPU) on every slider tick.
  const surface = useMemo(() => {
    const { width, height } = zoneTextureSize(zone);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;

    const texture = new THREE.CanvasTexture(canvas);
    const mapping = zoneTextureMapping(zone);
    // Everything outside the zone's rectangle samples the canvas edge,
    // which the paint below always leaves transparent — so the print stays
    // inside its zone instead of smearing across the garment.
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(mapping.repeatX, mapping.repeatY);
    texture.offset.set(mapping.offsetX, mapping.offsetY);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    return { canvas, context, texture };
  }, [zone, gl]);

  useEffect(() => {
    return () => surface?.texture.dispose();
  }, [surface]);

  useEffect(() => {
    if (!surface) return;
    const { canvas, context, texture } = surface;
    const { width, height } = canvas;

    context.clearRect(0, 0, width, height);
    for (const layer of visibleLayers) {
      const rect = artworkDrawRect(layer.transform, width, height);
      context.save();
      context.globalAlpha = Math.min(1, Math.max(0, layer.opacity));
      context.translate(rect.centerX, rect.centerY);
      context.rotate(rect.rotationRadians);
      try {
        context.drawImage(layer.image, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
      } catch {
        // A source that fails to draw (a broken decode that still produced
        // an element) must not abort the whole zone — the other layers in
        // it are still valid artwork the user placed.
      }
      context.restore();
    }

    // Guarantee the transparent border `ClampToEdgeWrapping` relies on,
    // even if a layer was drawn right up to the zone's edge.
    context.clearRect(0, 0, width, 1);
    context.clearRect(0, height - 1, width, 1);
    context.clearRect(0, 0, 1, height);
    context.clearRect(width - 1, 0, 1, height);

    texture.needsUpdate = true;
    // `frameloop="demand"` will not redraw for a texture upload on its own.
    invalidate();
  }, [surface, visibleLayers, invalidate]);

  /**
   * The print's own physical surface: the weave a screen print's ink settles
   * into, or the stitching an embroidery is built from.
   *
   * Clipping to the artwork is free and exact. The overlay material is
   * transparent and the artwork texture's alpha is zero everywhere outside
   * the print, so those texels are never shaded at all — a raised stitch
   * surface cannot appear on bare fabric no matter how strong the relief
   * is. That is why this is a small tiling texture rather than a normal map
   * derived per-artwork: the alpha already does the masking, so deriving one
   * would be paying to recompute a mask that already exists.
   *
   * Keyed on the surface's values so an unrelated edit doesn't rebuild it;
   * owned here and disposed on change or unmount.
   */
  const overlaySurface = useMemo(() => resolveOverlaySurface(effect, material), [effect, material]);
  const surfaceKey = overlaySurface
    ? `${overlaySurface.kind}:${overlaySurface.repeat}:${overlaySurface.rotation.toFixed(4)}:${overlaySurface.detail.fabric}:${overlaySurface.detail.wrinkle}:${overlaySurface.detail.fiber}`
    : 'none';

  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  useEffect(() => {
    // Named `printMaterial`, not `material` — the latter is the fabric prop,
    // and shadowing it here would read as mutating the garment's surface.
    const printMaterial = materialRef.current;
    if (!printMaterial) return;

    if (!overlaySurface) {
      if (printMaterial.normalMap) {
        printMaterial.normalMap = null;
        printMaterial.needsUpdate = true;
        invalidate();
      }
      return;
    }

    const texture = createSurfaceNormalTexture({
      kind: overlaySurface.kind,
      detail: overlaySurface.detail,
      // A print zone is a small patch of the garment, so the relief tiles
      // the same number of times on both axes — its canvas already has
      // physically square pixels (see `zoneTextureSize`).
      repeatU: overlaySurface.repeat,
      repeatV: overlaySurface.repeat,
      rotation: overlaySurface.rotation,
      anisotropy: Math.min(8, gl.capabilities.getMaxAnisotropy()),
    });

    printMaterial.normalMap = texture;
    // Assigned imperatively, with an explicit `needsUpdate`, because
    // attaching a map a material did not previously have changes the
    // shader's defines and the program has to be rebuilt. Letting React set
    // the prop leaves the old, map-less program in place — the embroidery
    // relief simply never appeared, which is exactly how this was found
    // during M04 visual QA.
    printMaterial.needsUpdate = true;
    invalidate();

    return () => {
      if (printMaterial.normalMap === texture) {
        printMaterial.normalMap = null;
        printMaterial.needsUpdate = true;
      }
      texture.dispose();
    };
    // `overlaySurface` is read above but excluded in favour of `surfaceKey`,
    // which changes only when a value the GPU cares about does.
  }, [surfaceKey, gl, invalidate]);

  if (!surface || visibleLayers.length === 0) return null;

  // Untreated prints keep exactly the surface M03 shipped, so adding effects
  // to the product did not quietly restyle every existing project.
  const roughness = overlaySurface?.roughness ?? 0.82;
  const metalness = overlaySurface?.metalness ?? 0;
  const normalScale = overlaySurface?.normalScale ?? 0;

  return (
    <mesh
      geometry={geometry}
      position={position}
      quaternion={quaternion}
      scale={scale}
      renderOrder={renderOrder}
    >
      <meshStandardMaterial
        ref={materialRef}
        map={surface.texture}
        normalScale={normalScaleVector(normalScale)}
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-4}
        polygonOffsetUnits={-4}
        roughness={roughness}
        metalness={metalness}
      />
    </mesh>
  );
}

/**
 * R3F diffs `normalScale` by identity, so a fresh `Vector2` per render would
 * make it re-assign every frame. Cached per value instead.
 */
const normalScaleCache = new Map<number, THREE.Vector2>();
function normalScaleVector(scale: number): THREE.Vector2 {
  const rounded = Math.round(scale * 1000) / 1000;
  const cached = normalScaleCache.get(rounded);
  if (cached) return cached;
  const vector = new THREE.Vector2(rounded, rounded);
  normalScaleCache.set(rounded, vector);
  return vector;
}
