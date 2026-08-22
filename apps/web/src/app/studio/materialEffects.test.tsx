import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as GarmentRuntimeModule from '@threadform/garment-runtime';
import { resetLocalStorage } from '@/test-utils/resetStorage';
import { ESSENTIAL_TEE_MANIFEST } from '@/test-utils/garmentFixture';
import { installBrowserImageStubs, pngFile } from '@/test-utils/artworkFixtures';
import StudioPage from './page';

/**
 * Garment material and print effects, from the Studio controls down through
 * `project-engine` and IndexedDB.
 *
 * The 3D canvas is stubbed (jsdom has no WebGL), but the stub records the
 * *resolved* material and effects it would render — which is what the two
 * new engines exist to produce. These tests therefore fail if the Studio
 * stops feeding the renderer correctly, while making no claim about the
 * pixels: whether cotton and jersey actually look different, and whether
 * embroidery differs from screen print, is measured against a real WebGL
 * canvas in `apps/web/e2e/materialEffects.spec.ts`.
 */

interface StubMaterial {
  materialId: string;
  roughness: number;
  normalScale: number;
  weave: string;
  substituted: boolean;
}

interface StubLayer {
  id: string;
  zoneId: string;
  effect: {
    kind: string;
    intensity: number;
    reliefScale: number;
    parameters: Record<string, number>;
  } | null;
}

const canvasSpy = vi.fn<(material: StubMaterial, layers: StubLayer[]) => void>();

