import type { MaterialId, MaterialProperties } from '@threadform/types';

/**
 * What a fabric actually is, as far as a renderer is concerned.
 *
 * Three.js is deliberately *not* the source of truth for any of this. A
 * preset is plain data with no GPU dependency, so a fabric can be authored,
 * diffed and tested without a WebGL context — and so adding a material later
 * means adding a row here rather than another conditional in a component.
 *
 * `weave` names the procedural surface a renderer should generate for this
 * fabric; the renderer owns the texture, this package owns the description.
 * The three detail weights are the frequency bands that surface is built
 * from, which is what makes two fabrics read differently under the same
 * lighting rather than merely differing in a roughness number.
 */
export type WeaveKind = 'plain-weave' | 'knit-jersey';

export interface MaterialPreset {
  id: MaterialId;
  label: string;
  /** Short, factual description shown beside the control. Not marketing copy. */
  description: string;
  properties: MaterialProperties;
  weave: WeaveKind;
  /**
   * How many times the weave tiles across the garment's UV space,
   * horizontally and vertically.
   *
   * Tuned by eye against the Essential Tee (M04 visual QA). The Tee is
   * roughly 1.7 m around and 0.76 m tall, so these counts put a thread or a
   * wale at about 3–4 mm — coarser than real cloth, which at this viewing
   * distance would be sub-pixel and alias into moiré, but fine enough to
   * read as fabric rather than as knitwear. The first pass used less than
   * half these counts and looked like corduroy.
   *
   * The two axes are not equal because UV space is not: `u` wraps the body
   * and `v` runs its height, so the ratio keeps the structure square on the
   * garment instead of stretched.
   */
  weaveRepeat: { u: number; v: number };
}

/**
 * The materials ThreadForm can actually render today.
 *
 * `MaterialId` names nine fabrics because the union was modelled up front
 * (M00). Only the two with a real preset appear here, and a garment can only
 * offer what its own manifest also lists — a material with no entry in this
 * table is never selectable and never resolvable, so the union growing does
 * not silently expose an unimplemented fabric.
 */
export const MATERIAL_PRESETS: Partial<Record<MaterialId, MaterialPreset>> = {
  cotton: {
    id: 'cotton',
    label: 'Cotton',
    description: 'Matte, evenly woven. Light scatters rather than reflects.',
    properties: {
      // Woven cotton is the flattest common apparel fabric: a dense, even
      // structure with very little directional sheen.
      roughness: 0.86,
      normalIntensity: 0.26,
      fabricDetail: 0.85,
      wrinkleDetail: 0.3,
      fiberDetail: 0.55,
    },
    weave: 'plain-weave',
    weaveRepeat: { u: 56, v: 25 },
  },
  jersey: {
    id: 'jersey',
    label: 'Jersey',
    description: 'Knitted, softer drape. Vertical wales catch a little light.',
    properties: {
      // A knit is smoother-faced than a weave and its looped columns catch
      // light along their length, so it is both less rough and more
      // structurally pronounced than cotton.
      roughness: 0.71,
      normalIntensity: 0.4,
      fabricDetail: 1,
      wrinkleDetail: 0.55,
      fiberDetail: 0.28,
    },
    weave: 'knit-jersey',
    weaveRepeat: { u: 46, v: 21 },
  },
};

/** The materials with a real implementation, in the order they should be offered. */
export const IMPLEMENTED_MATERIAL_IDS: readonly MaterialId[] = ['cotton', 'jersey'];

export function findMaterialPreset(materialId: MaterialId): MaterialPreset | undefined {
  return MATERIAL_PRESETS[materialId];
}

/**
 * The material a project falls back to when its own is unusable — because a
 * persisted project names a fabric this build cannot render, or one the
 * garment does not offer. Cotton is the plainest of the implemented
 * fabrics, so falling back to it changes the render as little as possible.
 */
export const FALLBACK_MATERIAL_ID: MaterialId = 'cotton';
