import { describe, expect, it } from 'vitest';
import type { ArtworkLayer, GarmentReference } from '@threadform/types';
import { createProject } from './factory';
import {
  addArtworkLayer,
  centerArtworkLayer,
  duplicateArtworkLayer,
  removeArtworkLayer,
  reorderArtworkLayer,
} from './layers';

const garment: GarmentReference = {
  garmentId: 'classic-tee',
  garmentVersion: '1.0.0',
  category: 't-shirt',
};

function stubLayer(
  printZoneId: ArtworkLayer['printZoneId'] = 'front',
): Omit<ArtworkLayer, 'id' | 'order'> {
  return {
    name: 'Logo',
    source: { kind: 'local-blob', blobId: 'blob_1', fileKind: 'png' },
    printZoneId,
    transform: { position: { x: 0.5, y: 0.5 }, rotationDegrees: 0, scale: { x: 1, y: 1 } },
    opacity: 1,
    visible: true,
    locked: false,
    lockAspectRatio: true,
  };
}

describe('addArtworkLayer', () => {
  it('assigns sequential order within a print zone', () => {
    let project = createProject(garment);
    project = addArtworkLayer(project, stubLayer());
    project = addArtworkLayer(project, stubLayer());
    expect(project.artworks.map((l) => l.order)).toEqual([0, 1]);
  });

  it('tracks order independently per print zone', () => {
    let project = createProject(garment);
    project = addArtworkLayer(project, stubLayer('front'));
    project = addArtworkLayer(project, stubLayer('back'));
    expect(project.artworks.find((l) => l.printZoneId === 'back')?.order).toBe(0);
  });
});

describe('removeArtworkLayer', () => {
  it('renumbers the remaining layers in the zone to stay dense', () => {
    let project = createProject(garment);
    project = addArtworkLayer(project, stubLayer());
    project = addArtworkLayer(project, stubLayer());
    project = addArtworkLayer(project, stubLayer());
    const middle = project.artworks[1];
    if (!middle) throw new Error('expected a middle layer');
    project = removeArtworkLayer(project, middle.id);
    expect(project.artworks.map((l) => l.order).sort()).toEqual([0, 1]);
  });

  it('is a no-op for an unknown layer id', () => {
    const project = createProject(garment);
    expect(removeArtworkLayer(project, 'missing')).toBe(project);
  });
});

describe('duplicateArtworkLayer', () => {
  it('appends a copy at the end of the zone stack', () => {
    let project = createProject(garment);
    project = addArtworkLayer(project, stubLayer());
    const original = project.artworks[0];
    if (!original) throw new Error('expected a layer');
    project = duplicateArtworkLayer(project, original.id);
    expect(project.artworks).toHaveLength(2);
    expect(project.artworks[1]?.order).toBe(1);
    expect(project.artworks[1]?.id).not.toBe(original.id);
  });
});

describe('reorderArtworkLayer', () => {
  it('moves a layer to a new position and keeps a dense sequence', () => {
    let project = createProject(garment);
    project = addArtworkLayer(project, { ...stubLayer(), name: 'A' });
    project = addArtworkLayer(project, { ...stubLayer(), name: 'B' });
    project = addArtworkLayer(project, { ...stubLayer(), name: 'C' });
    const [a] = project.artworks;
    if (!a) throw new Error('expected layer A');
    project = reorderArtworkLayer(project, a.id, 2);
    const byOrder = [...project.artworks].sort((x, y) => x.order - y.order);
    expect(byOrder.map((l) => l.name)).toEqual(['B', 'C', 'A']);
  });
});

describe('centerArtworkLayer', () => {
  it('sets position to the zone center', () => {
    let project = createProject(garment);
    project = addArtworkLayer(project, {
      ...stubLayer(),
      transform: { position: { x: 0.1, y: 0.9 }, rotationDegrees: 12, scale: { x: 1, y: 1 } },
    });
    const layer = project.artworks[0];
    if (!layer) throw new Error('expected a layer');
    project = centerArtworkLayer(project, layer.id);
    expect(project.artworks[0]?.transform.position).toEqual({ x: 0.5, y: 0.5 });
    expect(project.artworks[0]?.transform.rotationDegrees).toBe(12);
  });

  it('is a no-op for an unknown layer id', () => {
    const project = createProject(garment);
    expect(centerArtworkLayer(project, 'missing')).toBe(project);
  });
});
