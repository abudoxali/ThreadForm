import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudioPage from './page';

// The Studio shell renders a desktop rail/canvas/inspector layout and a
// separate mobile layout side by side, toggled with CSS breakpoints. jsdom
// does not apply real CSS, so both copies exist in the DOM at once here —
// tests take the first match, which is representative since both copies
// share the same component state.

describe('StudioPage', () => {
  it('renders the garment picker as the initial empty state', () => {
    render(<StudioPage />);
    expect(screen.getAllByRole('heading', { name: /choose a garment/i }).length).toBeGreaterThan(0);
  });

  it('unlocks the rest of the tool rail once a garment category is picked', async () => {
    render(<StudioPage />);
    const [artworkButton] = screen.getAllByRole('button', { name: 'Artwork' });
    if (!artworkButton) throw new Error('expected an Artwork tool button');
    // Tool-rail "disabled" tools stay focusable and hoverable (so their
    // explanatory title is reachable) — they're marked aria-disabled, not
    // the native `disabled` attribute. See ToolRail.tsx.
    expect(artworkButton).toHaveAttribute('aria-disabled', 'true');

    const [tShirtOption] = screen.getAllByRole('button', { name: 'T-Shirt' });
    if (!tShirtOption) throw new Error('expected a T-Shirt option');
    await userEvent.click(tShirtOption);

    expect(artworkButton).toHaveAttribute('aria-disabled', 'false');

    // "Selected garment: " and "T-Shirt" are split across a text node and a
    // child <span> — getByText's default matcher only checks direct text
    // node children, so a full-textContent function matcher is needed here.
    const matches = screen.getAllByText(
      (_, element) => element?.textContent?.trim().toLowerCase() === 'selected garment: t-shirt',
    );
    expect(matches.length).toBeGreaterThan(0);
  });
});
