import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GarmentReference, Project } from '@threadform/types';
import { createProject } from '@threadform/project-engine';
import * as repository from '@/lib/projectRepository';
import { useStudioProject } from './useStudioProject';

vi.mock('@/lib/projectRepository');

const garment: GarmentReference = {
  garmentId: 't-shirt',
  garmentVersion: '0.0.0',
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
  it('creates and persists a project, then enters the editing phase', async () => {
    const created = buildProject('T-Shirt Project');
    mocked.createAndPersistProject.mockResolvedValue(created);

    const { result } = renderHook(() => useStudioProject());
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await act(async () => {
      await result.current.chooseGarment('t-shirt');
    });

    expect(mocked.createAndPersistProject).toHaveBeenCalledWith(
      { garmentId: 't-shirt', garmentVersion: '0.0.0', category: 't-shirt' },
      'T-Shirt Project',
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
      await result.current.chooseGarment('hoodie');
    });

    expect(result.current.phase).toBe('start');
    expect(result.current.notice).toMatch(/couldn't create your project/i);
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
      await result.current.chooseGarment('t-shirt');
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
      await result.current.chooseGarment('t-shirt');
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
      await result.current.chooseGarment('t-shirt');
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
      await result.current.chooseGarment('t-shirt');
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
      await result.current.chooseGarment('t-shirt');
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
