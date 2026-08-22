import { z } from 'zod';
import type {
  AnimationPresetId,
  CameraPresetId,
  EffectKind,
  GarmentCategory,
  HexColor,
  MaterialId,
  PrintZoneId,
} from '@threadform/types';

/**
 * Runtime validation for a garment manifest fetched from `/garments/<id>/manifest.json`.
 * That's a disk/network boundary the same way a persisted `Project` is —
 * untrusted until it passes this schema. Enum lists are pinned to their
 * `@threadform/types` unions with `satisfies` so a type gaining a member
 * without this file being updated is a compile error, not a silent runtime
 * acceptance of data the rest of the app can't actually handle.
 */

const hexColorSchema = z
  .string()
  .regex(
    /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/,
    'expected a hex color like #1a1a1a',
  )
  .transform((value) => value as HexColor);

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

const CAMERA_PRESET_IDS = [
  'front',
  'back',
  'three-quarter',
  'side',
  'top',
  'custom',
] as const satisfies readonly CameraPresetId[];

/**
 * A print zone's rectangle in the garment model's UV layout. Both axes are
 * 0–1 and the rectangle must fit inside that square — a zone running off
 * the edge of UV space would silently sample whatever the texture's wrap
 * mode returned there rather than the region the garment author meant.
 */
const uvRectSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .refine((rect) => rect.x + rect.width <= 1 && rect.y + rect.height <= 1, {
    message: 'uvRect must fit inside the 0–1 UV square',
  });

const printZoneDefinitionSchema = z.object({
  id: z.enum(PRINT_ZONE_IDS),
  label: z.string().min(1),
  maxWidth: z.number().positive().max(1),
  maxHeight: z.number().positive().max(1),
  uvRect: uvRectSchema,
  aspectRatio: z.number().positive(),
});

const meshNamingSchema = z.object({
  front: z.string().min(1).optional(),
  back: z.string().min(1).optional(),
  leftSleeve: z.string().min(1).optional(),
  rightSleeve: z.string().min(1).optional(),
});

const modelReferenceSchema = z.object({
  reference: z.string().min(1),
  format: z.literal('glb'),
  scale: z.number().positive(),
  orientationDegrees: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  meshNaming: meshNamingSchema,
});

const provenanceSchema = z.object({
  source: z.enum(['threadform-original', 'third-party-licensed']),
  createdBy: z.string().min(1),
  license: z.string().min(1),
  notes: z.string().optional(),
});

export const garmentManifestSchema = z.object({
  garmentId: z.string().min(1),
  slug: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(GARMENT_CATEGORIES),
  readiness: z.enum(['development', 'production']),
  model: modelReferenceSchema,
  defaultColor: hexColorSchema,
  printZones: z.array(printZoneDefinitionSchema).min(1),
  supportedMaterials: z.array(z.enum(MATERIAL_IDS)),
  supportedEffects: z.array(z.enum(EFFECT_KINDS)),
  compatibleAnimations: z.array(z.enum(ANIMATION_PRESET_IDS)),
  cameraPresets: z.array(z.enum(CAMERA_PRESET_IDS)).min(1),
  provenance: provenanceSchema,
});
