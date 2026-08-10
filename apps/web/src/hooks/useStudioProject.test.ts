import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GarmentReference, Project } from '@threadform/types';
import type * as GarmentRuntimeModule from '@threadform/garment-runtime';
import { createProject } from '@threadform/project-engine';
import * as repository from '@/lib/projectRepository';
import { ESSENTIAL_TEE_MANIFEST } from '@/test-utils/garmentFixture';
import { useStudioProject } from './useStudioProject';

vi.mock('@/lib/projectRepository');

vi.mock('@threadform/garment-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof GarmentRuntimeModule>();
  return {
    ...actual,
    loadManifest: vi.fn().mockResolvedValue({ success: true, manifest: ESSENTIAL_TEE_MANIFEST }),
  };
});

const garment: GarmentReference = {
  garmentId: 'threadform-essential-tee',
  garmentVersion: '1.0.0',
  category: 't-shirt',
};

function buildProject(name = 'My Project'): Project {
  return createProject(garment, { name });
}

const mocked = vi.mocked(repository);

beforeEach(() => {
  vi.useFakeTimers();
  mocked.restoreLastOpenedProject.mockResolvedValue(null);
  mocked.listRecentProjects.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useStudioProject — initial load', () => {
  it('lands on the start phase when there is no last-opened project', async () => {
    const { result } = renderHook(() => useStudioProject());
    expect(result.current.phase).toBe('initializing');

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.phase).toBe('start');
    expect(result.current.project).toBeNull();
  });

  it('restores the last-opened project directly into the editing phase', async () => {
    const project = buildProject('Restored');
    mocked.restoreLastOpenedProject.mockResolvedValue(project);

    const { result } = renderHook(() => useStudioProject());
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.phase).toBe('editing');
    expect(result.current.project?.metadata.name).toBe('Restored');
  });
});

describe('useStudioProject — chooseGarment', () => {
  it('resolves the manifest, then creates and persists a project from it', async () => {
    const created = buildProject('ThreadForm Essential Tee Project');
    mocked.createAndPersistProject.mockResolvedValue(created);

    const { result } = renderHook(() => useStudioProject());
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await act(async () => {
      await result.current.chooseGarment('threadform-essential-tee');
    });

    expect(mocked.createAndPersistProject).toHaveBeenCalledWith(
      { garmentId: 'threadform-essential-tee', garmentVersion: '1.0.0', category: 't-shirt' },
      { name: 'ThreadForm Essential Tee Project', garmentColor: { hex: '#f5f5f0' } },
    );
    expect(result.current.phase).toBe('editing');
    expect(result.current.saveStatus).toBe('saved');
  });

  it('surfaces a restrained notice, not a raw error, when creation fails', async () => {
    mocked.createAndPersistProject.mockRejectedValue(new Error('disk full'));

    const { result } = renderHook(() => useStudioProject());
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await act(async () => {
      await result.current.chooseGarment('threadform-essential-tee');
    });

    expect(result.current.phase).toBe('start');
    expect(result.current.notice).toMatch(/couldn't create your project/i);
  });

  it('surfaces a restrained notice when the manifest itself cannot be resolved, without creating a project', async () => {
    const { loadManifest } = await import('@threadform/garment-runtime');
    vi.mocked(loadManifest).mockResolvedValueOnce({ success: false, error: 'HTTP 404' });

    const { result } = renderHook(() => useStudioProject());
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await act(async () => {
      await result.current.chooseGarment('threadform-essential-tee');
    });

    expect(mocked.createAndPersistProject).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('start');
    expect(result.current.notice).toMatch(/couldn't load that garment/i);
  });
});

describe('useStudioProject — renameProject autosave', () => {
  it('debounces writes and only reports "saved" after persistence resolves', async () => {
    const created = buildProject('Original');
    mocked.createAndPersistProject.mockResolvedValue(created);
    mocked.saveProjectChanges.mockResolvedValue(undefined);

    const { result } = renderHook(() => useStudioProject());
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await result.current.chooseGarment('threadform-essential-tee');
    });

    act(() => {
      result.current.renameProject('New Name');
    });

    // Optimistic UI update happens immediately, before the debounced write.
    expect(result.current.project?.metadata.name).toBe('New Name');
    expect(result.current.saveStatus).toBe('saving');
    expect(mocked.saveProjectChanges).not.toHaveBeenCalled();

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mocked.saveProjectChanges).toHaveBeenCalledTimes(1);
    expect(result.current.saveStatus).toBe('saved');
  });

  it('collapses rapid renames into a single debounced write', async () => {
    const created = buildProject('Original');
    mocked.createAndPersistProject.mockResolvedValue(created);
    mocked.saveProjectChanges.mockResolvedValue(undefined);

    const { result } = renderHook(() => useStudioProject());
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await result.current.chooseGarment('threadform-essential-tee');
    });

    act(() => {
      result.current.renameProject('A');
      result.current.renameProject('AB');
      result.current.renameProject('ABC');
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mocked.saveProjectChanges).toHaveBeenCalledTimes(1);
    expect(mocked.saveProjectChanges).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ name: 'ABC' }) }),
    );
  });

  it('reports a save failure honestly instead of showing "saved"', async () => {
    const created = buildProject('Original');
    mocked.createAndPersistProject.mockResolvedValue(created);
    mocked.saveProjectChanges.mockRejectedValue(new Error('quota exceeded'));

    const { result } = renderHook(() => useStudioProject());
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await result.current.chooseGarment('threadform-essential-tee');
    });

    act(() => {
      result.current.renameProject('New Name');
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.saveStatus).toBe('error');
  });
});

