import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as GarmentRuntimeModule from '@threadform/garment-runtime';
import { resetLocalStorage } from '@/test-utils/resetStorage';
import { ESSENTIAL_TEE_MANIFEST } from '@/test-utils/garmentFixture';
import { installBrowserImageStubs, pngFile } from '@/test-utils/artworkFixtures';
import StudioPage from './page';

/**
 * The export panel, from the Studio controls down through `project-engine`
 * and IndexedDB.
 *
 * These tests own the parts that are decisions rather than pixels: which
 * dimensions a setting computes to, whether a setting survives a reload,
 * whether an impossible size is refused with a reason, and whether the
 * render request carries the persisted camera rather than something else.
 * They make no claim about the resulting file — that the bytes are a real
 * PNG of a real garment at the stated size is measured against a real
 * browser in `apps/web/e2e/export.spec.ts`, which decodes what was actually
 * downloaded.
 */

interface RenderRequest {
  width: number;
  height: number;
  transparent: boolean;
  mimeType: string;
  quality?: number;
  cameraPreset: { id: string };
  artworkLayers: unknown[];
  colorHex: string;
}

const renderSpy = vi.fn<(request: RenderRequest) => void>();
let renderResult: { ok: true } | { ok: false; message: string } = { ok: true };

vi.mock('@threadform/3d-engine', () => ({
  StudioGarmentCanvas: ({ manifest }: { manifest: { name: string } }) => (
    <div data-testid="garment-canvas-stub">Rendering {manifest.name}</div>
  ),
  renderGarmentImage: (request: RenderRequest) => {
    renderSpy(request);
    if (!renderResult.ok) return Promise.reject(new Error(renderResult.message));
    // A byte or two is enough: nothing here inspects the image, and the
    // real file is decoded in the E2E suite instead.
    return Promise.resolve(new Blob([new Uint8Array([1, 2, 3])], { type: request.mimeType }));
  },
}));

vi.mock('@threadform/garment-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof GarmentRuntimeModule>();
  return {
    ...actual,
    loadManifest: vi.fn().mockResolvedValue({ success: true, manifest: ESSENTIAL_TEE_MANIFEST }),
  };
});

