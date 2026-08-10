import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './formatRelativeTime';

const NOW = new Date('2026-08-10T12:00:00.000Z');

describe('formatRelativeTime', () => {
  it('returns "just now" for timestamps within the last minute', () => {
    expect(formatRelativeTime('2026-08-10T11:59:30.000Z', NOW)).toBe('just now');
  });

  it('formats minutes ago', () => {
    expect(formatRelativeTime('2026-08-10T11:55:00.000Z', NOW)).toBe('5 minutes ago');
  });

  it('formats hours ago', () => {
    expect(formatRelativeTime('2026-08-10T09:00:00.000Z', NOW)).toBe('3 hours ago');
  });

  it('formats days ago', () => {
    expect(formatRelativeTime('2026-08-08T12:00:00.000Z', NOW)).toBe('2 days ago');
  });

  it('formats a future timestamp', () => {
    expect(formatRelativeTime('2026-08-10T12:05:00.000Z', NOW)).toBe('in 5 minutes');
  });

  it('does not throw on an unparseable timestamp', () => {
    expect(formatRelativeTime('not-a-date', NOW)).toBe('');
    expect(formatRelativeTime('', NOW)).toBe('');
  });
});
