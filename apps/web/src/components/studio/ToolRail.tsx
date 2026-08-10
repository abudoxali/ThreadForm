import { IconButton } from '@threadform/ui';
import {
  AnimationIcon,
  ArtworkIcon,
  EffectsIcon,
  ExportIcon,
  GarmentIcon,
  MaterialIcon,
  SceneIcon,
} from './icons';

export type StudioTool = 'garment' | 'artwork' | 'material' | 'effects' | 'scene' | 'animation' | 'export';

export const STUDIO_TOOLS: Array<{ id: StudioTool; label: string; icon: typeof GarmentIcon; requiresGarment: boolean }> = [
  { id: 'garment', label: 'Garment', icon: GarmentIcon, requiresGarment: false },
  { id: 'artwork', label: 'Artwork', icon: ArtworkIcon, requiresGarment: true },
  { id: 'material', label: 'Material', icon: MaterialIcon, requiresGarment: true },
  { id: 'effects', label: 'Effects', icon: EffectsIcon, requiresGarment: true },
  { id: 'scene', label: 'Camera & light', icon: SceneIcon, requiresGarment: true },
  { id: 'animation', label: 'Animation', icon: AnimationIcon, requiresGarment: true },
  { id: 'export', label: 'Export', icon: ExportIcon, requiresGarment: true },
];

export interface ToolRailProps {
  activeTool: StudioTool;
  hasGarment: boolean;
  onSelect: (tool: StudioTool) => void;
  orientation?: 'vertical' | 'horizontal';
}

export function ToolRail({ activeTool, hasGarment, onSelect, orientation = 'vertical' }: ToolRailProps) {
  return (
    <nav
      aria-label="Studio tools"
      className={
        orientation === 'vertical'
          ? 'flex w-16 shrink-0 flex-col items-center gap-1 border-r border-border bg-surface py-3'
          : 'flex items-center gap-1 overflow-x-auto border-t border-border bg-surface px-2 py-2'
      }
    >
      {STUDIO_TOOLS.map((tool) => {
        const disabled = tool.requiresGarment && !hasGarment;
        return (
          <IconButton
            key={tool.id}
            icon={<tool.icon className="h-5 w-5" />}
            aria-label={tool.label}
            active={activeTool === tool.id}
            aria-disabled={disabled}
            className={disabled ? 'cursor-not-allowed opacity-40' : undefined}
            title={disabled ? `${tool.label} — choose a garment first` : tool.label}
            onClick={() => onSelect(tool.id)}
          />
        );
      })}
    </nav>
  );
}
