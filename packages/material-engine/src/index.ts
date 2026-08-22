export {
  MATERIAL_PRESETS,
  IMPLEMENTED_MATERIAL_IDS,
  FALLBACK_MATERIAL_ID,
  findMaterialPreset,
} from './presets';
export type { MaterialPreset, WeaveKind } from './presets';
export { resolveMaterial, availableMaterials, isMaterialAvailable } from './resolve';
export type { ResolvedMaterial } from './resolve';
