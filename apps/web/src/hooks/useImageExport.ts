'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project } from '@threadform/types';
import type { GarmentManifest } from '@threadform/garment-runtime';
import type { ResolvedMaterial } from '@threadform/material-engine';
import type { ArtworkRenderLayer } from '@threadform/3d-engine';
import {
  canEncodeImageFormat,
  describeExportBlock,
  downloadBlob,
  planImageExport,
} from '@threadform/export-engine';
import type { ExportBlockReason, ExportJobState } from '@threadform/export-engine';
import type { ArtworkAsset } from './useArtworkAssets';

/**
 * Runs an image export.
 *
 * This hook is the **application-layer boundary** that M03 made necessary
 * and `EXPORT_SPEC.md` originally missed. The spec said "Project +
 * ExportPreferences → file", which stopped being sufficient the moment
 * artwork bytes moved out of the project document and into their own
 * IndexedDB store: a `Project` alone no longer contains enough to draw
 * itself.
 *
 * The fix is *not* to let `export-engine` reach into storage. It is for the
 * application — which already resolves garments through `useResolvedGarment`
 * and artwork through `useArtworkAssets` — to hand the export path inputs
 * that are already resolved and already past the artwork trust boundary. So
 * `export-engine` stays a pure planner that has never heard of IndexedDB,
 * and the renderer receives decoded images rather than blob ids.
 *
 * The job's progress lives here, in application state, and deliberately not
 * in the `Project`: "currently exporting" is a fact about this tab right
 * now, and persisting it would let a project be reopened tomorrow claiming
 * to be mid-export.
 */

export interface ImageExportInputs {
  project: Project | null;
  manifest: GarmentManifest | null;
  material: ResolvedMaterial;
  /** Decoded artwork, ready to draw — the output of `useArtworkAssets`. */
  renderLayers: ArtworkRenderLayer[];
  /** Per-blob load status, so export can refuse rather than silently omit a layer. */
  assets: Record<string, ArtworkAsset>;
}

export interface UseImageExportResult {
  job: ExportJobState;
  /** Non-null when export cannot run right now, with a message explaining why. */
  blockedReason: string | null;
  exportImage: () => Promise<void>;
  dismissJob: () => void;
}

/**
 * Checks that everything the export needs is genuinely ready.
 *
 * Stricter than interactive rendering on purpose. On screen, a layer whose
 * file has gone missing shows as broken and stays editable — the user can
 * see the problem and fix it. A file presented as finished output cannot
 * silently omit artwork the user placed, so this refuses instead, naming
 * the layers at fault.
 */
function findBlockingReason(inputs: ImageExportInputs): ExportBlockReason | null {
  const { project, manifest, assets } = inputs;
  if (!project) return { kind: 'no-project' };
  if (!manifest) return { kind: 'garment-not-ready' };

  const loading: string[] = [];
  const failed: string[] = [];

  for (const layer of project.artworks) {
    if (!layer.visible) continue;
    if (layer.source.kind !== 'local-blob') continue;
    const asset = assets[layer.source.blobId];
    if (!asset || asset.status === 'loading') loading.push(layer.name);
    else if (asset.status !== 'ready') failed.push(layer.name);
  }

  if (failed.length > 0) return { kind: 'artwork-failed', layerNames: failed };
  if (loading.length > 0) return { kind: 'artwork-not-ready', layerNames: loading };
  return null;
}

export function useImageExport(inputs: ImageExportInputs): UseImageExportResult {
  const [job, setJob] = useState<ExportJobState>({ status: 'idle' });

  // Synchronous guard against a double-click starting two 4K renders. State
  // alone cannot do this: a second handler in the same tick would not yet
  // see the first one's update.
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const blocking = findBlockingReason(inputs);
  const blockedReason = blocking ? describeExportBlock(blocking) : null;

  const { project, manifest, material, renderLayers } = inputs;

  const exportImage = useCallback(async () => {
    if (runningRef.current) return;

    const reason = findBlockingReason({
      project,
      manifest,
      material,
      renderLayers,
      assets: inputs.assets,
    });
    if (reason) {
      setJob({ status: 'failed', error: describeExportBlock(reason) });
      return;
    }
    if (!project || !manifest) return;

    const planned = planImageExport(project, project.exportPreferences);
    if (!planned.ok) {
      setJob({
        status: 'failed',
        error: describeExportBlock({ kind: 'invalid-settings', error: planned.error }),
      });
      return;
    }
    const { plan } = planned;

    runningRef.current = true;
    const update = (next: ExportJobState) => {
      if (mountedRef.current) setJob(next);
    };
    update({ status: 'preparing' });

    try {
      // Asked before rendering, not after: discovering the browser cannot
      // encode WebP once a 4K frame is already in memory wastes the render
      // and delays the message.
      if (!(await canEncodeImageFormat(plan.format))) {
        update({
          status: 'failed',
          error: describeExportBlock({ kind: 'format-unsupported', format: plan.format }),
        });
        return;
      }

      const dimensions = { width: plan.width, height: plan.height };
      update({ status: 'rendering', dimensions });

      // Imported lazily so three.js and the off-screen renderer are not part
      // of the Studio's initial bundle — this path only runs when someone
      // actually exports.
      const { renderGarmentImage } = await import('@threadform/3d-engine');
      const { CAMERA_PRESETS } = await import('@threadform/garment-runtime');

      const blob = await renderGarmentImage({
        manifest,
        colorHex: project.garmentColor.hex,
        material,
        artworkLayers: renderLayers,
        // The persisted camera preset, not the live viewport. See
        // `renderGarmentImage` and STATUS.md for exactly which fields of
        // `Project.camera` an export consumes.
        cameraPreset: CAMERA_PRESETS[project.camera.presetId] ?? CAMERA_PRESETS.front,
        width: plan.width,
        height: plan.height,
        transparent: plan.transparent,
        mimeType: plan.mimeType,
        quality: plan.quality,
      });

      update({ status: 'encoding', dimensions });
      downloadBlob(blob, plan.filename);
      update({
        status: 'completed',
        filename: plan.filename,
        dimensions,
        byteSize: blob.size,
      });
    } catch (error) {
      update({
        status: 'failed',
        error: error instanceof Error ? error.message : 'The export failed.',
      });
    } finally {
      runningRef.current = false;
    }
  }, [project, manifest, material, renderLayers, inputs.assets]);

  const dismissJob = useCallback(() => setJob({ status: 'idle' }), []);

  return { job, blockedReason, exportImage, dismissJob };
}
