import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { listArtworkBlobIds } from '@threadform/local-storage';
import { DEFAULT_ARTWORK_ZONE_COVERAGE } from '@threadform/project-engine';
import type * as GarmentRuntimeModule from '@threadform/garment-runtime';
import { resetLocalStorage } from '@/test-utils/resetStorage';
import { ESSENTIAL_TEE_MANIFEST } from '@/test-utils/garmentFixture';
import { installBrowserImageStubs, pngFile, svgFile } from '@/test-utils/artworkFixtures';
import type { ObjectUrlLedger } from '@/test-utils/artworkFixtures';
import StudioPage from './page';

/**
 * The artwork flow from the UI down through `project-engine` and IndexedDB.
 *
 * The 3D canvas is stubbed here (jsdom has no WebGL), but the stub records
 * exactly what the renderer *would* be given — which layers, in which zone,
 * with which transform — so these tests fail if the Studio stops feeding the
 * renderer correctly. They deliberately do not claim anything about the
 * rendered pixels: that is verified against a real WebGL canvas in
 * `apps/web/e2e/smoke.spec.ts`.
 *
 * As in the other Studio tests, both the desktop and mobile layouts exist in
 * the DOM at once (jsdom applies no CSS), so locators take the first match.
 */

interface StubLayer {
  id: string;
  zoneId: string;
  transform: {
    position: { x: number; y: number };
    rotationDegrees: number;
    scale: { x: number; y: number };
  };
  opacity: number;
}

const canvasSpy = vi.fn<(layers: StubLayer[]) => void>();

vi.mock('@threadform/3d-engine', () => ({
  StudioGarmentCanvas: ({
    manifest,
    colorHex,
    artworkLayers,
  }: {
    manifest: { name: string };
    colorHex: string;
    artworkLayers: StubLayer[];
  }) => {
    canvasSpy(artworkLayers);
    return (
      <div
        data-testid="garment-canvas-stub"
        data-color={colorHex}
        data-artwork-count={artworkLayers.length}
        data-artwork-zones={artworkLayers.map((layer) => layer.zoneId).join(',')}
      >
        Rendering {manifest.name}
      </div>
    );
  },
}));

vi.mock('@threadform/garment-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof GarmentRuntimeModule>();
  return {
    ...actual,
    loadManifest: vi.fn().mockResolvedValue({ success: true, manifest: ESSENTIAL_TEE_MANIFEST }),
  };
});

let urls: ObjectUrlLedger;

beforeEach(async () => {
  await resetLocalStorage();
  canvasSpy.mockClear();
  urls = installBrowserImageStubs();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastRenderedLayers(): StubLayer[] {
  const call = canvasSpy.mock.calls.at(-1);
  return call ? call[0] : [];
}

async function openArtworkTool() {
  render(<StudioPage />);
  await waitFor(() => {
    expect(screen.queryAllByText(/loading your studio/i)).toHaveLength(0);
  });
  await userEvent.click(screen.getAllByRole('button', { name: 'ThreadForm Essential Tee' })[0]!);
  await waitFor(() => screen.getAllByTestId('garment-canvas-stub')[0]);
  await userEvent.click(screen.getAllByRole('button', { name: 'Artwork' })[0]!);
  await waitFor(() => screen.getAllByLabelText(/add artwork/i)[0]);
}

function addArtworkInput(): HTMLInputElement {
  return screen.getAllByLabelText(/add artwork/i)[0] as HTMLInputElement;
}

async function uploadArtwork(file: File) {
  await userEvent.upload(addArtworkInput(), file);
}

/**
 * jsdom does not implement `<input type="range">` keyboard interaction (it
 * warns "the result of this interaction is unreliable"), so the sliders are
 * driven by their change event here. Real keyboard operability of the
 * placement sliders is a browser behaviour and is checked in the browser —
 * see the accessibility pass recorded in STATUS.md.
 */
function dragSlider(label: string, value: number) {
  const slider = screen.getAllByLabelText(label)[0] as HTMLInputElement;
  fireEvent.change(slider, { target: { value: String(value) } });
  return slider;
}

describe('Studio artwork — importing', () => {
  it('imports a real file, stores it, adds a layer and hands it to the renderer', async () => {
    await openArtworkTool();
    expect(lastRenderedLayers()).toHaveLength(0);

    await uploadArtwork(pngFile('Chest Mark.png', 600, 600));

    // The layer list names the artwork after the file.
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Chest Mark/ }).length).toBeGreaterThan(0);
    });

    await waitFor(() => expect(lastRenderedLayers()).toHaveLength(1));
    const [layer] = lastRenderedLayers();
    expect(layer?.zoneId).toBe('front');
    // A newly imported artwork is centered and sized to a confident share of
    // the garment's declared print area.
    expect(layer?.transform.position).toEqual({ x: 0.5, y: 0.5 });
    expect(layer?.transform.scale.x).toBeCloseTo(
      ESSENTIAL_TEE_MANIFEST.printZones[0]!.maxWidth * DEFAULT_ARTWORK_ZONE_COVERAGE,
    );

    // The bytes went to the artwork store, not into the project document.
    expect(await listArtworkBlobIds()).toHaveLength(1);
  });

  it('imports an SVG, storing sanitized markup rather than what was uploaded', async () => {
    await openArtworkTool();

    const hostile =
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><script>alert(1)</script><rect width="200" height="200" fill="#ff00aa"/></svg>';
    await uploadArtwork(svgFile(hostile, 'Hostile Mark.svg'));

    await waitFor(() => expect(lastRenderedLayers()).toHaveLength(1));

    const { loadArtworkBlob } = await import('@threadform/local-storage');
    const [blobId] = await listArtworkBlobIds();
    const stored = await loadArtworkBlob(blobId!);
    const markup = await stored!.blob.text();
    expect(markup).not.toContain('script');
    expect(markup).toContain('#ff00aa');
  });
});

