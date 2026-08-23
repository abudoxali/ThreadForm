'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CameraPresetId,
  EffectKind,
  ExportAspectRatio,
  ExportImageFormat,
  ExportResolution,
  ExportTargetPreset,
  MaterialId,
  PrintZoneDefinition,
  Project,
} from '@threadform/types';
import type { ProjectSummary } from '@threadform/local-storage';
import { loadManifest, getCameraPreset } from '@threadform/garment-runtime';
import { artworkNameFromFileName } from '@threadform/artwork-engine';
import type { DecodedArtwork } from '@threadform/artwork-engine';
import {
  addArtworkLayer,
  centerArtworkLayer,
  defaultArtworkTransform,
  moveArtworkLayerToZone,
  removeArtworkLayer,
  replaceArtworkSource,
  setArtworkOpacity as applyArtworkOpacity,
  setArtworkTransform as applyArtworkTransform,
  setGarmentColor as applyGarmentColor,
  setCameraPreset as applyCameraPreset,
  setGarmentMaterial as applyGarmentMaterial,
  applyArtworkEffect as applyEffectToArtwork,
  clearArtworkEffect as clearEffectFromArtwork,
  setArtworkEffectIntensity as applyArtworkEffectIntensity,
  setArtworkEffectParameter as applyArtworkEffectParameter,
  setExportTarget as applyExportTarget,
  setExportImageFormat as applyExportImageFormat,
  setExportResolution as applyExportResolution,
  setExportAspectRatio as applyExportAspectRatio,
  setExportCustomDimensions as applyExportCustomDimensions,
} from '@threadform/project-engine';
import type { ArtworkTransformPatch } from '@threadform/project-engine';
import { defaultEffectIntensity, defaultEffectParameters } from '@threadform/effects-engine';
import { matchTarget, targetSettings } from '@threadform/export-engine';
import {
  createAndPersistProject,
  deleteProjectById,
  discardArtworkBlob,
  importArtworkForProject,
  listRecentProjects,
  openProject,
  restoreLastOpenedProject,
  saveProjectChanges,
} from '@/lib/projectRepository';

export type StudioPhase = 'initializing' | 'start' | 'editing';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * The outcome of an artwork import. Success carries the already-decoded
 * image so the caller can hand it to `useArtworkAssets` and have the print
 * appear immediately; failure carries copy written for the user, which the
 * artwork panel shows beside the control they used rather than in the
 * Studio-wide notice banner.
 */
export type ArtworkMutationResult =
  | { ok: true; layerId: string; blobId: string; decoded: DecodedArtwork }
  | { ok: false; error: string };

const AUTOSAVE_DEBOUNCE_MS = 600;

export interface UseStudioProjectResult {
  phase: StudioPhase;
  project: Project | null;
  recentProjects: ProjectSummary[];
  saveStatus: SaveStatus;
  /** True while a create/open is in flight — callers should disable the controls that triggered it. */
  isBusy: boolean;
  /** A restrained, user-facing message for a recoverable problem (e.g. "couldn't open that project"). Never a raw error/stack trace. */
  notice: string | null;
  dismissNotice: () => void;
  chooseGarment: (garmentId: string) => Promise<void>;
  openExistingProject: (id: string) => Promise<void>;
  deleteExistingProject: (id: string) => Promise<void>;
  startNewProject: () => void;
  renameProject: (name: string) => void;
  setGarmentColor: (hex: string) => void;
  setCameraPreset: (presetId: CameraPresetId) => void;
  /**
   * Imports a file as a new artwork layer in `zone`. The zone definition
   * comes from the garment's manifest and is passed in rather than looked
   * up here, so the placement limits applied are always the ones the
   * *resolved* garment declares — this hook deliberately doesn't resolve
   * manifests for the open project (`useResolvedGarment` does).
   */
  addArtwork: (file: File, zone: PrintZoneDefinition) => Promise<ArtworkMutationResult>;
  replaceArtwork: (
    layerId: string,
    file: File,
    zone: PrintZoneDefinition,
  ) => Promise<ArtworkMutationResult>;
  removeArtwork: (layerId: string) => void;
  updateArtworkTransform: (
    layerId: string,
    patch: ArtworkTransformPatch,
    zone: PrintZoneDefinition,
  ) => void;
  centerArtwork: (layerId: string) => void;
  moveArtworkToZone: (layerId: string, zone: PrintZoneDefinition) => void;
  setArtworkOpacity: (layerId: string, opacity: number) => void;
  /**
   * Sets the garment's fabric. `allowedMaterialIds` is the intersection of
   * the garment manifest's `supportedMaterials` and the materials this build
   * implements — passed in for the same reason print zones are, so the
   * allow-list enforced by the domain is always the resolved garment's.
   */
  setGarmentMaterial: (materialId: MaterialId, allowedMaterialIds: readonly MaterialId[]) => void;
  applyArtworkEffect: (
    layerId: string,
    kind: EffectKind,
    allowedKinds: readonly EffectKind[],
  ) => void;
  clearArtworkEffect: (layerId: string) => void;
  setArtworkEffectIntensity: (layerId: string, intensity: number) => void;
  setArtworkEffectParameter: (
    layerId: string,
    key: string,
    value: number,
    range: { min: number; max: number },
  ) => void;
  /**
   * Export settings, written through `project-engine` and autosaved like
   * everything else — the panel never hand-edits the project. Changing the
   * shape or size by hand re-derives the preset, so a highlighted preset can
   * never disagree with what will actually be rendered.
   */
  setExportTarget: (target: ExportTargetPreset) => void;
  setExportImageFormat: (format: ExportImageFormat) => void;
  setExportResolution: (resolution: ExportResolution) => void;
  setExportAspectRatio: (aspectRatio: ExportAspectRatio) => void;
  setExportCustomDimensions: (width: number, height: number) => void;
  /** Bumped on every `setCameraPreset` call, including a re-selection of the already-active preset — lets the 3D canvas treat that as an explicit "reset view" rather than a no-op. */
  cameraResetToken: number;
}

function friendlyMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

export function useStudioProject(): UseStudioProjectResult {
  const [phase, setPhase] = useState<StudioPhase>('initializing');
  const [project, setProject] = useState<Project | null>(null);
  const [recentProjects, setRecentProjects] = useState<ProjectSummary[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [cameraResetToken, setCameraResetToken] = useState(0);
  // Synchronous guard against double-submission (e.g. a fast double-click)
  // that `isBusy` state alone can't provide, since state updates aren't
  // visible to a second event handler invocation in the same tick.
  const isBusyRef = useRef(false);

  // The single source of truth for "what project are we editing right now,"
  // read by event handlers. Every place that changes `project` must go
  // through `setProjectState` below, which updates this ref *synchronously*
  // in the same tick — never via a `useEffect`, which would leave the ref
  // one commit behind and let two handlers in the same tick both read a
  // stale base (a lost-update race).
  const projectRef = useRef<Project | null>(null);
  const setProjectState = useCallback((next: Project | null) => {
    projectRef.current = next;
    setProject(next);
  }, []);

  const saveEpochRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<Project | null>(null);

  const refreshRecentProjects = useCallback(async () => {
    try {
      setRecentProjects(await listRecentProjects());
    } catch {
      // Listing is best-effort UI sugar; a failure here shouldn't block the Studio.
      setRecentProjects([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const [restored] = await Promise.all([
        restoreLastOpenedProject().catch(() => null),
        refreshRecentProjects(),
      ]);
      if (cancelled) return;
      if (restored) {
        setProjectState(restored);
        setPhase('editing');
      } else {
        setPhase('start');
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [refreshRecentProjects, setProjectState]);

  /**
   * Performs the actual write, tracked so a later call can supersede it.
   * Only the most recently issued write may update `saveStatus` — an
   * in-flight write from a since-superseded edit must not flip the
   * indicator back to "Saved" after a newer edit already failed or is still
   * pending. Note this starts the write; it does not (cannot) abort one
   * already in flight — see `cancelPendingSave`.
   */
  const commitSave = useCallback((next: Project) => {
    const epoch = ++saveEpochRef.current;
    setSaveStatus('saving');
    saveProjectChanges(next)
      .then(() => {
        if (saveEpochRef.current === epoch) setSaveStatus('saved');
      })
      .catch(() => {
        if (saveEpochRef.current === epoch) setSaveStatus('error');
      });
  }, []);

  /**
   * Clears a *pending* (not yet fired) debounced write and bumps the epoch
   * so neither it nor any already-in-flight write can update `saveStatus`
   * afterward. This does NOT stop an in-flight IndexedDB write that has
   * already started — `saveProjectChanges` calls can't be aborted — so
   * callers that need the previous project's data to be fully settled
   * before proceeding (e.g. deleting it) must call this first, before
   * starting anything that assumes the old data is gone.
   */
  const cancelPendingSave = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingSaveRef.current = null;
    saveEpochRef.current += 1;
  }, []);

  const flushPendingSave = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (pending) commitSave(pending);
  }, [commitSave]);

  const scheduleSave = useCallback(
    (next: Project) => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      pendingSaveRef.current = next;
      setSaveStatus('saving');
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        pendingSaveRef.current = null;
        commitSave(next);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [commitSave],
  );

  // Best-effort flush on unmount/navigation-away so a pending debounced edit
  // (e.g. a rename typed just before closing the tab) isn't silently lost.
  // This can't be guaranteed for a hard tab close, but covers the common
  // cases (client-side navigation, backgrounding the tab).
  useEffect(() => {
    function handlePageHide() {
      if (pendingSaveRef.current) flushPendingSave();
    }
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      handlePageHide();
    };
  }, [flushPendingSave]);

  /**
   * Applies a `project-engine` mutator and schedules the autosave. Returns
   * the resulting project so callers that need to inspect what the mutator
   * produced — an artwork import needs the id of the layer that was just
   * created — can do so without re-reading state that React hasn't
   * committed yet. `null` means there was no open project to mutate.
   */
  const updateProject = useCallback(
    (mutator: (current: Project) => Project): Project | null => {
      const current = projectRef.current;
      if (!current) return null;
      const next = mutator(current);
      // project-engine mutators (e.g. `setGarmentColor` on an invalid hex)
      // return the same reference as a no-op — skip the render/save entirely
      // rather than scheduling a redundant identical write.
      if (next === current) return current;
      setProjectState(next);
      scheduleSave(next);
      return next;
    },
    [scheduleSave, setProjectState],
  );

  const chooseGarment = useCallback(
    async (garmentId: string) => {
      if (isBusyRef.current) return;
      isBusyRef.current = true;
      setIsBusy(true);
      setNotice(null);
      cancelPendingSave();
      try {
        // Resolve the manifest first — never create a project pointing at a
        // garment whose manifest can't actually be loaded.
        const manifestResult = await loadManifest(garmentId);
        if (!manifestResult.success) {
          setNotice(`Couldn't load that garment. ${manifestResult.error}`);
          return;
        }
        const { manifest } = manifestResult;
        const created = await createAndPersistProject(
          {
            garmentId: manifest.garmentId,
            garmentVersion: manifest.version,
            category: manifest.category,
          },
          { name: `${manifest.name} Project`, garmentColor: { hex: manifest.defaultColor } },
        );
        setProjectState(created);
        setPhase('editing');
        setSaveStatus('saved');
        void refreshRecentProjects();
      } catch (error) {
        setNotice(`Couldn't create your project. ${friendlyMessage(error)}`);
      } finally {
        isBusyRef.current = false;
        setIsBusy(false);
      }
    },
    [cancelPendingSave, refreshRecentProjects, setProjectState],
  );

  const openExistingProject = useCallback(
    async (id: string) => {
      if (isBusyRef.current) return;
      isBusyRef.current = true;
      setIsBusy(true);
      setNotice(null);
      cancelPendingSave();
      try {
        const opened = await openProject(id);
        setProjectState(opened);
        setPhase('editing');
        setSaveStatus('saved');
      } catch {
        setNotice("Couldn't open that project — it may have been removed or is no longer valid.");
        void refreshRecentProjects();
      } finally {
        isBusyRef.current = false;
        setIsBusy(false);
      }
    },
    [cancelPendingSave, refreshRecentProjects, setProjectState],
  );

  const deleteExistingProject = useCallback(
    async (id: string) => {
      setNotice(null);
      // Settle any pending/in-flight write *before* deleting — otherwise a
      // debounced save could still be sitting on the timer queue and fire
      // its `put` after this `delete` commits, resurrecting the record.
      cancelPendingSave();
      try {
        await deleteProjectById(id);
        if (projectRef.current?.metadata.id === id) {
          setProjectState(null);
          setSaveStatus('idle');
          setPhase('start');
        }
        void refreshRecentProjects();
      } catch (error) {
        setNotice(`Couldn't delete that project. ${friendlyMessage(error)}`);
      }
    },
    [cancelPendingSave, refreshRecentProjects, setProjectState],
  );

  const startNewProject = useCallback(() => {
    // Flush (not cancel) any pending rename/edit before leaving, so it isn't lost.
    flushPendingSave();
    setNotice(null);
    setProjectState(null);
    setSaveStatus('idle');
    setPhase('start');
    // The recents list was last refreshed at create/open time — a rename
    // since then wouldn't otherwise show up until the next create/open/
    // delete. (A rename immediately followed by this, before its debounced
    // write settles, can still race the refresh below — the same
    // documented ~600ms window as the autosave-on-teardown gap.)
    void refreshRecentProjects();
  }, [flushPendingSave, refreshRecentProjects, setProjectState]);

  const renameProject = useCallback(
    (name: string) => {
      updateProject((current) => ({
        ...current,
        metadata: { ...current.metadata, name, updatedAt: new Date().toISOString() },
      }));
    },
    [updateProject],
  );

  const setGarmentColor = useCallback(
    (hex: string) => {
      updateProject((current) => applyGarmentColor(current, hex));
    },
    [updateProject],
  );

  const setCameraPreset = useCallback(
    (presetId: CameraPresetId) => {
      const preset = getCameraPreset(presetId);
      updateProject((current) => applyCameraPreset(current, presetId, preset));
      // Bumped even when `presetId` matches the already-active preset, so
      // re-selecting it acts as an explicit "reset view" instead of a no-op
      // (the 3D canvas otherwise sees a referentially-unchanged preset).
      setCameraResetToken((token) => token + 1);
    },
    [updateProject],
  );

  /**
   * Deletes an artwork blob once the project no longer references it.
   * Blobs are shared by `blobId`, so a duplicated layer means two layers
   * pointing at one file — removing either must not delete the bytes the
   * other still needs.
   */
  const discardUnreferencedBlob = useCallback((blobId: string, project: Project | null) => {
    const stillReferenced = (project?.artworks ?? []).some(
      (layer) => layer.source.kind === 'local-blob' && layer.source.blobId === blobId,
    );
    if (!stillReferenced) void discardArtworkBlob(blobId);
  }, []);

  const addArtwork = useCallback(
    async (file: File, zone: PrintZoneDefinition): Promise<ArtworkMutationResult> => {
      const imported = await importArtworkForProject(file);
      if (!imported.ok) return imported;
      const { source, decoded } = imported.artwork;

      const before = new Set((projectRef.current?.artworks ?? []).map((layer) => layer.id));
      const next = updateProject((current) =>
        addArtworkLayer(current, {
          name: artworkNameFromFileName(file.name),
          source,
          printZoneId: zone.id,
          transform: defaultArtworkTransform(source, zone),
          opacity: 1,
          visible: true,
          locked: false,
          lockAspectRatio: true,
        }),
      );

      const created = next?.artworks.find((layer) => !before.has(layer.id));
      if (!created) {
        // The project was closed while the file was being read. Nothing
        // references the blob that was just written, so undo the write
        // rather than leaving it stranded in the user's storage.
        decoded.release();
        void discardArtworkBlob(source.blobId);
        return { ok: false, error: 'That project was closed before the artwork finished loading.' };
      }

      return { ok: true, layerId: created.id, blobId: source.blobId, decoded };
    },
    [updateProject],
  );

  const replaceArtwork = useCallback(
    async (
      layerId: string,
      file: File,
      zone: PrintZoneDefinition,
    ): Promise<ArtworkMutationResult> => {
      const existing = projectRef.current?.artworks.find((layer) => layer.id === layerId);
      if (!existing) return { ok: false, error: 'That artwork layer no longer exists.' };

      const imported = await importArtworkForProject(file);
      if (!imported.ok) return imported;
      const { source, decoded } = imported.artwork;

      const next = updateProject((current) =>
        replaceArtworkSource(current, layerId, source, zone, artworkNameFromFileName(file.name)),
      );
      if (!next || !next.artworks.some((layer) => layer.id === layerId)) {
        decoded.release();
        void discardArtworkBlob(source.blobId);
        return { ok: false, error: 'That artwork layer no longer exists.' };
      }

      if (existing.source.kind === 'local-blob') {
        discardUnreferencedBlob(existing.source.blobId, next);
      }
      return { ok: true, layerId, blobId: source.blobId, decoded };
    },
    [discardUnreferencedBlob, updateProject],
  );

  const removeArtwork = useCallback(
    (layerId: string) => {
      const existing = projectRef.current?.artworks.find((layer) => layer.id === layerId);
      const next = updateProject((current) => removeArtworkLayer(current, layerId));
      if (existing?.source.kind === 'local-blob') {
        discardUnreferencedBlob(existing.source.blobId, next);
      }
    },
    [discardUnreferencedBlob, updateProject],
  );

  const updateArtworkTransform = useCallback(
    (layerId: string, patch: ArtworkTransformPatch, zone: PrintZoneDefinition) => {
      updateProject((current) => applyArtworkTransform(current, layerId, patch, zone));
    },
    [updateProject],
  );

  const centerArtwork = useCallback(
    (layerId: string) => {
      updateProject((current) => centerArtworkLayer(current, layerId));
    },
    [updateProject],
  );

  const moveArtworkToZone = useCallback(
    (layerId: string, zone: PrintZoneDefinition) => {
      updateProject((current) => moveArtworkLayerToZone(current, layerId, zone));
    },
    [updateProject],
  );

  const setArtworkOpacity = useCallback(
    (layerId: string, opacity: number) => {
      updateProject((current) => applyArtworkOpacity(current, layerId, opacity));
    },
    [updateProject],
  );

  const setGarmentMaterial = useCallback(
    (materialId: MaterialId, allowedMaterialIds: readonly MaterialId[]) => {
      updateProject((current) => applyGarmentMaterial(current, materialId, allowedMaterialIds));
    },
    [updateProject],
  );

  const applyArtworkEffect = useCallback(
    (layerId: string, kind: EffectKind, allowedKinds: readonly EffectKind[]) => {
      // The effect's starting values come from its preset in
      // `effects-engine`; `project-engine` deliberately doesn't know them,
      // the same way it doesn't know camera preset angles.
      updateProject((current) =>
        applyEffectToArtwork(current, layerId, kind, allowedKinds, {
          intensity: defaultEffectIntensity(kind),
          parameters: defaultEffectParameters(kind),
        }),
      );
    },
    [updateProject],
  );

  const clearArtworkEffect = useCallback(
    (layerId: string) => {
      updateProject((current) => clearEffectFromArtwork(current, layerId));
    },
    [updateProject],
  );

  const setArtworkEffectIntensity = useCallback(
    (layerId: string, intensity: number) => {
      updateProject((current) => applyArtworkEffectIntensity(current, layerId, intensity));
    },
    [updateProject],
  );

  const setArtworkEffectParameter = useCallback(
    (layerId: string, key: string, value: number, range: { min: number; max: number }) => {
      updateProject((current) => applyArtworkEffectParameter(current, layerId, key, value, range));
    },
    [updateProject],
  );

  const setExportTarget = useCallback(
    (target: ExportTargetPreset) => {
      // The target's meaning lives in `export-engine`'s preset table;
      // `project-engine` receives the plain values, the same way it receives
      // a resolved camera preset.
      updateProject((current) => applyExportTarget(current, target, targetSettings(target)));
    },
    [updateProject],
  );

  const setExportImageFormat = useCallback(
    (format: ExportImageFormat) => {
      updateProject((current) => applyExportImageFormat(current, format));
    },
    [updateProject],
  );

  const setExportResolution = useCallback(
    (resolution: ExportResolution) => {
      updateProject((current) =>
        applyExportResolution(
          current,
          resolution,
          matchTarget(current.exportPreferences.aspectRatio, resolution),
        ),
      );
    },
    [updateProject],
  );

  const setExportAspectRatio = useCallback(
    (aspectRatio: ExportAspectRatio) => {
      updateProject((current) =>
        applyExportAspectRatio(
          current,
          aspectRatio,
          matchTarget(aspectRatio, current.exportPreferences.image.resolution),
        ),
      );
    },
    [updateProject],
  );

  const setExportCustomDimensions = useCallback(
    (width: number, height: number) => {
      updateProject((current) => applyExportCustomDimensions(current, width, height));
    },
    [updateProject],
  );

  const dismissNotice = useCallback(() => setNotice(null), []);

  return {
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
    moveArtworkToZone,
    setArtworkOpacity,
    setGarmentMaterial,
    applyArtworkEffect,
    clearArtworkEffect,
    setArtworkEffectIntensity,
    setArtworkEffectParameter,
    setExportTarget,
    setExportImageFormat,
    setExportResolution,
    setExportAspectRatio,
    setExportCustomDimensions,
    cameraResetToken,
  };
}
