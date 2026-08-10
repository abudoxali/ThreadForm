import type { Project } from '@threadform/types';
import { Panel } from '@threadform/ui';
import type { StudioTool } from './ToolRail';
import { GARMENT_CATEGORIES } from './garmentCategories';

const PLACEHOLDER_COPY: Record<StudioTool, string> = {
  garment: 'Garment color, material shortcuts and print-zone toggles will live here.',
  artwork: 'Layer list, transform controls and print-zone assignment will live here.',
  material: 'Fabric presets and surface property sliders will live here.',
  effects: 'The effect stack for the selected artwork layer will live here.',
  scene: 'Camera presets, orbit controls and the three-point lighting rig will live here.',
  animation: 'Animation preset, duration and playback controls will live here.',
  export: 'Format, resolution, frame rate and aspect-ratio controls will live here.',
};

export interface InspectorProps {
  activeTool: StudioTool;
  project: Project | null;
}

export function Inspector({ activeTool, project }: InspectorProps) {
  const categoryLabel = project
    ? (GARMENT_CATEGORIES.find((c) => c.id === project.garment.category)?.label ??
      project.garment.category)
    : undefined;

  return (
    <Panel
      raised
      className="flex h-full w-full flex-col gap-3 overflow-y-auto p-4 md:w-80 md:shrink-0 md:rounded-none md:border-y-0 md:border-r-0"
    >
      <h2 className="text-primary text-sm font-medium">Inspector</h2>
      {activeTool === 'garment' && categoryLabel && (
        <p className="border-border bg-surface text-secondary rounded-md border px-3 py-2 text-sm">
          Selected garment: <span className="text-primary">{categoryLabel}</span>
        </p>
      )}
      <p className="text-tertiary text-sm leading-relaxed">{PLACEHOLDER_COPY[activeTool]}</p>
      <p className="text-tertiary mt-auto text-xs">
        This panel establishes layout only — it is not wired to a garment engine yet.
      </p>
    </Panel>
  );
}
