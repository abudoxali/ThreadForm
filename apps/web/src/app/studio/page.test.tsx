import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLastOpenedProjectId } from '@threadform/local-storage';
import { resetLocalStorage } from '@/test-utils/resetStorage';
import StudioPage from './page';

// The Studio shell renders a desktop rail/canvas/inspector layout and a
// separate mobile layout side by side, toggled with CSS breakpoints. jsdom
// does not apply real CSS, so both copies exist in the DOM at once here —
// tests take the first match, which is representative since both copies
// share the same component state. This file exercises the real
// IndexedDB-backed persistence path (via fake-indexeddb, see vitest.setup.ts)
// rather than mocking the repository — see useStudioProject.test.ts for
// the mocked, debounce-focused unit tests of the hook itself.

beforeEach(async () => {
  await resetLocalStorage();
});

async function waitForInitialLoad() {
  await waitFor(() => {
    expect(screen.queryAllByText(/loading your studio/i)).toHaveLength(0);
  });
}

describe('StudioPage — initial state', () => {
  it('shows the garment picker when there is no persisted project', async () => {
    render(<StudioPage />);
    await waitForInitialLoad();
    expect(screen.getAllByRole('heading', { name: /choose a garment/i }).length).toBeGreaterThan(0);
  });

  it('recovers gracefully from a last-opened pointer that references a missing project', async () => {
    await setLastOpenedProjectId('project_does-not-exist');

    render(<StudioPage />);
    await waitForInitialLoad();

    expect(screen.getAllByRole('heading', { name: /choose a garment/i }).length).toBeGreaterThan(0);
  });
});

describe('StudioPage — creating and persisting a project', () => {
  it('creates a real project, drives the Inspector/topbar from it, and unlocks the tool rail', async () => {
    render(<StudioPage />);
    await waitForInitialLoad();

    const [artworkButton] = screen.getAllByRole('button', { name: 'Artwork' });
    if (!artworkButton) throw new Error('expected an Artwork tool button');
    expect(artworkButton).toHaveAttribute('aria-disabled', 'true');

    const [hoodieOption] = screen.getAllByRole('button', { name: 'Hoodie' });
    if (!hoodieOption) throw new Error('expected a Hoodie option');
    await userEvent.click(hoodieOption);

    await waitFor(() => {
      expect(screen.getAllByRole('textbox', { name: /project name/i })[0]).toHaveValue(
        'Hoodie Project',
      );
    });
    expect(artworkButton).toHaveAttribute('aria-disabled', 'false');

    const matches = screen.getAllByText(
      (_, element) => element?.textContent?.trim().toLowerCase() === 'selected garment: hoodie',
    );
    expect(matches.length).toBeGreaterThan(0);
  });

  it('shows a truthful save indicator across a rename: saving, then saved', async () => {
    render(<StudioPage />);
    await waitForInitialLoad();
    await userEvent.click(screen.getAllByRole('button', { name: 'T-Shirt' })[0]!);
    await waitFor(() => screen.getAllByRole('textbox', { name: /project name/i })[0]);

    const [nameInput] = screen.getAllByRole('textbox', { name: /project name/i });
    if (!nameInput) throw new Error('expected a project name input');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'My Renamed Project');

    await waitFor(() => {
      expect(screen.getAllByRole('status')[0]).toHaveTextContent(/saving/i);
    });
    await waitFor(
      () => {
        expect(screen.getAllByRole('status')[0]).toHaveTextContent(/^saved$/i);
      },
      { timeout: 3000 },
    );
  });
});

describe('StudioPage — reopening and switching projects', () => {
  it('lists a created project as "recent" after returning to the start state, and can reopen it', async () => {
    render(<StudioPage />);
    await waitForInitialLoad();
    await userEvent.click(screen.getAllByRole('button', { name: 'Polo' })[0]!);
    await waitFor(() => screen.getAllByRole('textbox', { name: /project name/i })[0]);

    const [newProjectButton] = screen.getAllByRole('button', { name: 'New Project' });
    if (!newProjectButton) throw new Error('expected a New Project button');
    await userEvent.click(newProjectButton);

    await waitFor(() => {
      expect(screen.getAllByText('Polo Project').length).toBeGreaterThan(0);
    });

    const recentEntry = screen.getAllByText('Polo Project')[0];
    if (!recentEntry) throw new Error('expected a recent project entry');
    await userEvent.click(recentEntry);

    await waitFor(() => {
      expect(screen.getAllByRole('textbox', { name: /project name/i })[0]).toHaveValue(
        'Polo Project',
      );
    });
  });
});

describe('StudioPage — deleting projects', () => {
  it('returns to the start state when the open project is deleted', async () => {
    render(<StudioPage />);
    await waitForInitialLoad();
    await userEvent.click(screen.getAllByRole('button', { name: 'Jersey' })[0]!);
    await waitFor(() => screen.getAllByRole('textbox', { name: /project name/i })[0]);

    await userEvent.click(screen.getAllByRole('button', { name: 'New Project' })[0]!);
    await waitFor(() => {
      expect(screen.getAllByText('Jersey Project').length).toBeGreaterThan(0);
    });

    const [deleteButton] = screen.getAllByRole('button', { name: /delete jersey project/i });
    if (!deleteButton) throw new Error('expected a delete button');
    await userEvent.click(deleteButton);

    const confirmButton = await screen.findByRole('button', { name: 'Delete' });
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.queryByText('Jersey Project')).not.toBeInTheDocument();
    });
    expect(screen.getAllByRole('heading', { name: /choose a garment/i }).length).toBeGreaterThan(0);
  });
});
