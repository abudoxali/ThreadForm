import { describe, expect, it } from 'vitest';
import type {
  ArtworkSource,
  EffectKind,
  GarmentReference,
  PrintZoneDefinition,
  Project,
} from '@threadform/types';
import { createProject } from './factory';
import { addArtworkLayer, duplicateArtworkLayer, removeArtworkLayer } from './layers';
import { defaultArtworkTransform } from './artwork';
import {
  applyArtworkEffect,
  clearArtworkEffect,
  findArtworkEffect,
  pruneOrphanEffects,
  setArtworkEffectIntensity,
  setArtworkEffectParameter,
} from './effects';

const garment: GarmentReference = {
  garmentId: 'threadform-essential-tee',
  garmentVersion: '1.1.0',
  category: 't-shirt',
};

const ALLOWED: readonly EffectKind[] = ['screen-print', 'embroidery'];

const FRONT: PrintZoneDefinition = {
  id: 'front',
  label: 'Front',
  maxWidth: 1,
  maxHeight: 1,
  uvRect: { x: 0.17, y: 0.4, width: 0.16, height: 0.42 },
  aspectRatio: 1,
};

const DEFAULTS = { intensity: 0.6, parameters: { stitchAngle: 45 } };

function source(blobId = 'blob_1'): Extract<ArtworkSource, { kind: 'local-blob' }> {
  return {
    kind: 'local-blob',
    blobId,
    fileKind: 'png',
    pixelWidth: 400,
    pixelHeight: 400,
    byteSize: 2048,
  };
}

function withLayers(count = 1): { project: Project; layerIds: string[] } {
  let project = createProject(garment);
  for (let index = 0; index < count; index += 1) {
    project = addArtworkLayer(project, {
      name: `Mark ${index}`,
      source: source(`blob_${index}`),
      printZoneId: 'front',
      transform: defaultArtworkTransform(source(), FRONT),
      opacity: 1,
      visible: true,
      locked: false,
      lockAspectRatio: true,
    });
  }
  return { project, layerIds: project.artworks.map((layer) => layer.id) };
}

function layerOf(project: Project, layerId: string) {
  const layer = project.artworks.find((candidate) => candidate.id === layerId);
  if (!layer) throw new Error('expected the layer to exist');
  return layer;
}

describe('applyArtworkEffect', () => {
  it('links a new effect configuration to the layer by id', () => {
    const { project, layerIds } = withLayers();
    const applied = applyArtworkEffect(project, layerIds[0]!, 'embroidery', ALLOWED, DEFAULTS);

    expect(applied.effects).toHaveLength(1);
    expect(layerOf(applied, layerIds[0]!).effectId).toBe(applied.effects[0]!.id);
    expect(applied.effects[0]!.kind).toBe('embroidery');
    expect(applied.effects[0]!.intensity).toBe(0.6);
    expect(applied.effects[0]!.parameters).toEqual({ stitchAngle: 45 });
  });

  // A stable id, not an array index: layers get reordered and removed, and an
  // index-based link would silently repoint at a different effect.
  it('resolves through findArtworkEffect', () => {
    const { project, layerIds } = withLayers();
    const applied = applyArtworkEffect(project, layerIds[0]!, 'screen-print', ALLOWED, DEFAULTS);
    expect(findArtworkEffect(applied, layerOf(applied, layerIds[0]!))?.kind).toBe('screen-print');
  });

  it('replaces an existing effect rather than accumulating configurations', () => {
    const { project, layerIds } = withLayers();
    const screen = applyArtworkEffect(project, layerIds[0]!, 'screen-print', ALLOWED, DEFAULTS);
    const stitched = applyArtworkEffect(screen, layerIds[0]!, 'embroidery', ALLOWED, DEFAULTS);

    expect(stitched.effects).toHaveLength(1);
    expect(stitched.effects[0]!.kind).toBe('embroidery');
    expect(layerOf(stitched, layerIds[0]!).effectId).toBe(stitched.effects[0]!.id);
  });

  // Otherwise the control would reset a tuned intensity every time it was clicked.
  it('is a no-op when the layer already has that effect', () => {
    const { project, layerIds } = withLayers();
    const applied = applyArtworkEffect(project, layerIds[0]!, 'embroidery', ALLOWED, DEFAULTS);
    const tuned = setArtworkEffectIntensity(applied, layerIds[0]!, 0.2);
    expect(applyArtworkEffect(tuned, layerIds[0]!, 'embroidery', ALLOWED, DEFAULTS)).toBe(tuned);
  });

  it('refuses a kind outside the allow-list', () => {
    const { project, layerIds } = withLayers();
    expect(applyArtworkEffect(project, layerIds[0]!, 'foil', ALLOWED, DEFAULTS)).toBe(project);
    expect(applyArtworkEffect(project, layerIds[0]!, 'puff-print', ALLOWED, DEFAULTS)).toBe(
      project,
    );
  });

  it('ignores an unknown layer', () => {
    const { project } = withLayers();
    expect(applyArtworkEffect(project, 'nope', 'embroidery', ALLOWED, DEFAULTS)).toBe(project);
  });

  // Each layer owns its own configuration, so tuning one cannot reach through
  // a shared record and move another.
  it('gives each layer its own configuration', () => {
    const { project, layerIds } = withLayers(2);
    let next = applyArtworkEffect(project, layerIds[0]!, 'embroidery', ALLOWED, DEFAULTS);
    next = applyArtworkEffect(next, layerIds[1]!, 'embroidery', ALLOWED, DEFAULTS);
    expect(next.effects).toHaveLength(2);

    next = setArtworkEffectIntensity(next, layerIds[0]!, 0.1);
    expect(findArtworkEffect(next, layerOf(next, layerIds[0]!))!.intensity).toBe(0.1);
    expect(findArtworkEffect(next, layerOf(next, layerIds[1]!))!.intensity).toBe(0.6);
  });

  it('does not mutate the project it was given', () => {
    const { project, layerIds } = withLayers();
    const snapshot = structuredClone(project);
    applyArtworkEffect(project, layerIds[0]!, 'embroidery', ALLOWED, DEFAULTS);
    expect(project).toEqual(snapshot);
  });
});

