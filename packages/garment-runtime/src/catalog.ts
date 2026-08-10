import type { GarmentCategory } from '@threadform/types';

/**
 * The catalog of garments with a real, runtime-loadable manifest. Each
 * entry's `reference` is where `loadManifest` fetches `manifest.json` from
 * (the app's static root) — see `manifest.ts`. Apps compose this with their
 * own "coming later" category list for the rest of the picker; this package
 * only knows what's actually real.
 */
export interface CatalogEntry {
  garmentId: string;
  category: GarmentCategory;
  label: string;
}

export const GARMENT_CATALOG: readonly CatalogEntry[] = [
  { garmentId: 'threadform-essential-tee', category: 't-shirt', label: 'ThreadForm Essential Tee' },
];

export function findCatalogEntry(garmentId: string): CatalogEntry | undefined {
  return GARMENT_CATALOG.find((entry) => entry.garmentId === garmentId);
}
