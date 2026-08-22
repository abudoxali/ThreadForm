'use client';

import { GradientTexture } from '@react-three/drei';

/**
 * Cheap product-photography backdrop, not a 3D room: a vertical gradient on
 * `scene.background` (a studio-sweep — the classic photography curve fake)
 * so the garment doesn't read as floating in flat, infinite black. One
 * static 256px texture, built once via `useMemo` inside `GradientTexture`
 * itself, so this adds no per-frame cost.
 *
 * A ground-plane "contact shadow"/"glow" was tried and rejected here: at
 * this Studio's fairly close, shallow camera angles a flat plane large
 * enough to avoid a visible edge foreshortens into a hard-edged wedge
 * rather than a soft pool — a real defect, not a subjective call (see
 * M02.5 visual QA). The vertical backdrop alone reads as an intentional
 * studio setting without that risk.
 */
export function StudioGrounding() {
  return (
    <GradientTexture
      attach="background"
      stops={[0, 0.55, 1]}
      colors={['#0a0a0b', '#141417', '#0a0a0b']}
      size={256}
    />
  );
}
