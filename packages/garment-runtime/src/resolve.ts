import type { GarmentReference } from '@threadform/types';
import { GARMENT_CATALOG } from './catalog';
import type { GarmentResolution } from './types';

const M01_PLACEHOLDER_VERSION = '0.0.0';

/**
 * Resolves a `Project.garment` reference against the current catalog.
 *
 * `legacy-compatible` exists for M01 projects, whose garment reference was
 * a placeholder shaped `{ garmentId: category, garmentVersion: '0.0.0',
 * category }` (no manifest system existed yet). It only fires when the
 * placeholder's category is an *exact* match for a cataloged garment's
 * category — an unrelated category (e.g. `hoodie`) is `unavailable`, never
 * silently mapped onto a t-shirt.
 */
export function resolveGarmentReference(reference: GarmentReference): GarmentResolution {
  const exact = GARMENT_CATALOG.find((entry) => entry.garmentId === reference.garmentId);
  if (exact) {
    return { status: 'ready', garmentId: exact.garmentId };
  }

  const looksLikeM01Placeholder =
    reference.garmentVersion === M01_PLACEHOLDER_VERSION &&
    reference.garmentId === reference.category;

  if (looksLikeM01Placeholder) {
    const compatible = GARMENT_CATALOG.find((entry) => entry.category === reference.category);
    if (compatible) {
      return { status: 'legacy-compatible', garmentId: compatible.garmentId };
    }
  }

  return { status: 'unavailable' };
}
