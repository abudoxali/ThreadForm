'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ArtworkFileKind, ArtworkLayer, Project } from '@threadform/types';
import { decodeStoredArtwork, isArtworkFileKind } from '@threadform/artwork-engine';
import type { DecodedArtwork } from '@threadform/artwork-engine';
import type { ArtworkRenderLayer } from '@threadform/3d-engine';
import { readArtworkBlob } from '@/lib/projectRepository';

/**
 * Owns the browser-side lifecycle of every artwork image a project
 * references: reading each blob out of local storage, re-validating and
 * decoding it, and — the part that is easy to get wrong — releasing the
 * object URL behind it the moment nothing refers to it any more.
 *
 * A project's `Project` document only ever stores a `blobId`
 * (`docs/PRIVACY_SECURITY.md`): object URLs are session-scoped, so
 * persisting one would break on the next visit. That makes *something*
 * responsible for turning ids back into drawable images and for cleaning up
 * afterward, and this hook is deliberately the only such place. Replacing a
 * layer's artwork, deleting a layer, switching projects and unmounting the
 * Studio all funnel through the same reconciliation below, so none of them
 * can leak a blob by forgetting its own cleanup path.
 *
 * Assets are keyed by blob id rather than by layer id, so duplicating a
 * layer costs no extra decode and no extra memory.
 */

export type ArtworkAssetStatus = 'loading' | 'ready' | 'missing' | 'error';

export interface ArtworkAsset {
  status: ArtworkAssetStatus;
  image: HTMLImageElement | null;
  error: string | null;
}

const LOADING_ASSET: ArtworkAsset = { status: 'loading', image: null, error: null };

export interface UseArtworkAssetsResult {
  /** Keyed by `ArtworkSource.blobId`. */
  assets: Record<string, ArtworkAsset>;
  /** Everything the 3D canvas needs, already filtered to layers whose image is ready. */
  renderLayers: ArtworkRenderLayer[];
  /**
   * Registers an artwork that was just imported and is already decoded, so
   * the print appears immediately instead of flashing a loading state while
   * the bytes are read straight back out of the database.
   */
  adoptDecodedArtwork: (blobId: string, decoded: DecodedArtwork) => void;
}

function localBlobId(layer: ArtworkLayer): string | null {
  return layer.source.kind === 'local-blob' ? layer.source.blobId : null;
}

