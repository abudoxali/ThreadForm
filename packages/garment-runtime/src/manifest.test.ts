import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadManifest } from './manifest';

function validManifestPayload(overrides: Record<string, unknown> = {}) {
  return {
    garmentId: 'threadform-essential-tee',
    slug: 'threadform-essential-tee',
    version: '1.0.0',
    name: 'ThreadForm Essential Tee',
    category: 't-shirt',
    readiness: 'development',
    model: {
      reference: '/garments/threadform-essential-tee/model.glb',
      format: 'glb',
      scale: 1,
      orientationDegrees: { x: 0, y: 0, z: 0 },
      meshNaming: { front: 'Mesh_Front', back: 'Mesh_Back' },
    },
    defaultColor: '#f5f5f0',
    printZones: [
      {
        id: 'front',
        label: 'Front',
        maxWidth: 0.8,
        maxHeight: 0.9,
        uvRect: { x: 0.17, y: 0.4, width: 0.16, height: 0.42 },
        aspectRatio: 1,
      },
      {
        id: 'back',
        label: 'Back',
        maxWidth: 0.8,
        maxHeight: 0.9,
        uvRect: { x: 0.67, y: 0.4, width: 0.16, height: 0.42 },
        aspectRatio: 1,
      },
    ],
    supportedMaterials: ['cotton'],
    supportedEffects: ['screen-print'],
    compatibleAnimations: ['idle'],
    cameraPresets: ['front', 'back'],
    provenance: {
      source: 'threadform-original',
      createdBy: 'ThreadForm',
      license: 'Original asset, all rights reserved to ThreadForm.',
    },
    ...overrides,
  };
}

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: () => Promise.resolve(body),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadManifest', () => {
  it('accepts a well-formed manifest', async () => {
    mockFetchOnce(validManifestPayload());
    const result = await loadManifest('threadform-essential-tee');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.manifest.name).toBe('ThreadForm Essential Tee');
    }
  });

  it('rejects an unknown garment id without making a network request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await loadManifest('not-in-the-catalog');
    expect(result.success).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects an invalid hex color', async () => {
    mockFetchOnce(validManifestPayload({ defaultColor: 'not-a-color' }));
    const result = await loadManifest('threadform-essential-tee');
    expect(result.success).toBe(false);
  });

  it('rejects a manifest with a garmentId mismatch', async () => {
    mockFetchOnce(validManifestPayload({ garmentId: 'a-different-id' }));
    const result = await loadManifest('threadform-essential-tee');
    expect(result.success).toBe(false);
  });

  it('rejects a non-2xx HTTP response', async () => {
    mockFetchOnce(null, { ok: false, status: 404 });
    const result = await loadManifest('threadform-essential-tee');
    expect(result.success).toBe(false);
  });

  it('rejects a manifest with no print zones', async () => {
    mockFetchOnce(validManifestPayload({ printZones: [] }));
    const result = await loadManifest('threadform-essential-tee');
    expect(result.success).toBe(false);
  });

  it('rejects a print zone with no UV rectangle', async () => {
    mockFetchOnce(
      validManifestPayload({
        printZones: [{ id: 'front', label: 'Front', maxWidth: 0.8, maxHeight: 0.9 }],
      }),
    );
    const result = await loadManifest('threadform-essential-tee');
    expect(result.success).toBe(false);
  });

  // A rectangle running off the edge of UV space would sample whatever the
  // texture's wrap mode returned there instead of the region the garment
  // author meant — silently misplacing every print in that zone.
  it('rejects a UV rectangle that does not fit inside the 0-1 square', async () => {
    mockFetchOnce(
      validManifestPayload({
        printZones: [
          {
            id: 'front',
            label: 'Front',
            maxWidth: 0.8,
            maxHeight: 0.9,
            uvRect: { x: 0.9, y: 0.4, width: 0.3, height: 0.42 },
            aspectRatio: 1,
          },
        ],
      }),
    );
    const result = await loadManifest('threadform-essential-tee');
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive zone aspect ratio', async () => {
    mockFetchOnce(
      validManifestPayload({
        printZones: [
          {
            id: 'front',
            label: 'Front',
            maxWidth: 0.8,
            maxHeight: 0.9,
            uvRect: { x: 0.1, y: 0.4, width: 0.16, height: 0.42 },
            aspectRatio: 0,
          },
        ],
      }),
    );
    const result = await loadManifest('threadform-essential-tee');
    expect(result.success).toBe(false);
  });

  it('rejects unlicensed-looking provenance (missing license)', async () => {
    const payload = validManifestPayload();
    // @ts-expect-error deliberately malformed for the test
    delete payload.provenance.license;
    mockFetchOnce(payload);
    const result = await loadManifest('threadform-essential-tee');
    expect(result.success).toBe(false);
  });
});
