import type { LightingConfiguration, LightingPresetId, LightSource } from '@threadform/types';

/**
 * Scene lighting as data.
 *
 * Before M06 the Studio's rig was five hard-coded lights inside a React
 * component in `3d-engine`. That was fine while there was exactly one look,
 * and became the wrong shape the moment `Project.lighting` had to mean
 * something: a preset would have turned into a `switch` in JSX, and the
 * exporter and the Studio would each have had their own copy of it.
 *
 * So lighting follows the same rule fabrics and print effects already do —
 * a preset is plain data with no GPU dependency, resolved and clamped here,
 * and the renderer only ever receives numbers it can hand straight to
 * Three.js. A rig can therefore be authored, diffed and tested without a
 * WebGL context.
 *
 * Positions are in the garment's own convention (front `+Z`, up `+Y`, see
 * `docs/GARMENT_SPEC.md`) and are unit-agnostic: the camera frames the
 * garment by its bounds, and these directions are normalised at the scale
 * the Essential Tee already renders at.
 */

/** A directional light, as the renderer consumes it. */
export interface ResolvedLight {
  position: readonly [number, number, number];
  intensity: number;
  /** Hex string, already derived from the preset's colour temperature. */
  color: string;
}

export interface ResolvedLighting {
  presetId: LightingPresetId;
  label: string;
  description: string;
  /**
   * A cheap stand-in for environment contribution: a sky/ground split tint
   * rather than flat ambient, so mid-tones keep some dimensionality without
   * the cost — or the external CDN fetch — of an HDRI. See
   * `docs/PRIVACY_SECURITY.md` for why this app does not fetch one.
   */
  hemisphere: { sky: string; ground: string; intensity: number };
  ambient: { intensity: number };
  key: ResolvedLight;
  fill: ResolvedLight;
  rim: ResolvedLight;
  /** True when the requested preset could not be used and this is a substitute. */
  substituted: boolean;
}

export interface LightingPresetDefinition {
  id: LightingPresetId;
  label: string;
  /** Short, factual description shown beside the control. */
  description: string;
  rig: Omit<ResolvedLighting, 'presetId' | 'label' | 'description' | 'substituted'>;
  /**
   * The per-source intensities and colour temperatures written into
   * `Project.lighting` when this preset is chosen, so the persisted document
   * describes the rig it actually renders rather than carrying stale numbers
   * from whichever preset was selected first.
   */
  sources: { key: LightSource; fill: LightSource; rim: LightSource; environment: LightSource };
}

/**
 * The lighting rigs ThreadForm can actually render today.
 *
 * `LightingPresetId` also names `custom`. There is no per-light editor, so
 * offering `custom` would be a control that opens onto nothing — it is
 * modelled, unimplemented, and resolves to the default rig rather than
 * silently rendering something arbitrary.
 *
 * Every rig keeps a pronounced rim light. A black garment against the dark
 * studio backdrop has almost no diffuse response, so without an edge
 * highlight it disappears into the background entirely (established in M02
 * visual QA and still true). A "moody" preset that lost the garment would
 * not be moody, it would be broken.
 */
