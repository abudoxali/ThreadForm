export type ExportImageFormat = 'png' | 'jpg' | 'webp' | 'png-transparent';
export type ExportVideoFormat = 'webm' | 'mp4';
export type ExportResolution = '720p' | '1080p' | '1440p' | '4k';
export type ExportFrameRate = 24 | 30 | 60;
export type ExportAspectRatio = '1:1' | '4:5' | '9:16' | '16:9' | 'custom';

export type ExportTargetPreset =
  | 'instagram-feed'
  | 'instagram-story'
  | 'tiktok'
  | 'youtube-shorts'
  | 'shopify'
  | 'amazon'
  | 'etsy'
  | 'custom';

export interface ExportPreferences {
  target: ExportTargetPreset;
  image: {
    format: ExportImageFormat;
    resolution: ExportResolution;
  };
  video: {
    format: ExportVideoFormat;
    resolution: ExportResolution;
    frameRate: ExportFrameRate;
  };
  aspectRatio: ExportAspectRatio;
  /** Only meaningful when `aspectRatio` is `'custom'`. */
  customAspectRatio?: { width: number; height: number };
}