describe('Studio artwork — rejecting bad input', () => {
  it('rejects a file whose bytes are not an image, however it is named', async () => {
    await openArtworkTool();

    // A text file with a .png name and an image/png MIME type — exactly the
    // shape of input that a filename- or MIME-based check would accept.
    const disguised = new File(['not actually a png at all'], 'logo.png', { type: 'image/png' });
    await uploadArtwork(disguised);

    const alert = await screen.findAllByRole('alert');
    expect(alert[0]).toHaveTextContent(/supported image/i);
    expect(lastRenderedLayers()).toHaveLength(0);
    expect(await listArtworkBlobIds()).toHaveLength(0);
  });

  it('rejects an image whose declared dimensions are a decompression bomb', async () => {
    await openArtworkTool();
    await uploadArtwork(pngFile('bomb.png', 30000, 30000));

    const alert = await screen.findAllByRole('alert');
    expect(alert[0]).toHaveTextContent(/8192 pixels/);
    expect(await listArtworkBlobIds()).toHaveLength(0);
  });

  it('lets the user retry with a good file after a rejection', async () => {
    await openArtworkTool();
    await uploadArtwork(new File(['nope'], 'logo.png', { type: 'image/png' }));
    await screen.findAllByRole('alert');

    await uploadArtwork(pngFile('Good Mark.png'));
    await waitFor(() => expect(lastRenderedLayers()).toHaveLength(1));
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });
});

describe('Studio artwork — placement', () => {
  it('resizes, rotates and moves a layer, clamping it inside the print zone', async () => {
    await openArtworkTool();
    await uploadArtwork(pngFile('Mark.png', 400, 400));
    await waitFor(() => expect(lastRenderedLayers()).toHaveLength(1));

    dragSlider('Size', 30);
    await waitFor(() => {
      expect(lastRenderedLayers()[0]!.transform.scale.x).toBeCloseTo(0.3);
      // Aspect-locked: a square image stays square.
      expect(lastRenderedLayers()[0]!.transform.scale.y).toBeCloseTo(0.3);
    });

    dragSlider('Rotation', 15);
    await waitFor(() => {
      expect(lastRenderedLayers()[0]!.transform.rotationDegrees).toBe(15);
    });

    // Push the artwork hard against the right edge; the domain must clamp it
    // to where its own rotated bounding box still fits inside the zone.
    dragSlider('Horizontal', 100);
    await waitFor(() => {
      const { position } = lastRenderedLayers()[0]!.transform;
      expect(position.x).toBeGreaterThan(0.5);
      expect(position.x).toBeLessThan(1);
    });
  });

  it('recenters a moved layer', async () => {
    await openArtworkTool();
    await uploadArtwork(pngFile('Mark.png'));
    await waitFor(() => expect(lastRenderedLayers()).toHaveLength(1));

    dragSlider('Vertical', 0);
    await waitFor(() => expect(lastRenderedLayers()[0]!.transform.position.y).toBeLessThan(0.5));

    await userEvent.click(screen.getAllByRole('button', { name: 'Center' })[0]!);
    await waitFor(() => {
      expect(lastRenderedLayers()[0]!.transform.position).toEqual({ x: 0.5, y: 0.5 });
    });
  });
});

describe('Studio artwork — print zones', () => {
  it('keeps front and back artwork independent', async () => {
    await openArtworkTool();
    await uploadArtwork(pngFile('Front Mark.png'));
    await waitFor(() => expect(lastRenderedLayers()).toHaveLength(1));

    await userEvent.click(screen.getAllByRole('button', { name: /^Back/ })[0]!);
    // The back zone starts empty even though the front has artwork.
    expect(screen.queryAllByRole('button', { name: /Front Mark/ })).toHaveLength(0);
    expect(screen.getAllByText(/nothing on the back yet/i).length).toBeGreaterThan(0);

    await uploadArtwork(pngFile('Back Mark.png'));
    await waitFor(() => expect(lastRenderedLayers()).toHaveLength(2));

    const zones = lastRenderedLayers()
      .map((layer) => layer.zoneId)
      .sort();
    expect(zones).toEqual(['back', 'front']);

    // Returning to the front finds its artwork exactly as it was left.
    await userEvent.click(screen.getAllByRole('button', { name: /^Front/ })[0]!);
    expect(screen.getAllByRole('button', { name: /Front Mark/ }).length).toBeGreaterThan(0);
    expect(lastRenderedLayers()).toHaveLength(2);
  });

  it('turns the garment to face the zone being edited', async () => {
    await openArtworkTool();
    await userEvent.click(screen.getAllByRole('button', { name: /^Back/ })[0]!);

    await userEvent.click(screen.getAllByRole('button', { name: 'View' })[0]!);
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Back' })[0]).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
  });
});

