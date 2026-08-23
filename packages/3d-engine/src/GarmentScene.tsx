'use client';

import { Suspense } from 'react';
import type { ReactNode } from 'react';
import type { GarmentManifest } from '@threadform/garment-runtime';
import type { ResolvedMaterial } from '@threadform/material-engine';
import { GarmentModel } from './GarmentModel';
import type { ArtworkRenderLayer } from './ArtworkZoneOverlay';
import { StudioLighting } from './StudioLighting';
import { StudioGrounding } from './StudioGrounding';
import type { GarmentBounds } from './frameGarment';

export interface GarmentSceneProps {
  manifest: GarmentManifest;
  colorHex: string;
  material: ResolvedMaterial;
  artworkLayers: ArtworkRenderLayer[];
  onBoundsReady: (bounds: GarmentBounds) => void;
  /**
   * The studio-sweep backdrop. On for the interactive Studio and for normal
   * exports; off for a transparent export, where drawing it would be the
   * whole bug — a "transparent" PNG with the dark studio gradient baked in.
   */
  backdrop?: boolean;
  /** Shown while the GLB loads. The Studio passes an overlay; an export passes nothing, since it has no viewer. */
  fallback?: ReactNode;
}

/**
 * Everything inside the canvas except the camera.
 *
 * This exists so the Studio and the exporter cannot become two different
 * visual systems. An exporter that rebuilt the garment, its material, its
 * artwork overlays and its lighting rig would look right on the day it was
 * written and drift from the Studio with every subsequent change — and the
 * drift would only ever be discovered in a file a user had already
 * published. Both mount *this*, so a change to how a garment renders is a
 * change to how it exports, by construction.
 *
 * The camera is deliberately outside: the Studio's is an orbit rig the user
 * drives, and an export's is a deterministic framing derived from the
 * project. That is the one place the two legitimately differ.
 */
export function GarmentScene({
  manifest,
  colorHex,
  material,
  artworkLayers,
  onBoundsReady,
  backdrop = true,
  fallback = null,
}: GarmentSceneProps) {
  return (
    <>
      {backdrop && <StudioGrounding />}
      <StudioLighting />
      <Suspense fallback={fallback}>
        <GarmentModel
          manifest={manifest}
          colorHex={colorHex}
          material={material}
          artworkLayers={artworkLayers}
          onBoundsReady={onBoundsReady}
        />
      </Suspense>
    </>
  );
}
