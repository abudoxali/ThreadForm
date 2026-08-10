import type { ArtworkLayer, Project } from '@threadform/types';
import { createId } from './id';

function touch(): Pick<Project['metadata'], 'updatedAt'> {
  return { updatedAt: new Date().toISOString() };
}

/** Renumbers `order` within a print zone to a dense 0..n-1 sequence, preserving relative order. */
function renumberZone(layers: ArtworkLayer[], zoneId: ArtworkLayer['printZoneId']): ArtworkLayer[] {
  const inZone = layers
    .filter((layer) => layer.printZoneId === zoneId)
    .sort((a, b) => a.order - b.order);
  const outOfZone = layers.filter((layer) => layer.printZoneId !== zoneId);
  const renumbered = inZone.map((layer, index) => ({ ...layer, order: index }));
  return [...outOfZone, ...renumbered];
}

/** Appends a new artwork layer to the end of its print zone's stack. */
export function addArtworkLayer(
  project: Project,
  layer: Omit<ArtworkLayer, 'id' | 'order'>,
): Project {
  const zoneLayers = project.artworks.filter((l) => l.printZoneId === layer.printZoneId);
  const nextOrder = zoneLayers.length === 0 ? 0 : Math.max(...zoneLayers.map((l) => l.order)) + 1;
  const newLayer: ArtworkLayer = { ...layer, id: createId('artwork'), order: nextOrder };
  return { ...project, artworks: [...project.artworks, newLayer], metadata: { ...project.metadata, ...touch() } };
}

export function removeArtworkLayer(project: Project, layerId: string): Project {
  const target = project.artworks.find((l) => l.id === layerId);
  if (!target) return project;
  const remaining = project.artworks.filter((l) => l.id !== layerId);
  return {
    ...project,
    artworks: renumberZone(remaining, target.printZoneId),
    metadata: { ...project.metadata, ...touch() },
  };
}

export function duplicateArtworkLayer(project: Project, layerId: string): Project {
  const source = project.artworks.find((l) => l.id === layerId);
  if (!source) return project;
  const zoneLayers = project.artworks.filter((l) => l.printZoneId === source.printZoneId);
  const nextOrder = Math.max(...zoneLayers.map((l) => l.order)) + 1;
  const copy: ArtworkLayer = {
    ...source,
    id: createId('artwork'),
    name: `${source.name} copy`,
    order: nextOrder,
  };
  return { ...project, artworks: [...project.artworks, copy], metadata: { ...project.metadata, ...touch() } };
}

/** Moves a layer to `targetOrder` within its print zone, shifting others to keep a dense sequence. */
export function reorderArtworkLayer(project: Project, layerId: string, targetOrder: number): Project {
  const target = project.artworks.find((l) => l.id === layerId);
  if (!target) return project;

  const zoneLayers = project.artworks
    .filter((l) => l.printZoneId === target.printZoneId && l.id !== layerId)
    .sort((a, b) => a.order - b.order);

  const clampedOrder = Math.max(0, Math.min(targetOrder, zoneLayers.length));
  zoneLayers.splice(clampedOrder, 0, target);
  const reordered = zoneLayers.map((layer, index) => ({ ...layer, order: index }));

  const others = project.artworks.filter((l) => l.printZoneId !== target.printZoneId);
  return {
    ...project,
    artworks: [...others, ...reordered],
    metadata: { ...project.metadata, ...touch() },
  };
}

/** Centers a layer within its print zone (position 0.5, 0.5 in zone-normalized units). */
export function centerArtworkLayer(project: Project, layerId: string): Project {
  if (!project.artworks.some((layer) => layer.id === layerId)) return project;
  return {
    ...project,
    artworks: project.artworks.map((layer) =>
      layer.id === layerId
        ? { ...layer, transform: { ...layer.transform, position: { x: 0.5, y: 0.5 } } }
        : layer,
    ),
    metadata: { ...project.metadata, ...touch() },
  };
}
