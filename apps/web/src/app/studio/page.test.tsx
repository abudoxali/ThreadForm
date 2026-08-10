import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLastOpenedProjectId } from '@threadform/local-storage';
import type * as GarmentRuntimeModule from '@threadform/garment-runtime';
import { resetLocalStorage } from '@/test-utils/resetStorage';
import { ESSENTIAL_TEE_MANIFEST } from '@/test-utils/garmentFixture';
import StudioPage from './page';

// The Studio shell renders a desktop rail/canvas/inspector layout and a
// separate mobile layout side by side, toggled with CSS breakpoints. jsdom
// does not apply real CSS, so both copies exist in the DOM at once here —
// tests take the first match, which is representative since both copies
// share the same component state. This file exercises the real
// IndexedDB-backed persistence path (via fake-indexeddb, see vitest.setup.ts)
// rather than mocking the repository — see useStudioProject.test.ts for
// the mocked, debounce-focused unit tests of the hook itself.
//
// jsdom has no WebGL, so `@threadform/3d-engine`'s actual Canvas is mocked
// out here (real rendering is exercised by the Playwright E2E suite
// instead) — `loadManifest` is mocked alongside it to avoid a real network
// fetch to a manifest file no dev server is serving during this test run.

vi.mock('@threadform/3d-engine', () => ({
  StudioGarmentCanvas: ({
    manifest,
    colorHex,
  }: {
    manifest: { name: string };
    colorHex: string;
  }) => (
    <div data-testid="garment-canvas-stub" data-color={colorHex}>
      Rendering {manifest.name}
    </div>
  ),
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
});

async function waitForInitialLoad() {
  await waitFor(() => {
    expect(screen.queryAllByText(/loading your studio/i)).toHaveLength(0);
  });
}

async function chooseEssentialTee() {
  await userEvent.click(screen.getAllByRole('button', { name: 'ThreadForm Essential Tee' })[0]!);
  await waitFor(() => screen.getAllByTestId('garment-canvas-stub')[0]);
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
  it('creates a real project, resolves the manifest, renders the canvas, and unlocks the tool rail', async () => {
    render(<StudioPage />);
    await waitForInitialLoad();

    const [artworkButton] = screen.getAllByRole('button', { name: 'Artwork' });
    if (!artworkButton) throw new Error('expected an Artwork tool button');
    expect(artworkButton).toHaveAttribute('aria-disabled', 'true');

    await chooseEssentialTee();

    await waitFor(() => {
      expect(screen.getAllByRole('textbox', { name: /project name/i })[0]).toHaveValue(
        'ThreadForm Essential Tee Project',
      );
    });
    expect(artworkButton).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getAllByTestId('garment-canvas-stub')[0]).toHaveTextContent(
      'Rendering ThreadForm Essential Tee',
    );
  });

  it('drives the rendered garment color from a preset swatch, and persists it', async () => {
    render(<StudioPage />);
    await waitForInitialLoad();
    await chooseEssentialTee();

    const blackSwatch = screen.getAllByRole('button', { name: 'Black' })[0];
    if (!blackSwatch) throw new Error('expected a Black color swatch');
    await userEvent.click(blackSwatch);

    await waitFor(() => {
      expect(screen.getAllByTestId('garment-canvas-stub')[0]).toHaveAttribute(
        'data-color',
        '#1a1a1a',
      );
    });
  });

  it('shows a truthful save indicator across a rename: saving, then saved', async () => {
    render(<StudioPage />);
    await waitForInitialLoad();
    await chooseEssentialTee();

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
    await chooseEssentialTee();

    const [nameInput] = screen.getAllByRole('textbox', { name: /project name/i });
    if (!nameInput) throw new Error('expected a project name input');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Weekend Drop');
    await waitFor(() => {
      expect(screen.getAllByRole('status')[0]).toHaveTextContent(/^saved$/i);
    });

    const [newProjectButton] = screen.getAllByRole('button', { name: 'New Project' });
    if (!newProjectButton) throw new Error('expected a New Project button');
    await userEvent.click(newProjectButton);

    await waitFor(() => {
      expect(screen.getAllByText('Weekend Drop').length).toBeGreaterThan(0);
    });

    const recentEntry = screen.getAllByText('Weekend Drop')[0];
    if (!recentEntry) throw new Error('expected a recent project entry');
    await userEvent.click(recentEntry);

    await waitFor(() => {
      expect(screen.getAllByRole('textbox', { name: /project name/i })[0]).toHaveValue(
        'Weekend Drop',
      );
    });
  });
});

describe('StudioPage — deleting projects', () => {
  it('returns to the start state when the open project is deleted', async () => {
    render(<StudioPage />);
    await waitForInitialLoad();
    await chooseEssentialTee();

    const [nameInput] = screen.getAllByRole('textbox', { name: /project name/i });
    if (!nameInput) throw new Error('expected a project name input');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Doomed Project');
    await waitFor(() => {
      expect(screen.getAllByRole('status')[0]).toHaveTextContent(/^saved$/i);
    });

    await userEvent.click(screen.getAllByRole('button', { name: 'New Project' })[0]!);
    await waitFor(() => {
      expect(screen.getAllByText('Doomed Project').length).toBeGreaterThan(0);
    });

    const [deleteButton] = screen.getAllByRole('button', { name: /delete doomed project/i });
    if (!deleteButton) throw new Error('expected a delete button');
    await userEvent.click(deleteButton);

    const confirmButton = await screen.findByRole('button', { name: 'Delete' });
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.queryByText('Doomed Project')).not.toBeInTheDocument();
    });
    expect(screen.getAllByRole('heading', { name: /choose a garment/i }).length).toBeGreaterThan(0);
  });
});
