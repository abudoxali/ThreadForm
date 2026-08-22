import type { PrintZoneDefinition, Transform2D } from '@threadform/types';

/**
 * The arithmetic that turns a print zone plus a layer's zone-normalized
 * transform into concrete canvas pixels, kept out of the React/Three
 * components so it can be tested without a GPU or a DOM - the same split
 * `frameGarment` uses for camera framing.
 */

/** Longest side, in pixels, of the texture rendered for one print zone. */
export const ZONE_TEXTURE_MAX_PX = 1024;

/**
 * A zone's texture is sized so its pixels are *physically* square: the
 * canvas aspect ratio matches the zone's real-world width-to-height ratio,
 * not its UV rectangle's proportions. UV space on a garment is not
 * uniform - a torso's `u` is an angle around the body while its `v` is a
 * height - so sizing the canvas by the UV rectangle would pre-stretch every
 * print. With physically-square pixels, a layer's already aspect-corrected
 * `scale` maps straight onto the canvas with no further correction.
 */
export function zoneTextureSize(zone: PrintZoneDefinition): { width: number; height: number } {
  const aspect = zone.aspectRatio > 0 ? zone.aspectRatio : 1;
  const width = aspect >= 1 ? ZONE_TEXTURE_MAX_PX : Math.round(ZONE_TEXTURE_MAX_PX * aspect);
  const height = aspect >= 1 ? Math.round(ZONE_TEXTURE_MAX_PX / aspect) : ZONE_TEXTURE_MAX_PX;
  return { width: Math.max(2, width), height: Math.max(2, height) };
}

export interface ArtworkDrawRect {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  rotationRadians: number;
}

/**
 * Zone-normalized space is y-up (it follows the garment's own UV
 * orientation, where `v` increases toward the collar); a 2D canvas is
 * y-down. The flip lives here, in one place, so nothing downstream has to
 * remember which convention it is holding.
 *
 * The corresponding flip on the GPU side is the texture's `flipY`, left at
 * its default `true`, which makes the top row of this canvas the top of the
 * print zone on the garment.
 */
export function artworkDrawRect(
  transform: Transform2D,
  canvasWidth: number,
  canvasHeight: number,
): ArtworkDrawRect {
  return {
    centerX: transform.position.x * canvasWidth,
    centerY: (1 - transform.position.y) * canvasHeight,
    width: transform.scale.x * canvasWidth,
    height: transform.scale.y * canvasHeight,
    rotationRadians: (transform.rotationDegrees * Math.PI) / 180,
  };
}

export interface ZoneTextureMapping {
  repeatX: number;
  repeatY: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Maps a zone-sized texture onto just its rectangle of the garment's UV
 * space. Three samples a texture at `uv * repeat + offset`, so scaling by
 * `1 / rect.size` and shifting by `-rect.origin / rect.size` makes the
 * zone's rectangle span exactly 0-1 of this texture.
 *
 * The alternative - one full-garment texture with both zones composited
 * into it - would need roughly forty times the pixels to give a print the
 * same resolution, since a print zone covers only a few percent of a
 * garment's UV area. Paired with `ClampToEdgeWrapping` and a transparent
 * border in the canvas, every part of the garment outside the zone samples
 * a transparent texel and disappears.
 */
export function zoneTextureMapping(zone: PrintZoneDefinition): ZoneTextureMapping {
  const { x, y, width, height } = zone.uvRect;
  return {
    repeatX: 1 / width,
    repeatY: 1 / height,
    offsetX: -x / width,
    offsetY: -y / height,
  };
}
