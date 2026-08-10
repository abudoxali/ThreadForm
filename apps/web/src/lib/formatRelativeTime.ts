const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
];

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** Formats an ISO timestamp as "3 hours ago", "just now", etc., relative to `now`. */
export function formatRelativeTime(isoTimestamp: string, now: Date = new Date()): string {
  const parsed = Date.parse(isoTimestamp);
  // `listProjectSummaries` deliberately doesn't validate each record's full
  // payload, so a corrupt/missing timestamp must render as *something*
  // rather than throw and take the whole recents list down with it.
  if (!Number.isFinite(parsed)) return '';

  const deltaSeconds = Math.round((parsed - now.getTime()) / 1000);

  if (Math.abs(deltaSeconds) < 60) return 'just now';

  for (const [unit, secondsInUnit] of UNITS) {
    if (Math.abs(deltaSeconds) >= secondsInUnit) {
      return relativeTimeFormatter.format(Math.round(deltaSeconds / secondsInUnit), unit);
    }
  }

  return relativeTimeFormatter.format(Math.round(deltaSeconds / 60), 'minute');
}
