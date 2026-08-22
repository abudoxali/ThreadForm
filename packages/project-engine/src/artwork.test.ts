import { describe, expect, it } from 'vitest';
import type {
  ArtworkLayer,
  ArtworkSource,
  GarmentReference,
  PrintZoneDefinition,
  Project,
} from '@threadform/types';
import { createProject } from './factory';
import { addArtworkLayer } from './layers';
import {
  MIN_ARTWORK_SCALE,
  DEFAULT_ARTWORK_ZONE_COVERAGE,
  artworkHeightFraction,
  artworkLayersInZone,
  clampArtworkTransform,
  defaultArtworkTransform,
  fitArtworkScale,
  moveArtworkLayerToZone,
  normalizeRotationDegrees,
  replaceArtworkSource,
  rotatedHalfExtent,
  setArtworkOpacity,
  setArtworkTransform,
  setArtworkVisibility,
} from './artwork';

const garment: GarmentReference = {
  garmentId: 'threadform-essential-tee',
  garmentVersion: '1.1.0',
  category: 't-shirt',
};

/** Mirrors the real Essential Tee manifest: a square-ish zone, half-width artwork ceiling. */
const FRONT: PrintZoneDefinition = {
  id: 'front',
  label: 'Front',
  maxWidth: 0.5,
  maxHeight: 0.55,
  uvRect: { x: 0.17, y: 0.4, width: 0.16, height: 0.42 },
  aspectRatio: 1,
};

const BACK: PrintZoneDefinition = { ...FRONT, id: 'back', label: 'Back' };

/** A deliberately non-square zone, to catch anything that assumes `aspectRatio === 1`. */
const SLEEVE: PrintZoneDefinition = {
  id: 'left-sleeve',
  label: 'Left sleeve',
  maxWidth: 0.8,
  maxHeight: 0.6,
  uvRect: { x: 0.02, y: 0.1, width: 0.1, height: 0.3 },
  aspectRatio: 2.5,
};

// Narrowed to the local-blob variant so tests can spread it (`{ ...source(),
// blobId: "blob_2" }`) without widening back to the union.
function source(
  pixelWidth = 400,
  pixelHeight = 400,
): Extract<ArtworkSource, { kind: 'local-blob' }> {
  return {
    kind: 'local-blob',
    blobId: 'blob_1',
    fileKind: 'png',
    pixelWidth,
    pixelHeight,
    byteSize: 2048,
  };
}

function projectWithLayer(
  overrides: Partial<Omit<ArtworkLayer, 'id' | 'order'>> = {},
  zone: PrintZoneDefinition = FRONT,
): { project: Project; layerId: string } {
  const base = createProject(garment);
  const artworkSource = overrides.source ?? source();
  const project = addArtworkLayer(base, {
    name: 'Logo',
    source: artworkSource,
    printZoneId: zone.id,
    transform: defaultArtworkTransform(artworkSource, zone),
    opacity: 1,
    visible: true,
    locked: false,
    lockAspectRatio: true,
    ...overrides,
  });
  const layerId = project.artworks[0]!.id;
  return { project, layerId };
}

function layerOf(project: Project, layerId: string): ArtworkLayer {
  const layer = project.artworks.find((candidate) => candidate.id === layerId);
  if (!layer) throw new Error('expected the layer to exist');
  return layer;
}