describe('clearArtworkEffect', () => {
  it('unlinks the layer and removes the now-orphaned configuration', () => {
    const { project, layerIds } = withLayers();
    const applied = applyArtworkEffect(project, layerIds[0]!, 'embroidery', ALLOWED, DEFAULTS);
    const cleared = clearArtworkEffect(applied, layerIds[0]!);

    expect(layerOf(cleared, layerIds[0]!).effectId).toBeUndefined();
    expect(cleared.effects).toHaveLength(0);
  });

  it('is a no-op for a layer with no effect', () => {
    const { project, layerIds } = withLayers();
    expect(clearArtworkEffect(project, layerIds[0]!)).toBe(project);
  });

  it('leaves other layers effects intact', () => {
    const { project, layerIds } = withLayers(2);
    let next = applyArtworkEffect(project, layerIds[0]!, 'embroidery', ALLOWED, DEFAULTS);
    next = applyArtworkEffect(next, layerIds[1]!, 'screen-print', ALLOWED, DEFAULTS);
    const cleared = clearArtworkEffect(next, layerIds[0]!);

    expect(cleared.effects).toHaveLength(1);
    expect(findArtworkEffect(cleared, layerOf(cleared, layerIds[1]!))?.kind).toBe('screen-print');
  });
});

describe('setArtworkEffectIntensity / setArtworkEffectParameter', () => {
  it('clamps intensity into 0-1', () => {
    const { project, layerIds } = withLayers();
    const applied = applyArtworkEffect(project, layerIds[0]!, 'embroidery', ALLOWED, DEFAULTS);

    expect(
      findArtworkEffect(
        setArtworkEffectIntensity(applied, layerIds[0]!, 5),
        layerOf(applied, layerIds[0]!),
      )!.intensity,
    ).toBe(1);
    expect(
      findArtworkEffect(
        setArtworkEffectIntensity(applied, layerIds[0]!, -2),
        layerOf(applied, layerIds[0]!),
      )!.intensity,
    ).toBe(0);
    expect(
      findArtworkEffect(
        setArtworkEffectIntensity(applied, layerIds[0]!, Number.NaN),
        layerOf(applied, layerIds[0]!),
      )!.intensity,
    ).toBe(0);
  });

  it('clamps a parameter to the caller-supplied range', () => {
    const { project, layerIds } = withLayers();
    const applied = applyArtworkEffect(project, layerIds[0]!, 'embroidery', ALLOWED, DEFAULTS);
    const range = { min: 0, max: 180 };

    const high = setArtworkEffectParameter(applied, layerIds[0]!, 'stitchAngle', 900, range);
    expect(findArtworkEffect(high, layerOf(high, layerIds[0]!))!.parameters.stitchAngle).toBe(180);

    const low = setArtworkEffectParameter(applied, layerIds[0]!, 'stitchAngle', -30, range);
    expect(findArtworkEffect(low, layerOf(low, layerIds[0]!))!.parameters.stitchAngle).toBe(0);
  });

  it('is a no-op when the value would not change', () => {
    const { project, layerIds } = withLayers();
    const applied = applyArtworkEffect(project, layerIds[0]!, 'embroidery', ALLOWED, DEFAULTS);
    expect(setArtworkEffectIntensity(applied, layerIds[0]!, 0.6)).toBe(applied);
    expect(
      setArtworkEffectParameter(applied, layerIds[0]!, 'stitchAngle', 45, { min: 0, max: 180 }),
    ).toBe(applied);
  });

  it('is a no-op for a layer with no effect', () => {
    const { project, layerIds } = withLayers();
    expect(setArtworkEffectIntensity(project, layerIds[0]!, 0.5)).toBe(project);
    expect(
      setArtworkEffectParameter(project, layerIds[0]!, 'stitchAngle', 90, { min: 0, max: 180 }),
    ).toBe(project);
  });
});

