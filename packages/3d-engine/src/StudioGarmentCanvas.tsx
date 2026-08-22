'use client';

import { Suspense, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { GarmentManifest, CameraPresetDefinition } from '@threadform/garment-runtime';
import { GarmentModel } from './GarmentModel';
import type { ArtworkRenderLayer } from './ArtworkZoneOverlay';
import { CameraRig } from './CameraRig';
import { StudioLighting } from './StudioLighting';
import { StudioGrounding } from './StudioGrounding';
import { GarmentCanvasErrorBoundary } from './GarmentCanvasErrorBoundary';
import type { GarmentBounds } from './frameGarment';

export interface StudioGarmentCanvasProps {
  manifest: GarmentManifest;
  colorHex: string;
  /** Decoded, validated artwork to print on the garment. A stable reference matters — see GarmentModel. */
  artworkLayers: ArtworkRenderLayer[];
  cameraPreset: CameraPresetDefinition;
  /** Bumped by the caller to force a camera re-frame even when `cameraPreset` is referentially unchanged (e.g. re-selecting the already-active preset as a "reset view" action). */
  cameraResetToken: number;
  /** Rendered in place of the canvas after a load/render failure — pass a real recovery action (e.g. "choose another garment"), never a raw error. */
  errorFallback: ReactNode;
  onError?: () => void;
  className?: string;
}

const CANVAS_BACKGROUND = '#0b0b0c'; // matches --tf-color-bg-canvas

function LoadingOverlay() {
  return (
    <Html center>
      <div
        role="status"
        style={{
          color: '#a8a7a3',
          fontSize: '0.8125rem',
          whiteSpace: 'nowrap',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        Loading garment…
      </div>
    </Html>
  );
}

/**
 * The Studio's 3D rendering surface. Bounded DPR and a demand-driven frame
 * loop keep this from burning GPU/battery when idle — OrbitControls'
 * damping still triggers re-renders while the user is actively
 * orbiting/settling, via R3F's built-in invalidate-on-control-change.
 */
export function StudioGarmentCanvas({
  manifest,
  colorHex,
  artworkLayers,
  cameraPreset,
  cameraResetToken,
  errorFallback,
  onError,
  className,
}: StudioGarmentCanvasProps) {
  const [bounds, setBounds] = useState<GarmentBounds | null>(null);

  return (
    <GarmentCanvasErrorBoundary fallback={errorFallback} onError={onError}>
      <Canvas
        className={className}
        frameloop="demand"
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: false }}
        camera={{ fov: 26, near: 0.05, far: 20 }}
        onCreated={({ gl }) => gl.setClearColor(CANVAS_BACKGROUND)}
      >
        <StudioGrounding />
        <StudioLighting />
        <CameraRig preset={cameraPreset} bounds={bounds} resetToken={cameraResetToken} />
        <Suspense fallback={<LoadingOverlay />}>
          <GarmentModel
            manifest={manifest}
            colorHex={colorHex}
            artworkLayers={artworkLayers}
            onBoundsReady={setBounds}
          />
        </Suspense>
      </Canvas>
    </GarmentCanvasErrorBoundary>
  );
}
