import type {
  ArtworkLayer,
  ArtworkSource,
  PrintZoneDefinition,
  PrintZoneId,
  Project,
  Transform2D,
  Vector2,
} from '@threadform/types';

/**
 * Artwork placement, as pure `Project` transformations.
 *
 * Everything here works in *zone-normalized* space (see `Transform2D`):
 * `position` is the artwork's center within its print zone, `scale` is its
 * extent as a fraction of that zone. Nothing in this file knows about
 * pixels, canvases, textures, or UV rectangles — a print zone arrives as a
 * `PrintZoneDefinition` read from the garment's manifest, so the limits
 * applied are the garment author's, not the Studio's.
 *
 * Every mutator clamps rather than rejects. A slider drag, a pinch gesture
 * and a restored-from-storage value all funnel through the same clamp, so
 * a layer can never reach a state the renderer would have to guess about:
 * no zero or negative scale, no artwork parked outside its own print zone,
 * no unbounded rotation accumulating across sessions.
 */

/** Smallest artwork extent, as a fraction of the print zone. Below this a print is not meaningfully visible. */
export const MIN_ARTWORK_SCALE = 0.04;

/**
 * How much of a print zone a freshly imported artwork covers.
 *
 * Deliberately short of the zone's full allowance: a print that arrives
 * already touching its limits reads as "this is as big as it goes" and
 * leaves the size control with nowhere useful to go, whereas one that
 * arrives at a confident, obviously-adjustable size invites the user to
 * place it. Sizing to the *zone* rather than to a fixed measurement is what
 * keeps this sensible on a garment whose print area is a different shape.
 */
export const DEFAULT_ARTWORK_ZONE_COVERAGE = 0.7;

