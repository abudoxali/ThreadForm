import type { GarmentCategory } from '@threadform/types';
import { GARMENT_CATEGORIES } from './garmentCategories';

export interface GarmentPickerProps {
  selected: GarmentCategory | null;
  onSelect: (category: GarmentCategory) => void;
}

export function GarmentPicker({ selected, onSelect }: GarmentPickerProps) {
  return (
    <div className="mx-auto max-w-lg text-center">
      <h2 className="text-lg font-medium text-primary">Choose a garment to begin</h2>
      <p className="mt-1.5 text-sm text-secondary">
        The garment library and 3D preview ship in the next milestone. Picking a category here
        unlocks the rest of the tool rail so you can see how the Studio fits together.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {GARMENT_CATEGORIES.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelect(category.id)}
            aria-pressed={selected === category.id}
            className={`rounded-md border px-3 py-2.5 text-sm transition-colors duration-[var(--tf-duration-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
              selected === category.id
                ? 'border-accent bg-accent-muted text-primary'
                : 'border-border bg-surface-raised text-secondary hover:border-border-strong hover:text-primary'
            }`}
          >
            {category.label}
          </button>
        ))}
      </div>
    </div>
  );
}
