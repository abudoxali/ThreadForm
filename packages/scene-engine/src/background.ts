import type { BackgroundConfiguration, HexColor } from '@threadform/types';

/**
 * Scene backgrounds as data.
 *
 * `BackgroundConfiguration` models five kinds. Two of them — a solid colour
 * and a gradient — are enough to produce every product and social export
 * this milestone is for, and are the two that can be implemented completely
 * rather than partially. The other three each need infrastructure that does
 * not exist: an uploaded image needs a second artwork-style trust boundary
 * and its own blob lifecycle, a studio scene needs authored 3D sets, and an
 * HDRI environment needs a lighting probe pipeline and hosted assets this
 * local-first app deliberately does not fetch.
 *
 * So they stay modelled and unavailable. `resolveBackground` degrades them
 * to something renderable rather than throwing, and the Studio never offers
 * them — the same rule the tool rail and the fabric picker already follow.
 */

export type ResolvedBackground =
  | { kind: 'solid-color'; color: string }
  | { kind: 'gradient'; from: string; to: string; angleDegrees: number };

export type BackgroundKind = BackgroundConfiguration['kind'];

/** The background kinds with a real implementation, in the order they should be offered. */
export const IMPLEMENTED_BACKGROUND_KINDS: readonly BackgroundKind[] = ['solid-color', 'gradient'];

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Matches `--tf-color-bg-canvas`, and what every project before M06 rendered against. */
export const DEFAULT_BACKGROUND_COLOR = '#101012';

export const FALLBACK_BACKGROUND: ResolvedBackground = {
  kind: 'solid-color',
  color: DEFAULT_BACKGROUND_COLOR,
};

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value) ? value : fallback;
}

function angle(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 180;
  // Normalised rather than clamped: an angle is cyclic, so 400° is a
  // perfectly meaningful 40° and refusing it would be pedantry.
  return ((value % 360) + 360) % 360;
}

/**
 * Turns a stored background into something the renderer can draw.
 *
 * Never fails. A hand-edited record naming an unimplemented kind, or
 * carrying a malformed colour, resolves to the default studio backdrop —
 * the same one every project rendered against before backgrounds were
 * editable — rather than reaching Three.js as `undefined` and clearing the
 * canvas to black.
 */
export function resolveBackground(
  configuration: BackgroundConfiguration | undefined,
): ResolvedBackground {
  if (!configuration) return FALLBACK_BACKGROUND;

  switch (configuration.kind) {
    case 'solid-color':
      return { kind: 'solid-color', color: color(configuration.color, DEFAULT_BACKGROUND_COLOR) };
    case 'gradient':
      return {
        kind: 'gradient',
        from: color(configuration.from, '#1b1c22'),
        to: color(configuration.to, DEFAULT_BACKGROUND_COLOR),
        angleDegrees: angle(configuration.angleDegrees),
      };
    default:
      return FALLBACK_BACKGROUND;
  }
}

export function isBackgroundKindImplemented(kind: BackgroundKind): boolean {
  return IMPLEMENTED_BACKGROUND_KINDS.includes(kind);
}

export interface BackgroundPresetDefinition {
  id: string;
  label: string;
  configuration: Extract<BackgroundConfiguration, { kind: 'solid-color' | 'gradient' }>;
}

/**
 * A short, curated set of backdrops.
 *
 * Deliberately small. A colour picker is offered alongside these for anyone
 * who wants a specific brand colour; what a preset row is for is giving
 * someone a good-looking result without asking them to be a colourist. Each
 * one was checked against a natural, a black and a navy garment — a backdrop
 * that swallows a dark garment is not a style choice.
 */
export const BACKGROUND_PRESETS: readonly BackgroundPresetDefinition[] = [
  {
    id: 'studio-dark',
    label: 'Studio dark',
    configuration: { kind: 'gradient', from: '#141417', to: '#0a0a0b', angleDegrees: 180 },
  },
  {
    id: 'charcoal',
    label: 'Charcoal',
    configuration: { kind: 'solid-color', color: '#101012' as HexColor },
  },
  {
    id: 'paper',
    label: 'Paper',
    configuration: { kind: 'solid-color', color: '#e8e4dc' as HexColor },
  },
  {
    id: 'sand',
    label: 'Sand',
    configuration: { kind: 'gradient', from: '#d8cbb6', to: '#a8987e', angleDegrees: 180 },
  },
  {
    id: 'dusk',
    label: 'Dusk',
    configuration: { kind: 'gradient', from: '#3b3050', to: '#141220', angleDegrees: 180 },
  },
];

/**
 * Which preset, if any, the stored background corresponds to — so the panel
 * can show a hand-picked colour falling back to no highlighted preset rather
 * than leaving one selected that no longer describes what is rendered.
 */
export function matchBackgroundPreset(
  configuration: BackgroundConfiguration | undefined,
): string | null {
  if (!configuration) return null;
  const match = BACKGROUND_PRESETS.find((preset) => {
    const candidate = preset.configuration;
    if (candidate.kind !== configuration.kind) return false;
    if (candidate.kind === 'solid-color' && configuration.kind === 'solid-color') {
      return candidate.color.toLowerCase() === configuration.color.toLowerCase();
    }
    if (candidate.kind === 'gradient' && configuration.kind === 'gradient') {
      return (
        candidate.from.toLowerCase() === configuration.from.toLowerCase() &&
        candidate.to.toLowerCase() === configuration.to.toLowerCase() &&
        candidate.angleDegrees === configuration.angleDegrees
      );
    }
    return false;
  });
  return match?.id ?? null;
}
