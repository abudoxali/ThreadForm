import type { Transform2D } from './geometry';
import type { PrintZoneId } from './garment';

export type ArtworkFileKind = 'png' | 'jpeg' | 'webp' | 'svg';

/**
 * Where an artwork layer's pixel/vector data lives. `local-blob` references
 * a blob persisted through `@threadform/local-storage`; the id is a stable
 * key, never a raw object URL (those are session-scoped and cannot survive
 * reload). `remote` is reserved for the future cloud-projects feature.
 *
 * `pixelWidth`/`pixelHeight`/`byteSize` are recorded at import time so the
 * Studio can lay out, describe and aspect-correct a layer before (or
 * without) decoding its bytes again — and so a reload can restore a
 * visually identical placement even while the image is still loading.
 * `fileKind` is what the file's *actual signature* said at import, never
 * its declared MIME type or extension (see `@threadform/artwork-engine`).
 */
export type ArtworkSource =
  | {
      kind: 'local-blob';
      blobId: string;
      fileKind: ArtworkFileKind;
      pixelWidth: number;
      pixelHeight: number;
      byteSize: number;
    }
  | {
      kind: 'remote';
      url: string;
      fileKind: ArtworkFileKind;
      pixelWidth: number;
      pixelHeight: number;
      byteSize: number;
    };

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
  /**
   * The `EffectConfiguration.id` in `Project.effects` describing how this
   * artwork is physically printed — screen-printed ink, embroidered thread,
   * and so on (`docs/PRODUCT.md`: effects apply to individual artwork
   * layers). Absent means the plain, untreated print M03 shipped, which is
   * what every project created before M04 has.
   *
   * A stable id rather than an array index: layers are reordered and
   * removed, and an index-based link would silently repoint at a different
   * effect the first time either happened.
   */
  effectId?: string;
}
