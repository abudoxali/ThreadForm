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

/**
 * One configured print effect. Owned by `Project.effects` and referenced by
 * an `ArtworkLayer.effectId` — the layer points at the effect, not the other
 * way round, so an effect's settings survive the layer being retransformed
 * and a layer can drop its effect without disturbing any other layer's.
 *
 * `parameters` is deliberately an open record in the domain model and a
 * strictly allow-listed one at the point of use: `@threadform/effects-engine`
 * accepts only the keys a given `kind` actually understands, and clamps
 * them, before anything reaches the renderer. Persisted project data is
 * untrusted, so an unknown or hostile key is dropped rather than forwarded.
 */
export interface EffectConfiguration {
  id: string;
  kind: EffectKind;
  /** 0–1 blend strength of the effect against the base artwork/material. */
  intensity: number;
  /** Effect-specific tunables (e.g. puff height, embroidery stitch angle). */
  parameters: Record<string, number>;
}
