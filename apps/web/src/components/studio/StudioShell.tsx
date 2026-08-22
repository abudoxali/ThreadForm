'use client';

import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { CAMERA_PRESETS } from '@threadform/garment-runtime';
import type { CameraPresetId, PrintZoneId } from '@threadform/types';
import { resolveMaterial } from '@threadform/material-engine';
import { useStudioProject } from '@/hooks/useStudioProject';
import { useResolvedGarment } from '@/hooks/useResolvedGarment';
import { useArtworkAssets } from '@/hooks/useArtworkAssets';
import { StudioTopbar } from './StudioTopbar';
import { ToolRail, STUDIO_TOOLS } from './ToolRail';
import type { StudioTool } from './ToolRail';
import { GarmentPicker } from './GarmentPicker';
import { Inspector } from './Inspector';
import { ArtworkPanel } from './ArtworkPanel';
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

/**
 * Which camera preset shows a print zone head-on. Selecting a zone in the
 * artwork panel turns the garment to face it — you cannot judge a back
 * print while looking at the chest. This only moves the camera; it never
 * touches artwork state, so switching between Front and Back leaves both
 * placements exactly as they were.
 */
const ZONE_CAMERA_PRESET: Partial<Record<PrintZoneId, CameraPresetId>> = {
  front: 'front',
  'left-chest': 'front',
  'right-chest': 'front',
  pocket: 'front',
  back: 'back',
};

export function StudioShell() {
  const [activeTool, setActiveTool] = useState<StudioTool>('garment');
  const [canvasFailed, setCanvasFailed] = useState(false);
  const [activeZoneId, setActiveZoneId] = useState<PrintZoneId>('front');
  const [selectedArtworkId, setSelectedArtworkId] = useState<string | null>(null);
  // Mobile only: the Inspector sheet is collapsed on arrival so the garment
  // gets the whole viewport, but picking *any* tool opens it — every tool's
  // controls live inside it, so a tap that left it shut would look like it
  // did nothing. Found in M04 mobile QA: the fabric picker joined the
  // garment tool, whose controls were the one set the sheet never opened for.
  const [inspectorOpen, setInspectorOpen] = useState(false);
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
    addArtwork,
    replaceArtwork,
    removeArtwork,
    updateArtworkTransform,
    centerArtwork,
    setArtworkOpacity,
    setGarmentMaterial,
    applyArtworkEffect,
    clearArtworkEffect,
    setArtworkEffectIntensity,
    setArtworkEffectParameter,
    cameraResetToken,
  } = useStudioProject();

  const garment = useResolvedGarment(project);

  /**
   * The fabric the renderer will actually use.
   *
   * Resolved here, once, from the project's stored material and the resolved
   * garment's own `supportedMaterials` — so a project naming a fabric this
   * garment does not offer (a stale save, a hand-edited record) is
   * substituted at the boundary rather than reaching Three.js. Memoised on
   * the two inputs so an unrelated edit doesn't hand the canvas a new object
   * and make it re-evaluate its texture keys.
   */
  const resolvedMaterial = useMemo(
    () => resolveMaterial(project?.material, garment.manifest?.supportedMaterials ?? []),
    [project?.material, garment.manifest],
  );
  const { assets, renderLayers, adoptDecodedArtwork } = useArtworkAssets(project);
  const hasProject = project !== null;

  function selectTool(tool: StudioTool) {
    const definition = STUDIO_TOOLS.find((t) => t.id === tool);
    if (definition?.requiresGarment && !hasProject) return;
    setActiveTool(tool);
    setInspectorOpen(true);
  }

  function handleChooseGarment(garmentId: string) {
    setActiveTool('garment');
    setSelectedArtworkId(null);
    setActiveZoneId('front');
    void chooseGarment(garmentId);
  }

  function handleOpenProject(id: string) {
    setSelectedArtworkId(null);
    setActiveZoneId('front');
    void openExistingProject(id);
  }

  function handleNewProject() {
    startNewProject();
    setCanvasFailed(false);
    setActiveTool('garment');
    setSelectedArtworkId(null);
    setActiveZoneId('front');
  }

  const handleSelectZone = useCallback(
    (zoneId: PrintZoneId) => {
      setActiveZoneId(zoneId);
      setSelectedArtworkId(null);
      const preset = ZONE_CAMERA_PRESET[zoneId];
      if (preset && garment.manifest?.cameraPresets.includes(preset)) {
        setCameraPreset(preset);
      }
    },
    [garment.manifest, setCameraPreset],
  );

  // One element, rendered into both Inspector copies (desktop rail and
  // mobile sheet). Each copy mounts its own instance, so their transient
  // import/error state stays independent while both read the same Project.
  const artworkPanel =
    project && garment.manifest ? (
      <ArtworkPanel
        project={project}
        manifest={garment.manifest}
        assets={assets}
        activeZoneId={activeZoneId}
        onSelectZone={handleSelectZone}
        selectedLayerId={selectedArtworkId}
        onSelectLayer={setSelectedArtworkId}
        onAddArtwork={addArtwork}
        onReplaceArtwork={replaceArtwork}
        onRemoveArtwork={removeArtwork}
        onTransform={updateArtworkTransform}
        onCenter={centerArtwork}
        onOpacity={setArtworkOpacity}
        onArtworkImported={adoptDecodedArtwork}
        onApplyEffect={applyArtworkEffect}
        onClearEffect={clearArtworkEffect}
        onEffectIntensity={setArtworkEffectIntensity}
        onEffectParameter={setArtworkEffectParameter}
      />
    ) : null;

  const canvas = (
    <div className="bg-canvas relative flex flex-1 items-center justify-center overflow-hidden">
      {phase === 'initializing' && <p className="text-tertiary text-sm">Loading your studio…</p>}

      {phase === 'start' && (
        <div className="h-full w-full overflow-y-auto p-6">
          {notice && <NoticeBanner message={notice} onDismiss={dismissNotice} />}
          <GarmentPicker onSelect={handleChooseGarment} disabled={isBusy} />
          <RecentProjects
            projects={recentProjects}
            onOpen={handleOpenProject}
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
                material={resolvedMaterial}
                artworkLayers={renderLayers}
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
          onMaterialChange={setGarmentMaterial}
          artworkPanel={artworkPanel}
        />
      </div>

      {/* Mobile layout: canvas, collapsible inspector sheet, bottom tool bar */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        {canvas}
        <details
          className="border-border bg-surface-raised border-t"
          open={inspectorOpen}
          onToggle={(event) => setInspectorOpen(event.currentTarget.open)}
        >
          <summary className="text-secondary cursor-pointer list-none px-4 py-2.5 text-sm font-medium">
            Inspector
          </summary>
          {/* Grown from max-h-72 in M04: the artwork panel gained a print-effect
              selector, an intensity control and a parameter, which pushed the
              effect controls below the fold on a 390x844 phone. Still capped
              and still scrollable — the garment keeps the larger share of the
              viewport, which is the point of the sheet. */}
          <div className="max-h-80 overflow-y-auto">
            <Inspector
              activeTool={activeTool}
              project={project}
              garmentStatus={garment.status}
              manifest={garment.manifest}
              onColorChange={setGarmentColor}
              onCameraPreset={setCameraPreset}
              onMaterialChange={setGarmentMaterial}
              artworkPanel={artworkPanel}
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
