export { StudioGarmentCanvas } from './StudioGarmentCanvas';
export type { StudioGarmentCanvasProps } from './StudioGarmentCanvas';
export { frameGarment } from './frameGarment';
export type { GarmentBounds, FramedCamera } from './frameGarment';
export { ArtworkZoneOverlay } from './ArtworkZoneOverlay';
export type { ArtworkRenderLayer, ArtworkZoneOverlayProps } from './ArtworkZoneOverlay';
export {
  artworkDrawRect,
  zoneTextureMapping,
  zoneTextureSize,
  ZONE_TEXTURE_MAX_PX,
} from './artworkPlacement';
export type { ArtworkDrawRect, ZoneTextureMapping } from './artworkPlacement';
export {
  createSurfaceNormalTexture,
  getSurfaceNormalData,
  resolveOverlaySurface,
  SURFACE_TEXTURE_SIZE,
} from './surfaceTextures';
export type { OverlaySurface, SurfaceTextureOptions } from './surfaceTextures';
export { buildHeightField, heightFieldToNormalRgba } from './surfaceHeightField';
export type { SurfaceKind, SurfaceDetail, HeightFieldSpec } from './surfaceHeightField';
export { groupLayersIntoEffectRuns } from './effectRuns';
export type { ArtworkEffectRun } from './effectRuns';
