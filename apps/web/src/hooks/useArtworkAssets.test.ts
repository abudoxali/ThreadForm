import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  createProject,
  addArtworkLayer,
  defaultArtworkTransform,
} from '@threadform/project-engine';
import { saveArtworkBlob } from '@threadform/local-storage';
import type { ArtworkSource, PrintZoneDefinition, Project } from '@threadform/types';
import { resetLocalStorage } from '@/test-utils/resetStorage';
import { installBrowserImageStubs, pngBytes } from '@/test-utils/artworkFixtures';
import type { ObjectUrlLedger } from '@/test-utils/artworkFixtures';
import { useArtworkAssets } from './useArtworkAssets';

/**
 * Focused tests for the object-URL lifecycle `docs/PRIVACY_SECURITY.md`
 * requires. Every URL handed out has to come back: a long editing session
 * that swaps artwork repeatedly would otherwise pin every superseded blob
 * in memory for the lifetime of the document, which is invisible in normal
 * use and only shows up as a browser tab that slowly gets heavier.
 */

const ZONE: PrintZoneDefinition = {
  id: 'front',
  label: 'Front',
  maxWidth: 0.5,
  maxHeight: 0.55,
  uvRect: { x: 0.17, y: 0.4, width: 0.16, height: 0.42 },
  aspectRatio: 1,
};

let urls: ObjectUrlLedger;

beforeEach(async () => {
  await resetLocalStorage();
  urls = installBrowserImageStubs();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function source(blobId: string): ArtworkSource {
  return {
    kind: 'local-blob',
    blobId,
    fileKind: 'png',
    pixelWidth: 512,
    pixelHeight: 512,
    byteSize: 64,
  };
}

async function storeArtwork(blobId: string, kind = 'png') {
  await saveArtworkBlob(blobId, new Blob([pngBytes() as BlobPart], { type: 'image/png' }), kind);
}

function projectWithBlobs(...blobIds: string[]): Project {
  let project = createProject({
    garmentId: 'threadform-essential-tee',
    garmentVersion: '1.1.0',
    category: 't-shirt',
  });
  for (const blobId of blobIds) {
    project = addArtworkLayer(project, {
      name: blobId,
      source: source(blobId),
      printZoneId: 'front',
      transform: defaultArtworkTransform(source(blobId), ZONE),
      opacity: 1,
      visible: true,
      locked: false,
      lockAspectRatio: true,
    });
  }
  return project;
}

describe('useArtworkAssets', () => {
  it('decodes each referenced blob and exposes it as a render layer', async () => {
    await storeArtwork('blob_1');
    const project = projectWithBlobs('blob_1');

    const { result } = renderHook(() => useArtworkAssets(project));

    await waitFor(() => expect(result.current.renderLayers).toHaveLength(1));
    expect(result.current.assets.blob_1?.status).toBe('ready');
    expect(result.current.renderLayers[0]?.zoneId).toBe('front');
  });

  it('decodes a shared blob once, however many layers reference it', async () => {
    await storeArtwork('blob_1');
    let project = projectWithBlobs('blob_1');
    project = addArtworkLayer(project, {
      name: 'duplicate',
      source: source('blob_1'),
      printZoneId: 'back',
      transform: defaultArtworkTransform(source('blob_1'), ZONE),
      opacity: 1,
      visible: true,
      locked: false,
      lockAspectRatio: true,
    });

    const { result } = renderHook(() => useArtworkAssets(project));

    await waitFor(() => expect(result.current.renderLayers).toHaveLength(2));
    expect(urls.created).toHaveLength(1);
  });

  it('releases the object URL when a layer stops referencing its blob', async () => {
    await storeArtwork('blob_1');
    const withArtwork = projectWithBlobs('blob_1');
    const withoutArtwork: Project = { ...withArtwork, artworks: [] };

    const { result, rerender } = renderHook(({ project }) => useArtworkAssets(project), {
      initialProps: { project: withArtwork },
    });
    await waitFor(() => expect(result.current.renderLayers).toHaveLength(1));
    expect(urls.outstanding()).toHaveLength(1);

    rerender({ project: withoutArtwork });
    await waitFor(() => expect(urls.outstanding()).toHaveLength(0));
    expect(result.current.renderLayers).toHaveLength(0);
  });

  it('releases every URL when switching to a different project', async () => {
    await storeArtwork('blob_1');
    await storeArtwork('blob_2');

    const { result, rerender } = renderHook(({ project }) => useArtworkAssets(project), {
      initialProps: { project: projectWithBlobs('blob_1') },
    });
    await waitFor(() => expect(result.current.renderLayers).toHaveLength(1));

    rerender({ project: projectWithBlobs('blob_2') });
    await waitFor(() => expect(result.current.renderLayers).toHaveLength(1));

    expect(urls.created).toHaveLength(2);
    expect(urls.outstanding()).toHaveLength(1);
  });

  it('releases every URL on unmount', async () => {
    await storeArtwork('blob_1');
    const { result, unmount } = renderHook(() => useArtworkAssets(projectWithBlobs('blob_1')));
    await waitFor(() => expect(result.current.renderLayers).toHaveLength(1));

    unmount();
    expect(urls.outstanding()).toHaveLength(0);
  });

  it('reports a missing blob without throwing or dropping the layer from the project', async () => {
    const { result } = renderHook(() => useArtworkAssets(projectWithBlobs('blob_gone')));

    await waitFor(() => expect(result.current.assets.blob_gone?.status).toBe('missing'));
    expect(result.current.renderLayers).toHaveLength(0);
    expect(urls.created).toHaveLength(0);
  });

  // Stored bytes are a trust boundary of their own: if what is on disk does
  // not match what the project says it is, that is refused rather than
  // handed to a canvas.
  it('refuses a stored blob whose real signature contradicts the project', async () => {
    await saveArtworkBlob(
      'blob_lying',
      new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], {
        type: 'image/png',
      }),
      'png',
    );

    const { result } = renderHook(() => useArtworkAssets(projectWithBlobs('blob_lying')));

    await waitFor(() => expect(result.current.assets.blob_lying?.status).toBe('error'));
    expect(result.current.renderLayers).toHaveLength(0);
  });

  it('adopts an already-decoded import without a second read, and releases it later', async () => {
    await storeArtwork('blob_1');
    const project = projectWithBlobs('blob_1');
    const { result, unmount } = renderHook(() => useArtworkAssets(project));
    await waitFor(() => expect(result.current.renderLayers).toHaveLength(1));

    const release = vi.fn();
    const image = new Image();
    act(() => {
      result.current.adoptDecodedArtwork('blob_1', {
        image,
        width: 512,
        height: 512,
        fileKind: 'png',
        release,
      });
    });

    await waitFor(() => expect(result.current.renderLayers[0]?.image).toBe(image));
    // The decode it superseded is released immediately, not on unmount.
    expect(urls.outstanding()).toHaveLength(0);

    unmount();
    expect(release).toHaveBeenCalled();
  });
});
