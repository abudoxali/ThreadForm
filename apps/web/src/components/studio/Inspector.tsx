import type { CameraPresetId, Project } from '@threadform/types';
import { CAMERA_PRESETS } from '@threadform/garment-runtime';
import type { GarmentManifest } from '@threadform/garment-runtime';
import { Panel } from '@threadform/ui';
import type { StudioTool } from './ToolRail';
import type { ResolvedGarmentStatus } from '@/hooks/useResolvedGarment';

const PLACEHOLDER_COPY: Record<StudioTool, string> = {
  garment: 'Garment color, material shortcuts and print-zone toggles will live here.',
  artwork: 'Layer list, transform controls and print-zone assignment will live here.',
  material: 'Fabric presets and surface property sliders will live here.',
  effects: 'The effect stack for the selected artwork layer will live here.',
  scene: 'Camera presets, orbit controls and the three-point lighting rig will live here.',
  animation: 'Animation preset, duration and playback controls will live here.',
  export: 'Format, resolution, frame rate and aspect-ratio controls will live here.',
};

const COLOR_PRESETS: Array<{ hex: string; label: string }> = [
  { hex: '#f5f5f0', label: 'Natural' },
  { hex: '#1a1a1a', label: 'Black' },
  { hex: '#8a8a86', label: 'Heather Grey' },
  { hex: '#2c3550', label: 'Navy' },
  { hex: '#b5623a', label: 'Rust' },
  { hex: '#6b7d63', label: 'Sage' },
];

export interface InspectorProps {
  activeTool: StudioTool;
  project: Project | null;
  garmentStatus: ResolvedGarmentStatus;
  manifest: GarmentManifest | null;
  onColorChange: (hex: string) => void;
  onCameraPreset: (presetId: CameraPresetId) => void;
  /** False when an ancestor (the mobile `<details><summary>Inspector</summary>`) already labels this panel — avoids a duplicate "Inspector" heading once expanded. */
  showHeading?: boolean;
}

export function Inspector({
  activeTool,
  project,
  garmentStatus,
  manifest,
  onColorChange,
  onCameraPreset,
  showHeading = true,
}: InspectorProps) {
  return (
    <Panel
      raised
      className="flex h-full w-full flex-col gap-4 overflow-y-auto p-4 md:w-80 md:shrink-0 md:rounded-none md:border-y-0 md:border-r-0"
    >
      {showHeading && <h2 className="text-primary text-sm font-medium">Inspector</h2>}

      {activeTool === 'garment' && manifest && project && (
        <div className="flex flex-col gap-3">
          <p className="border-border bg-surface text-secondary rounded-md border px-3 py-2 text-sm">
            Selected garment: <span className="text-primary">{manifest.name}</span>
            {garmentStatus === 'legacy-compatible' && (
              <span className="text-tertiary block text-xs">
                Matched from an earlier project format.
              </span>
            )}
          </p>

          <div>
            <h3 className="text-secondary text-xs font-medium uppercase tracking-wide">
              Garment color
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {COLOR_PRESETS.map((preset) => {
                const active = project.garmentColor.hex.toLowerCase() === preset.hex.toLowerCase();
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    onClick={() => onColorChange(preset.hex)}
                    aria-label={preset.label}
                    aria-pressed={active}
                    title={preset.label}
                    style={{ backgroundColor: preset.hex }}
                    className={`focus-visible:ring-accent-strong focus-visible:ring-offset-surface-raised h-9 w-9 rounded-full border transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                      active
                        ? 'border-accent-strong ring-accent-strong ring-2'
                        : 'border-border-strong'
                    }`}
                  />
                );
              })}
              <label className="text-tertiary flex items-center gap-1.5 text-xs">
                <span className="sr-only">Custom garment color</span>
                <input
                  type="color"
                  value={project.garmentColor.hex}
                  onChange={(event) => onColorChange(event.target.value)}
                  aria-label="Custom garment color"
                  className="border-border-strong h-9 w-9 cursor-pointer rounded-full border bg-transparent p-0"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {activeTool === 'scene' && manifest && (
        <div>
          <h3 className="text-secondary text-xs font-medium uppercase tracking-wide">Camera</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {manifest.cameraPresets.map((presetId) => {
              const preset = CAMERA_PRESETS[presetId];
              const active = project?.camera.presetId === presetId;
              return (
                <button
                  key={presetId}
                  type="button"
                  onClick={() => onCameraPreset(presetId)}
                  aria-pressed={active}
                  className={`focus-visible:ring-accent-strong min-h-9 rounded-md border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                    active
                      ? 'border-accent bg-accent-muted text-primary'
                      : 'border-border bg-surface text-secondary hover:border-border-strong hover:text-primary'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <p className="text-tertiary mt-3 text-xs leading-relaxed">
            Drag to orbit, scroll or pinch to zoom. Full lighting/background editing arrives later.
          </p>
        </div>
      )}

      {!(activeTool === 'garment' && manifest) && !(activeTool === 'scene' && manifest) && (
        <p className="text-tertiary text-sm leading-relaxed">{PLACEHOLDER_COPY[activeTool]}</p>
      )}

      <p className="text-tertiary mt-auto text-xs">
        {manifest
          ? 'Artwork, materials and effects controls establish layout only — not wired up yet.'
          : 'This panel establishes layout only — it is not wired to a garment engine yet.'}
      </p>
    </Panel>
  );
}
