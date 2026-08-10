/**
 * Effect presets are configurable entities, not UI conditionals — new effect
 * kinds are added here as union members, never as ad hoc booleans on
 * `ArtworkLayer` or scattered `if` checks in Studio components.
 */
export type EffectKind =
  | 'normal-print'
  | 'screen-print'
  | 'puff-print'
  | 'embroidery'
  | 'distressed'
  | 'vintage-faded'
  | 'acid-wash'
  | 'cracked-print'
  | 'gloss'
  | 'matte'
  | 'metallic'
  | 'reflective'
  | 'foil'
  | 'raised-ink'
  | 'patch'
  | 'sublimation';

export interface EffectConfiguration {
  id: string;
  kind: EffectKind;
  /** 0–1 blend strength of the effect against the base artwork/material. */
  intensity: number;
  /** Effect-specific tunables (e.g. puff height, embroidery stitch density). */
  parameters: Record<string, number>;
}
