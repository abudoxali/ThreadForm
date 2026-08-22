import type { MaterialConfiguration, MaterialId, MaterialProperties } from '@threadform/types';
import { FALLBACK_MATERIAL_ID, findMaterialPreset, IMPLEMENTED_MATERIAL_IDS } from './presets';
import type { MaterialPreset, WeaveKind } from './presets';

/**
 * Turns a `MaterialConfiguration` plus a garment's declared capabilities
 * into renderer-ready surface parameters.
 *
 * This is the single clamp on the path to Three.js. Everything upstream of
 * it — a persisted project, a hand-edited IndexedDB record, a future import
 * format — is untrusted, and a NaN or negative roughness reaching a
 * `MeshStandardMaterial` does not throw: it silently produces a black or
 * blank surface that looks like a renderer bug. Resolution therefore never
 * fails and never throws; it degrades to something renderable and says so
 * in the result, so the UI can explain rather than the canvas going wrong.
 *
 * The function is pure: it does not mutate its inputs and returns the same
 * values for the same inputs, which is what makes the renderer's texture
 * caching safe to key on it.
 */

export interface ResolvedMaterial {
  materialId: MaterialId;
  label: string;
  /** PBR roughness handed to the renderer's standard material. */
  roughness: number;
  metalness: number;
  /** Strength of the procedural weave's normal contribution. */
  normalScale: number;
  weave: WeaveKind;
  weaveRepeat: { u: number; v: number };
  /** Frequency-band weights the renderer builds the weave's height field from. */
  detail: {
    fabric: number;
    wrinkle: number;
    fiber: number;
  };
  /**
   * True when the requested material could not be used and this is a
   * substitute — either the build has no preset for it, or the garment does
   * not support it. The Studio surfaces this rather than pretending the
   * user's stored choice was honoured.
   */
  substituted: boolean;
}

/** Bounds every resolved value is held within, chosen so no combination can blank or destabilise the surface. */
const LIMITS = {
  roughness: { min: 0.05, max: 1 },
  normalScale: { min: 0, max: 2 },
  detail: { min: 0, max: 1 },
} as const;

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/**
 * Merges a partial override set over a preset's defaults. An override that
 * is absent, non-numeric or non-finite leaves the preset's value in place
 * rather than poisoning it — `{ roughness: NaN }` means "no usable opinion",
 * not "roughness is NaN".
 */
function mergeProperties(
  preset: MaterialProperties,
  overrides: Partial<MaterialProperties> | undefined,
): MaterialProperties {
  const pick = (key: keyof MaterialProperties, min: number, max: number): number => {
    const override = overrides?.[key];
    if (override === undefined) return clamp(preset[key], min, max, min);
    return clamp(override, min, max, clamp(preset[key], min, max, min));
  };

  return {
    roughness: pick('roughness', LIMITS.roughness.min, LIMITS.roughness.max),
    normalIntensity: pick('normalIntensity', LIMITS.detail.min, LIMITS.detail.max),
    fabricDetail: pick('fabricDetail', LIMITS.detail.min, LIMITS.detail.max),
    wrinkleDetail: pick('wrinkleDetail', LIMITS.detail.min, LIMITS.detail.max),
    fiberDetail: pick('fiberDetail', LIMITS.detail.min, LIMITS.detail.max),
  };
}

function build(
  preset: MaterialPreset,
  config: MaterialConfiguration | undefined,
  substituted: boolean,
): ResolvedMaterial {
  const properties = mergeProperties(preset.properties, config?.propertyOverrides);
  return {
    materialId: preset.id,
    label: preset.label,
    roughness: properties.roughness,
    // Apparel fabric is a dielectric. This is not user-tunable because a
    // metallic t-shirt is not a fabric choice, it is a rendering bug.
    metalness: 0,
    normalScale: clamp(
      properties.normalIntensity * 1.6,
      LIMITS.normalScale.min,
      LIMITS.normalScale.max,
      0,
    ),
    weave: preset.weave,
    weaveRepeat: preset.weaveRepeat,
    detail: {
      fabric: properties.fabricDetail,
      wrinkle: properties.wrinkleDetail,
      fiber: properties.fiberDetail,
    },
    substituted,
  };
}

/**
 * `supportedMaterialIds` comes from the garment's own manifest. Passing it is
 * mandatory rather than optional so a caller cannot accidentally resolve a
 * material the garment never offered — the allow-list is enforced here, at
 * the resolution boundary, not only by hiding options in the UI.
 */
export function resolveMaterial(
  config: MaterialConfiguration | undefined,
  supportedMaterialIds: readonly MaterialId[],
): ResolvedMaterial {
  const requested = config?.materialId;
  const preset = requested ? findMaterialPreset(requested) : undefined;
  const isSupported = requested !== undefined && supportedMaterialIds.includes(requested);

  if (preset && isSupported) return build(preset, config, false);

  // Prefer a fabric the garment actually lists over the global fallback, so
  // a garment that never offered cotton doesn't get cotton foisted on it.
  const substituteId =
    supportedMaterialIds.find((id) => findMaterialPreset(id) !== undefined) ?? FALLBACK_MATERIAL_ID;
  const substitute = findMaterialPreset(substituteId) ?? findMaterialPreset(FALLBACK_MATERIAL_ID);

  // Only reachable if the fallback preset itself were removed; resolving to
  // *something* renderable matters more than being right about which.
  if (!substitute) {
    return {
      materialId: FALLBACK_MATERIAL_ID,
      label: 'Fabric',
      roughness: 0.85,
      metalness: 0,
      normalScale: 0,
      weave: 'plain-weave',
      weaveRepeat: { u: 1, v: 1 },
      detail: { fabric: 0, wrinkle: 0, fiber: 0 },
      substituted: true,
    };
  }

  // The substitute's own defaults are used; overrides were authored against
  // a different fabric and carrying them across would be a guess.
  return build(substitute, undefined, true);
}

/**
 * The materials a garment can actually offer: declared by its manifest *and*
 * implemented in this build. Used to populate the Studio's control, so an
 * option can never appear without something real behind it.
 */
export function availableMaterials(supportedMaterialIds: readonly MaterialId[]): MaterialPreset[] {
  return IMPLEMENTED_MATERIAL_IDS.filter((id) => supportedMaterialIds.includes(id))
    .map((id) => findMaterialPreset(id))
    .filter((preset): preset is MaterialPreset => preset !== undefined);
}

/** Whether a garment can use a material — both sides of the allow-list in one call. */
export function isMaterialAvailable(
  materialId: MaterialId,
  supportedMaterialIds: readonly MaterialId[],
): boolean {
  return supportedMaterialIds.includes(materialId) && findMaterialPreset(materialId) !== undefined;
}
