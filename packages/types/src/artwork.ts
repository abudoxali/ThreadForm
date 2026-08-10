import type { Transform2D } from './geometry';
import type { PrintZoneId } from './garment';

export type ArtworkFileKind = 'png' | 'jpeg' | 'webp' | 'svg';

/**
 * Where an artwork layer's pixel/vector data lives. `local-blob` references
 * a blob persisted through `@threadform/local-storage`; the id is a stable
 * key, never a raw object URL (those are session-scoped and cannot survive
 * reload). `remote` is reserved for the future cloud-projects feature.
 */
export type ArtworkSource =
  | { kind: 'local-blob'; blobId: string; fileKind: ArtworkFileKind }
  | { kind: 'remote'; url: string; fileKind: ArtworkFileKind };

export interface ArtworkLayer {
  id: string;
  name: string;
  source: ArtworkSource;
  printZoneId: PrintZoneId;
  transform: Transform2D;
  opacity: number;
  visible: boolean;
  locked: boolean;
  lockAspectRatio: boolean;
  /** Lower renders first (behind); higher renders on top. Unique within a print zone. */
  order: number;
}