describe('normalizeRotationDegrees', () => {
  it('wraps any input into (-180, 180]', () => {
    expect(normalizeRotationDegrees(0)).toBe(0);
    expect(normalizeRotationDegrees(45)).toBe(45);
    expect(normalizeRotationDegrees(180)).toBe(180);
    expect(normalizeRotationDegrees(190)).toBe(-170);
    expect(normalizeRotationDegrees(-190)).toBe(170);
    // Repeated rotation over many sessions must not accumulate.
    expect(normalizeRotationDegrees(720 + 30)).toBe(30);
    expect(normalizeRotationDegrees(-3600)).toBe(0);
  });

  it('treats a non-finite rotation as unrotated rather than propagating NaN into the renderer', () => {
    expect(normalizeRotationDegrees(Number.NaN)).toBe(0);
    expect(normalizeRotationDegrees(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('artworkHeightFraction', () => {
  it('keeps a square image square in a square zone', () => {
    expect(artworkHeightFraction(400, 400, 1, 0.4)).toBeCloseTo(0.4);
  });

  it('accounts for the zone being physically wider than it is tall', () => {
    // A square image in a zone 2.5x wider than tall must occupy 2.5x more of
    // the zone's height than its width, or it renders as a squashed rectangle.
    expect(artworkHeightFraction(400, 400, 2.5, 0.2)).toBeCloseTo(0.5);
  });

  it("accounts for the image's own aspect ratio", () => {
    expect(artworkHeightFraction(800, 400, 1, 0.4)).toBeCloseTo(0.2);
    expect(artworkHeightFraction(400, 800, 1, 0.4)).toBeCloseTo(0.8);
  });

  it('degrades to the requested width rather than dividing by zero', () => {
    expect(artworkHeightFraction(0, 400, 1, 0.3)).toBe(0.3);
    expect(artworkHeightFraction(400, 400, 0, 0.3)).toBe(0.3);
  });
});

describe('fitArtworkScale', () => {
  it('fills the zone allowance for a square image', () => {
    expect(fitArtworkScale(400, 400, FRONT)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('gives up width rather than distorting a tall image', () => {
    const scale = fitArtworkScale(400, 1200, FRONT);
    expect(scale.y).toBeLessThanOrEqual(FRONT.maxHeight + 1e-9);
    // Aspect preserved: 1:3 image stays 1:3.
    expect(scale.y / scale.x).toBeCloseTo(3);
    expect(scale.x).toBeLessThan(FRONT.maxWidth);
  });

  it('never returns a scale below the minimum', () => {
    const scale = fitArtworkScale(400, 400, FRONT, 0);
    expect(scale.x).toBeGreaterThanOrEqual(MIN_ARTWORK_SCALE);
  });
});

describe('rotatedHalfExtent', () => {
  it('matches the raw half-size when unrotated', () => {
    expect(rotatedHalfExtent(0.4, 0.2, 0)).toEqual({ x: 0.2, y: 0.1 });
  });

  it('swaps the axes at a quarter turn', () => {
    const half = rotatedHalfExtent(0.4, 0.2, 90);
    expect(half.x).toBeCloseTo(0.1);
    expect(half.y).toBeCloseTo(0.2);
  });

  it('grows a square by root two at 45 degrees', () => {
    const half = rotatedHalfExtent(0.4, 0.4, 45);
    expect(half.x).toBeCloseTo((0.4 * Math.SQRT2) / 2);
  });
});

describe('clampArtworkTransform', () => {
  it('holds artwork inside its print zone', () => {
    const clamped = clampArtworkTransform(
      {
        position: { x: 5, y: -3 },
        rotationDegrees: 0,
        scale: { x: 0.4, y: 0.4 },
      },
      FRONT,
    );
    expect(clamped.position.x).toBeCloseTo(0.8);
    expect(clamped.position.y).toBeCloseTo(0.2);
  });

  it('tightens the position limits as the artwork is rotated', () => {
    const unrotated = clampArtworkTransform(
      { position: { x: 1, y: 0.5 }, rotationDegrees: 0, scale: { x: 0.5, y: 0.5 } },
      FRONT,
    );
    const rotated = clampArtworkTransform(
      { position: { x: 1, y: 0.5 }, rotationDegrees: 45, scale: { x: 0.5, y: 0.5 } },
      FRONT,
    );
    expect(unrotated.position.x).toBeCloseTo(0.75);
    expect(rotated.position.x).toBeLessThan(unrotated.position.x);
  });

  it('centers on an axis where the artwork is wider than the zone', () => {
    const clamped = clampArtworkTransform(
      { position: { x: 0.9, y: 0.9 }, rotationDegrees: 0, scale: { x: 1, y: 1 } },
      { ...FRONT, maxWidth: 1, maxHeight: 1 },
    );
    expect(clamped.position).toEqual({ x: 0.5, y: 0.5 });
  });

  it('clamps scale to the zone allowance and the minimum', () => {
    const big = clampArtworkTransform(
      { position: { x: 0.5, y: 0.5 }, rotationDegrees: 0, scale: { x: 9, y: 9 } },
      FRONT,
    );
    expect(big.scale).toEqual({ x: FRONT.maxWidth, y: FRONT.maxHeight });

    const tiny = clampArtworkTransform(
      { position: { x: 0.5, y: 0.5 }, rotationDegrees: 0, scale: { x: 0, y: -4 } },
      FRONT,
    );
    expect(tiny.scale).toEqual({ x: MIN_ARTWORK_SCALE, y: MIN_ARTWORK_SCALE });
  });

  it('replaces non-finite values instead of passing them to the renderer', () => {
    const clamped = clampArtworkTransform(
      {
        position: { x: Number.NaN, y: Number.POSITIVE_INFINITY },
        rotationDegrees: Number.NaN,
        scale: { x: Number.NaN, y: Number.POSITIVE_INFINITY },
      },
      FRONT,
    );
    expect(Number.isFinite(clamped.position.x)).toBe(true);
    expect(Number.isFinite(clamped.position.y)).toBe(true);
    expect(Number.isFinite(clamped.scale.x)).toBe(true);
    expect(Number.isFinite(clamped.scale.y)).toBe(true);
    expect(clamped.rotationDegrees).toBe(0);
  });
});

describe('defaultArtworkTransform', () => {
  it('centers a new artwork and sizes it to a share of the zone allowance', () => {
    const transform = defaultArtworkTransform(source(600, 600), FRONT);
    expect(transform.position).toEqual({ x: 0.5, y: 0.5 });
    expect(transform.rotationDegrees).toBe(0);
    expect(transform.scale.x).toBeCloseTo(FRONT.maxWidth * DEFAULT_ARTWORK_ZONE_COVERAGE);
    // Short of the limit, so the size control has room in both directions.
    expect(transform.scale.x).toBeLessThan(FRONT.maxWidth);
  });

  it('respects a non-square zone', () => {
    const transform = defaultArtworkTransform(source(600, 600), SLEEVE);
    expect(transform.scale.y).toBeLessThanOrEqual(SLEEVE.maxHeight + 1e-9);
    expect(transform.scale.y / transform.scale.x).toBeCloseTo(SLEEVE.aspectRatio);
  });
});

describe('setArtworkTransform', () => {
  it('moves a layer and clamps the result', () => {
    const { project, layerId } = projectWithLayer();
    const before = layerOf(project, layerId).transform;
    const moved = setArtworkTransform(project, layerId, { position: { y: 0.9 } }, FRONT);
    const layer = layerOf(moved, layerId);
    // Clamped to where the artwork's own half-height still fits in the zone.
    expect(layer.transform.position.y).toBeCloseTo(1 - before.scale.y / 2);
    expect(layer.transform.position.y).toBeLessThan(0.9);
    expect(layer.transform.position.x).toBeCloseTo(0.5);
  });

  it('derives height from the image aspect when resizing an aspect-locked layer', () => {
    const { project, layerId } = projectWithLayer({ source: source(800, 400) });
    const resized = setArtworkTransform(project, layerId, { widthFraction: 0.4 }, FRONT);
    const { scale } = layerOf(resized, layerId).transform;
    expect(scale.x).toBeCloseTo(0.4);
    expect(scale.y).toBeCloseTo(0.2);
  });

  it('normalizes rotation', () => {
    const { project, layerId } = projectWithLayer();
    const rotated = setArtworkTransform(project, layerId, { rotationDegrees: 540 }, FRONT);
    expect(layerOf(rotated, layerId).transform.rotationDegrees).toBe(180);
  });

  it('returns the same project reference when the clamped result is unchanged', () => {
    const { project, layerId } = projectWithLayer();
    const first = setArtworkTransform(project, layerId, { position: { x: 2 } }, FRONT);
    // Already pinned against the right edge; dragging further must not churn autosave.
    const second = setArtworkTransform(first, layerId, { position: { x: 3 } }, FRONT);
    expect(second).toBe(first);
  });

  it('ignores an unknown layer', () => {
    const { project } = projectWithLayer();
    expect(setArtworkTransform(project, 'nope', { rotationDegrees: 20 }, FRONT)).toBe(project);
  });

  it('leaves a locked layer alone', () => {
    const { project, layerId } = projectWithLayer({ locked: true });
    expect(setArtworkTransform(project, layerId, { rotationDegrees: 20 }, FRONT)).toBe(project);
  });

  it('touches updatedAt on a real change', () => {
    const { project, layerId } = projectWithLayer();
    const changed = setArtworkTransform(project, layerId, { rotationDegrees: 15 }, FRONT);
    expect(changed.metadata.updatedAt >= project.metadata.updatedAt).toBe(true);
    expect(changed).not.toBe(project);
  });
});

describe('setArtworkOpacity / setArtworkVisibility', () => {
  it('clamps opacity into 0-1', () => {
    const { project, layerId } = projectWithLayer();
    expect(layerOf(setArtworkOpacity(project, layerId, 5), layerId).opacity).toBe(1);
    expect(layerOf(setArtworkOpacity(project, layerId, -2), layerId).opacity).toBe(0);
    expect(layerOf(setArtworkOpacity(project, layerId, 0.35), layerId).opacity).toBeCloseTo(0.35);
  });

  it('toggles visibility without touching anything else', () => {
    const { project, layerId } = projectWithLayer();
    const hidden = setArtworkVisibility(project, layerId, false);
    expect(layerOf(hidden, layerId).visible).toBe(false);
    expect(layerOf(hidden, layerId).transform).toEqual(layerOf(project, layerId).transform);
    expect(setArtworkVisibility(hidden, layerId, false)).toBe(hidden);
  });
});

describe('moveArtworkLayerToZone', () => {
  it('reassigns the zone and appends to the destination stack', () => {
    const { project, layerId } = projectWithLayer();
    const moved = moveArtworkLayerToZone(project, layerId, BACK);
    expect(layerOf(moved, layerId).printZoneId).toBe('back');
    expect(artworkLayersInZone(moved, 'front')).toHaveLength(0);
    expect(artworkLayersInZone(moved, 'back')).toHaveLength(1);
  });

  it('re-clamps placement against the destination zone rather than assuming it still fits', () => {
    const { project, layerId } = projectWithLayer();
    const narrow: PrintZoneDefinition = { ...BACK, maxWidth: 0.1, maxHeight: 0.1 };
    const moved = moveArtworkLayerToZone(project, layerId, narrow);
    const { scale } = layerOf(moved, layerId).transform;
    expect(scale.x).toBeLessThanOrEqual(0.1 + 1e-9);
    expect(scale.y).toBeLessThanOrEqual(0.1 + 1e-9);
  });

  it('renumbers the source zone so its remaining layers stay a dense sequence', () => {
    let project = createProject(garment);
    for (const name of ['A', 'B', 'C']) {
      project = addArtworkLayer(project, {
        name,
        source: source(),
        printZoneId: 'front',
        transform: defaultArtworkTransform(source(), FRONT),
        opacity: 1,
        visible: true,
        locked: false,
        lockAspectRatio: true,
      });
    }
    const middle = artworkLayersInZone(project, 'front')[1]!;
    const moved = moveArtworkLayerToZone(project, middle.id, BACK);
    expect(artworkLayersInZone(moved, 'front').map((layer) => layer.order)).toEqual([0, 1]);
    expect(artworkLayersInZone(moved, 'back').map((layer) => layer.order)).toEqual([0]);
  });

  it('is a no-op when the layer is already in that zone', () => {
    const { project, layerId } = projectWithLayer();
    expect(moveArtworkLayerToZone(project, layerId, FRONT)).toBe(project);
  });
});

describe('replaceArtworkSource', () => {
  it('swaps the artwork and re-fits placement to the replacement aspect ratio', () => {
    const { project, layerId } = projectWithLayer({ source: source(400, 400) });
    const wide = { ...source(1600, 400), blobId: 'blob_2' };
    const replaced = replaceArtworkSource(project, layerId, wide, FRONT, 'Wide mark');

    const layer = layerOf(replaced, layerId);
    expect(layer.source).toEqual(wide);
    expect(layer.name).toBe('Wide mark');
    // 4:1 image keeps its 4:1 proportions instead of inheriting the square's height.
    expect(layer.transform.scale.x / layer.transform.scale.y).toBeCloseTo(4);
  });

  it('keeps the layer identity, zone and stacking order', () => {
    const { project, layerId } = projectWithLayer();
    const before = layerOf(project, layerId);
    const replaced = replaceArtworkSource(
      project,
      layerId,
      { ...source(), blobId: 'blob_2' },
      FRONT,
    );
    const after = layerOf(replaced, layerId);
    expect(after.id).toBe(before.id);
    expect(after.printZoneId).toBe(before.printZoneId);
    expect(after.order).toBe(before.order);
  });

  it('keeps the existing name when none is supplied', () => {
    const { project, layerId } = projectWithLayer({ name: 'Chest mark' });
    const replaced = replaceArtworkSource(
      project,
      layerId,
      { ...source(), blobId: 'blob_2' },
      FRONT,
    );
    expect(layerOf(replaced, layerId).name).toBe('Chest mark');
  });
});

describe('artworkLayersInZone', () => {
  it('returns only that zone, bottom of the stack first', () => {
    let project = createProject(garment);
    const add = (zoneId: 'front' | 'back', name: string) => {
      project = addArtworkLayer(project, {
        name,
        source: source(),
        printZoneId: zoneId,
        transform: defaultArtworkTransform(source(), FRONT),
        opacity: 1,
        visible: true,
        locked: false,
        lockAspectRatio: true,
      });
    };
    add('front', 'F1');
    add('back', 'B1');
    add('front', 'F2');

    expect(artworkLayersInZone(project, 'front').map((layer) => layer.name)).toEqual(['F1', 'F2']);
    expect(artworkLayersInZone(project, 'back').map((layer) => layer.name)).toEqual(['B1']);
  });
});
