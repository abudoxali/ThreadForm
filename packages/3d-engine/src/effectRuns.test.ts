import { describe, expect, it } from 'vitest';
import type { ResolvedEffect } from '@threadform/effects-engine';
import { groupLayersIntoEffectRuns } from './effectRuns';
import type { ArtworkRenderLayer } from './ArtworkZoneOverlay';

function resolved(kind: 'screen-print' | 'embroidery', reliefScale = 1): ResolvedEffect {
  return {
    kind,
    label: kind,
    intensity: 0.5,
    roughness: kind === 'embroidery' ? 0.45 : 0.6,
    metalness: 0,
    relief: kind === 'embroidery' ? 'embroidery-stitch' : 'garment-weave',
    reliefScale,
    reliefRepeat: 30,
    reliefRotation: 0,
    parameters: {},
  };
}

function layer(id: string, order: number, effect: ResolvedEffect | null): ArtworkRenderLayer {
  return {
    id,
    zoneId: 'front',
    image: {} as CanvasImageSource,
    transform: { position: { x: 0.5, y: 0.5 }, rotationDegrees: 0, scale: { x: 0.5, y: 0.5 } },
    opacity: 1,
    visible: true,
    order,
    effect,
  };
}

describe('groupLayersIntoEffectRuns', () => {
  it('collapses untreated layers into a single draw', () => {
    const runs = groupLayersIntoEffectRuns([
      layer('a', 0, null),
      layer('b', 1, null),
      layer('c', 2, null),
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.effect).toBeNull();
    expect(runs[0]!.layers.map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('collapses layers that share an identical treatment', () => {
    const runs = groupLayersIntoEffectRuns([
      layer('a', 0, resolved('embroidery')),
      layer('b', 1, resolved('embroidery')),
    ]);
    expect(runs).toHaveLength(1);
  });

  it('splits layers whose treatments differ', () => {
    const runs = groupLayersIntoEffectRuns([
      layer('a', 0, resolved('screen-print')),
      layer('b', 1, resolved('embroidery')),
    ]);
    expect(runs).toHaveLength(2);
    expect(runs[0]!.effect?.kind).toBe('screen-print');
    expect(runs[1]!.effect?.kind).toBe('embroidery');
  });

  it('splits two layers of the same kind configured differently', () => {
    const runs = groupLayersIntoEffectRuns([
      layer('a', 0, resolved('embroidery', 0.4)),
      layer('b', 1, resolved('embroidery', 1.6)),
    ]);
    expect(runs).toHaveLength(2);
  });

  /**
   * The reason this groups *consecutive* runs rather than bucketing by
   * effect: bucketing would draw both screen prints together and silently
   * move one of them behind the embroidery that was on top of it.
   */
  it('preserves stacking order across interleaved treatments', () => {
    const runs = groupLayersIntoEffectRuns([
      layer('bottom', 0, resolved('screen-print')),
      layer('middle', 1, resolved('embroidery')),
      layer('top', 2, resolved('screen-print')),
    ]);
    expect(runs).toHaveLength(3);
    expect(runs.flatMap((run) => run.layers.map((l) => l.id))).toEqual(['bottom', 'middle', 'top']);
  });

  it('sorts by order before grouping, whatever order it was handed', () => {
    const runs = groupLayersIntoEffectRuns([
      layer('top', 2, null),
      layer('bottom', 0, null),
      layer('middle', 1, null),
    ]);
    expect(runs[0]!.layers.map((l) => l.id)).toEqual(['bottom', 'middle', 'top']);
  });

  it('does not mutate the array it was given', () => {
    const layers = [layer('top', 2, null), layer('bottom', 0, null)];
    const order = layers.map((l) => l.id);
    groupLayersIntoEffectRuns(layers);
    expect(layers.map((l) => l.id)).toEqual(order);
  });

  it('returns stable keys for the same grouping, so meshes stay mounted', () => {
    const layers = [layer('a', 0, resolved('embroidery')), layer('b', 1, null)];
    expect(groupLayersIntoEffectRuns(layers).map((r) => r.key)).toEqual(
      groupLayersIntoEffectRuns(layers).map((r) => r.key),
    );
  });

  it('returns distinct keys for distinct runs', () => {
    const runs = groupLayersIntoEffectRuns([
      layer('a', 0, resolved('screen-print')),
      layer('b', 1, resolved('embroidery')),
    ]);
    expect(new Set(runs.map((r) => r.key)).size).toBe(2);
  });

  it('handles an empty zone', () => {
    expect(groupLayersIntoEffectRuns([])).toEqual([]);
  });
});
