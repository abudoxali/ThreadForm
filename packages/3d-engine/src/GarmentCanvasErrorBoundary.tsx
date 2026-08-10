'use client';

import { Component } from 'react';
import type { ReactNode } from 'react';

export interface GarmentCanvasErrorBoundaryProps {
  children: ReactNode;
  /** Rendered instead of the canvas after a load/render failure. Receives no error detail — never surface a raw stack trace to the user. */
  fallback: ReactNode;
  onError?: () => void;
}

interface State {
  hasError: boolean;
}

/**
 * A failed garment asset (bad manifest, corrupt GLB, a WebGL context loss)
 * must not take down the rest of the Studio. React error boundaries must be
 * class components — there is no hook equivalent. Scoped tightly around the
 * 3D canvas only, so the rest of the Studio (topbar, inspector, rail)
 * keeps working even if this trips.
 */
export class GarmentCanvasErrorBoundary extends Component<GarmentCanvasErrorBoundaryProps, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown) {
    // Logged for local debugging only — never rendered into the UI.
    console.error('ThreadForm 3D canvas failed to render:', error);
    this.props.onError?.();
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
