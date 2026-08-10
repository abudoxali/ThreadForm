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
  .regex(/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'expected a hex color like #1a1a1a')
  .transform((value) => value as HexColor);

const vector2Schema = z.object({ x: z.number(), y: z.number() });
const vector3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });

const transform2DSchema = z.object({
  position: vector2Schema,
  rotationDegrees: z.number(),
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

const materialConfigurationSchema = z.object({
  materialId: z.enum(MATERIAL_IDS),
  color: garmentColorSchema,
  propertyOverrides: z.object({
    roughness: z.number().optional(),
    normalIntensity: z.number().optional(),
    fabricDetail: z.number().optional(),
    wrinkleDetail: z.number().optional(),
    fiberDetail: z.number().optional(),
  }),
});

const ARTWORK_FILE_KINDS = ['png', 'jpeg', 'webp', 'svg'] as const satisfies readonly ArtworkFileKind[];

const artworkSourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('local-blob'),
    blobId: z.string().min(1),
    fileKind: z.enum(ARTWORK_FILE_KINDS),
  }),
  z.object({
    kind: z.literal('remote'),
    url: z.string().url(),
    fileKind: z.enum(ARTWORK_FILE_KINDS),
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
});

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

const effectConfigurationSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(EFFECT_KINDS),
  intensity: z.number().min(0).max(1),
  parameters: z.record(z.string(), z.number()),
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

const EXPORT_RESOLUTIONS = ['720p', '1080p', '1440p', '4k'] as const satisfies readonly ExportResolution[];

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
  customAspectRatio: z.object({ width: z.number().positive(), height: z.number().positive() }).optional(),
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
