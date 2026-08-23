'use client';

import { useEffect, useId, useState } from 'react';
import type {
  ExportAspectRatio,
  ExportImageFormat,
  ExportResolution,
  ExportTargetPreset,
  Project,
} from '@threadform/types';
import {
  EXPORT_TARGETS,
  IMAGE_FORMAT_ORDER,
  MAX_EXPORT_DIMENSION_PX,
  formatDimensions,
  imageFormat,
  resolveExportDimensions,
  supportedImageFormats,
} from '@threadform/export-engine';
import type { ExportJobState } from '@threadform/export-engine';
import { buttonStyles } from '@threadform/ui';
import { AlertIcon, CheckIcon, ExportIcon } from './icons';

export interface ExportPanelProps {
  project: Project;
  onTargetChange: (target: ExportTargetPreset) => void;
  onFormatChange: (format: ExportImageFormat) => void;
  onResolutionChange: (resolution: ExportResolution) => void;
  onAspectRatioChange: (aspectRatio: ExportAspectRatio) => void;
  onCustomDimensionsChange: (width: number, height: number) => void;
  job: ExportJobState;
  blockedReason: string | null;
  onExport: () => void;
}

const HEADING_CLASS = 'text-tertiary text-xs font-medium uppercase tracking-wide';

const RESOLUTIONS: Array<{ id: ExportResolution; label: string }> = [
  { id: '720p', label: '720p' },
  { id: '1080p', label: '1080p' },
  { id: '1440p', label: '1440p' },
  { id: '4k', label: '4K' },
];

const ASPECT_RATIOS: Array<{ id: ExportAspectRatio; label: string }> = [
  { id: '1:1', label: '1:1' },
  { id: '4:5', label: '4:5' },
  { id: '9:16', label: '9:16' },
  { id: '16:9', label: '16:9' },
  // "Custom size", not "Custom": the preset group above already has a
  // "Custom" option, and two identically-named toggles in one panel are
  // ambiguous to read and worse to hear announced. Caught when an export
  // test could not tell them apart either.
  { id: 'custom', label: 'Custom size' },
];