describe('Studio artwork — replace and remove', () => {
  it('replaces a layer artwork, re-fitting it and discarding the old file', async () => {
    await openArtworkTool();
    await uploadArtwork(pngFile('Square.png', 400, 400));
    await waitFor(() => expect(lastRenderedLayers()).toHaveLength(1));
    const originalBlobs = await listArtworkBlobIds();
    expect(originalBlobs).toHaveLength(1);

    await userEvent.upload(
      screen.getAllByLabelText(/replace artwork/i)[0] as HTMLInputElement,
      pngFile('Wide.png', 1600, 400),
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Wide/ }).length).toBeGreaterThan(0);
    });
    // Still one layer, and still one stored file — the replaced one is gone.
    expect(lastRenderedLayers()).toHaveLength(1);
    await waitFor(async () => {
      const blobs = await listArtworkBlobIds();
      expect(blobs).toHaveLength(1);
      expect(blobs[0]).not.toBe(originalBlobs[0]);
    });
  });

  it('removes a layer, its stored file, and its object URL', async () => {
    await openArtworkTool();
    await uploadArtwork(pngFile('Mark.png'));
    await waitFor(() => expect(lastRenderedLayers()).toHaveLength(1));
    expect(urls.outstanding().length).toBeGreaterThan(0);

    await userEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]!);

    await waitFor(() => expect(lastRenderedLayers()).toHaveLength(0));
    await waitFor(async () => expect(await listArtworkBlobIds()).toHaveLength(0));
    // No leaked object URL once nothing references the artwork any more.
    await waitFor(() => expect(urls.outstanding()).toHaveLength(0));
  });
});

describe('Studio artwork — persistence', () => {
  it('restores artwork and its placement after a reload', async () => {
    await openArtworkTool();
    await uploadArtwork(pngFile('Persisted Mark.png', 400, 400));
    await waitFor(() => expect(lastRenderedLayers()).toHaveLength(1));

    dragSlider('Rotation', 20);
    dragSlider('Size', 28);
    dragSlider('Vertical', 70);
    await waitFor(() => {
      const { rotationDegrees, scale } = lastRenderedLayers()[0]!.transform;
      expect(rotationDegrees).toBe(20);
      expect(scale.x).toBeCloseTo(0.28);
    });
    const placed = lastRenderedLayers()[0]!.transform;
    expect(placed.position.y).toBeGreaterThan(0.5);

    // Wait for the debounced autosave to land, then simulate a fresh visit.
    await new Promise((resolve) => setTimeout(resolve, 900));
    canvasSpy.mockClear();
    cleanup();

    render(<StudioPage />);
    await waitFor(() => {
      expect(screen.queryAllByText(/loading your studio/i)).toHaveLength(0);
    });
    await waitFor(() => expect(lastRenderedLayers()).toHaveLength(1));

    const restored = lastRenderedLayers()[0]!;
    expect(restored.zoneId).toBe('front');
    expect(restored.transform.rotationDegrees).toBe(placed.rotationDegrees);
    expect(restored.transform.scale.x).toBeCloseTo(placed.scale.x);
    expect(restored.transform.position).toEqual(placed.position);

    // The artwork is named as it was, and the file is still in storage.
    await userEvent.click(screen.getAllByRole('button', { name: 'Artwork' })[0]!);
    expect(screen.getAllByRole('button', { name: /Persisted Mark/ }).length).toBeGreaterThan(0);
    expect(await listArtworkBlobIds()).toHaveLength(1);
  }, 15000);

  it('surfaces an artwork layer whose stored file has gone missing, without breaking the project', async () => {
    await openArtworkTool();
    await uploadArtwork(pngFile('Orphan.png'));
    await waitFor(() => expect(lastRenderedLayers()).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 900));

    // Simulate storage eviction: the project still references a blob that
    // is no longer there.
    const { deleteArtworkBlob } = await import('@threadform/local-storage');
    for (const blobId of await listArtworkBlobIds()) await deleteArtworkBlob(blobId);

    cleanup();
    canvasSpy.mockClear();

    render(<StudioPage />);
    await waitFor(() => {
      expect(screen.queryAllByText(/loading your studio/i)).toHaveLength(0);
    });
    await userEvent.click(screen.getAllByRole('button', { name: 'Artwork' })[0]!);

    // The project opens, the layer is listed, and it says honestly that the
    // file is gone rather than rendering nothing with no explanation.
    const layerButton = (await screen.findAllByRole('button', { name: /Orphan/ }))[0]!;
    expect(within(layerButton).getByText(/file missing/i)).toBeInTheDocument();
    expect(lastRenderedLayers()).toHaveLength(0);
  }, 15000);
});
