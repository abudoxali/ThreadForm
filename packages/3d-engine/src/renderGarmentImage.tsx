'use client';

import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
// Type-only: this module never constructs Three objects itself, it drives
// the renderer R3F already created.
import type * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import type { GarmentManifest, CameraPresetDefinition } from '@threadform/garment-runtime';
import type { ResolvedMaterial } from '@threadform/material-engine';
import { GarmentScene } from './GarmentScene';
import type { ArtworkRenderLayer } from './ArtworkZoneOverlay';
import { frameGarment } from './frameGarment';
import type { GarmentBounds } from './frameGarment';

/**
 * Off-screen image export.
 *
 * This is a *second, independent render* at exactly the requested pixel
 * size — not a screenshot of the Studio. That distinction is the whole
 * feature: a viewport capture would be the size of the user's window, at
 * their device pixel ratio, from whatever angle they happened to have
 * orbited to, with the Studio's aspect ratio baked in. None of those are
 * things an exported file should depend on.
 *
 * It renders `GarmentScene` — the same component the Studio mounts — so the
 * garment, fabric, artwork, print effects and lighting are the same code
 * producing the same pixels, at a different size.
 */

/** Vertical field of view, matching the Studio canvas so framing math agrees. */
const EXPORT_FOV_DEGREES = 26;

/** Matches the Studio's `--tf-color-bg-canvas`, for opaque exports. */
const OPAQUE_CLEAR_COLOR = '#0b0b0c';

/** Frames to let settle after the garment reports its bounds, before capturing. */
const SETTLE_FRAMES = 3;

export interface GarmentImageRequest {
  manifest: GarmentManifest;
  colorHex: string;
  material: ResolvedMaterial;
  artworkLayers: ArtworkRenderLayer[];
  /**
   * The camera this export renders from.
   *
   * A resolved preset, not the live viewport: `EXPORT_SPEC.md` calls for
   * deterministic, project-driven output, and OrbitControls state is
   * transient UI, not project state. Two exports of the same project
   * therefore match even if the user spun the garment between them.
   */
  cameraPreset: CameraPresetDefinition;
  width: number;
  height: number;
  /** No backdrop, alpha kept. Only `png-transparent` sets this. */
  transparent: boolean;
  mimeType: string;
  quality?: number;
  /** Guards against a GLB that never resolves leaving a hidden canvas mounted forever. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

interface CaptureProps {
  request: GarmentImageRequest;
  bounds: GarmentBounds | null;
  onCaptured: (blob: Blob) => void;
  onFailed: (error: Error) => void;
}

/**
 * Sizes the renderer, frames the camera and takes the picture.
 *
 * Everything here is done imperatively and in one synchronous block on
 * purpose. R3F sizes its canvas from the DOM element via a ResizeObserver,
 * which is a frame or more behind and rounds to layout pixels; an export
 * that came out 1079px wide because of a sub-pixel container would be a very
 * annoying bug to find. Setting the drawing buffer explicitly, rendering,
 * and reading back before yielding removes that whole class of problem.
 */
function CaptureFrame({ request, bounds, onCaptured, onFailed }: CaptureProps) {
  const { gl, scene, camera } = useThree();
  const capturedRef = useRef(false);

  useEffect(() => {
    if (!bounds || capturedRef.current) return;

    let cancelled = false;
    let frames = 0;
    let handle = 0;

    const capture = () => {
      if (cancelled || capturedRef.current) return;
      capturedRef.current = true;

      try {
        const { width, height, transparent, mimeType, quality } = request;

        // Exact pixels, independent of the container's layout size and of
        // the device pixel ratio.
        gl.setPixelRatio(1);
        gl.setSize(width, height, false);

        const perspective = camera as THREE.PerspectiveCamera;
        perspective.fov = EXPORT_FOV_DEGREES;
        perspective.aspect = width / height;
        perspective.near = 0.05;
        perspective.far = 20;

        // Framed for the *export's* aspect ratio, not the Studio's, so a
        // 9:16 export is composed for 9:16 rather than being a cropped or
        // stretched 16:9. `frameGarment` fits to whichever of the two fields
        // of view is tighter, so the garment stays fully visible on very
        // tall and very wide outputs alike.
        const framed = frameGarment(
          bounds,
          request.cameraPreset,
          EXPORT_FOV_DEGREES,
          width / height,
        );
        perspective.position.copy(framed.position);
        perspective.lookAt(framed.target);
        perspective.updateProjectionMatrix();
        perspective.updateMatrixWorld(true);

        if (transparent) {
          gl.setClearColor(0x000000, 0);
        } else {
          gl.setClearColor(OPAQUE_CLEAR_COLOR, 1);
        }

        gl.render(scene, perspective);

        const canvas = gl.domElement;
        if (canvas.width !== width || canvas.height !== height) {
          throw new Error(
            `Export rendered at ${canvas.width}×${canvas.height} instead of ${width}×${height}.`,
          );
        }

        canvas.toBlob(
          (blob) => {
            if (cancelled) return;
            if (!blob) {
              onFailed(new Error('The browser could not encode the exported image.'));
              return;
            }
            if (blob.type !== mimeType) {
              // `toBlob` silently falls back to PNG for a MIME type it
              // cannot encode. Downloading that as `.webp` would hand the
              // user a file that looks corrupt.
              onFailed(
                new Error(
                  `The browser encoded ${blob.type || 'an unknown format'}, not ${mimeType}.`,
                ),
              );
              return;
            }
            onCaptured(blob);
          },
          mimeType,
          quality,
        );
      } catch (error) {
        onFailed(error instanceof Error ? error : new Error('Export rendering failed.'));
      }
    };

    // Let the artwork overlays' texture uploads and the material's weave
    // land before reading the framebuffer back.
    const step = () => {
      if (cancelled) return;
      frames += 1;
      if (frames >= SETTLE_FRAMES) capture();
      else handle = requestAnimationFrame(step);
    };
    handle = requestAnimationFrame(step);

    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
    };
  }, [bounds, request, gl, scene, camera, onCaptured, onFailed]);

