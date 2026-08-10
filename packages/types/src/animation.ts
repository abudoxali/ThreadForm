export type AnimationPresetId =
  | 'idle'
  | 'slow-rotate'
  | 'turntable-360'
  | 'walking'
  | 'wind'
  | 'wave'
  | 'floating'
  | 'hanging-motion'
  | 'fabric-drop'
  | 'knitting-reveal'
  | 'fold-unfold'
  | 'camera-orbit'
  | 'cinematic-reveal';

export interface AnimationConfiguration {
  presetId: AnimationPresetId;
  durationMs: number;
  playbackSpeed: number;
  loop: boolean;
  startAtMs: number;
  endAtMs: number;
}
