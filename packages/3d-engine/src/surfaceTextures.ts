import * as THREE from 'three';
import type { ResolvedMaterial } from '@threadform/material-engine';
import type { ResolvedEffect } from '@threadform/effects-engine';
import { buildHeightField, heightFieldToNormalRgba } from './surfaceHeightField';
import type { SurfaceDetail, SurfaceKind } from './surfaceHeightField';

/**
 * Turns the engines' surface descriptions into GPU resources.
 *
 * The expensive half of a procedural surface is generating its pixels, and
 * that result depends only on the surface's parameters — so the *pixel data*
 * is cached module-wide and shared, while each material that needs it gets
 * its own cheap `DataTexture` wrapper. That split matters because `repeat`
 * and `rotation` live on the texture, not the material: the garment's weave
 * and a screen print's ink conforming to that same weave need different
 * tiling of identical pixels.
 *
 * Ownership is therefore explicit and one-directional. The shared pixel
 * cache is never disposed (it holds a few hundred kilobytes of typed array
 * and is bounded by the number of distinct fabrics), and every texture
 * handed out is owned by its caller, which must dispose it. Nothing here
 * mutates a shared resource, which is the same rule `GarmentModel` already
 * follows for drei's GLTF cache.
 */

/** Tile resolution. Small on purpose: this is a repeating structure, not a photograph. */
export const SURFACE_TEXTURE_SIZE = 256;

/**
 * How strongly the height field is converted to slopes. Baked once into the
 * pixels; per-use strength is `normalScale` on the material, so changing an
 * effect's intensity never regenerates a texture.
 */
const NORMAL_BAKE_STRENGTH = 0.06;

/**
 * Bound on the shared cache. Reached only by a project carrying many
 * distinct property overrides; well past that point the right behaviour is
 * to stop growing rather than to keep every variant alive forever.
 */
const MAX_CACHED_SURFACES = 12;

const surfaceDataCache = new Map<string, Uint8ClampedArray>();

/** Quantized so floating-point noise in an override can't fragment the cache. */
function surfaceKey(kind: SurfaceKind, detail: SurfaceDetail): string {
  const q = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 100);
  return `${kind}:${q(detail.fabric)}:${q(detail.wrinkle)}:${q(detail.fiber)}`;
}

/** The normal-map pixels for a surface, generated once and shared. */
export function getSurfaceNormalData(kind: SurfaceKind, detail: SurfaceDetail): Uint8ClampedArray {
  const key = surfaceKey(kind, detail);
  const cached = surfaceDataCache.get(key);
  if (cached) return cached;

  const heights = buildHeightField({ kind, size: SURFACE_TEXTURE_SIZE, detail });
  const rgba = heightFieldToNormalRgba(heights, SURFACE_TEXTURE_SIZE, NORMAL_BAKE_STRENGTH);

  if (surfaceDataCache.size >= MAX_CACHED_SURFACES) {
    const oldest = surfaceDataCache.keys().next().value;
    if (oldest !== undefined) surfaceDataCache.delete(oldest);
  }
  surfaceDataCache.set(key, rgba);
  return rgba;
}

export interface SurfaceTextureOptions {
  kind: SurfaceKind;
  detail: SurfaceDetail;
  repeatU: number;
  repeatV: number;
  /** Radians. Used to run embroidery stitches at the configured angle without baking a texture per angle. */
  rotation?: number;
  anisotropy?: number;
}

/**
 * Creates a normal-map texture for one material. The caller owns it and must
 * dispose it; the underlying pixels are shared and outlive it.
 */
export function createSurfaceNormalTexture(options: SurfaceTextureOptions): THREE.DataTexture {
  const data = getSurfaceNormalData(options.kind, options.detail);
  const texture = new THREE.DataTexture(
    data,
    SURFACE_TEXTURE_SIZE,
    SURFACE_TEXTURE_SIZE,
    THREE.RGBAFormat,
  );

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(options.repeatU, options.repeatV);
  if (options.rotation) {
    // Rotate about the tile's centre, otherwise the pattern also slides.
    texture.center.set(0.5, 0.5);
    texture.rotation = options.rotation;
  }
  // A normal map is geometry data, not colour — tagging it sRGB would apply
  // a gamma curve to vectors and tilt every normal.
  texture.colorSpace = THREE.NoColorSpace;
  // `DataTexture` defaults to no mipmaps, which at these repeat counts is
  // exactly how a fabric weave turns into moiré as the garment rotates.
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = options.anisotropy ?? 1;
  texture.needsUpdate = true;
  return texture;
}

/** Test-only: lets a test observe caching behaviour from a known-empty state. */
export function clearSurfaceCacheForTests(): void {
  surfaceDataCache.clear();
}

/** Test-only: how many distinct surfaces have been generated. */
export function cachedSurfaceCountForTests(): number {
  return surfaceDataCache.size;
}

/**
 * The surface an artwork overlay should be given, derived from its resolved
 * effect and the fabric it is printed on.
 *
 * `null` means "no treatment": the plain transparent print M03 shipped,
 * which is what every layer without an effect must keep looking like.
 *
 * Screen-printed ink has no structure of its own — it takes the shape of the
 * cloth underneath, so it borrows the *garment's* weave. Embroidery brings
 * its own thread, so it does not. That difference is the reason the two
 * effects read as different processes rather than as two roughness values.
 */
export interface OverlaySurface {
  kind: SurfaceKind;
  detail: SurfaceDetail;
  repeat: number;
  rotation: number;
  normalScale: number;
  roughness: number;
  metalness: number;
}

/** Thread is smoother and less fuzzy than cloth, and has no cloth undulation of its own. */
const THREAD_DETAIL: SurfaceDetail = { fabric: 1, wrinkle: 0.12, fiber: 0.22 };

export function resolveOverlaySurface(
  effect: ResolvedEffect | null,
  material: ResolvedMaterial,
): OverlaySurface | null {
  if (!effect) return null;

  if (effect.relief === 'embroidery-stitch') {
    return {
      kind: 'embroidery-stitch',
      detail: THREAD_DETAIL,
      repeat: effect.reliefRepeat,
      rotation: effect.reliefRotation,
      normalScale: effect.reliefScale,
      roughness: effect.roughness,
      metalness: effect.metalness,
    };
  }

  return {
    kind: material.weave,
    detail: material.detail,
    repeat: effect.reliefRepeat,
    rotation: 0,
    normalScale: effect.reliefScale,
    roughness: effect.roughness,
    metalness: effect.metalness,
  };
}