describe('effect lifecycle alongside layers', () => {
  // An orphaned configuration is invisible in the UI but real in the saved
  // document, and would grow every time an effect was changed.
  it('removes a layer effect when the layer is deleted', () => {
    const { project, layerIds } = withLayers(2);
    let next = applyArtworkEffect(project, layerIds[0]!, 'embroidery', ALLOWED, DEFAULTS);
    next = applyArtworkEffect(next, layerIds[1]!, 'screen-print', ALLOWED, DEFAULTS);

    const removed = removeArtworkLayer(next, layerIds[0]!);
    expect(removed.effects).toHaveLength(1);
    expect(removed.effects[0]!.kind).toBe('screen-print');
  });

  it('gives a duplicated layer its own configuration, not a shared one', () => {
    const { project, layerIds } = withLayers();
    const applied = applyArtworkEffect(project, layerIds[0]!, 'embroidery', ALLOWED, DEFAULTS);
    const duplicated = duplicateArtworkLayer(applied, layerIds[0]!);

    expect(duplicated.effects).toHaveLength(2);
    const copy = duplicated.artworks.find((layer) => layer.id !== layerIds[0]!)!;
    expect(copy.effectId).toBeDefined();
    expect(copy.effectId).not.toBe(layerOf(duplicated, layerIds[0]!).effectId);

    // Tuning the copy leaves the original where it was.
    const tuned = setArtworkEffectIntensity(duplicated, copy.id, 0.1);
    expect(findArtworkEffect(tuned, layerOf(tuned, layerIds[0]!))!.intensity).toBe(0.6);
  });
});

describe('pruneOrphanEffects', () => {
  it('drops configurations nothing references', () => {
    const { project } = withLayers();
    const withOrphan: Project = {
      ...project,
      effects: [{ id: 'effect_orphan', kind: 'embroidery', intensity: 0.5, parameters: {} }],
    };
    expect(pruneOrphanEffects(withOrphan).effects).toHaveLength(0);
  });

  it('is a no-op when everything is referenced', () => {
    const { project, layerIds } = withLayers();
    const applied = applyArtworkEffect(project, layerIds[0]!, 'embroidery', ALLOWED, DEFAULTS);
    expect(pruneOrphanEffects(applied)).toBe(applied);
  });

  // A layer pointing at an effect that no longer exists is not corrupt data;
  // it resolves to "no effect" and renders as a plain print.
  it('treats a dangling effectId as no effect rather than an error', () => {
    const { project, layerIds } = withLayers();
    const dangling: Project = {
      ...project,
      artworks: project.artworks.map((layer) => ({ ...layer, effectId: 'effect_missing' })),
    };
    expect(findArtworkEffect(dangling, layerOf(dangling, layerIds[0]!))).toBeUndefined();
  });
});