function touch(): Pick<Project['metadata'], 'updatedAt'> {
  return { updatedAt: new Date().toISOString() };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Normalizes any rotation to the (-180, 180] range so repeated edits can't drift toward infinity. */
export function normalizeRotationDegrees(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  const wrapped = ((degrees % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

/**
 * The height an artwork must occupy to keep its own aspect ratio at a given
 * width.
 *
 * Zone-normalized space is not square in the real world: a t-shirt's front
 * zone might be 32 cm wide and 32 cm tall, but a sleeve's is long and
 * narrow. `zoneAspectRatio` (the zone's real width ÷ height, declared by
 * the manifest) is what converts between the two, so a square logo stays
 * square on the garment instead of stretching to the zone's proportions.
 */
export function artworkHeightFraction(
  pixelWidth: number,
  pixelHeight: number,
  zoneAspectRatio: number,
  widthFraction: number,
): number {
  if (pixelWidth <= 0 || pixelHeight <= 0 || zoneAspectRatio <= 0) return widthFraction;
  const imageAspect = pixelWidth / pixelHeight;
  return (widthFraction * zoneAspectRatio) / imageAspect;
}

/**
 * The largest aspect-correct scale that fits inside a zone's declared
 * `maxWidth`/`maxHeight`. Used both for a newly imported layer's default
 * size and to shrink a layer whose width would otherwise push it past the
 * zone's height limit.
 */
export function fitArtworkScale(
  pixelWidth: number,
  pixelHeight: number,
  zone: PrintZoneDefinition,
  desiredWidth = zone.maxWidth,
): Vector2 {
  const width = clamp(desiredWidth, MIN_ARTWORK_SCALE, zone.maxWidth);
  const height = artworkHeightFraction(pixelWidth, pixelHeight, zone.aspectRatio, width);
  if (height <= zone.maxHeight) return { x: width, y: height };

  // Too tall at this width - give up width rather than distorting the image.
  const shrunk = width * (zone.maxHeight / height);
  const clampedWidth = Math.max(shrunk, MIN_ARTWORK_SCALE);
  return {
    x: clampedWidth,
    y: artworkHeightFraction(pixelWidth, pixelHeight, zone.aspectRatio, clampedWidth),
  };
}

/**
 * Half-extents of a rotated rectangle's axis-aligned bounding box. Rotation
 * is what makes "keep the artwork inside its zone" non-trivial: a 45-degree
 * square needs ~1.41x the room an unrotated one does, so position limits
 * have to tighten as the user rotates.
 */
export function rotatedHalfExtent(
  width: number,
  height: number,
  rotationDegrees: number,
): { x: number; y: number } {
  const radians = (normalizeRotationDegrees(rotationDegrees) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  return {
    x: (width * cos + height * sin) / 2,
    y: (width * sin + height * cos) / 2,
  };
}

/**
 * Clamps a whole transform into a valid state for the given zone: scale
 * within the zone's declared limits, rotation normalized, and position
 * constrained so the artwork's rotated bounding box stays inside the zone.
 * If the bounding box is wider than the zone itself (possible at extreme
 * rotations of a near-maximum-size artwork), the artwork is centered on
 * that axis instead - the least surprising resolution of an
 * over-constrained clamp.
 */
export function clampArtworkTransform(
  transform: Transform2D,
  zone: PrintZoneDefinition,
): Transform2D {
  const scale: Vector2 = {
    x: clamp(transform.scale.x, MIN_ARTWORK_SCALE, zone.maxWidth),
    y: clamp(transform.scale.y, MIN_ARTWORK_SCALE, zone.maxHeight),
  };
  const rotationDegrees = normalizeRotationDegrees(transform.rotationDegrees);
  const half = rotatedHalfExtent(scale.x, scale.y, rotationDegrees);

  const position: Vector2 = {
    x: half.x >= 0.5 ? 0.5 : clamp(transform.position.x, half.x, 1 - half.x),
    y: half.y >= 0.5 ? 0.5 : clamp(transform.position.y, half.y, 1 - half.y),
  };

  return { position, rotationDegrees, scale };
}

/** A newly imported artwork: centered in its zone, unrotated, sized to a confident fraction of the print area. */
export function defaultArtworkTransform(
  source: Pick<ArtworkSource, 'pixelWidth' | 'pixelHeight'>,
  zone: PrintZoneDefinition,
): Transform2D {
  return clampArtworkTransform(
    {
      position: { x: 0.5, y: 0.5 },
      rotationDegrees: 0,
      scale: fitArtworkScale(
        source.pixelWidth,
        source.pixelHeight,
        zone,
        zone.maxWidth * DEFAULT_ARTWORK_ZONE_COVERAGE,
      ),
    },
    zone,
  );
}

function mapLayer(
  project: Project,
  layerId: string,
  map: (layer: ArtworkLayer) => ArtworkLayer,
): Project {
  const existing = project.artworks.find((layer) => layer.id === layerId);
  if (!existing) return project;
  const next = map(existing);
  if (next === existing) return project;
  return {
    ...project,
    artworks: project.artworks.map((layer) => (layer.id === layerId ? next : layer)),
    metadata: { ...project.metadata, ...touch() },
  };
}

export interface ArtworkTransformPatch {
  position?: Partial<Vector2>;
  rotationDegrees?: number;
  /**
   * The artwork's width as a fraction of the zone. Height follows from the
   * artwork's own aspect ratio while `lockAspectRatio` is set (it is, for
   * every layer the Studio creates today), so callers never have to keep
   * the two axes consistent themselves.
   */
  widthFraction?: number;
}

/**
 * Applies a partial placement change and re-clamps the result. Returns the
 * project unchanged when the layer doesn't exist, when it is locked, or
 * when the clamped result is identical to what was already stored - so a
 * slider being dragged against its limit doesn't churn autosave.
 */
export function setArtworkTransform(
  project: Project,
  layerId: string,
  patch: ArtworkTransformPatch,
  zone: PrintZoneDefinition,
): Project {
  return mapLayer(project, layerId, (layer) => {
    if (layer.locked) return layer;

    const scale =
      patch.widthFraction === undefined
        ? layer.transform.scale
        : layer.lockAspectRatio
          ? fitArtworkScale(
              layer.source.pixelWidth,
              layer.source.pixelHeight,
              zone,
              patch.widthFraction,
            )
          : { x: patch.widthFraction, y: layer.transform.scale.y };

    const candidate = clampArtworkTransform(
      {
        position: {
          x: patch.position?.x ?? layer.transform.position.x,
          y: patch.position?.y ?? layer.transform.position.y,
        },
        rotationDegrees: patch.rotationDegrees ?? layer.transform.rotationDegrees,
        scale,
      },
      zone,
    );

    const current = layer.transform;
    const unchanged =
      candidate.position.x === current.position.x &&
      candidate.position.y === current.position.y &&
      candidate.rotationDegrees === current.rotationDegrees &&
      candidate.scale.x === current.scale.x &&
      candidate.scale.y === current.scale.y;

    return unchanged ? layer : { ...layer, transform: candidate };
  });
}

/** Sets a layer's opacity, clamped to 0-1. */
export function setArtworkOpacity(project: Project, layerId: string, opacity: number): Project {
  return mapLayer(project, layerId, (layer) => {
    const next = clamp(opacity, 0, 1);
    return next === layer.opacity ? layer : { ...layer, opacity: next };
  });
}

export function setArtworkVisibility(project: Project, layerId: string, visible: boolean): Project {
  return mapLayer(project, layerId, (layer) =>
    layer.visible === visible ? layer : { ...layer, visible },
  );
}

export function renameArtworkLayer(project: Project, layerId: string, name: string): Project {
  const trimmed = name.trim();
  return mapLayer(project, layerId, (layer) =>
    !trimmed || trimmed === layer.name ? layer : { ...layer, name: trimmed },
  );
}

/**
 * Moves a layer to a different print zone, re-clamping its placement
 * against the destination's limits and appending it to that zone's stack.
 * Zones differ in size and shape, so a placement that was valid in the
 * source zone is not assumed to be valid in the target one.
 */
export function moveArtworkLayerToZone(
  project: Project,
  layerId: string,
  zone: PrintZoneDefinition,
): Project {
  const layer = project.artworks.find((candidate) => candidate.id === layerId);
  if (!layer || layer.printZoneId === zone.id) return project;

  const destination = project.artworks.filter((candidate) => candidate.printZoneId === zone.id);
  const nextOrder =
    destination.length === 0 ? 0 : Math.max(...destination.map((entry) => entry.order)) + 1;

  const moved: ArtworkLayer = {
    ...layer,
    printZoneId: zone.id,
    order: nextOrder,
    transform: clampArtworkTransform(
      {
        ...layer.transform,
        scale: layer.lockAspectRatio
          ? fitArtworkScale(
              layer.source.pixelWidth,
              layer.source.pixelHeight,
              zone,
              layer.transform.scale.x,
            )
          : layer.transform.scale,
      },
      zone,
    ),
  };

  const remaining = project.artworks.filter((candidate) => candidate.id !== layerId);
  const sourceZone = layer.printZoneId;
  const renumberedSource = remaining
    .filter((candidate) => candidate.printZoneId === sourceZone)
    .sort((a, b) => a.order - b.order)
    .map((candidate, index) => ({ ...candidate, order: index }));
  const untouched = remaining.filter((candidate) => candidate.printZoneId !== sourceZone);

  return {
    ...project,
    artworks: [...untouched, ...renumberedSource, moved],
    metadata: { ...project.metadata, ...touch() },
  };
}

/**
 * Swaps a layer's underlying artwork while keeping its identity, zone and
 * stacking order. The placement is re-fitted because the replacement's
 * aspect ratio is almost never the original's - keeping the old height
 * against a new width would silently distort it.
 */
export function replaceArtworkSource(
  project: Project,
  layerId: string,
  source: ArtworkSource,
  zone: PrintZoneDefinition,
  name?: string,
): Project {
  return mapLayer(project, layerId, (layer) => ({
    ...layer,
    source,
    name: name?.trim() || layer.name,
    transform: clampArtworkTransform(
      {
        ...layer.transform,
        scale: fitArtworkScale(
          source.pixelWidth,
          source.pixelHeight,
          zone,
          layer.transform.scale.x,
        ),
      },
      zone,
    ),
  }));
}

/** The layers assigned to one print zone, bottom of the stack first. */
export function artworkLayersInZone(project: Project, zoneId: PrintZoneId): ArtworkLayer[] {
  return project.artworks
    .filter((layer) => layer.printZoneId === zoneId)
    .sort((a, b) => a.order - b.order);
}
