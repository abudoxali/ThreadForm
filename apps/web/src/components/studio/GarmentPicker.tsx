import type { GarmentCategory } from '@threadform/types';
import { GARMENT_CATEGORIES } from './garmentCategories';

export interface GarmentPickerProps {
  onSelect: (category: GarmentCategory) => void;
  disabled?: boolean;
}

export function GarmentPicker({ onSelect, disabled = false }: GarmentPickerProps) {
  return (
    <div className="mx-auto max-w-lg text-center">
      <h2 className="text-primary text-lg font-medium">Choose a garment to begin</h2>
      <p className="text-secondary mt-1.5 text-sm">
        The garment library and 3D preview ship in a later milestone. Picking a category here
        creates a real local project and unlocks the rest of the tool rail.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {GARMENT_CATEGORIES.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelect(category.id)}
            disabled={disabled}
            className="border-border bg-surface-raised text-secondary hover:border-border-strong hover:text-primary focus-visible:ring-accent-strong focus-visible:ring-offset-canvas rounded-md border px-3 py-2.5 text-sm transition-colors duration-[var(--tf-duration-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40"
          >
            {category.label}
          </button>
        ))}
      </div>
    </div>
  );
}
