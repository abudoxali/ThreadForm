'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { CAMERA_PRESETS } from '@threadform/garment-runtime';
import { useStudioProject } from '@/hooks/useStudioProject';
import { useResolvedGarment } from '@/hooks/useResolvedGarment';
import { StudioTopbar } from './StudioTopbar';
import { ToolRail, STUDIO_TOOLS } from './ToolRail';
import type { StudioTool } from './ToolRail';
import { GarmentPicker } from './GarmentPicker';
import { Inspector } from './Inspector';
import { RecentProjects } from './RecentProjects';
import { NoticeBanner } from './NoticeBanner';

// three.js + drei + the GLTF loader stack are a meaningful chunk of the
// Studio bundle — load them only once a garment is actually being rendered
// (never on the picker/recents start screen), and never during SSR, since
// the canvas can only ever run in the browser.
const StudioGarmentCanvas = dynamic(
  () => import('@threadform/3d-engine').then((mod) => mod.StudioGarmentCanvas),
  {
    ssr: false,
    loading: () => <p className="text-tertiary p-6 text-sm">Loading garment…</p>,
  },
);

export function StudioShell() {
  const [activeTool, setActiveTool] = useState<StudioTool>('garment');
  const [canvasFailed, setCanvasFailed] = useState(false);
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
    setGarmentColor,
    setCameraPreset,
    cameraResetToken,
  } = useStudioProject();

  const garment = useResolvedGarment(project);
  const hasProject = project !== null;

  function selectTool(tool: StudioTool) {
    const definition = STUDIO_TOOLS.find((t) => t.id === tool);
    if (definition?.requiresGarment && !hasProject) return;
    setActiveTool(tool);
  }

  function handleChooseGarment(garmentId: string) {
    setActiveTool('garment');
    void chooseGarment(garmentId);
  }

  function handleNewProject() {
    startNewProject();
    setCanvasFailed(false);
    setActiveTool('garment');
  }

  const canvas = (
    <div className="bg-canvas relative flex flex-1 items-center justify-center overflow-hidden">
      {phase === 'initializing' && <p className="text-tertiary text-sm">Loading your studio…</p>}

      {phase === 'start' && (
        <div className="h-full w-full overflow-y-auto p-6">
          {notice && <NoticeBanner message={notice} onDismiss={dismissNotice} />}
          <GarmentPicker onSelect={handleChooseGarment} disabled={isBusy} />
          <RecentProjects
            projects={recentProjects}
            onOpen={(id) => void openExistingProject(id)}
            onDelete={(id) => void deleteExistingProject(id)}
          />
        </div>
      )}

      {phase === 'editing' && project && (
        <>
          {notice && (
            <div className="absolute left-1/2 top-4 z-10 w-full max-w-lg -translate-x-1/2 px-4">
              <NoticeBanner message={notice} onDismiss={dismissNotice} />
            </div>
          )}

          {garment.status === 'loading' && (
            <p className="text-tertiary p-6 text-sm">Loading garment…</p>
          )}

          {garment.status === 'unavailable' && (
            <div className="max-w-sm p-6 text-center">
              <p className="text-primary text-sm">
                This project&rsquo;s garment isn&rsquo;t available in this build.
              </p>
              <p className="text-tertiary mt-1.5 text-sm">
                Start a new project to use the ThreadForm Essential Tee. This project is safe and
                unchanged — nothing has been deleted.
              </p>
            </div>
          )}

          {garment.status === 'error' && (
            <div className="max-w-sm p-6 text-center">
              <p className="text-primary text-sm">Couldn&rsquo;t load this garment.</p>
              <p className="text-tertiary mt-1.5 text-sm">
                Try reloading the page, or start a new project.
              </p>
            </div>
          )}

          {(garment.status === 'ready' || garment.status === 'legacy-compatible') &&
            garment.manifest &&
            (canvasFailed ? (
              <div className="max-w-sm p-6 text-center">
                <p className="text-primary text-sm">The 3D preview couldn&rsquo;t be displayed.</p>
                <p className="text-tertiary mt-1.5 text-sm">
                  Your project is unaffected. Try reloading the page, or start a new project.
                </p>
              </div>
            ) : (
              <StudioGarmentCanvas
                className="h-full w-full"
                manifest={garment.manifest}
                colorHex={project.garmentColor.hex}
                cameraPreset={CAMERA_PRESETS[project.camera.presetId] ?? CAMERA_PRESETS.front}
                cameraResetToken={cameraResetToken}
                errorFallback={
                  <div className="flex h-full w-full items-center justify-center text-center">
                    <div className="max-w-sm">
                      <p className="text-primary text-sm">
                        The 3D preview couldn&rsquo;t be displayed.
                      </p>
                      <p className="text-tertiary mt-1.5 text-sm">
                        Your project is unaffected. Try reloading the page, or start a new project.
                      </p>
                    </div>
                  </div>
                }
                onError={() => setCanvasFailed(true)}
              />
            ))}
        </>
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
        <Inspector
          activeTool={activeTool}
          project={project}
          garmentStatus={garment.status}
          manifest={garment.manifest}
          onColorChange={setGarmentColor}
          onCameraPreset={setCameraPreset}
        />
      </div>

      {/* Mobile layout: canvas, collapsible inspector sheet, bottom tool bar */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        {canvas}
        <details className="border-border bg-surface-raised border-t">
          <summary className="text-secondary cursor-pointer list-none px-4 py-2.5 text-sm font-medium">
            Inspector
          </summary>
          <div className="max-h-64 overflow-y-auto">
            <Inspector
              activeTool={activeTool}
              project={project}
              garmentStatus={garment.status}
              manifest={garment.manifest}
              onColorChange={setGarmentColor}
              onCameraPreset={setCameraPreset}
              showHeading={false}
            />
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
