import type { EffectKind } from '@threadform/types';

/**
 * How a print is physically applied to a garment, as renderer-ready data.
 *
 * The two implemented effects differ in the way the real processes differ:
 * screen printing lays a thin film of ink that bonds to the cloth and takes
 * on its weave, while embroidery builds a raised surface out of thread that
 * runs in a direction and catches light along it. That is why the presets
 * differ in `relief` and roughness rather than only in colour — a treatment
 * that changed hue alone would not be a print process, it would be a filter.
 */

/** Which procedural surface the renderer should give a treatment its relief from. */
export type ReliefKind =
  /** No relief of its own — the ink follows the garment's own weave. */
  | 'garment-weave'
  /** Directional satin stitching, the raised thread surface of embroidery. */
  | 'embroidery-stitch';

export interface EffectParameterSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  /** Rendered beside the value, e.g. `°`. */
  unit?: string;
}

export interface EffectPreset {
  kind: EffectKind;
  label: string;
  /** Short, factual description of the physical process. */
  description: string;
  /** Label for the intensity control, phrased for this specific process. */
  intensityLabel: string;
  defaultIntensity: number;
  relief: ReliefKind;
  /** Normal-map strength at intensity 0 and 1; interpolated between. */
  reliefScale: { min: number; max: number };
  /** PBR roughness at intensity 0 and 1. */
  roughness: { min: number; max: number };
  /** How many times the relief surface tiles across a print zone. */
  reliefRepeat: number;
  /**
   * Every parameter this kind understands. Anything not listed is dropped
   * at resolution — persisted `parameters` is untrusted input, and an
   * open-ended record reaching a renderer is how shader parameters become
   * an injection surface.
   */
  parameters: readonly EffectParameterSpec[];
}

export const EFFECT_PRESETS: Partial<Record<EffectKind, EffectPreset>> = {
  'screen-print': {
    kind: 'screen-print',
    label: 'Screen print',
    description: 'Flat ink bonded to the fabric, picking up its weave.',
    intensityLabel: 'Ink weight',
    defaultIntensity: 0.55,
    // The ink conforms to the cloth rather than adding structure, so its
    // relief comes from the garment's own weave and stays subtle. More ink
    // means a thicker, smoother, slightly glossier film that fills the
    // weave in — hence relief falls as intensity rises while the surface
    // gets less rough.
    relief: 'garment-weave',
    reliefScale: { min: 0.45, max: 0.12 },
    roughness: { min: 0.78, max: 0.42 },
    reliefRepeat: 26,
    parameters: [],
  },
  embroidery: {
    kind: 'embroidery',
    label: 'Embroidery',
    description: 'Raised satin stitching. Thread catches light along its run.',
    intensityLabel: 'Stitch relief',
    defaultIntensity: 0.6,
    relief: 'embroidery-stitch',
    // Thread stands proud of the cloth, so relief climbs with intensity.
    // Rayon/polyester embroidery thread is markedly shinier than cotton.
    reliefScale: { min: 0.35, max: 1.75 },
    roughness: { min: 0.62, max: 0.34 },
    reliefRepeat: 34,
    parameters: [
      {
        key: 'stitchAngle',
        label: 'Stitch angle',
        min: 0,
        max: 180,
        step: 15,
        defaultValue: 45,
        unit: '°',
      },
    ],
  },
};

/** The effects with a real implementation, in the order they should be offered. */
export const IMPLEMENTED_EFFECT_KINDS: readonly EffectKind[] = ['screen-print', 'embroidery'];

export function findEffectPreset(kind: EffectKind): EffectPreset | undefined {
  return EFFECT_PRESETS[kind];
}