const downloads: Array<{ filename: string; size: number }> = [];
let anchorClick: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(async () => {
  await resetLocalStorage();
  renderSpy.mockClear();
  downloads.length = 0;
  renderResult = { ok: true };
  installBrowserImageStubs();

  // jsdom ships no canvas encoder at all, so the format-capability probe
  // would refuse JPG and WebP and no lossy export could reach the renderer
  // here. Stand in a canvas that honours what it is asked for; whether a
  // real browser can encode WebP is a browser question, and the E2E suite
  // answers it against the downloaded bytes.
  HTMLCanvasElement.prototype.toBlob = function toBlob(
    callback: BlobCallback,
    type?: string,
  ): void {
    callback(new Blob([new Uint8Array([0])], { type: type ?? 'image/png' }));
  };

  // jsdom has no download mechanism; record what would have been saved.
  anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    if (this.download) downloads.push({ filename: this.download, size: 0 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  // Restore this one spy by hand rather than calling `vi.restoreAllMocks`:
  // that also resets the module-level `loadManifest` mock's implementation,
  // leaving every test after the first with no garment to export.
  anchorClick?.mockRestore();
  anchorClick = null;
});

async function openStudio() {
  render(<StudioPage />);
  await waitFor(() => {
    expect(screen.queryAllByText(/loading your studio/i)).toHaveLength(0);
  });
  await userEvent.click(screen.getAllByRole('button', { name: 'ThreadForm Essential Tee' })[0]!);
  await waitFor(() => screen.getAllByTestId('garment-canvas-stub')[0]);
}

/**
 * The Studio renders a desktop inspector and a mobile sheet at once and
 * toggles them with CSS breakpoints, which jsdom does not apply — so both
 * copies are in the DOM and every query takes the first match.
 */
const button = (name: string | RegExp) => screen.getAllByRole('button', { name })[0]!;

async function openExportTool() {
  await userEvent.click(button('Export'));
  await waitFor(() => screen.getAllByTestId('export-dimensions')[0]);
}

const dimensions = () => screen.getAllByTestId('export-dimensions')[0]!.textContent;

async function addArtwork() {
  await userEvent.click(button('Artwork'));
  const input = screen.getAllByLabelText(/add artwork/i)[0]! as HTMLInputElement;
  await userEvent.upload(input, pngFile('Chest Mark.png'));
  // The layer takes its name from the file, minus the extension.
  await waitFor(() =>
    expect(screen.getAllByRole('button', { name: /Chest Mark/ }).length).toBeGreaterThan(0),
  );
}

describe('Studio export — computed output size', () => {
  it('opens on a square 1080p export and says exactly how big that is', async () => {
    await openStudio();
    await openExportTool();
    expect(dimensions()).toBe('1080 × 1080 px');
  });

  /**
   * The rule the whole dimension module exists to enforce: a tier names the
   * *short* edge, so the same tier is 1080 wide in portrait and 1080 tall in
   * landscape.
   */
  it('applies the resolution tier to the short edge, whichever edge that is', async () => {
    await openStudio();
    await openExportTool();

    await userEvent.click(button('9:16'));
    await waitFor(() => expect(dimensions()).toBe('1080 × 1920 px'));

    await userEvent.click(button('16:9'));
    await waitFor(() => expect(dimensions()).toBe('1920 × 1080 px'));

    await userEvent.click(button('4K'));
    await waitFor(() => expect(dimensions()).toBe('3840 × 2160 px'));
  });

  it('applies a target preset as ordinary ratio and tier settings', async () => {
    await openStudio();
    await openExportTool();

    await userEvent.click(button('Instagram story'));
    await waitFor(() => expect(dimensions()).toBe('1080 × 1920 px'));
    // Not a mode: the individual controls now show the preset's own values.
    expect(button('9:16')).toHaveAttribute('aria-pressed', 'true');
    expect(button('1080p')).toHaveAttribute('aria-pressed', 'true');
  });

  it('re-points the target when an edit no longer matches the preset', async () => {
    await openStudio();
    await openExportTool();

    await userEvent.click(button('Instagram story'));
    await waitFor(() => expect(button('Instagram story')).toHaveAttribute('aria-pressed', 'true'));

    await userEvent.click(button('720p'));
    await waitFor(() => expect(button('Instagram story')).toHaveAttribute('aria-pressed', 'false'));
    expect(button('Custom')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Studio export — custom dimensions', () => {
  it('takes an explicit size and ignores the resolution tier entirely', async () => {
    await openStudio();
    await openExportTool();

    await userEvent.click(button('Custom size'));
    const width = screen.getAllByLabelText('Width')[0]!;
    await userEvent.clear(width);
    await userEvent.type(width, '1234');
    await waitFor(() => expect(dimensions()).toBe('1234 × 1080 px'));

    // There is no tier control while a custom size is active, because a
    // custom size is the final output size, not a shape to be scaled.
    expect(screen.queryAllByRole('button', { name: '4K' })).toHaveLength(0);
  });

  it('refuses an impossible size with a specific reason, and recovers', async () => {
    await openStudio();
    await openExportTool();

    await userEvent.click(button('Custom size'));
    const width = screen.getAllByLabelText('Width')[0]!;
    await userEvent.clear(width);

    await waitFor(() => expect(dimensions()).toBe('—'));
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(/\d/);
    expect(button(/Export image/)).toBeDisabled();

    // The project is not poisoned by a mid-keystroke value: typing on
    // restores a working export.
    await userEvent.type(width, '900');
    await waitFor(() => expect(dimensions()).toBe('900 × 1080 px'));
    expect(button(/Export image/)).toBeEnabled();
  });

  it('refuses a size past the ceiling rather than attempting it', async () => {
    await openStudio();
    await openExportTool();

    await userEvent.click(button('Custom size'));
    const width = screen.getAllByLabelText('Width')[0]!;
    await userEvent.clear(width);
    await userEvent.type(width, '99999');

    await waitFor(() => expect(dimensions()).toBe('—'));
    expect(button(/Export image/)).toBeDisabled();
    expect(renderSpy).not.toHaveBeenCalled();
  });
});

describe('Studio export — running a job', () => {
  it('renders at the stated size and downloads a deterministically named file', async () => {
    await openStudio();
    await openExportTool();
    await userEvent.click(button('9:16'));
    await waitFor(() => expect(dimensions()).toBe('1080 × 1920 px'));

    await userEvent.click(button(/Export image/));

    await waitFor(() => expect(renderSpy).toHaveBeenCalledTimes(1));
    const request = renderSpy.mock.calls[0]![0];
    expect(request.width).toBe(1080);
    expect(request.height).toBe(1920);
    expect(request.mimeType).toBe('image/png');
    expect(request.transparent).toBe(false);

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]!.filename).toMatch(/^threadform-.*-1080x1920\.png$/);
    // No timestamp: re-exporting the same project at the same settings has
    // to overwrite rather than pile up "(1)" copies.
    expect(downloads[0]!.filename).not.toMatch(/\d{4}-\d{2}-\d{2}|\d{10,}/);
  });

  it('asks the renderer for real transparency, not a dark rectangle', async () => {
    await openStudio();
    await openExportTool();

    await userEvent.click(button(/PNG \(transparent\)/));
    await userEvent.click(button(/Export image/));

    await waitFor(() => expect(renderSpy).toHaveBeenCalledTimes(1));
    expect(renderSpy.mock.calls[0]![0].transparent).toBe(true);
    expect(renderSpy.mock.calls[0]![0].mimeType).toBe('image/png');
  });

  it('sends a quality only for the lossy formats', async () => {
    await openStudio();
    await openExportTool();

    await userEvent.click(button('JPG'));
    await userEvent.click(button(/Export image/));
    await waitFor(() => expect(renderSpy).toHaveBeenCalledTimes(1));
    expect(renderSpy.mock.calls[0]![0].mimeType).toBe('image/jpeg');
    expect(renderSpy.mock.calls[0]![0].quality).toBeGreaterThan(0);

    await userEvent.click(button('PNG'));
    await userEvent.click(button(/Export image/));
    await waitFor(() => expect(renderSpy).toHaveBeenCalledTimes(2));
    expect(renderSpy.mock.calls[1]![0].quality).toBeUndefined();
  });

  /**
   * The camera is a persisted project value, not live viewport state, so an
   * export does not depend on where someone left the mouse.
   */
  it('renders from the persisted camera preset', async () => {
    await openStudio();
    await userEvent.click(button('View'));
    await userEvent.click(button(/^Back$/));

    await openExportTool();
    await userEvent.click(button(/Export image/));

    await waitFor(() => expect(renderSpy).toHaveBeenCalledTimes(1));
    expect(renderSpy.mock.calls[0]![0].cameraPreset.id).toBe('back');
  });

  it('reports a failed render without leaving the panel stuck', async () => {
    renderResult = { ok: false, message: 'WebGL context lost' };
    await openStudio();
    await openExportTool();

    await userEvent.click(button(/Export image/));

    await waitFor(() => expect(screen.getAllByRole('alert')[0]).toHaveTextContent(/WebGL/));
    expect(downloads).toHaveLength(0);
    // Still usable: the button comes back rather than staying in "Exporting…".
    await waitFor(() => expect(button(/Export image/)).toBeEnabled());
  });

  it('carries the artwork through to the render request', async () => {
    await openStudio();
    await addArtwork();
    await openExportTool();

    await userEvent.click(button(/Export image/));

    await waitFor(() => expect(renderSpy).toHaveBeenCalledTimes(1));
    expect(renderSpy.mock.calls[0]![0].artworkLayers.length).toBe(1);
  });
});

describe('Studio export — persistence', () => {
  it('keeps export settings across a reload', async () => {
    await openStudio();
    await openExportTool();
    await userEvent.click(button('4:5'));
    await userEvent.click(button('1440p'));
    await waitFor(() => expect(dimensions()).toBe('1440 × 1800 px'));

    // The autosave debounce has to land before the project is re-read.
    await waitFor(() => expect(screen.getAllByRole('status')[0]).toHaveTextContent(/saved/i), {
      timeout: 4000,
    });

    screen.getAllByTestId('garment-canvas-stub')[0]!.remove();
    render(<StudioPage />);
    await waitFor(() => {
      expect(screen.queryAllByText(/loading your studio/i)).toHaveLength(0);
    });
    await waitFor(() => screen.getAllByTestId('garment-canvas-stub')[0]);
    await openExportTool();

    await waitFor(() => expect(dimensions()).toBe('1440 × 1800 px'));
  });
});
