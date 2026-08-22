'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import type { ArtworkLayer, PrintZoneDefinition, PrintZoneId, Project } from '@threadform/types';
import type { GarmentManifest } from '@threadform/garment-runtime';
import {
  MIN_ARTWORK_SCALE,
  artworkLayersInZone,
  rotatedHalfExtent,
} from '@threadform/project-engine';
import type { ArtworkTransformPatch } from '@threadform/project-engine';
import {
  ACCEPTED_ARTWORK_LABEL,
  ARTWORK_ACCEPT_ATTRIBUTE,
  ARTWORK_KIND_LABEL,
} from '@threadform/artwork-engine';
import type { DecodedArtwork } from '@threadform/artwork-engine';
import { buttonStyles } from '@threadform/ui';
import type { ArtworkMutationResult } from '@/hooks/useStudioProject';
import type { ArtworkAsset } from '@/hooks/useArtworkAssets';
import { AlertIcon, CenterIcon, CheckIcon, SwapIcon, TrashIcon } from './icons';

export interface ArtworkPanelProps {
  project: Project;
  manifest: GarmentManifest;
  assets: Record<string, ArtworkAsset>;
  activeZoneId: PrintZoneId;
  onSelectZone: (zoneId: PrintZoneId) => void;
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string | null) => void;
  onAddArtwork: (file: File, zone: PrintZoneDefinition) => Promise<ArtworkMutationResult>;
  onReplaceArtwork: (
    layerId: string,
    file: File,
    zone: PrintZoneDefinition,
  ) => Promise<ArtworkMutationResult>;
  onRemoveArtwork: (layerId: string) => void;
  onTransform: (layerId: string, patch: ArtworkTransformPatch, zone: PrintZoneDefinition) => void;
  onCenter: (layerId: string) => void;
  onOpacity: (layerId: string, opacity: number) => void;
  onArtworkImported: (blobId: string, decoded: DecodedArtwork) => void;
}

const HEADING_CLASS = 'text-tertiary text-xs font-medium uppercase tracking-wide';

/** Slider ergonomics only — the authoritative limits are the garment's, applied by `project-engine`. */
const ROTATION_STEP = 1;
const PERCENT_STEP = 1;

function toPercent(value: number): number {
  return Math.round(value * 100);
}

interface SliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Rendered next to the label and announced with the slider — never the only indication of the value. */
  readout: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

function Slider({ id, label, value, min, max, step, readout, disabled, onChange }: SliderProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-secondary text-xs">
          {label}
        </label>
        <span className="text-tertiary font-mono text-xs tabular-nums">{readout}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={readout}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-accent-strong focus-visible:ring-accent-strong focus-visible:ring-offset-surface-raised mt-1 h-9 w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
      />
    </div>
  );
}

interface ArtworkFileButtonProps {
  id: string;
  label: string;
  describedBy?: string;
  busy: boolean;
  variant: 'primary' | 'secondary';
  icon?: ReactNode;
  onFile: (file: File) => void;
}

/**
 * A file picker that looks and behaves like the rest of the Studio's
 * buttons. The real `<input type="file">` stays in the accessibility tree
 * and the tab order (it is visually hidden, not `display: none`), so
 * keyboard users reach it and open the picker with Enter as usual; the
 * `<label>` is what carries the button styling and the focus ring.
 */
function ArtworkFileButton({
  id,
  label,
  describedBy,
  busy,
  variant,
  icon,
  onFile,
}: ArtworkFileButtonProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset first: picking the same file twice in a row must still fire a
    // change event (a user retrying after an error usually picks the same
    // file, having just fixed it).
    event.target.value = '';
    if (file) onFile(file);
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="file"
        accept={ARTWORK_ACCEPT_ATTRIBUTE}
        disabled={busy}
        aria-describedby={describedBy}
        onChange={handleChange}
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className={buttonStyles(
          variant,
          'sm',
          `peer-focus-visible:ring-accent-strong peer-focus-visible:ring-offset-surface-raised w-full cursor-pointer peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 ${
            busy ? 'pointer-events-none opacity-40' : ''
          }`,
        )}
      >
        {icon}
        {busy ? 'Working…' : label}
      </label>
    </div>
  );
}

function LayerStatusNote({ asset }: { asset: ArtworkAsset | undefined }) {
  if (!asset || asset.status === 'ready') return null;
  if (asset.status === 'loading') {
    return (
      <span className="text-tertiary text-xs" role="status">
        Loading…
      </span>
    );
  }
  return (
    <span className="text-danger flex items-center gap-1 text-xs">
      <AlertIcon className="h-3.5 w-3.5 shrink-0" />
      {asset.status === 'missing' ? 'File missing' : 'Could not load'}
    </span>
  );
}

