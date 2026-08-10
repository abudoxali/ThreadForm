import type {
  AnimationPresetId,
  CameraPresetId,
  EffectKind,
  GarmentCategory,
  HexColor,
  MaterialId,
  PrintZoneDefinition,
} from '@threadform/types';

export interface GarmentMeshNaming {
  front?: string;
  back?: string;
  leftSleeve?: string;
  rightSleeve?: string;
}

export interface GarmentModelReference {
  /** Path the 3D engine fetches the model from, relative to the app's static root (e.g. `/garments/<id>/model.glb`). */
  reference: string;
  format: 'glb';
  scale: number;
  orientationDegrees: { x: number; y: number; z: number };
  meshNaming: GarmentMeshNaming;
}

/**
 * Where a garment asset actually came from. Required on every manifest —
 * see `docs/GARMENT_SPEC.md` and `assets/garments/<id>/PROVENANCE.md` for
 * the full record. `source` is deliberately not free text so a manifest
 * can't claim third-party provenance without the accompanying license field.
 */
export interface GarmentProvenance {
  source: 'threadform-original' | 'third-party-licensed';
  createdBy: string;
  license: string;
  notes?: string;
}

export interface GarmentManifest {
  garmentId: string;
  slug: string;
  version: string;
  name: string;
  category: GarmentCategory;
  /** `development` garments are functional but not presented as final production quality. */
  readiness: 'development' | 'production';
  model: GarmentModelReference;
  defaultColor: HexColor;
  printZones: PrintZoneDefinition[];
  supportedMaterials: MaterialId[];
  supportedEffects: EffectKind[];
  compatibleAnimations: AnimationPresetId[];
  cameraPresets: CameraPresetId[];
  provenance: GarmentProvenance;
}

/** An entry in the Studio's garment picker — real manifests and honestly-unavailable future categories alike. */
export interface GarmentCatalogEntry {
  garmentId: string;
  category: GarmentCategory;
  label: string;
  available: boolean;
}

export interface CameraPresetDefinition {
  id: CameraPresetId;
  label: string;
  azimuthDegrees: number;
  polarDegrees: number;
  distance: number;
}

/**
 * The result of resolving a `Project`'s `GarmentReference` against the
 * current catalog. `legacy-compatible` covers M01 placeholder references
 * (`garmentVersion: '0.0.0'`) whose category exactly matches a garment that
 * now has a real manifest — never an unrelated category.
 */
export type GarmentResolution =
  | { status: 'ready'; garmentId: string }
  | { status: 'legacy-compatible'; garmentId: string }
  | { status: 'unavailable' };
