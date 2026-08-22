export type GarmentCategory =
  | 't-shirt'
  | 'oversized-t-shirt'
  | 'boxy-t-shirt'
  | 'hoodie'
  | 'zip-hoodie'
  | 'sweatshirt'
  | 'long-sleeve'
  | 'tank-top'
  | 'polo'
  | 'jersey'
  | 'jacket'
  | 'shorts'
  | 'sweatpants'
  | 'cap'
  | 'accessory';

export type PrintZoneId =
  | 'front'
  | 'back'
  | 'left-chest'
  | 'right-chest'
  | 'left-sleeve'
  | 'right-sleeve'
  | 'hood'
  | 'pocket'
  | 'leg-front'
  | 'leg-back';

/**
 * A rectangle in a garment's UV space (0–1 on both axes), declaring where a
 * print zone lives on the garment's texture layout. This is what makes a
 * print zone a real region of the actual mesh rather than a screen-space
 * guess — the renderer maps artwork into exactly this rectangle, so two
 * zones on the same mesh (e.g. the Essential Tee's front and back, both on
 * `Mesh_Torso`) stay independent.
 */
export interface UvRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A print zone as declared by a garment's manifest — see `docs/GARMENT_SPEC.md`. */
export interface PrintZoneDefinition {
  id: PrintZoneId;
  label: string;
  /** Max artwork extent within the zone, in zone-normalized units (0–1). */
  maxWidth: number;
  maxHeight: number;
  /** Where this zone sits in the garment model's UV layout. */
  uvRect: UvRect;
  /**
   * The zone's real-world width ÷ height. UV space is not physically
   * uniform (a cylindrical torso's `u` is angular, its `v` is vertical), so
   * this is what lets the renderer keep an artwork's own aspect ratio
   * instead of stretching it to the zone's UV proportions.
   */
  aspectRatio: number;
}

/** A garment as referenced by a project. Resolved against the garment manifest at runtime. */
export interface GarmentReference {
  garmentId: string;
  /** Manifest version this project was authored against; used for compatibility checks. */
  garmentVersion: string;
  category: GarmentCategory;
}

/** Hex color, e.g. `#1a1a1a`. */
export type HexColor = `#${string}`;

export interface GarmentColor {
  hex: HexColor;
  label?: string;
}

/** A print zone as used within a project — a definition plus whether the user has enabled it. */
export interface PrintZoneState {
  zoneId: PrintZoneId;
  enabled: boolean;
}
