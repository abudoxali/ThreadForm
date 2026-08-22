import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteArtworkBlob,
  listArtworkBlobIds,
  loadArtworkBlob,
  saveArtworkBlob,
} from './artworks';
import { clearAllStores } from './test-helpers';

beforeEach(async () => {
  await clearAllStores();
});

function pngBlob(contents = 'artwork-bytes'): Blob {
  return new Blob([contents], { type: 'image/png' });
}

describe('artwork blob storage', () => {
  it('round-trips a blob with its recorded kind and size', async () => {
    const blob = pngBlob();
    await saveArtworkBlob('blob_1', blob, 'png');

    const stored = await loadArtworkBlob('blob_1');
    expect(stored).not.toBeNull();
    expect(stored?.fileKind).toBe('png');
    expect(stored?.byteSize).toBe(blob.size);
    expect(await stored?.blob.text()).toBe('artwork-bytes');
  });

  // A project can outlive its artwork (storage eviction, "clear site data",
  // an import interrupted mid-write). That has to be an ordinary state the
  // Studio can render an honest message for, not an exception that stops a
  // project from opening at all.
  it('returns null for a blob that is not stored, rather than throwing', async () => {
    expect(await loadArtworkBlob('blob_missing')).toBeNull();
  });

  it('overwrites an existing blob under the same id', async () => {
    await saveArtworkBlob('blob_1', pngBlob('first'), 'png');
    await saveArtworkBlob('blob_1', pngBlob('second'), 'png');
    const stored = await loadArtworkBlob('blob_1');
    expect(await stored?.blob.text()).toBe('second');
  });

  it('deletes a blob, and treats deleting a missing one as a no-op', async () => {
    await saveArtworkBlob('blob_1', pngBlob(), 'png');
    await deleteArtworkBlob('blob_1');
    expect(await loadArtworkBlob('blob_1')).toBeNull();
    await expect(deleteArtworkBlob('blob_1')).resolves.toBeUndefined();
  });

  it('lists stored blob ids', async () => {
    await saveArtworkBlob('blob_a', pngBlob(), 'png');
    await saveArtworkBlob('blob_b', pngBlob(), 'svg');
    expect((await listArtworkBlobIds()).sort()).toEqual(['blob_a', 'blob_b']);
  });

  // Artwork lives in its own store precisely so a project document stays
  // small enough to re-serialize on every debounced autosave.
  it('keeps artwork out of the projects store', async () => {
    await saveArtworkBlob('blob_1', pngBlob(), 'png');
    const { saveProject, loadProject } = await import('./projects');
    const { buildTestProject } = await import('./test-helpers');
    const project = buildTestProject();
    await saveProject(project);
    const reloaded = await loadProject(project.metadata.id);
    expect(reloaded.artworks).toEqual([]);
    expect(JSON.stringify(reloaded)).not.toContain('artwork-bytes');
  });
});
