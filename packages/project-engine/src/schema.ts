import { z } from 'zod';
import type {
  AnimationPresetId,
  ArtworkFileKind,
  CameraPresetId,
  EffectKind,
  ExportAspectRatio,
  ExportImageFormat,
  ExportResolution,
  ExportTargetPreset,
  ExportVideoFormat,
  GarmentCategory,
  HexColor,
  LightingPresetId,
  MaterialId,
  PrintZoneId,
  StudioMode,
} from '@threadform/types';

/**
 * Runtime validation for `Project` values crossing a trust boundary —
 * loading from `@threadform/local-storage`, an imported project file, or a
 * future cloud sync response. Application code that already holds a
 * `Project` it produced itself (e.g. via `createProject`) does not need to
 * re-validate; `zod` here guards untrusted input, not internal plumbing.
 *
 * Every enum list below is pinned to its `@threadform/types` union with
 * `satisfies readonly X[]` so adding a member to the type without updating
 * the list here is a compile error, not a silent runtime rejection of
 * otherwise-valid saved projects.
 */

const hexColorSchema = z
  .string()
  .regex(
    /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/,
    'expected a hex color like #1a1a1a',
  )
  .transform((value) => value as HexColor);

// `.finite()` matters more than it looks: `z.number()` alone accepts
// `Infinity`, and an infinite scale or position reaches the renderer as a
// NaN transform matrix that silently blanks the whole canvas.
const vector2Schema = z.object({ x: z.number().finite(), y: z.number().finite() });
const vector3Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});

const transform2DSchema = z.object({
  position: vector2Schema,
  rotationDegrees: z.number().finite(),
  scale: vector2Schema,
});

const garmentColorSchema = z.object({
  hex: hexColorSchema,
  label: z.string().optional(),
});

const GARMENT_CATEGORIES = [
  't-shirt',
  'oversized-t-shirt',
  'boxy-t-shirt',
  'hoodie',
  'zip-hoodie',
  'sweatshirt',
  'long-sleeve',
  'tank-top',
  'polo',
  'jersey',
  'jacket',
  'shorts',
  'sweatpants',
  'cap',
  'accessory',
] as const satisfies readonly GarmentCategory[];

const garmentReferenceSchema = z.object({
  garmentId: z.string().min(1),
  garmentVersion: z.string().min(1),
  category: z.enum(GARMENT_CATEGORIES),
});

const PRINT_ZONE_IDS = [
  'front',
  'back',
  'left-chest',
  'right-chest',
  'left-sleeve',
  'right-sleeve',
  'hood',
  'pocket',
  'leg-front',
  'leg-back',
] as const satisfies readonly PrintZoneId[];

const printZoneIdSchema = z.enum(PRINT_ZONE_IDS);

const printZoneStateSchema = z.object({
  zoneId: printZoneIdSchema,
  enabled: z.boolean(),
});

const MATERIAL_IDS = [
  'cotton',
  'heavyweight-cotton',
  'fleece',
  'polyester',
  'jersey',
  'denim',
  'nylon',
  'mesh',
  'performance',
] as const satisfies readonly MaterialId[];

/**
 * Note the absence of a `color`. Projects saved before M04 carry one, and
 * zod's default object mode strips unknown keys — so an M03 document loads,
 * validates, and quietly sheds its duplicate colour on the next save. That
 * is the whole migration: `Project.garmentColor` was always the field the
 * renderer and the colour control used, and this one was never read.
 *
 * Overrides are `.finite()` but otherwise unbounded here on purpose. What
 * counts as a sane roughness belongs to the *material preset* the override
 * sits on top of, which this schema cannot see; `@threadform/material-engine`
 * clamps them at the point of use. Rejecting a whole project because one
 * override drifted out of range would lose a user's work over a number the
 * renderer can simply pull back into bounds.
 */
const materialConfigurationSchema = z.object({
  materialId: z.enum(MATERIAL_IDS),
  propertyOverrides: z.object({
    roughness: z.number().finite().optional(),
    normalIntensity: z.number().finite().optional(),
    fabricDetail: z.number().finite().optional(),
    wrinkleDetail: z.number().finite().optional(),
    fiberDetail: z.number().finite().optional(),
  }),
});

