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

/** A print zone as declared by a garment's manifest — see `docs/GARMENT_SPEC.md`. */
export interface PrintZoneDefinition {
  id: PrintZoneId;
  label: string;
  /** Max artwork extent within the zone, in zone-normalized units (0–1). */
  maxWidth: number;
  maxHeight: number;
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
