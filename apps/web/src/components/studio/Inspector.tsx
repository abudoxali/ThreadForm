import { useId } from 'react';
import type { ReactNode } from 'react';
import type { CameraPresetId, MaterialId, Project } from '@threadform/types';
import { availableMaterials } from '@threadform/material-engine';
import { CAMERA_PRESETS } from '@threadform/garment-runtime';
import type { GarmentManifest } from '@threadform/garment-runtime';
import { Panel } from '@threadform/ui';
import { CheckIcon, PlusIcon, ResetViewIcon } from './icons';
import type { StudioTool } from './ToolRail';
import type { ResolvedGarmentStatus } from '@/hooks/useResolvedGarment';

const COLOR_PRESETS: Array<{ hex: string; label: string }> = [
  { hex: '#f5f5f0', label: 'Natural' },
  { hex: '#1a1a1a', label: 'Black' },
  { hex: '#8a8a86', label: 'Heather Grey' },
  { hex: '#2c3550', label: 'Navy' },
  { hex: '#b5623a', label: 'Rust' },
  { hex: '#6b7d63', label: 'Sage' },
];

function colorLabel(hex: string): string {
  const preset = COLOR_PRESETS.find((c) => c.hex.toLowerCase() === hex.toLowerCase());
  return preset?.label ?? hex.toUpperCase();
}

export interface InspectorProps {
  activeTool: StudioTool;
  project: Project | null;
  garmentStatus: ResolvedGarmentStatus;
  manifest: GarmentManifest | null;
  onColorChange: (hex: string) => void;
  onCameraPreset: (presetId: CameraPresetId) => void;
  onMaterialChange: (materialId: MaterialId, allowed: readonly MaterialId[]) => void;
  /**
   * The artwork tool's panel, supplied by `StudioShell` rather than built
   * here: the Inspector is rendered twice (a desktop rail and a mobile
   * sheet), and artwork import/placement needs its own local state per
   * copy — which is exactly what passing an element rather than a prop bag
   * gives, two independent instances behind one prop.
   */
  artworkPanel?: ReactNode;
  /** The export tool's panel. Supplied as an element for the same reason `artworkPanel` is — two independent instances behind one prop. */
  exportPanel?: ReactNode;
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
  onMaterialChange,
  artworkPanel,
  exportPanel,
  showHeading = true,
}: InspectorProps) {
  const hasCustomColor =
    !!project &&
    !COLOR_PRESETS.some((c) => c.hex.toLowerCase() === project.garmentColor.hex.toLowerCase());

  return (
    <Panel
      raised
      className="flex h-full w-full flex-col gap-5 overflow-y-auto p-4 md:w-72 md:shrink-0 md:rounded-none md:border-y-0 md:border-r-0"
    >
      {showHeading && <h2 className="text-primary text-sm font-medium">Inspector</h2>}

      {activeTool === 'garment' && manifest && project && (
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-tertiary text-xs font-medium uppercase tracking-wide">Garment</h3>
            <p className="text-primary mt-1.5 text-sm">{manifest.name}</p>
            {garmentStatus === 'legacy-compatible' && (
              <p className="text-tertiary mt-0.5 text-xs">
                Matched from an earlier project format.
              </p>
            )}
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <h3 className="text-tertiary text-xs font-medium uppercase tracking-wide">Color</h3>
              <span className="text-tertiary text-xs">{colorLabel(project.garmentColor.hex)}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
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
                    className={`focus-visible:ring-accent-strong focus-visible:ring-offset-surface-raised relative flex h-9 w-9 items-center justify-center rounded-full border transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                      active
                        ? 'border-accent-strong ring-accent-strong ring-2'
                        : 'border-border-strong hover:border-accent'
                    }`}
                  >
                    {active && (
                      <CheckIcon
                        className="h-3.5 w-3.5 drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]"
                        style={{ color: isLight(preset.hex) ? '#141416' : '#f2f1ee' }}
                      />
                    )}
                  </button>
                );
              })}
              <label
                className={`focus-within:ring-accent-strong focus-within:ring-offset-surface-raised relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border transition-shadow focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 ${
                  hasCustomColor
                    ? 'border-accent-strong ring-accent-strong ring-2'
                    : 'border-border-strong hover:border-accent'
                }`}
                style={hasCustomColor ? { backgroundColor: project.garmentColor.hex } : undefined}
                title="Custom color"
              >
                <span className="sr-only">Custom garment color</span>
                <input
                  type="color"
                  value={project.garmentColor.hex}
                  onChange={(event) => onColorChange(event.target.value)}
                  aria-label="Custom garment color"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                <PlusIcon
                  aria-hidden="true"
                  className="pointer-events-none h-4 w-4"
                  style={{
                    color:
                      hasCustomColor && !isLight(project.garmentColor.hex) ? '#f2f1ee' : undefined,
                  }}
                />
              </label>
            </div>
          </div>

          <MaterialPicker
            supportedMaterials={manifest.supportedMaterials}
            activeMaterialId={project.material.materialId}
            onSelect={onMaterialChange}
          />
        </div>
      )}

      {activeTool === 'artwork' && manifest && project && artworkPanel}

      {activeTool === 'export' && manifest && project && exportPanel}

      {activeTool === 'view' && manifest && project && (
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-tertiary text-xs font-medium uppercase tracking-wide">Camera</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {manifest.cameraPresets.map((presetId) => {
                const preset = CAMERA_PRESETS[presetId];
                const active = project.camera.presetId === presetId;
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
          </div>

          <button
            type="button"
            onClick={() => onCameraPreset(project.camera.presetId)}
            className="border-border bg-surface text-secondary hover:border-border-strong hover:text-primary focus-visible:ring-accent-strong flex min-h-9 items-center gap-2 self-start rounded-md border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            <ResetViewIcon className="h-4 w-4" />
            Reset view
          </button>

          <p className="text-tertiary text-xs leading-relaxed">
            Drag to orbit, scroll or pinch to zoom.
          </p>
        </div>
      )}
    </Panel>
  );
}

