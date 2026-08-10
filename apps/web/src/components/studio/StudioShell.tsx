'use client';

import { useState } from 'react';
import type { GarmentCategory } from '@threadform/types';
import { StudioTopbar } from './StudioTopbar';
import { ToolRail, STUDIO_TOOLS } from './ToolRail';
import type { StudioTool } from './ToolRail';
import { GarmentPicker } from './GarmentPicker';
import { Inspector } from './Inspector';

export function StudioShell() {
  const [activeTool, setActiveTool] = useState<StudioTool>('garment');
  const [selectedCategory, setSelectedCategory] = useState<GarmentCategory | null>(null);
  const hasGarment = selectedCategory !== null;

  function selectTool(tool: StudioTool) {
    const definition = STUDIO_TOOLS.find((t) => t.id === tool);
    if (definition?.requiresGarment && !hasGarment) return;
    setActiveTool(tool);
  }

  function selectCategory(category: GarmentCategory) {
    setSelectedCategory(category);
  }

  const canvas = (
    <div className="flex flex-1 items-center justify-center overflow-y-auto bg-canvas p-6">
      {activeTool === 'garment' && !hasGarment ? (
        <GarmentPicker selected={selectedCategory} onSelect={selectCategory} />
      ) : (
        <div className="text-center">
          <p className="text-sm text-tertiary">
            {hasGarment ? '3D / 2D preview arrives in the next milestone.' : 'Choose a garment to begin.'}
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div id="main" className="flex h-dvh flex-col">
      <StudioTopbar projectName="Untitled Project" />

      {/* Desktop layout: rail | canvas | inspector */}
      <div className="hidden min-h-0 flex-1 md:flex">
        <ToolRail activeTool={activeTool} hasGarment={hasGarment} onSelect={selectTool} />
        {canvas}
        <Inspector activeTool={activeTool} selectedCategory={selectedCategory} />
      </div>

      {/* Mobile layout: canvas, collapsible inspector sheet, bottom tool bar */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        {canvas}
        <details className="border-t border-border bg-surface-raised">
          <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-medium text-secondary">
            Inspector
          </summary>
          <div className="max-h-64 overflow-y-auto">
            <Inspector activeTool={activeTool} selectedCategory={selectedCategory} />
          </div>
        </details>
        <ToolRail
          activeTool={activeTool}
          hasGarment={hasGarment}
          onSelect={selectTool}
          orientation="horizontal"
        />
      </div>
    </div>
  );
}