  return null;
}

function ExportCanvas({
  request,
  onCaptured,
  onFailed,
}: {
  request: GarmentImageRequest;
  onCaptured: (blob: Blob) => void;
  onFailed: (error: Error) => void;
}) {
  const [bounds, setBounds] = useState<GarmentBounds | null>(null);

  return (
    <Canvas
      // Never animated — one frame is rendered on demand and read back.
      frameloop="never"
      // Exact output pixels: a device pixel ratio has no business deciding
      // how large an exported file is.
      dpr={1}
      gl={{
        antialias: true,
        // `preserveDrawingBuffer` is set *here only*. The interactive Studio
        // keeps its default, because forcing it globally would cost every
        // frame of every session to make one-shot capture convenient.
        preserveDrawingBuffer: true,
        alpha: request.transparent,
      }}
      camera={{ fov: EXPORT_FOV_DEGREES, near: 0.05, far: 20 }}
      onCreated={({ gl }) => {
        gl.setClearColor(
          request.transparent ? 0x000000 : OPAQUE_CLEAR_COLOR,
          request.transparent ? 0 : 1,
        );
      }}
    >
      <GarmentScene
        manifest={request.manifest}
        colorHex={request.colorHex}
        material={request.material}
        artworkLayers={request.artworkLayers}
        onBoundsReady={setBounds}
        backdrop={!request.transparent}
      />
      <CaptureFrame request={request} bounds={bounds} onCaptured={onCaptured} onFailed={onFailed} />
    </Canvas>
  );
}

/**
 * Renders one garment image off-screen and resolves with its encoded bytes.
 *
 * The React tree, its canvas and its WebGL context exist only for the
 * duration of the call: the container is removed and the root unmounted in a
 * `finally`, which is what lets R3F dispose the renderer and its resources.
 * Exporting repeatedly therefore settles rather than accumulating contexts —
 * browsers cap how many WebGL contexts a page may hold, and leaking them
 * eventually kills the Studio's own canvas.
 */
export async function renderGarmentImage(request: GarmentImageRequest): Promise<Blob> {
  if (typeof document === 'undefined') {
    throw new Error('Exporting requires a browser.');
  }

  const container = document.createElement('div');
  // Off-screen rather than hidden: `display: none` gives the canvas a zero
  // size and some browsers decline to render into it at all.
  container.setAttribute('aria-hidden', 'true');
  container.style.cssText = [
    'position:fixed',
    'left:-20000px',
    'top:0',
    `width:${request.width}px`,
    `height:${request.height}px`,
    'pointer-events:none',
    'opacity:0',
  ].join(';');
  document.body.appendChild(container);

  const root: Root = createRoot(container);

  try {
    return await new Promise<Blob>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('The export timed out before the garment finished rendering.'));
      }, request.timeoutMs ?? DEFAULT_TIMEOUT_MS);

      const settle = (fn: () => void) => {
        clearTimeout(timeout);
        fn();
      };

      root.render(
        <ExportCanvas
          request={request}
          onCaptured={(blob) => settle(() => resolve(blob))}
          onFailed={(error) => settle(() => reject(error))}
        />,
      );
    });
  } finally {
    // Unmounting synchronously from inside React's own commit is not
    // allowed, so this is deferred a tick — by which point the promise has
    // already settled and the caller has the bytes.
    setTimeout(() => {
      root.unmount();
      container.remove();
    }, 0);
  }
}
