import type { HexColor } from './garment';

export type BackgroundConfiguration =
  | { kind: 'solid-color'; color: HexColor }
  | { kind: 'gradient'; from: HexColor; to: HexColor; angleDegrees: number }
  | { kind: 'image'; source: { blobId: string } }
  | { kind: 'studio-scene'; sceneId: string }
  | { kind: 'hdri-environment'; environmentId: string };
