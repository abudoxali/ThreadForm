'use client';

import { useState } from 'react';
import { useStudioProject } from '@/hooks/useStudioProject';
import { StudioTopbar } from './StudioTopbar';
import { ToolRail, STUDIO_TOOLS } from './ToolRail';
import type { StudioTool } from './ToolRail';
import { GarmentPicker } from './GarmentPicker';
import { Inspector } from './Inspector';
import { RecentProjects } from './RecentProjects';
import { NoticeBanner } from './NoticeBanner';

export function StudioShell() {
  const [activeTool, setActiveTool] = useState<StudioTool>('garment');
  const {
    phase,
    project,
    recentProjects,
    saveStatus,
    isBusy,
    notice,
    dismissNotice,
    chooseGarment,
    openExistingProject,
    deleteExistingProject,
    startNewProject,
    renameProject,
  } = useStudioProject();

  const hasProject = project !== null;

  function selectTool(tool: StudioTool) {
    const definition = STUDIO_TOOLS.find((t) => t.id === tool);
    if (definition?.requiresGarment && !hasProject) return;
    setActiveTool(tool);
  }

  function handleChooseGarment(category: Parameters<typeof chooseGarment>[0]) {
    setActiveTool('garment');
    void chooseGarment(category);
  }

  function handleNewProject() {
    startNewProject();
    setActiveTool('garment');
  }

  const canvas = (
    <div className="bg-canvas flex flex-1 items-center justify-center overflow-y-auto p-6">
      {phase === 'initializing' && <p className="text-tertiary text-sm">Loading your studio…</p>}

      {phase === 'start' && (
        <div className="w-full">
          {notice && <NoticeBanner message={notice} onDismiss={dismissNotice} />}
          <GarmentPicker onSelect={handleChooseGarment} disabled={isBusy} />
          <RecentProjects
            projects={recentProjects}
            onOpen={(id) => void openExistingProject(id)}
            onDelete={(id) => void deleteExistingProject(id)}
          />
        </div>
      )}

      {phase === 'editing' && (
        <div className="text-center">
          {notice && <NoticeBanner message={notice} onDismiss={dismissNotice} />}
          <p className="text-tertiary text-sm">3D / 2D preview arrives in a later milestone.</p>
        </div>
      )}
    </div>
  );

  return (
    <div id="main" className="flex h-dvh flex-col">
      <StudioTopbar
        project={project}
        saveStatus={saveStatus}
        onRename={renameProject}
        onNewProject={handleNewProject}
      />

      {/* Desktop layout: rail | canvas | inspector */}
      <div className="hidden min-h-0 flex-1 md:flex">
        <ToolRail activeTool={activeTool} hasGarment={hasProject} onSelect={selectTool} />
        {canvas}
        <Inspector activeTool={activeTool} project={project} />
      </div>

      {/* Mobile layout: canvas, collapsible inspector sheet, bottom tool bar */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        {canvas}
        <details className="border-border bg-surface-raised border-t">
          <summary className="text-secondary cursor-pointer list-none px-4 py-2.5 text-sm font-medium">
            Inspector
          </summary>
          <div className="max-h-64 overflow-y-auto">
            <Inspector activeTool={activeTool} project={project} />
          </div>
        </details>
        <ToolRail
          activeTool={activeTool}
          hasGarment={hasProject}
          onSelect={selectTool}
          orientation="horizontal"
        />
      </div>
    </div>
  );
}
