import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'ThreadForm — Apparel Design & Mockup Studio',
    template: '%s · ThreadForm',
  },
  description:
    'Turn artwork into realistic 2D and 3D apparel mockups in the browser. Local-first, no account required.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0b0c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <a
          href="#main"
          className="fixed left-2 top-2 z-50 -translate-y-16 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-transform focus:translate-y-0"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
