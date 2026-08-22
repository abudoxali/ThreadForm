import type { EffectConfiguration, EffectKind } from '@threadform/types';
import { findEffectPreset, IMPLEMENTED_EFFECT_KINDS } from './presets';
import type { EffectPreset, ReliefKind } from './presets';

/**
 * Turns an `EffectConfiguration` into renderer-ready print parameters.
 *
 * Like material resolution, this is a clamp on the path to Three.js and is
 * pure: same input, same output, no mutation. An effect that cannot be
 * resolved returns `null` rather than a half-configured surface — an
 * unrecognised effect kind should render as the plain untreated print the
 * project had before, not as an approximation of something the build cannot
 * actually do.
 */

export interface ResolvedEffect {
  kind: EffectKind;
  label: string;
  intensity: number;
  roughness: number;
  metalness: number;
  relief: ReliefKind;
  reliefScale: number;
  reliefRepeat: number;
  /** Radians. Relief surfaces that have a direction are rotated by this. */
  reliefRotation: number;
  /** Only the parameters this kind understands, clamped and defaulted. */
  parameters: Record<string, number>;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * Keeps only the keys the preset declares, clamped to their declared range,
 * with a deterministic default for anything missing or unusable. A stored
 * `parameters` record is arbitrary attacker-controllable data; this is the
 * allow-list that stops it becoming renderer input.
 */
function resolveParameters(
  preset: EffectPreset,
  stored: Record<string, number> | undefined,
): Record<string, number> {
  const resolved: Record<string, number> = {};
  for (const spec of preset.parameters) {
    resolved[spec.key] = clamp(stored?.[spec.key], spec.min, spec.max, spec.defaultValue);
  }
  return resolved;
}

export function resolveEffect(effect: EffectConfiguration | undefined): ResolvedEffect | null {
  if (!effect) return null;
  const preset = findEffectPreset(effect.kind);
  if (!preset) return null;

  const intensity = clamp(effect.intensity, 0, 1, preset.defaultIntensity);
  const parameters = resolveParameters(preset, effect.parameters);
  const stitchAngle = parameters.stitchAngle;

  return {
    kind: preset.kind,
    label: preset.label,
    intensity,
    roughness: clamp(
      lerp(preset.roughness.min, preset.roughness.max, intensity),
      0.05,
      1,
      preset.roughness.min,
    ),
    // Ink and thread are both dielectric; nothing here may make a print metallic.
    metalness: 0,
    relief: preset.relief,
    reliefScale: clamp(lerp(preset.reliefScale.min, preset.reliefScale.max, intensity), 0, 2, 0),
    reliefRepeat: preset.reliefRepeat,
    reliefRotation: stitchAngle === undefined ? 0 : (stitchAngle * Math.PI) / 180,
    parameters,
  };
}

/**
 * The effects a garment can actually offer: declared by its manifest *and*
 * implemented in this build. `EffectKind` names sixteen processes because
 * the vocabulary was modelled up front; only the ones with a preset are ever
 * offered or resolvable.
 */
export function availableEffects(supportedEffectKinds: readonly EffectKind[]): EffectPreset[] {
  return IMPLEMENTED_EFFECT_KINDS.filter((kind) => supportedEffectKinds.includes(kind))
    .map((kind) => findEffectPreset(kind))
    .filter((preset): preset is EffectPreset => preset !== undefined);
}

export function isEffectAvailable(
  kind: EffectKind,
  supportedEffectKinds: readonly EffectKind[],
): boolean {
  return supportedEffectKinds.includes(kind) && findEffectPreset(kind) !== undefined;
}

/** The deterministic starting parameters for a newly applied effect. */
export function defaultEffectParameters(kind: EffectKind): Record<string, number> {
  const preset = findEffectPreset(kind);
  if (!preset) return {};
  const parameters: Record<string, number> = {};
  for (const spec of preset.parameters) parameters[spec.key] = spec.defaultValue;
  return parameters;
}

export function defaultEffectIntensity(kind: EffectKind): number {
  return findEffectPreset(kind)?.defaultIntensity ?? 0.5;
}