function isLight(hex: string): boolean {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}

interface MaterialPickerProps {
  /** Straight from the garment's manifest — the authoritative list of what this garment is made in. */
  supportedMaterials: readonly MaterialId[];
  activeMaterialId: MaterialId;
  onSelect: (materialId: MaterialId, allowed: readonly MaterialId[]) => void;
}

/**
 * Fabric selection.
 *
 * The options come from `availableMaterials`, which intersects what the
 * garment's manifest declares with what the renderer actually implements —
 * so a fabric can never appear here without something real behind it, and
 * `MaterialId` gaining a member does not silently add an option. A garment
 * offering only one fabric renders it as a statement rather than a choice.
 */
function MaterialPicker({ supportedMaterials, activeMaterialId, onSelect }: MaterialPickerProps) {
  // The Inspector is rendered twice (desktop rail, mobile sheet), so the
  // group’s label id has to be unique per instance.
  const labelId = `${useId()}-material`;
  const materials = availableMaterials(supportedMaterials);
  if (materials.length === 0) return null;

  const active = materials.find((material) => material.id === activeMaterialId);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-tertiary text-xs font-medium uppercase tracking-wide" id={labelId}>
          Fabric
        </h3>
        {active && <span className="text-tertiary text-xs">{active.label}</span>}
      </div>

      {materials.length === 1 ? (
        <p className="text-secondary mt-1.5 text-sm">{materials[0]!.label}</p>
      ) : (
        <div role="group" aria-labelledby={labelId} className="mt-2 flex flex-wrap gap-2">
          {materials.map((material) => {
            const isActive = material.id === activeMaterialId;
            return (
              <button
                key={material.id}
                type="button"
                aria-pressed={isActive}
                title={material.description}
                onClick={() => onSelect(material.id, supportedMaterials)}
                className={`focus-visible:ring-accent-strong flex min-h-9 items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                  isActive
                    ? 'border-accent bg-accent-muted text-primary'
                    : 'border-border bg-surface text-secondary hover:border-border-strong hover:text-primary'
                }`}
              >
                {/* An icon marks the active fabric, so the state does not depend on colour alone. */}
                {isActive && <CheckIcon className="text-accent-strong h-3.5 w-3.5" />}
                {material.label}
              </button>
            );
          })}
        </div>
      )}

      {active && <p className="text-tertiary mt-2 text-xs leading-relaxed">{active.description}</p>}
    </div>
  );
}