const ARTWORK_FILE_KINDS = [
  'png',
  'jpeg',
  'webp',
  'svg',
] as const satisfies readonly ArtworkFileKind[];

/**
 * Recorded at import time by `@threadform/artwork-engine`. Bounded here as
 * well as there: these numbers come back out of storage, where they are as
 * untrusted as any other persisted field, and the renderer divides by them
 * when it aspect-corrects a layer.
 */
const artworkPixelFields = {
  pixelWidth: z.number().int().positive().max(65535),
  pixelHeight: z.number().int().positive().max(65535),
  byteSize: z.number().int().nonnegative(),
};

const artworkSourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('local-blob'),
    blobId: z.string().min(1),
    fileKind: z.enum(ARTWORK_FILE_KINDS),
    ...artworkPixelFields,
  }),
  z.object({
    kind: z.literal('remote'),
    url: z.string().url(),
    fileKind: z.enum(ARTWORK_FILE_KINDS),
    ...artworkPixelFields,
  }),
]);

const artworkLayerSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  source: artworkSourceSchema,
  printZoneId: printZoneIdSchema,
  transform: transform2DSchema,
  opacity: z.number().min(0).max(1),
  visible: z.boolean(),
  locked: z.boolean(),
  lockAspectRatio: z.boolean(),
  order: z.number(),
  // Optional, so every project saved before M04 validates unchanged. A
  // dangling id (the effect it named is gone) is not a validation failure
  // either: `findArtworkEffect` resolves it to "no effect", which renders as
  // the plain print the layer had before.
  effectId: z.string().min(1).optional(),
});

/**
 * `transform2DSchema` deliberately accepts any finite numbers rather than
 * re-encoding the placement limits: those limits belong to the *garment's*
 * print zone, which this schema cannot see. A stored transform is brought
 * back into range by `clampArtworkTransform` at the point of use, where the
 * zone definition is available, rather than causing a whole project to fail
 * validation because a manifest tightened a limit after it was saved.
 */

const EFFECT_KINDS = [
  'normal-print',
  'screen-print',
  'puff-print',
  'embroidery',
  'distressed',
  'vintage-faded',
  'acid-wash',
  'cracked-print',
  'gloss',
  'matte',
  'metallic',
  'reflective',
  'foil',
  'raised-ink',
  'patch',
  'sublimation',
] as const satisfies readonly EffectKind[];

/**
 * `parameters` stays an open record of finite numbers here, and is
 * allow-listed per effect kind by `@threadform/effects-engine` before any of
 * it reaches the renderer. Two layers of defence for the same reason as the
 * material overrides above: the schema cannot know which keys a kind
 * understands, and a project should not fail to open because it carries a
 * parameter this build has since renamed.
 */
const effectConfigurationSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(EFFECT_KINDS),
  intensity: z.number().min(0).max(1),
  parameters: z.record(z.string(), z.number().finite()),
});

const ANIMATION_PRESET_IDS = [
  'idle',
  'slow-rotate',
  'turntable-360',
  'walking',
  'wind',
  'wave',
  'floating',
  'hanging-motion',
  'fabric-drop',
  'knitting-reveal',
  'fold-unfold',
  'camera-orbit',
  'cinematic-reveal',
] as const satisfies readonly AnimationPresetId[];

const animationConfigurationSchema = z.object({
  presetId: z.enum(ANIMATION_PRESET_IDS),
  durationMs: z.number().positive(),
  playbackSpeed: z.number().positive(),
  loop: z.boolean(),
  startAtMs: z.number().nonnegative(),
  endAtMs: z.number().nonnegative(),
});

const CAMERA_PRESET_IDS = [
  'front',
  'back',
  'three-quarter',
  'side',
  'top',
  'custom',
] as const satisfies readonly CameraPresetId[];

const cameraConfigurationSchema = z.object({
  presetId: z.enum(CAMERA_PRESET_IDS),
  target: vector3Schema,
  distance: z.number().positive(),
  azimuthDegrees: z.number(),
  polarDegrees: z.number(),
  fieldOfViewDegrees: z.number().positive(),
});

const lightSourceSchema = z.object({
  intensity: z.number().nonnegative(),
  colorTemperatureKelvin: z.number().positive(),
});

