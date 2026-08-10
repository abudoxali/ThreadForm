import Link from 'next/link';
import { buttonStyles } from '@threadform/ui';
import { GarmentMark } from './GarmentMark';

export function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-16 sm:px-6 sm:pt-24 md:grid-cols-2 md:items-center md:pb-24">
      <div>
        <p className="text-accent text-sm font-medium uppercase tracking-widest">
          2D + 3D apparel studio
        </p>
        <h1 className="text-primary mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          Turn artwork into apparel mockups, without leaving the browser.
        </h1>
        <p className="text-secondary mt-5 max-w-lg text-base leading-relaxed sm:text-lg">
          ThreadForm places your artwork on real print zones, previews it on garments in 2D and 3D,
          and exports assets you can ship — all from a local-first editor that works before you ever
          create an account.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/studio" className={buttonStyles('primary', 'md')}>
            Open the Studio
          </Link>
          <a href="#workflow" className={buttonStyles('ghost', 'md')}>
            See how it works
          </a>
        </div>
      </div>
      <div className="flex justify-center md:justify-end">
        <GarmentMark className="h-72 w-64 sm:h-80 sm:w-72" />
      </div>
    </section>
  );
}
