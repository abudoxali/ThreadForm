import { describe, expect, it } from 'vitest';
import type { GarmentReference } from '@threadform/types';
import { resolveGarmentReference } from './resolve';

describe('resolveGarmentReference', () => {
  it('resolves a canonical catalog reference as ready', () => {
    const reference: GarmentReference = {
      garmentId: 'threadform-essential-tee',
      garmentVersion: '1.0.0',
      category: 't-shirt',
    };
    expect(resolveGarmentReference(reference)).toEqual({
      status: 'ready',
      garmentId: 'threadform-essential-tee',
    });
  });

  it('maps an M01 placeholder t-shirt reference to the real t-shirt garment', () => {
    const reference: GarmentReference = {
      garmentId: 't-shirt',
      garmentVersion: '0.0.0',
      category: 't-shirt',
    };
    expect(resolveGarmentReference(reference)).toEqual({
      status: 'legacy-compatible',
      garmentId: 'threadform-essential-tee',
    });
  });

  it('does not map an unrelated placeholder category onto the t-shirt', () => {
    const reference: GarmentReference = {
      garmentId: 'hoodie',
      garmentVersion: '0.0.0',
      category: 'hoodie',
    };
    expect(resolveGarmentReference(reference)).toEqual({ status: 'unavailable' });
  });

  it('treats an unknown garmentId with a real version as unavailable, not legacy', () => {
    const reference: GarmentReference = {
      garmentId: 'some-future-garment',
      garmentVersion: '1.0.0',
      category: 't-shirt',
    };
    expect(resolveGarmentReference(reference)).toEqual({ status: 'unavailable' });
  });
});
