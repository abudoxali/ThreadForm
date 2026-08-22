import { describe, expect, it } from 'vitest';
import type { PrintZoneDefinition, Transform2D } from '@threadform/types';
import {
  ZONE_TEXTURE_MAX_PX,
  artworkDrawRect,
  zoneTextureMapping,
  zoneTextureSize,
} from './artworkPlacement';

const FRONT: PrintZoneDefinition = {
  id: 'front',
  label: 'Front',
  maxWidth: 0.5,
  maxHeight: 0.55,
  uvRect: { x: 0.17, y: 0.4, width: 0.16, height: 0.42 },
  aspectRatio: 1,
};

const BACK: PrintZoneDefinition = {
  ...FRONT,
  id: 'back',
  uvRect: { x: 0.67, y: 0.4, width: 0.16, height: 0.42 },
};

function transform(overrides: Partial<Transform2D> = {}): Transform2D {
  return {
    position: { x: 0.5, y: 0.5 },
    rotationDegrees: 0,
    scale: { x: 0.5, y: 0.5 },
    ...overrides,
  };
}

describe('zoneTextureSize', () => {
  it('gives a square zone a square canvas', () => {
    expect(zoneTextureSize(FRONT)).toEqual({
      width: ZONE_TEXTURE_MAX_PX,
      height: ZONE_TEXTURE_MAX_PX,
    });
  });

  // Physically-square texels are what let an already aspect-corrected
  // `scale` map straight onto the canvas. If the canvas matched the *UV*
  // rectangle's proportions instead, every print would arrive pre-stretched.
  it('matches the canvas aspect to the zone real-world aspect, not its UV rectangle', () => {
    const wide = zoneTextureSize({ ...FRONT, aspectRatio: 2 });
    expect(wide.width / wide.height).toBeCloseTo(2);

    const tall = zoneTextureSize({ ...FRONT, aspectRatio: 0.5 });
    expect(tall.width / tall.height).toBeCloseTo(0.5);

    // The UV rectangle is 0.16 x 0.42 — nothing like either of the above.
    expect(FRONT.uvRect.width / FRONT.uvRect.height).not.toBeCloseTo(1);
  });

  it('never produces a degenerate canvas', () => {
    const extreme = zoneTextureSize({ ...FRONT, aspectRatio: 5000 });
    expect(extreme.width).toBeGreaterThanOrEqual(2);
    expect(extreme.height).toBeGreaterThanOrEqual(2);
  });
});

describe('artworkDrawRect', () => {
  it('places a centered layer in the middle of the canvas', () => {
    const rect = artworkDrawRect(transform(), 1000, 800);
    expect(rect.centerX).toBe(500);
    expect(rect.centerY).toBe(400);
    expect(rect.width).toBe(500);
    expect(rect.height).toBe(400);
  });

  // Zone-normalized space is y-up (it follows the garment's UV orientation);
  // a 2D canvas is y-down. Getting this backwards prints artwork upside down
  // on the garment, which no amount of slider tweaking can correct.
  it('flips the vertical axis from zone space to canvas space', () => {
    const top = artworkDrawRect(transform({ position: { x: 0.5, y: 1 } }), 1000, 800);
    const bottom = artworkDrawRect(transform({ position: { x: 0.5, y: 0 } }), 1000, 800);
    expect(top.centerY).toBe(0);
    expect(bottom.centerY).toBe(800);
  });

  it('leaves the horizontal axis alone', () => {
    const right = artworkDrawRect(transform({ position: { x: 1, y: 0.5 } }), 1000, 800);
    expect(right.centerX).toBe(1000);
  });

  it('converts rotation to radians', () => {
    expect(
      artworkDrawRect(transform({ rotationDegrees: 90 }), 100, 100).rotationRadians,
    ).toBeCloseTo(Math.PI / 2);
    expect(
      artworkDrawRect(transform({ rotationDegrees: -180 }), 100, 100).rotationRadians,
    ).toBeCloseTo(-Math.PI);
  });
});

describe('zoneTextureMapping', () => {
  it('maps the zone rectangle onto the full 0-1 range of its own texture', () => {
    const mapping = zoneTextureMapping(FRONT);
    const sample = (uv: number, repeat: number, offset: number) => uv * repeat + offset;

    expect(sample(FRONT.uvRect.x, mapping.repeatX, mapping.offsetX)).toBeCloseTo(0);
    expect(
      sample(FRONT.uvRect.x + FRONT.uvRect.width, mapping.repeatX, mapping.offsetX),
    ).toBeCloseTo(1);
    expect(sample(FRONT.uvRect.y, mapping.repeatY, mapping.offsetY)).toBeCloseTo(0);
    expect(
      sample(FRONT.uvRect.y + FRONT.uvRect.height, mapping.repeatY, mapping.offsetY),
    ).toBeCloseTo(1);
  });

  // Front and back share one mesh on the Essential Tee, so this mapping is
  // the only thing keeping their prints apart. Sampling the front zone at
  // the back's UV coordinates must land far outside 0-1, where
  // ClampToEdgeWrapping returns the canvas's transparent border.
  it('sends another zone UV coordinates outside its own texture', () => {
    const front = zoneTextureMapping(FRONT);
    const backCenterU = BACK.uvRect.x + BACK.uvRect.width / 2;
    const sampled = backCenterU * front.repeatX + front.offsetX;
    expect(sampled > 1 || sampled < 0).toBe(true);
  });
});
