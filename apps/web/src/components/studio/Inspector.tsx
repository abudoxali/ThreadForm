import type { GarmentCategory } from '@threadform/types';
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
  selectedCategory: GarmentCategory | null;
}

export function Inspector({ activeTool, selectedCategory }: InspectorProps) {
  const categoryLabel = GARMENT_CATEGORIES.find((c) => c.id === selectedCategory)?.label;

  return (
    <Panel
      raised
      className="flex h-full w-full flex-col gap-3 overflow-y-auto p-4 md:w-80 md:shrink-0 md:rounded-none md:border-y-0 md:border-r-0"
    >
      <h2 className="text-sm font-medium text-primary">Inspector</h2>
      {activeTool === 'garment' && categoryLabel && (
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-secondary">
          Selected garment: <span className="text-primary">{categoryLabel}</span>
        </p>
      )}
      <p className="text-sm leading-relaxed text-tertiary">{PLACEHOLDER_COPY[activeTool]}</p>
      <p className="mt-auto text-xs text-tertiary">
        This panel establishes layout only — it is not wired to a garment engine yet.
      </p>
    </Panel>
  );
}
