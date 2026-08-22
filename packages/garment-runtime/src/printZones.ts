import type { PrintZoneDefinition, PrintZoneId } from '@threadform/types';
import type { GarmentManifest } from './types';

/**
 * A garment's print zones are declared by its manifest, not by the Studio —
 * every consumer that needs a zone's placement limits or UV rectangle looks
 * it up here rather than keeping its own copy. A zone id that isn't in the
 * manifest resolves to `undefined`: garments legitimately differ (a cap has
 * no `back`), and a persisted project can reference a zone a newer manifest
 * has dropped, so callers must handle the miss rather than assume.
 */
export function findPrintZone(
  manifest: GarmentManifest,
  zoneId: PrintZoneId,
): PrintZoneDefinition | undefined {
  return manifest.printZones.find((zone) => zone.id === zoneId);
}

/** The zone a newly imported artwork lands in when the user hasn't chosen one — a garment's first declared zone. */
export function defaultPrintZone(manifest: GarmentManifest): PrintZoneDefinition | undefined {
  return manifest.printZones[0];
}

/**
 * Which named mesh a print zone lives on. `meshNaming` is deliberately
 * coarse — a manifest names the garment's major surfaces, not one mesh per
 * zone — so several zones legitimately share a mesh and are separated by
 * their `uvRect` instead. The Essential Tee's `front` and `back` are the
 * canonical example: one lathe torso, two disjoint UV rectangles.
 *
 * Returns `undefined` for a zone whose surface the manifest doesn't name.
 * That is a real state, not an error: `meshNaming` has no key for a hood or
 * a trouser leg yet, so a garment declaring those zones would need the
 * manifest schema extended before they could render — better to render
 * nothing than to guess a mesh.
 */
export function printZoneMeshName(
  manifest: GarmentManifest,
  zoneId: PrintZoneId,
): string | undefined {
  const { front, back, leftSleeve, rightSleeve } = manifest.model.meshNaming;
  switch (zoneId) {
    case 'front':
    case 'left-chest':
    case 'right-chest':
    case 'pocket':
      return front;
    case 'back':
      return back;
    case 'left-sleeve':
      return leftSleeve;
    case 'right-sleeve':
      return rightSleeve;
    default:
      return undefined;
  }
}
