'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import type { PrintZoneDefinition, PrintZoneId, Transform2D } from '@threadform/types';
import { artworkDrawRect, zoneTextureMapping, zoneTextureSize } from './artworkPlacement';

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

  if (!surface || visibleLayers.length === 0) return null;

  return (
    <mesh
      geometry={geometry}
      position={position}
      quaternion={quaternion}
      scale={scale}
      renderOrder={2}
    >
      <meshStandardMaterial
        map={surface.texture}
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-4}
        polygonOffsetUnits={-4}
        roughness={0.82}
        metalness={0}
      />
    </mesh>
  );
}
