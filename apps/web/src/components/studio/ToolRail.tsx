import { IconButton } from '@threadform/ui';
import { ArtworkIcon, GarmentIcon, ViewIcon } from './icons';

export type StudioTool = 'garment' | 'artwork' | 'view';

// Only tools with real, wired-up functionality appear here — see
// docs/DESIGN_SYSTEM.md and CLAUDE.md's "No fake implementations": a tool
// that opens onto placeholder copy is prototype residue, not a preview of
// a future milestone. Artwork joined the rail in M03, when it gained a real
// import/placement/render path; material, effects, animation and export
// return when each has something real behind it too.
export const STUDIO_TOOLS: Array<{
  id: StudioTool;
  label: string;
  icon: typeof GarmentIcon;
  requiresGarment: boolean;
}> = [
  { id: 'garment', label: 'Garment', icon: GarmentIcon, requiresGarment: false },
  { id: 'artwork', label: 'Artwork', icon: ArtworkIcon, requiresGarment: true },
  { id: 'view', label: 'View', icon: ViewIcon, requiresGarment: true },
];

export interface ToolRailProps {
  activeTool: StudioTool;
  hasGarment: boolean;
  onSelect: (tool: StudioTool) => void;
  orientation?: 'vertical' | 'horizontal';
}

export function ToolRail({
  activeTool,
  hasGarment,
  onSelect,
  orientation = 'vertical',
}: ToolRailProps) {
  return (
    <nav
      aria-label="Studio tools"
      className={
        orientation === 'vertical'
          ? 'border-border bg-surface flex w-16 shrink-0 flex-col items-center gap-1.5 border-r py-3'
          : 'border-border bg-surface flex items-center justify-center gap-2 border-t px-2 py-2'
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
