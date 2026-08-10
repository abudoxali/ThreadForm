import type { CameraPresetId } from '@threadform/types';
import type { CameraPresetDefinition } from './types';

/**
 * Camera presets belong here, not scattered as magic numbers in Studio JSX
 * (see docs/ARCHITECTURE.md). Angles are relative to the garment's own
 * front-facing `+Z` / up `+Y` convention (docs/GARMENT_SPEC.md), so any
 * garment following that convention frames correctly without per-garment
 * tuning. Distance is in meters (1 model unit = 1 meter), sized for a
 * roughly human-torso-scale garment (~0.6m wide, ~0.7m tall).
 */
export const CAMERA_PRESETS: Record<CameraPresetId, CameraPresetDefinition> = {
  front: { id: 'front', label: 'Front', azimuthDegrees: 0, polarDegrees: 80, distance: 1.9 },
  back: { id: 'back', label: 'Back', azimuthDegrees: 180, polarDegrees: 80, distance: 1.9 },
  'three-quarter': {
    id: 'three-quarter',
    label: '3/4 Front',
    azimuthDegrees: 35,
    polarDegrees: 78,
    distance: 2.0,
  },
  side: { id: 'side', label: 'Side', azimuthDegrees: 90, polarDegrees: 80, distance: 1.9 },
  top: { id: 'top', label: 'Top', azimuthDegrees: 0, polarDegrees: 20, distance: 2.2 },
  custom: { id: 'custom', label: 'Custom', azimuthDegrees: 35, polarDegrees: 80, distance: 1.9 },
};

export function getCameraPreset(id: CameraPresetId): CameraPresetDefinition {
  return CAMERA_PRESETS[id];
}