const LIGHTING_PRESET_IDS = [
  'studio-soft',
  'studio-contrast',
  'daylight',
  'moody',
  'custom',
] as const satisfies readonly LightingPresetId[];

const lightingConfigurationSchema = z.object({
  presetId: z.enum(LIGHTING_PRESET_IDS),
  key: lightSourceSchema,
  fill: lightSourceSchema,
  rim: lightSourceSchema,
  environment: lightSourceSchema,
});

const backgroundConfigurationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('solid-color'), color: hexColorSchema }),
  z.object({
    kind: z.literal('gradient'),
    from: hexColorSchema,
    to: hexColorSchema,
    angleDegrees: z.number(),
  }),
  z.object({ kind: z.literal('image'), source: z.object({ blobId: z.string().min(1) }) }),
  z.object({ kind: z.literal('studio-scene'), sceneId: z.string().min(1) }),
  z.object({ kind: z.literal('hdri-environment'), environmentId: z.string().min(1) }),
]);

const EXPORT_TARGETS = [
  'instagram-feed',
  'instagram-story',
  'tiktok',
  'youtube-shorts',
  'shopify',
  'amazon',
  'etsy',
  'custom',
] as const satisfies readonly ExportTargetPreset[];

const EXPORT_IMAGE_FORMATS = [
  'png',
  'jpg',
  'webp',
  'png-transparent',
] as const satisfies readonly ExportImageFormat[];

const EXPORT_RESOLUTIONS = [
  '720p',
  '1080p',
  '1440p',
  '4k',
] as const satisfies readonly ExportResolution[];

const EXPORT_VIDEO_FORMATS = ['webm', 'mp4'] as const satisfies readonly ExportVideoFormat[];

const EXPORT_ASPECT_RATIOS = [
  '1:1',
  '4:5',
  '9:16',
  '16:9',
  'custom',
] as const satisfies readonly ExportAspectRatio[];

const exportPreferencesSchema = z.object({
  target: z.enum(EXPORT_TARGETS),
  image: z.object({
    format: z.enum(EXPORT_IMAGE_FORMATS),
    resolution: z.enum(EXPORT_RESOLUTIONS),
  }),
  video: z.object({
    format: z.enum(EXPORT_VIDEO_FORMATS),
    resolution: z.enum(EXPORT_RESOLUTIONS),
    frameRate: z.union([z.literal(24), z.literal(30), z.literal(60)]),
  }),
  aspectRatio: z.enum(EXPORT_ASPECT_RATIOS),
  /**
   * `.finite()` rather than `.positive()`, widened in M05.
   *
   * These are two numbers a user types. Halfway to "1080" the field holds
   * "1", and clearing it holds "0" — and with `.positive()` a stored `0`
   * would fail validation and make the *whole project* refuse to open. That
   * is a catastrophic response to a typo. What counts as a usable export
   * size is a renderer question this schema cannot see, so it is enforced by
   * `@threadform/export-engine` at the point of export, which refuses with a
   * specific message and leaves the project intact. Same reasoning as
   * artwork transforms and material overrides.
   *
   * A widening, so every document valid before M05 is still valid — no
   * migration, and none manufactured.
   */
  customAspectRatio: z
    .object({ width: z.number().finite(), height: z.number().finite() })
    .optional(),
});

const STUDIO_MODES = ['2d', '3d'] as const satisfies readonly StudioMode[];

const projectMetadataSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  studioMode: z.enum(STUDIO_MODES),
});

/** Validates a `Project` at its current schema version. Older payloads must go through `migrateProject` first. */
export const projectSchema = z.object({
  schemaVersion: z.literal(1),
  metadata: projectMetadataSchema,
  garment: garmentReferenceSchema,
  garmentColor: garmentColorSchema,
  material: materialConfigurationSchema,
  artworks: z.array(artworkLayerSchema),
  printZones: z.array(printZoneStateSchema),
  effects: z.array(effectConfigurationSchema),
  animation: animationConfigurationSchema,
  camera: cameraConfigurationSchema,
  lighting: lightingConfigurationSchema,
  background: backgroundConfigurationSchema,
  exportPreferences: exportPreferencesSchema,
});