vi.mock('@threadform/3d-engine', () => ({
  StudioGarmentCanvas: ({
    manifest,
    material,
    artworkLayers,
  }: {
    manifest: { name: string };
    material: StubMaterial;
    artworkLayers: StubLayer[];
  }) => {
    canvasSpy(material, artworkLayers);
    return (
      <div data-testid="garment-canvas-stub" data-material={material.materialId}>
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

beforeEach(async () => {
  await resetLocalStorage();
  canvasSpy.mockClear();
  installBrowserImageStubs();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastMaterial(): StubMaterial {
  const call = canvasSpy.mock.calls.at(-1);
  if (!call) throw new Error('the canvas has not rendered');
  return call[0];
}

function lastLayers(): StubLayer[] {
  return canvasSpy.mock.calls.at(-1)?.[1] ?? [];
}

async function openStudio() {
  render(<StudioPage />);
  await waitFor(() => {
    expect(screen.queryAllByText(/loading your studio/i)).toHaveLength(0);
  });
  await userEvent.click(screen.getAllByRole('button', { name: 'ThreadForm Essential Tee' })[0]!);
  await waitFor(() => screen.getAllByTestId('garment-canvas-stub')[0]);
}

async function openArtworkTool() {
  await userEvent.click(screen.getAllByRole('button', { name: 'Artwork' })[0]!);
  await waitFor(() => screen.getAllByLabelText(/add artwork/i)[0]);
}

describe('Studio material', () => {
  it('starts on cotton and renders it', async () => {
    await openStudio();
    expect(lastMaterial().materialId).toBe('cotton');
    expect(lastMaterial().substituted).toBe(false);
    expect(screen.getAllByRole('button', { name: /Jersey/ }).length).toBeGreaterThan(0);
  });

  it('switches fabric and hands the renderer a different surface', async () => {
    await openStudio();
    const cotton = lastMaterial();

    await userEvent.click(screen.getAllByRole('button', { name: /Jersey/ })[0]!);

    await waitFor(() => expect(lastMaterial().materialId).toBe('jersey'));
    const jersey = lastMaterial();
    // Not just a different label — a different surface.
    expect(jersey.weave).not.toBe(cotton.weave);
    expect(jersey.roughness).not.toBeCloseTo(cotton.roughness);
  });

  it('marks the active fabric with aria-pressed', async () => {
    await openStudio();
    const jersey = screen.getAllByRole('button', { name: /Jersey/ })[0]!;
    expect(jersey).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(jersey);
    await waitFor(() => expect(jersey).toHaveAttribute('aria-pressed', 'true'));
  });

  // `MaterialId` names nine fabrics; the garment declares two.
  it('offers only the fabrics the garment supports', async () => {
    await openStudio();
    for (const absent of ['Denim', 'Fleece', 'Nylon', 'Mesh', 'Polyester']) {
      expect(screen.queryAllByRole('button', { name: new RegExp(absent, 'i') })).toHaveLength(0);
    }
  });

  it('keeps the garment colour when the fabric changes', async () => {
    await openStudio();
    await userEvent.click(screen.getAllByRole('button', { name: 'Navy' })[0]!);
    await userEvent.click(screen.getAllByRole('button', { name: /Jersey/ })[0]!);

    await waitFor(() => expect(lastMaterial().materialId).toBe('jersey'));
    expect(screen.getAllByRole('button', { name: 'Navy' })[0]).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('restores the fabric after a reload', async () => {
    await openStudio();
    await userEvent.click(screen.getAllByRole('button', { name: /Jersey/ })[0]!);
    await waitFor(() => expect(lastMaterial().materialId).toBe('jersey'));

    await new Promise((resolve) => setTimeout(resolve, 900));
    cleanup();
    canvasSpy.mockClear();

    render(<StudioPage />);
    await waitFor(() => {
      expect(screen.queryAllByText(/loading your studio/i)).toHaveLength(0);
    });
    await waitFor(() => expect(lastMaterial().materialId).toBe('jersey'));
    expect(screen.getAllByRole('button', { name: /Jersey/ })[0]).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }, 15000);
});

describe('Studio print effects', () => {
  async function addArtwork() {
    await userEvent.upload(
      screen.getAllByLabelText(/add artwork/i)[0] as HTMLInputElement,
      pngFile('Mark.png', 400, 400),
    );
    await waitFor(() => expect(lastLayers()).toHaveLength(1));
  }

  it('starts a new print untreated', async () => {
    await openStudio();
    await openArtworkTool();
    await addArtwork();
    expect(lastLayers()[0]!.effect).toBeNull();
    expect(screen.getAllByRole('button', { name: 'None' })[0]).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('applies screen print and embroidery as different resolved treatments', async () => {
    await openStudio();
    await openArtworkTool();
    await addArtwork();

    await userEvent.click(screen.getAllByRole('button', { name: /Screen print/ })[0]!);
    await waitFor(() => expect(lastLayers()[0]!.effect?.kind).toBe('screen-print'));
    const ink = lastLayers()[0]!.effect!;

    await userEvent.click(screen.getAllByRole('button', { name: /Embroidery/ })[0]!);
    await waitFor(() => expect(lastLayers()[0]!.effect?.kind).toBe('embroidery'));
    const thread = lastLayers()[0]!.effect!;

    // Different processes, not one surface behind two names.
    expect(thread.reliefScale).toBeGreaterThan(ink.reliefScale * 3);
  });

  it('exposes an intensity control labelled for the process', async () => {
    await openStudio();
    await openArtworkTool();
    await addArtwork();

    await userEvent.click(screen.getAllByRole('button', { name: /Embroidery/ })[0]!);
    await waitFor(() => screen.getAllByLabelText('Stitch relief')[0]);

    await userEvent.click(screen.getAllByRole('button', { name: /Screen print/ })[0]!);
    await waitFor(() => screen.getAllByLabelText('Ink weight')[0]);
    // The embroidery-only control is gone, not left inert.
    expect(screen.queryAllByLabelText('Stitch relief')).toHaveLength(0);
  });

  it('shows a parameter only for the effect that declares one', async () => {
    await openStudio();
    await openArtworkTool();
    await addArtwork();

    await userEvent.click(screen.getAllByRole('button', { name: /Screen print/ })[0]!);
    await waitFor(() => screen.getAllByLabelText('Ink weight')[0]);
    expect(screen.queryAllByLabelText('Stitch angle')).toHaveLength(0);

    await userEvent.click(screen.getAllByRole('button', { name: /Embroidery/ })[0]!);
    await waitFor(() => expect(screen.getAllByLabelText('Stitch angle').length).toBeGreaterThan(0));
  });

  it('clears an effect back to an untreated print', async () => {
    await openStudio();
    await openArtworkTool();
    await addArtwork();

    await userEvent.click(screen.getAllByRole('button', { name: /Embroidery/ })[0]!);
    await waitFor(() => expect(lastLayers()[0]!.effect?.kind).toBe('embroidery'));

    await userEvent.click(screen.getAllByRole('button', { name: 'None' })[0]!);
    await waitFor(() => expect(lastLayers()[0]!.effect).toBeNull());
    expect(screen.queryAllByLabelText('Stitch relief')).toHaveLength(0);
  });

  // `EffectKind` names sixteen processes; the garment declares two.
  it('offers only the processes the garment supports', async () => {
    await openStudio();
    await openArtworkTool();
    await addArtwork();
    for (const absent of ['Puff', 'Foil', 'Metallic', 'Distressed', 'Acid']) {
      expect(screen.queryAllByRole('button', { name: new RegExp(absent, 'i') })).toHaveLength(0);
    }
  });

  it('restores the effect and its intensity after a reload', async () => {
    await openStudio();
    await openArtworkTool();
    await addArtwork();

    await userEvent.click(screen.getAllByRole('button', { name: /Embroidery/ })[0]!);
    await waitFor(() => expect(lastLayers()[0]!.effect?.kind).toBe('embroidery'));
    const intensityBefore = lastLayers()[0]!.effect!.intensity;

    await new Promise((resolve) => setTimeout(resolve, 900));
    cleanup();
    canvasSpy.mockClear();

    render(<StudioPage />);
    await waitFor(() => {
      expect(screen.queryAllByText(/loading your studio/i)).toHaveLength(0);
    });
    await waitFor(() => expect(lastLayers()).toHaveLength(1));

    expect(lastLayers()[0]!.effect?.kind).toBe('embroidery');
    expect(lastLayers()[0]!.effect?.intensity).toBeCloseTo(intensityBefore);
  }, 15000);

  // Two layers in a zone each keep their own treatment; M03's stacking must
  // still hold.
  it('keeps per-layer effects independent', async () => {
    await openStudio();
    await openArtworkTool();
    await addArtwork();
    await userEvent.click(screen.getAllByRole('button', { name: /Embroidery/ })[0]!);
    await waitFor(() => expect(lastLayers()[0]!.effect?.kind).toBe('embroidery'));

    await userEvent.upload(
      screen.getAllByLabelText(/add artwork/i)[0] as HTMLInputElement,
      pngFile('Second.png', 400, 400),
    );
    await waitFor(() => expect(lastLayers()).toHaveLength(2));
    await userEvent.click(screen.getAllByRole('button', { name: /Screen print/ })[0]!);

    await waitFor(() => {
      const kinds = lastLayers()
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((layer) => layer.effect?.kind ?? 'none');
      expect(new Set(kinds)).toEqual(new Set(['embroidery', 'screen-print']));
    });
  });

  it('removes a layer effect along with the layer', async () => {
    await openStudio();
    await openArtworkTool();
    await addArtwork();
    await userEvent.click(screen.getAllByRole('button', { name: /Embroidery/ })[0]!);
    await waitFor(() => expect(lastLayers()[0]!.effect?.kind).toBe('embroidery'));

    await userEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]!);
    await waitFor(() => expect(lastLayers()).toHaveLength(0));

    // The orphaned configuration is gone from the document, not just unlinked.
    const { loadProject } = await import('@threadform/local-storage');
    await new Promise((resolve) => setTimeout(resolve, 900));
    const summaries = await (await import('@threadform/local-storage')).listProjectSummaries();
    const reloaded = await loadProject(summaries[0]!.id);
    expect(reloaded.effects).toHaveLength(0);
  }, 15000);
});
