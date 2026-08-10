import type { Vector3 } from './geometry';

export type CameraPresetId = 'front' | 'back' | 'three-quarter' | 'side' | 'top' | 'custom';

export interface CameraConfiguration {
  presetId: CameraPresetId;
  target: Vector3;
  distance: number;
  azimuthDegrees: number;
  polarDegrees: number;
  fieldOfViewDegrees: number;
}
