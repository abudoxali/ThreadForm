/**
 * Handing a finished export to the browser.
 *
 * The object URL is revoked on the next turn of the event loop rather than
 * synchronously: the click has to be dispatched and the navigation started
 * before the URL is torn down, but leaving it alive pins the whole encoded
 * image — a 4K PNG is tens of megabytes — for the lifetime of the document.
 * Exporting repeatedly without this is a steady leak the user cannot see.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