export const LIGHTING_PRESETS: Partial<Record<LightingPresetId, LightingPresetDefinition>> = {
  'studio-soft': {
    id: 'studio-soft',
    label: 'Studio soft',
    description: 'Even product lighting with a gentle falloff. The neutral default.',
    rig: {
      hemisphere: { sky: '#3a3d45', ground: '#0e0e10', intensity: 0.55 },
      ambient: { intensity: 0.22 },
      key: { position: [1.6, 2.4, 2.2], intensity: 1.2, color: '#fff2e2' },
      fill: { position: [-2.2, 0.8, -0.6], intensity: 0.5, color: '#dce6ff' },
      rim: { position: [-0.4, 1.6, -2.6], intensity: 1.35, color: '#ffffff' },
    },
    sources: {
      key: { intensity: 1.2, colorTemperatureKelvin: 5200 },
      fill: { intensity: 0.5, colorTemperatureKelvin: 7000 },
      rim: { intensity: 1.35, colorTemperatureKelvin: 6500 },
      environment: { intensity: 0.55, colorTemperatureKelvin: 6500 },
    },
  },
  'studio-contrast': {
    id: 'studio-contrast',
    label: 'Studio contrast',
    description: 'A harder key and a darker shadow side. Shows fabric structure.',
    rig: {
      // Less ambient and less fill is what makes contrast — not a brighter
      // key, which would only blow out the highlight side.
      hemisphere: { sky: '#2b2e36', ground: '#050506', intensity: 0.34 },
      ambient: { intensity: 0.1 },
      key: { position: [2.3, 2.2, 1.7], intensity: 1.85, color: '#fff6ea' },
      fill: { position: [-2.4, 0.6, -0.4], intensity: 0.16, color: '#c9d6f2' },
      rim: { position: [-0.6, 1.8, -2.6], intensity: 1.5, color: '#ffffff' },
    },
    sources: {
      key: { intensity: 1.85, colorTemperatureKelvin: 5000 },
      fill: { intensity: 0.16, colorTemperatureKelvin: 7400 },
      rim: { intensity: 1.5, colorTemperatureKelvin: 6500 },
      environment: { intensity: 0.34, colorTemperatureKelvin: 6500 },
    },
  },
  daylight: {
    id: 'daylight',
    label: 'Daylight',
    description: 'Cooler, brighter and more open, like an overcast window.',
    rig: {
      hemisphere: { sky: '#7d8ea8', ground: '#22242a', intensity: 0.95 },
      ambient: { intensity: 0.4 },
      key: { position: [1.2, 2.8, 2.0], intensity: 1.5, color: '#eef4ff' },
      fill: { position: [-2.0, 1.2, 0.4], intensity: 0.72, color: '#dfe8ff' },
      rim: { position: [-0.4, 1.6, -2.6], intensity: 1.05, color: '#ffffff' },
    },
    sources: {
      key: { intensity: 1.5, colorTemperatureKelvin: 6800 },
      fill: { intensity: 0.72, colorTemperatureKelvin: 7200 },
      rim: { intensity: 1.05, colorTemperatureKelvin: 6500 },
      environment: { intensity: 0.95, colorTemperatureKelvin: 7000 },
    },
  },
  moody: {
    id: 'moody',
    label: 'Moody',
    description: 'Warm, low and directional. Deep shadows, edges still readable.',
    rig: {
      hemisphere: { sky: '#241d1a', ground: '#050505', intensity: 0.3 },
      ambient: { intensity: 0.12 },
      key: { position: [2.0, 1.2, 1.8], intensity: 1.55, color: '#ffd9a8' },
      fill: { position: [-2.2, 0.5, -0.8], intensity: 0.18, color: '#8fa3d6' },
      // Deliberately not dimmed with the rest: this is the light that keeps
      // a dark garment separated from a dark backdrop, and losing it is the
      // difference between moody and invisible.
      rim: { position: [-0.5, 1.7, -2.6], intensity: 1.3, color: '#cfe0ff' },
    },
    sources: {
      key: { intensity: 1.55, colorTemperatureKelvin: 3200 },
      fill: { intensity: 0.18, colorTemperatureKelvin: 8000 },
      rim: { intensity: 1.3, colorTemperatureKelvin: 7000 },
      environment: { intensity: 0.3, colorTemperatureKelvin: 3400 },
    },
  },
};

/** The rigs with a real implementation, in the order they should be offered. */
export const IMPLEMENTED_LIGHTING_PRESET_IDS: readonly LightingPresetId[] = [
  'studio-soft',
  'studio-contrast',
  'daylight',
  'moody',
];

export const FALLBACK_LIGHTING_PRESET_ID: LightingPresetId = 'studio-soft';

export function findLightingPreset(
  presetId: LightingPresetId,
): LightingPresetDefinition | undefined {
  return LIGHTING_PRESETS[presetId];
}

/** Every rig the Studio may offer. `custom` is deliberately absent — there is no editor behind it. */
export function availableLightingPresets(): LightingPresetDefinition[] {
  return IMPLEMENTED_LIGHTING_PRESET_IDS.map((id) => LIGHTING_PRESETS[id]).filter(
    (preset): preset is LightingPresetDefinition => preset !== undefined,
  );
}

/**
 * Resolves a project's lighting into renderer-ready values.
 *
 * Only `presetId` is consulted. The per-source intensities and colour
 * temperatures in `LightingConfiguration` are written *by* the preset and
 * read back by nothing: there is no control that edits them, so treating
 * them as authoritative would let a hand-edited record produce a rig no
 * preset describes and no UI can explain. When a per-light editor exists,
 * this is the one function that has to change.
 */
export function resolveLighting(configuration: LightingConfiguration | undefined): ResolvedLighting {
  const requested = configuration?.presetId;
  const preset = requested ? findLightingPreset(requested) : undefined;
  const substituted = preset === undefined;
  const resolved = preset ?? findLightingPreset(FALLBACK_LIGHTING_PRESET_ID);

  // Unreachable while `studio-soft` has an entry, but a resolver that can
  // throw is a resolver that can blank the Studio.
  if (!resolved) {
    return {
      presetId: FALLBACK_LIGHTING_PRESET_ID,
      label: 'Studio soft',
      description: 'Even product lighting.',
      hemisphere: { sky: '#3a3d45', ground: '#0e0e10', intensity: 0.55 },
      ambient: { intensity: 0.22 },
      key: { position: [1.6, 2.4, 2.2], intensity: 1.2, color: '#fff2e2' },
      fill: { position: [-2.2, 0.8, -0.6], intensity: 0.5, color: '#dce6ff' },
      rim: { position: [-0.4, 1.6, -2.6], intensity: 1.35, color: '#ffffff' },
      substituted: true,
    };
  }

  return {
    presetId: resolved.id,
    label: resolved.label,
    description: resolved.description,
    ...resolved.rig,
    substituted,
  };
}