export function ArtworkPanel({
  project,
  manifest,
  assets,
  activeZoneId,
  onSelectZone,
  selectedLayerId,
  onSelectLayer,
  onAddArtwork,
  onReplaceArtwork,
  onRemoveArtwork,
  onTransform,
  onCenter,
  onOpacity,
  onArtworkImported,
}: ArtworkPanelProps) {
  const idPrefix = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // The panel is a scrolling column, and on a phone it lives in a short
  // sheet where a rejection message lands below the fold — the user picks a
  // bad file and, visually, nothing happens. Found during M03 mobile visual
  // QA at 360x800. Screen-reader users already get it via `role="alert"`;
  // this is the sighted equivalent.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);

  const zones = manifest.printZones;
  const activeZone = zones.find((zone) => zone.id === activeZoneId) ?? zones[0];
  const layers = activeZone ? artworkLayersInZone(project, activeZone.id) : [];
  const selectedLayer =
    layers.find((layer) => layer.id === selectedLayerId) ?? layers[layers.length - 1] ?? null;

  if (!activeZone) {
    return (
      <p className="text-tertiary text-sm leading-relaxed">
        This garment doesn&rsquo;t declare any print zones, so there&rsquo;s nowhere to place
        artwork.
      </p>
    );
  }

  const zone = activeZone;

  async function runImport(action: () => Promise<ArtworkMutationResult>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onArtworkImported(result.blobId, result.decoded);
      onSelectLayer(result.layerId);
    } finally {
      setBusy(false);
    }
  }

  function handleTransform(patch: ArtworkTransformPatch) {
    if (selectedLayer) onTransform(selectedLayer.id, patch, zone);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className={HEADING_CLASS} id={`${idPrefix}-zone-label`}>
          Print zone
        </h3>
        <div
          role="group"
          aria-labelledby={`${idPrefix}-zone-label`}
          className="mt-2 flex flex-wrap gap-2"
        >
          {zones.map((candidate) => {
            const active = candidate.id === zone.id;
            const count = artworkLayersInZone(project, candidate.id).length;
            return (
              <button
                key={candidate.id}
                type="button"
                aria-pressed={active}
                onClick={() => onSelectZone(candidate.id)}
                className={`focus-visible:ring-accent-strong flex min-h-9 items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                  active
                    ? 'border-accent bg-accent-muted text-primary'
                    : 'border-border bg-surface text-secondary hover:border-border-strong hover:text-primary'
                }`}
              >
                {/* An icon, not just the accent colour, marks the active zone. */}
                {active && <CheckIcon className="text-accent-strong h-3.5 w-3.5" />}
                {candidate.label}
                <span className="text-tertiary text-xs tabular-nums">
                  {count > 0 ? count : ''}
                  <span className="sr-only">
                    {count === 1 ? ', 1 artwork' : `, ${count} artworks`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-tertiary mt-2 text-xs leading-relaxed">
          Selecting a zone turns the garment to face it.
        </p>
      </div>

      <div>
        <h3 className={HEADING_CLASS}>{zone.label} artwork</h3>

        {layers.length === 0 ? (
          // The accepted formats are stated once, under the button — repeating
          // them here made the empty state read as two copies of the same
          // sentence at narrow widths.
          <p className="text-tertiary mt-2 text-sm leading-relaxed">
            Nothing on the {zone.label.toLowerCase()} yet. Add artwork to print it here.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {[...layers].reverse().map((layer: ArtworkLayer) => {
              const active = layer.id === selectedLayer?.id;
              const asset =
                layer.source.kind === 'local-blob' ? assets[layer.source.blobId] : undefined;
              return (
                <li key={layer.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => onSelectLayer(layer.id)}
                    className={`focus-visible:ring-accent-strong flex min-h-9 w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                      active
                        ? 'border-accent bg-accent-muted text-primary'
                        : 'border-border bg-surface text-secondary hover:border-border-strong hover:text-primary'
                    }`}
                  >
                    <CheckIcon
                      className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-accent-strong' : 'invisible'}`}
                    />
                    <span className="min-w-0 flex-1 truncate">{layer.name}</span>
                    <LayerStatusNote asset={asset} />
                    <span className="text-tertiary shrink-0 text-xs uppercase">
                      {ARTWORK_KIND_LABEL[layer.source.fileKind]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-3">
          <ArtworkFileButton
            id={`${idPrefix}-add`}
            label="Add artwork"
            describedBy={`${idPrefix}-formats`}
            busy={busy}
            // Accent is reserved for the one action the panel is asking for.
            // Once a zone has artwork, adding more is an ordinary option, not
            // the call to action — see docs/DESIGN_SYSTEM.md.
            variant={layers.length === 0 ? 'primary' : 'secondary'}
            onFile={(file) => void runImport(() => onAddArtwork(file, zone))}
          />
          <p id={`${idPrefix}-formats`} className="text-tertiary mt-1.5 text-xs leading-relaxed">
            {ACCEPTED_ARTWORK_LABEL}, up to 12&nbsp;MB. Artwork stays on this device — it is never
            uploaded.
          </p>
        </div>

        {error && (
          <p
            ref={errorRef}
            role="alert"
            className="border-danger/40 text-danger mt-2 flex items-start gap-1.5 rounded-md border px-2.5 py-2 text-xs leading-relaxed"
          >
            <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>

      {selectedLayer && (
        <ArtworkPlacementControls
          idPrefix={idPrefix}
          layer={selectedLayer}
          zone={zone}
          busy={busy}
          onTransform={handleTransform}
          onCenter={() => onCenter(selectedLayer.id)}
          onOpacity={(value) => onOpacity(selectedLayer.id, value)}
          onReplace={(file) => void runImport(() => onReplaceArtwork(selectedLayer.id, file, zone))}
          onRemove={() => {
            onRemoveArtwork(selectedLayer.id);
            onSelectLayer(null);
            setError(null);
          }}
        />
      )}
    </div>
  );
}

interface ArtworkPlacementControlsProps {
  idPrefix: string;
  layer: ArtworkLayer;
  zone: PrintZoneDefinition;
  busy: boolean;
  onTransform: (patch: ArtworkTransformPatch) => void;
  onCenter: () => void;
  onOpacity: (value: number) => void;
  onReplace: (file: File) => void;
  onRemove: () => void;
}

function ArtworkPlacementControls({
  idPrefix,
  layer,
  zone,
  busy,
  onTransform,
  onCenter,
  onOpacity,
  onReplace,
  onRemove,
}: ArtworkPlacementControlsProps) {
  // The position sliders' own range is derived from the same rotated
  // bounding box `project-engine` clamps against, so dragging one stops
  // where the artwork actually reaches the edge of the print zone rather
  // than travelling into a region the domain will silently snap back.
  const half = rotatedHalfExtent(
    layer.transform.scale.x,
    layer.transform.scale.y,
    layer.transform.rotationDegrees,
  );
  const xMin = toPercent(Math.min(half.x, 0.5));
  const xMax = toPercent(Math.max(1 - half.x, 0.5));
  const yMin = toPercent(Math.min(half.y, 0.5));
  const yMax = toPercent(Math.max(1 - half.y, 0.5));

  return (
    <div className="border-border flex flex-col gap-4 border-t pt-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className={HEADING_CLASS}>Placement</h3>
        <span className="text-tertiary truncate text-xs">{layer.name}</span>
      </div>

      <Slider
        id={`${idPrefix}-size`}
        label="Size"
        min={toPercent(MIN_ARTWORK_SCALE)}
        max={toPercent(zone.maxWidth)}
        step={PERCENT_STEP}
        value={toPercent(layer.transform.scale.x)}
        readout={`${toPercent(layer.transform.scale.x)}% wide`}
        onChange={(value) => onTransform({ widthFraction: value / 100 })}
      />

      <Slider
        id={`${idPrefix}-rotation`}
        label="Rotation"
        min={-180}
        max={180}
        step={ROTATION_STEP}
        value={Math.round(layer.transform.rotationDegrees)}
        readout={`${Math.round(layer.transform.rotationDegrees)}°`}
        onChange={(value) => onTransform({ rotationDegrees: value })}
      />

      <Slider
        id={`${idPrefix}-x`}
        label="Horizontal"
        min={xMin}
        max={xMax}
        step={PERCENT_STEP}
        value={Math.min(xMax, Math.max(xMin, toPercent(layer.transform.position.x)))}
        readout={`${toPercent(layer.transform.position.x)}% from left`}
        onChange={(value) => onTransform({ position: { x: value / 100 } })}
      />

      <Slider
        id={`${idPrefix}-y`}
        label="Vertical"
        min={yMin}
        max={yMax}
        step={PERCENT_STEP}
        value={Math.min(yMax, Math.max(yMin, toPercent(layer.transform.position.y)))}
        readout={`${toPercent(layer.transform.position.y)}% from bottom`}
        onChange={(value) => onTransform({ position: { y: value / 100 } })}
      />

      <Slider
        id={`${idPrefix}-opacity`}
        label="Opacity"
        min={5}
        max={100}
        step={PERCENT_STEP}
        value={toPercent(layer.opacity)}
        readout={`${toPercent(layer.opacity)}%`}
        onChange={(value) => onOpacity(value / 100)}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCenter}
          className={buttonStyles('secondary', 'sm', 'min-h-9')}
        >
          <CenterIcon className="h-4 w-4" />
          Center
        </button>
        <button
          type="button"
          onClick={onRemove}
          className={buttonStyles('secondary', 'sm', 'text-danger hover:border-danger/60 min-h-9')}
        >
          <TrashIcon className="h-4 w-4" />
          Remove
        </button>
      </div>

      <ArtworkFileButton
        id={`${idPrefix}-replace`}
        label="Replace artwork"
        busy={busy}
        variant="secondary"
        icon={<SwapIcon className="h-4 w-4" />}
        onFile={onReplace}
      />
    </div>
  );
}
