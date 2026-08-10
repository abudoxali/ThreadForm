import type { GarmentColor } from './garment';

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
 */
export interface MaterialProperties {
  roughness: number;
  normalIntensity: number;
  fabricDetail: number;
  wrinkleDetail: number;
  fiberDetail: number;
}

export interface MaterialConfiguration {
  materialId: MaterialId;
  color: GarmentColor;
  /** Partial overrides applied on top of the material preset's defaults. */
  propertyOverrides: Partial<MaterialProperties>;
}
