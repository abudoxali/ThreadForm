import type { ResolvedEffect } from '@threadform/effects-engine';
import type { ArtworkRenderLayer } from './ArtworkZoneOverlay';

/**
 * Splits a print zone's layers into the smallest number of draws that can
 * still composite them correctly.
 *
 * A print zone is drawn as an overlay mesh whose material carries the
 * treatment — a screen print's ink roughness, an embroidery's stitch relief.
 * One material cannot be two treatments at once, so layers with different
 * effects cannot share a mesh.
 *
 * They also cannot simply be bucketed by effect, because that would reorder
 * them. If a zone holds a screen print, then an embroidery on top, then
 * another screen print, bucketing would draw both screen prints together and
 * silently move one of them behind the embroidery. Grouping *consecutive*
 * runs preserves the stack exactly while still collapsing the common cases
 * — a zone of untreated layers, or a zone where everything shares one
 * treatment — into a single draw.
 *
 * Pure and independent of Three.js, so the ordering guarantee is testable
 * without a GPU.
 */

export interface ArtworkEffectRun {
  /** Stable across renders for the same grouping, so React can keep the mesh mounted. */
  key: string;
  effect: ResolvedEffect | null;
  layers: ArtworkRenderLayer[];
}

/**
 * Two layers share a run only if their treatments are identical in every way
 * the renderer acts on. Comparing resolved values rather than effect ids
 * means two layers configured the same way still cost one draw.
 */
function treatmentSignature(effect: ResolvedEffect | null): string {
  if (!effect) return 'none';
  return [
    effect.kind,
    effect.roughness.toFixed(4),
    effect.metalness.toFixed(4),
    effect.relief,
    effect.reliefScale.toFixed(4),
    effect.reliefRepeat,
    effect.reliefRotation.toFixed(4),
  ].join('|');
}

export function groupLayersIntoEffectRuns(layers: ArtworkRenderLayer[]): ArtworkEffectRun[] {
  const ordered = [...layers].sort((a, b) => a.order - b.order);
  const runs: ArtworkEffectRun[] = [];

  for (const layer of ordered) {
    const signature = treatmentSignature(layer.effect);
    const current = runs[runs.length - 1];
    if (current && treatmentSignature(current.effect) === signature) {
      current.layers.push(layer);
      continue;
    }
    runs.push({
      // The first layer's id makes the key stable while that run exists and
      // distinct from any other run's, without depending on array position.
      key: `${layer.id}:${signature}`,
      effect: layer.effect,
      layers: [layer],
    });
  }

  return runs;
}
