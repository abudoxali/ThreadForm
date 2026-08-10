import Link from 'next/link';
import { buttonStyles } from '@threadform/ui';

export function MarketingHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="text-sm font-semibold tracking-wide text-primary">
          ThreadForm
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-6 text-sm text-secondary md:flex">
          <a href="#workflow" className="transition-colors hover:text-primary">
            Workflow
          </a>
          <a href="#capabilities" className="transition-colors hover:text-primary">
            Capabilities
          </a>
          <a href="#local-first" className="transition-colors hover:text-primary">
            Local-first
          </a>
        </nav>
        <Link href="/studio" className={buttonStyles('secondary', 'sm')}>
          Open Studio
        </Link>
      </div>
    </header>
  );
}