describe('useStudioProject — setGarmentColor', () => {
  it('updates the project color and autosaves it', async () => {
    const created = buildProject('Original');
    mocked.createAndPersistProject.mockResolvedValue(created);
    mocked.saveProjectChanges.mockResolvedValue(undefined);

    const { result } = renderHook(() => useStudioProject());
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await result.current.chooseGarment('threadform-essential-tee');
    });

    act(() => {
      result.current.setGarmentColor('#1a1a1a');
    });
    expect(result.current.project?.garmentColor.hex).toBe('#1a1a1a');

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(mocked.saveProjectChanges).toHaveBeenCalledWith(
      expect.objectContaining({ garmentColor: expect.objectContaining({ hex: '#1a1a1a' }) }),
    );
  });

  it('rejects a malformed color value rather than persisting it', async () => {
    const created = buildProject('Original');
    mocked.createAndPersistProject.mockResolvedValue(created);

    const { result } = renderHook(() => useStudioProject());
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await result.current.chooseGarment('threadform-essential-tee');
    });

    const before = result.current.project?.garmentColor.hex;
    act(() => {
      result.current.setGarmentColor('not-a-color');
    });
    expect(result.current.project?.garmentColor.hex).toBe(before);
  });
});

describe('useStudioProject — setCameraPreset', () => {
  it('updates the camera configuration from the preset and autosaves it', async () => {
    const created = buildProject('Original');
    mocked.createAndPersistProject.mockResolvedValue(created);
    mocked.saveProjectChanges.mockResolvedValue(undefined);

    const { result } = renderHook(() => useStudioProject());
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await result.current.chooseGarment('threadform-essential-tee');
    });

    act(() => {
      result.current.setCameraPreset('back');
    });
    expect(result.current.project?.camera.presetId).toBe('back');
    expect(result.current.project?.camera.azimuthDegrees).toBe(180);

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(mocked.saveProjectChanges).toHaveBeenCalledWith(
      expect.objectContaining({ camera: expect.objectContaining({ presetId: 'back' }) }),
    );
  });
});

describe('useStudioProject — deleteExistingProject', () => {
  it('returns to the start phase when the currently open project is deleted', async () => {
    const created = buildProject('Doomed');
    mocked.createAndPersistProject.mockResolvedValue(created);
    mocked.deleteProjectById.mockResolvedValue(undefined);

    const { result } = renderHook(() => useStudioProject());
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await result.current.chooseGarment('threadform-essential-tee');
    });

    await act(async () => {
      await result.current.deleteExistingProject(created.metadata.id);
    });

    expect(result.current.phase).toBe('start');
    expect(result.current.project).toBeNull();
  });

  it('does not disturb the current project when deleting a different one', async () => {
    const created = buildProject('Keep me');
    mocked.createAndPersistProject.mockResolvedValue(created);
    mocked.deleteProjectById.mockResolvedValue(undefined);

    const { result } = renderHook(() => useStudioProject());
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await result.current.chooseGarment('threadform-essential-tee');
    });

    await act(async () => {
      await result.current.deleteExistingProject('some-other-project-id');
    });

    expect(result.current.phase).toBe('editing');
    expect(result.current.project?.metadata.id).toBe(created.metadata.id);
  });
});

describe('useStudioProject — openExistingProject', () => {
  it('surfaces a restrained notice when the project cannot be opened', async () => {
    mocked.openProject.mockRejectedValue(new Error('not found'));

    const { result } = renderHook(() => useStudioProject());
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await act(async () => {
      await result.current.openExistingProject('missing-id');
    });

    expect(result.current.phase).toBe('start');
    expect(result.current.notice).toMatch(/couldn't open that project/i);
  });
});
