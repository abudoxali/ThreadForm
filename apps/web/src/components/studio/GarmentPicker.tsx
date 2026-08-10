import { GARMENT_CATALOG } from '@threadform/garment-runtime';
import { GARMENT_CATEGORIES } from './garmentCategories';

export interface GarmentPickerProps {
  onSelect: (garmentId: string) => void;
  disabled?: boolean;
}

const CATALOG_CATEGORIES = new Set(GARMENT_CATALOG.map((entry) => entry.category));
const COMING_LATER = GARMENT_CATEGORIES.filter((category) => !CATALOG_CATEGORIES.has(category.id));

export function GarmentPicker({ onSelect, disabled = false }: GarmentPickerProps) {
  return (
    <div className="mx-auto max-w-lg text-center">
      <h2 className="text-primary text-lg font-medium">Choose a garment to begin</h2>
      <p className="text-secondary mt-1.5 text-sm">
        Picking a garment creates a real local project and renders it live in the Studio canvas.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {GARMENT_CATALOG.map((entry) => (
          <button
            key={entry.garmentId}
            type="button"
            onClick={() => onSelect(entry.garmentId)}
            disabled={disabled}
            className="border-accent bg-accent-muted text-primary hover:border-accent-strong focus-visible:ring-accent-strong focus-visible:ring-offset-canvas rounded-md border px-3 py-2.5 text-sm font-medium transition-colors duration-[var(--tf-duration-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40"
          >
            {entry.label}
          </button>
        ))}
        {COMING_LATER.map((category) => (
          <button
            key={category.id}
            type="button"
            disabled
            aria-disabled="true"
            title={`${category.label} — coming in a later milestone`}
            className="border-border bg-surface-raised text-tertiary cursor-not-allowed rounded-md border px-3 py-2.5 text-sm opacity-50"
          >
            {category.label}
          </button>
        ))}
      </div>
    </div>
  );
}
