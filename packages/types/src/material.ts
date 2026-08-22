export type MaterialId =
  | 'cotton'
  | 'heavyweight-cotton'
  | 'fleece'
  | 'polyester'
  | 'jersey'
  | 'denim'
  | 'nylon'
  | 'mesh'
  | 'performance';

/**
 * Tunable surface properties layered on top of a material preset.
 * All values are normalized 0–1 unless noted otherwise.
 *
 * `roughness` and `normalIntensity` map onto the renderer's PBR surface
 * directly. `fabricDetail`, `wrinkleDetail` and `fiberDetail` are weights on
 * the three frequency bands of the procedural weave a material generates —
 * the structural weave, a low-frequency cloth undulation, and a fine fibre
 * fuzz respectively (see `@threadform/material-engine`).
 */
export interface MaterialProperties {
  roughness: number;
  normalIntensity: number;
  fabricDetail: number;
  wrinkleDetail: number;
  fiberDetail: number;
}

/**
 * The garment's fabric.
 *
 * Deliberately carries **no colour of its own**. `Project.garmentColor` is
 * the single source of the garment's colour: it is what the colour control
 * writes, what the renderer reads, and what a garment manifest's
 * `defaultColor` seeds. A `color` field here would be a second, silently
 * divergent source of the same fact — it existed through M03, was never
 * read by anything, and was removed in M04 rather than kept in sync.
 * Persisted projects that still carry one are simply ignored (the field is
 * dropped at the validation boundary), so no migration is required.
 */
export interface MaterialConfiguration {
  materialId: MaterialId;
  /** Partial overrides applied on top of the material preset's defaults. */
  propertyOverrides: Partial<MaterialProperties>;
}
