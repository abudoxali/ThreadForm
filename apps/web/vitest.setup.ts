import '@testing-library/jest-dom/vitest';
// Real, spec-faithful IndexedDB for jsdom (which has none), so component
// tests that exercise the Studio's persistence flow hit actual IndexedDB
// semantics rather than needing every test to mock the repository layer.
import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom's `Blob` predates `Blob.prototype.arrayBuffer`/`text`, which the
// artwork import path uses to read a file's bytes before trusting them.
// Implementing them over jsdom's own `FileReader` keeps the code under test
// on its real path rather than forcing every artwork test to mock the
// reading step it is partly there to exercise.
function readBlobAs<T>(blob: Blob, read: (reader: FileReader, blob: Blob) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as T);
    reader.onerror = () => reject(reader.error ?? new Error('failed to read blob'));
    read(reader, blob);
  });
}

if (typeof Blob !== 'undefined' && typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
    return readBlobAs<ArrayBuffer>(this, (reader, blob) => reader.readAsArrayBuffer(blob));
  };
}

// jsdom implements no layout and therefore no scrolling, so
// `Element.scrollIntoView` is simply absent. A no-op keeps components that
// scroll something into view (the artwork panel's rejection message) from
// throwing here — whether the scroll actually happens is a browser
// behaviour and is checked in the browser, not asserted in jsdom.
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

if (typeof Blob !== 'undefined' && typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function text(this: Blob) {
    return readBlobAs<string>(this, (reader, blob) => reader.readAsText(blob));
  };
}

afterEach(() => {
  cleanup();
});
