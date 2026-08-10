'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GarmentCategory, Project } from '@threadform/types';
import type { ProjectSummary } from '@threadform/local-storage';
import {
  createAndPersistProject,
  deleteProjectById,
  listRecentProjects,
  openProject,
  restoreLastOpenedProject,
  saveProjectChanges,
} from '@/lib/projectRepository';
import { GARMENT_CATEGORIES } from '@/components/studio/garmentCategories';

export type StudioPhase = 'initializing' | 'start' | 'editing';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

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
  chooseGarment: (category: GarmentCategory) => Promise<void>;
  openExistingProject: (id: string) => Promise<void>;
  deleteExistingProject: (id: string) => Promise<void>;
  startNewProject: () => void;
  renameProject: (name: string) => void;
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

  const updateProject = useCallback(
    (mutator: (current: Project) => Project) => {
      const current = projectRef.current;
      if (!current) return;
      const next = mutator(current);
      setProjectState(next);
      scheduleSave(next);
    },
    [scheduleSave, setProjectState],
  );

  const chooseGarment = useCallback(
    async (category: GarmentCategory) => {
      if (isBusyRef.current) return;
      isBusyRef.current = true;
      setIsBusy(true);
      setNotice(null);
      cancelPendingSave();
      try {
        const created = await createAndPersistProject(
          { garmentId: category, garmentVersion: '0.0.0', category },
          defaultProjectName(category),
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
  }, [flushPendingSave, setProjectState]);

  const renameProject = useCallback(
    (name: string) => {
      updateProject((current) => ({
        ...current,
        metadata: { ...current.metadata, name, updatedAt: new Date().toISOString() },
      }));
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
  };
}

function defaultProjectName(category: GarmentCategory): string {
  const label = GARMENT_CATEGORIES.find((c) => c.id === category)?.label ?? category;
  return `${label} Project`;
}
