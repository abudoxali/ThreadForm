import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VisuallyHidden } from './VisuallyHidden';

describe('VisuallyHidden', () => {
  it('renders its text in the accessibility tree while staying off-screen', () => {
    render(<VisuallyHidden>Screen-reader-only label</VisuallyHidden>);
    const node = screen.getByText('Screen-reader-only label');
    expect(node).toBeInTheDocument();
    // jsdom doesn't apply layout from the stylesheet, so this checks the
    // mechanism (a 1px clipped box, not display:none) rather than computed size.
    expect(node).toHaveClass('absolute', 'h-px', 'w-px', 'overflow-hidden');
    expect(node).toHaveStyle({ clip: 'rect(0, 0, 0, 0)' });
  });
});
