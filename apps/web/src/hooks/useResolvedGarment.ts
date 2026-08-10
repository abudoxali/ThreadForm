'use client';

import { useEffect, useState } from 'react';
import type { Project } from '@threadform/types';
import type { GarmentManifest, GarmentResolution } from '@threadform/garment-runtime';
import { loadManifest, resolveGarmentReference } from '@threadform/garment-runtime';

export type ResolvedGarmentStatus =
  'idle' | 'loading' | 'ready' | 'legacy-compatible' | 'unavailable' | 'error';

export interface ResolvedGarment {
  status: ResolvedGarmentStatus;
  manifest: GarmentManifest | null;
  error: string | null;
}

/**
 * Resolves a `Project.garment` reference to a loaded, validated manifest —
 * the `Project.garment → manifest resolution → garment-runtime` step of the
 * pipeline described in `docs/ARCHITECTURE.md`. Never touches IndexedDB;
 * that's `local-storage`'s job, reached only through `projectRepository`.
 */
export function useResolvedGarment(project: Project | null): ResolvedGarment {
  const [state, setState] = useState<ResolvedGarment>({
    status: 'idle',
    manifest: null,
    error: null,
  });

  // Deliberately keyed on the garment reference's own fields, not the whole
  // `project` object — `project` gets a new identity on every autosaved
  // edit (rename, color change, ...), none of which should re-trigger a
  // manifest re-fetch.
  const garmentId = project?.garment.garmentId ?? null;
  const garmentVersion = project?.garment.garmentVersion ?? null;
  const category = project?.garment.category ?? null;

  useEffect(() => {
    if (!garmentId || !garmentVersion || !category) {
      setState({ status: 'idle', manifest: null, error: null });
      return;
    }

    const resolution: GarmentResolution = resolveGarmentReference({
      garmentId,
      garmentVersion,
      category,
    });
    if (resolution.status === 'unavailable') {
      setState({ status: 'unavailable', manifest: null, error: null });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading', manifest: null, error: null });

    void loadManifest(resolution.garmentId).then((result) => {
      if (cancelled) return;
      if (result.success) {
        setState({ status: resolution.status, manifest: result.manifest, error: null });
      } else {
        setState({ status: 'error', manifest: null, error: result.error });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [garmentId, garmentVersion, category]);

  return state;
}
