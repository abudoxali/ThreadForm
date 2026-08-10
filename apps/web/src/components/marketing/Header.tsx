import Link from 'next/link';
import { buttonStyles } from '@threadform/ui';

export function MarketingHeader() {
  return (
    <header className="border-border border-b">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="text-primary text-sm font-semibold tracking-wide">
          ThreadForm
        </Link>
        <nav
          aria-label="Primary"
          className="text-secondary hidden items-center gap-6 text-sm md:flex"
        >
          <a href="#workflow" className="hover:text-primary transition-colors">
            Workflow
          </a>
          <a href="#capabilities" className="hover:text-primary transition-colors">
            Capabilities
          </a>
          <a href="#local-first" className="hover:text-primary transition-colors">
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