export function useArtworkAssets(project: Project | null): UseArtworkAssetsResult {
  const [assets, setAssets] = useState<Record<string, ArtworkAsset>>({});

  // The decoded images and their `release()` handles, held in a ref because
  // cleanup has to reach them without depending on a render having
  // committed first.
  const decodedRef = useRef(new Map<string, DecodedArtwork>());
  // Ids currently being decoded, so a re-render mid-decode doesn't start a
  // second read of the same blob.
  const inFlightRef = useRef(new Set<string>());

  const layers = project?.artworks;

  // Which blobs this project needs, and what kind the project believes each
  // one is. Reduced to a plain string key so an unrelated edit — a rename, a
  // color change, a placement slider being dragged — doesn't re-run the
  // reconciliation below just because `project.artworks` got a new identity.
  const requiredKey = useMemo(() => {
    const kinds = new Map<string, ArtworkFileKind>();
    for (const layer of layers ?? []) {
      if (layer.source.kind !== 'local-blob') continue;
      kinds.set(layer.source.blobId, layer.source.fileKind);
    }
    return [...kinds]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([blobId, fileKind]) => `${blobId}:${fileKind}`)
      .join('|');
  }, [layers]);

  const adoptDecodedArtwork = useCallback((blobId: string, decoded: DecodedArtwork) => {
    const previous = decodedRef.current.get(blobId);
    if (previous && previous !== decoded) previous.release();
    decodedRef.current.set(blobId, decoded);
    inFlightRef.current.delete(blobId);
    setAssets((current) => ({
      ...current,
      [blobId]: { status: 'ready', image: decoded.image, error: null },
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const requiredKinds = new Map<string, ArtworkFileKind>(
      (requiredKey ? requiredKey.split('|') : []).flatMap((entry) => {
        const separator = entry.lastIndexOf(':');
        const kind = entry.slice(separator + 1);
        return isArtworkFileKind(kind) ? [[entry.slice(0, separator), kind] as const] : [];
      }),
    );
    const required = new Set(requiredKinds.keys());

    // Release anything no longer referenced. This is the single cleanup
    // path for artwork deletion, replacement and project switching alike.
    for (const [blobId, decoded] of decodedRef.current) {
      if (required.has(blobId)) continue;
      decoded.release();
      decodedRef.current.delete(blobId);
    }
    setAssets((current) => {
      const next: Record<string, ArtworkAsset> = {};
      let changed = false;
      for (const [blobId, asset] of Object.entries(current)) {
        if (required.has(blobId)) next[blobId] = asset;
        else changed = true;
      }
      for (const blobId of required) {
        if (!next[blobId]) {
          next[blobId] = LOADING_ASSET;
          changed = true;
        }
      }
      return changed ? next : current;
    });

    for (const [blobId, expectedKind] of requiredKinds) {
      if (decodedRef.current.has(blobId) || inFlightRef.current.has(blobId)) continue;
      inFlightRef.current.add(blobId);

      void (async () => {
        try {
          const stored = await readArtworkBlob(blobId);
          if (cancelled) return;
          if (!stored) {
            inFlightRef.current.delete(blobId);
            setAssets((current) => ({
              ...current,
              [blobId]: {
                status: 'missing',
                image: null,
                error: 'This artwork file is no longer stored in this browser.',
              },
            }));
            return;
          }

          // Persisted bytes are untrusted: `decodeStoredArtwork` re-checks
          // the file's actual signature and re-sanitizes SVG before the
          // image is ever handed to a canvas. The kind it is checked
          // against comes from the *project* — the typed record of what
          // this layer is supposed to be — not from the stored blob's own
          // metadata, which is part of what's being verified.
          const decoded = await decodeStoredArtwork(stored.blob, expectedKind);
          if (cancelled) {
            if (decoded.ok) decoded.artwork.release();
            return;
          }
          inFlightRef.current.delete(blobId);
          if (!decoded.ok) {
            setAssets((current) => ({
              ...current,
              [blobId]: { status: 'error', image: null, error: decoded.error },
            }));
            return;
          }
          // A freshly imported artwork can be adopted (already decoded)
          // while this read of the same blob is in flight. Keeping the
          // adopted one and releasing this duplicate is what stops that
          // race from leaking an object URL.
          if (decodedRef.current.has(blobId)) {
            decoded.artwork.release();
            return;
          }
          decodedRef.current.set(blobId, decoded.artwork);
          setAssets((current) => ({
            ...current,
            [blobId]: { status: 'ready', image: decoded.artwork.image, error: null },
          }));
        } catch {
          if (cancelled) return;
          inFlightRef.current.delete(blobId);
          setAssets((current) => ({
            ...current,
            [blobId]: {
              status: 'error',
              image: null,
              error: "Couldn't read this artwork from local storage.",
            },
          }));
        }
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [requiredKey]);

  // Unmount is the one case the reconciliation above cannot cover, since it
  // never sees an empty requirement set for a Studio that is going away.
  useEffect(() => {
    const decoded = decodedRef.current;
    return () => {
      for (const artwork of decoded.values()) artwork.release();
      decoded.clear();
    };
  }, []);

  const renderLayers = useMemo<ArtworkRenderLayer[]>(() => {
    if (!layers) return [];
    return layers.flatMap((layer) => {
      const blobId = localBlobId(layer);
      if (!blobId) return [];
      const asset = assets[blobId];
      if (!asset || asset.status !== 'ready' || !asset.image) return [];
      return [
        {
          id: layer.id,
          zoneId: layer.printZoneId,
          image: asset.image,
          transform: layer.transform,
          opacity: layer.opacity,
          visible: layer.visible,
          order: layer.order,
        },
      ];
    });
  }, [layers, assets]);

  return { assets, renderLayers, adoptDecodedArtwork };
}