/** Shared styling for the panel's small toggle buttons. */
function OptionButton({
  label,
  active,
  title,
  onClick,
}: {
  label: string;
  active: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      onClick={onClick}
      className={`focus-visible:ring-accent-strong flex min-h-9 items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
        active
          ? 'border-accent bg-accent-muted text-primary'
          : 'border-border bg-surface text-secondary hover:border-border-strong hover:text-primary'
      }`}
    >
      {/* Icon, not colour alone, marks the active option. */}
      {active && <CheckIcon className="text-accent-strong h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

/**
 * Export settings and the export action.
 *
 * Only image export appears here. `ExportPreferences` also models video and
 * the type vocabulary reaches to 3D formats, but none of that has an
 * implementation — and a control that opens onto nothing is exactly what
 * this project's tool rail already refuses to ship.
 *
 * The computed pixel size is shown before the user commits, because it is
 * the one thing a resolution tier plus an aspect ratio does not make
 * obvious. No estimated file size: that would be a guess presented as a
 * fact.
 */
export function ExportPanel({
  project,
  onTargetChange,
  onFormatChange,
  onResolutionChange,
  onAspectRatioChange,
  onCustomDimensionsChange,
  job,
  blockedReason,
  onExport,
}: ExportPanelProps) {
  const idPrefix = useId();
  const preferences = project.exportPreferences;
  const dimensions = resolveExportDimensions(preferences);

  // Which formats this browser can genuinely encode. Probed rather than
  // assumed: `canvas.toBlob` silently falls back to PNG for a format it
  // cannot produce, so offering WebP unconditionally would risk handing
  // someone a PNG named `.webp`.
  const [availableFormats, setAvailableFormats] = useState<ExportImageFormat[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void supportedImageFormats().then((formats) => {
      if (!cancelled) setAvailableFormats(formats);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const formats = availableFormats ?? IMAGE_FORMAT_ORDER;
  const activeFormat = imageFormat(preferences.image.format);
  const isCustom = preferences.aspectRatio === 'custom';
  const busy =
    job.status === 'preparing' || job.status === 'rendering' || job.status === 'encoding';

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className={HEADING_CLASS} id={`${idPrefix}-target`}>
          Preset
        </h3>
        <div
          role="group"
          aria-labelledby={`${idPrefix}-target`}
          className="mt-2 flex flex-wrap gap-2"
        >
          {EXPORT_TARGETS.map((target) => (
            <OptionButton
              key={target.id}
              label={target.label}
              title={target.description}
              active={preferences.target === target.id}
              onClick={() => onTargetChange(target.id)}
            />
          ))}
        </div>
        <p className="text-tertiary mt-2 text-xs leading-relaxed">
          ThreadForm presets — sensible starting sizes, not a guarantee of what any platform
          accepts. Adjust the shape and size below at any time.
        </p>
      </div>

      <div>
        <h3 className={HEADING_CLASS} id={`${idPrefix}-format`}>
          Format
        </h3>
        <div
          role="group"
          aria-labelledby={`${idPrefix}-format`}
          className="mt-2 flex flex-wrap gap-2"
        >
          {formats.map((format) => (
            <OptionButton
              key={format}
              label={imageFormat(format).label}
              title={imageFormat(format).description}
              active={preferences.image.format === format}
              onClick={() => onFormatChange(format)}
            />
          ))}
        </div>
        <p className="text-tertiary mt-2 text-xs leading-relaxed">{activeFormat.description}</p>
      </div>

      <div>
        <h3 className={HEADING_CLASS} id={`${idPrefix}-shape`}>
          Shape
        </h3>
        <div
          role="group"
          aria-labelledby={`${idPrefix}-shape`}
          className="mt-2 flex flex-wrap gap-2"
        >
          {ASPECT_RATIOS.map((ratio) => (
            <OptionButton
              key={ratio.id}
              label={ratio.label}
              active={preferences.aspectRatio === ratio.id}
              onClick={() => onAspectRatioChange(ratio.id)}
            />
          ))}
        </div>
      </div>

      {isCustom ? (
        <CustomDimensions
          idPrefix={idPrefix}
          width={preferences.customAspectRatio?.width ?? 1080}
          height={preferences.customAspectRatio?.height ?? 1080}
          onChange={onCustomDimensionsChange}
        />
      ) : (
        <div>
          <h3 className={HEADING_CLASS} id={`${idPrefix}-size`}>
            Size
          </h3>
          <div
            role="group"
            aria-labelledby={`${idPrefix}-size`}
            className="mt-2 flex flex-wrap gap-2"
          >
            {RESOLUTIONS.map((resolution) => (
              <OptionButton
                key={resolution.id}
                label={resolution.label}
                active={preferences.image.resolution === resolution.id}
                onClick={() => onResolutionChange(resolution.id)}
              />
            ))}
          </div>
          <p className="text-tertiary mt-2 text-xs leading-relaxed">
            The size names the image&rsquo;s shortest side.
          </p>
        </div>
      )}

      <div className="border-border border-t pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className={HEADING_CLASS}>Output</h3>
          <span
            className="text-primary font-mono text-sm tabular-nums"
            data-testid="export-dimensions"
          >
            {dimensions.ok ? formatDimensions(dimensions.dimensions) : '—'}
          </span>
        </div>

        {!dimensions.ok && (
          <p
            role="alert"
            className="border-danger/40 text-danger mt-2 flex items-start gap-1.5 rounded-md border px-2.5 py-2 text-xs leading-relaxed"
          >
            <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{dimensions.error}</span>
          </p>
        )}

        <button
          type="button"
          onClick={onExport}
          disabled={busy || !dimensions.ok || blockedReason !== null}
          className={buttonStyles('primary', 'sm', 'mt-3 w-full')}
        >
          <ExportIcon className="h-4 w-4" />
          {busy ? 'Exporting…' : 'Export image'}
        </button>

        <ExportStatus job={job} blockedReason={blockedReason} />
      </div>
    </div>
  );
}

/**
 * The job's live state.
 *
 * `role="status"` rather than a silent visual change: an export is
 * asynchronous and can take seconds at 4K, so its progress and — more
 * importantly — its completion and failure have to reach someone who is not
 * watching the panel. Failures use `role="alert"` so they interrupt.
 */
function ExportStatus({
  job,
  blockedReason,
}: {
  job: ExportJobState;
  blockedReason: string | null;
}) {
  if (job.status === 'failed') {
    return (
      <p
        role="alert"
        className="border-danger/40 text-danger mt-2 flex items-start gap-1.5 rounded-md border px-2.5 py-2 text-xs leading-relaxed"
      >
        <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{job.error}</span>
      </p>
    );
  }

  if (blockedReason) {
    return (
      <p role="status" className="text-tertiary mt-2 text-xs leading-relaxed">
        {blockedReason}
      </p>
    );
  }

  const message =
    job.status === 'preparing'
      ? 'Preparing…'
      : job.status === 'rendering'
        ? `Rendering ${job.dimensions.width} × ${job.dimensions.height}…`
        : job.status === 'encoding'
          ? 'Encoding…'
          : job.status === 'completed'
            ? `Saved ${job.filename}`
            : null;

  if (!message) return null;

  return (
    <p
      role="status"
      className={`mt-2 text-xs leading-relaxed ${
        job.status === 'completed' ? 'text-success' : 'text-tertiary'
      }`}
    >
      {message}
    </p>
  );
}

function CustomDimensions({
  idPrefix,
  width,
  height,
  onChange,
}: {
  idPrefix: string;
  width: number;
  height: number;
  onChange: (width: number, height: number) => void;
}) {
  return (
    <div>
      <h3 className={HEADING_CLASS}>Custom size</h3>
      <div className="mt-2 flex items-end gap-2">
        <label className="flex-1">
          <span className="text-secondary block text-xs">Width</span>
          <input
            id={`${idPrefix}-width`}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_EXPORT_DIMENSION_PX}
            value={width}
            onChange={(event) => onChange(Number(event.target.value), height)}
            className="border-border bg-surface text-primary focus-visible:ring-accent-strong mt-1 h-9 w-full rounded-md border px-2 font-mono text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          />
        </label>
        <span className="text-tertiary pb-2 text-sm">×</span>
        <label className="flex-1">
          <span className="text-secondary block text-xs">Height</span>
          <input
            id={`${idPrefix}-height`}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_EXPORT_DIMENSION_PX}
            value={height}
            onChange={(event) => onChange(width, Number(event.target.value))}
            className="border-border bg-surface text-primary focus-visible:ring-accent-strong mt-1 h-9 w-full rounded-md border px-2 font-mono text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          />
        </label>
      </div>
      <p className="text-tertiary mt-2 text-xs leading-relaxed">
        Up to {MAX_EXPORT_DIMENSION_PX}px on a side.
      </p>
    </div>
  );
}
