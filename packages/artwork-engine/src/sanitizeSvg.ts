/**
 * Sanitizes untrusted SVG markup before ThreadForm ever renders or
 * rasterizes it, per `docs/PRIVACY_SECURITY.md`. SVG is a full XML document
 * format that can carry `<script>`, embedded HTML via `<foreignObject>`,
 * event-handler attributes, external stylesheet references, and remote
 * resource loads. Uploaded artwork is untrusted input, so the file that
 * reaches storage and the renderer is a *rebuilt* document containing only
 * what survived this pass — never the bytes the user supplied.
 *
 * Two design notes worth keeping:
 *
 * - This is an allow-list for references and a deny-list for elements and
 *   attributes, applied to a parsed DOM rather than to the raw string. A
 *   regex-over-markup sanitizer is defeated by entity encoding, unusual
 *   namespace prefixes, and attribute-value quoting tricks; parsing first
 *   removes that whole class of bypass.
 * - It runs on *every* load, not just on import. Persisted project data is
 *   a trust boundary of its own (the same reason `local-storage` re-runs
 *   `validateProject` on every read), so a blob written by an older build —
 *   or edited directly in DevTools — is re-sanitized before use.
 */

/** Elements removed outright, along with everything inside them. */
const FORBIDDEN_ELEMENTS = new Set([
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'audio',
  'video',
  'handler',
  'listener',
  'set',
  'animate',
  'animatemotion',
  'animatetransform',
  'discard',
]);

/** Attributes removed wherever they appear, regardless of element. */
const FORBIDDEN_ATTRIBUTES = new Set([
  'xlink:actuate',
  'xlink:arcrole',
  'xlink:role',
  'xlink:show',
  'requiredextensions',
  'systemlanguage',
]);

const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** Raster data URIs are allowed inline; everything else must be a same-document fragment. */
const SAFE_DATA_URI = /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i;

function isSafeReference(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith('#')) return true;
  return SAFE_DATA_URI.test(trimmed);
}

/**
 * Strips `@import` rules and any non-fragment `url()` reference out of CSS
 * text. Both are network loads initiated by the artwork itself, which a
 * local-first app must never perform on a user's behalf.
 */
function sanitizeCss(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (match, _quote: string, target: string) =>
      isSafeReference(target) ? match : 'none',
    );
}

function sanitizeElement(element: Element): void {
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    const localName = attribute.localName.toLowerCase();

    // Event handlers (`onload`, `onclick`, …) are the most direct script
    // vector and are never legitimate in artwork.
    if (name.startsWith('on') || FORBIDDEN_ATTRIBUTES.has(name)) {
      element.removeAttributeNode(attribute);
      continue;
    }

    if (localName === 'href' && !isSafeReference(attribute.value)) {
      element.removeAttributeNode(attribute);
      continue;
    }

    if (localName === 'style') {
      element.setAttribute('style', sanitizeCss(attribute.value));
    }
  }

  if (element.localName.toLowerCase() === 'style') {
    element.textContent = sanitizeCss(element.textContent ?? '');
  }

  for (const child of Array.from(element.children)) {
    if (FORBIDDEN_ELEMENTS.has(child.localName.toLowerCase())) {
      child.remove();
      continue;
    }
    sanitizeElement(child);
  }
}

/** Parses `width="120"`, `width="120px"` and the like; returns `null` for percentages and other relative units. */
function parseLength(value: string | null): number | null {
  if (!value) return null;
  const match = /^\s*(-?\d*\.?\d+)\s*(px)?\s*$/i.exec(value);
  if (!match?.[1]) return null;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseViewBox(value: string | null): { width: number; height: number } | null {
  if (!value) return null;
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length !== 4) return null;
  const [, , width, height] = parts;
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

/**
 * Fallback intrinsic size for an SVG that declares neither usable
 * `width`/`height` nor a `viewBox`. Such a file has no size of its own, and
 * an `<img>` would rasterize it at a browser-dependent default; pinning one
 * here keeps import deterministic.
 */
const DEFAULT_SVG_SIZE = 512;

export type SvgSanitizeResult =
  { ok: true; markup: string; width: number; height: number } | { ok: false; error: string };

export function sanitizeSvg(markup: string): SvgSanitizeResult {
  let document: Document;
  try {
    document = new DOMParser().parseFromString(markup, 'image/svg+xml');
  } catch {
    return { ok: false, error: 'That SVG file could not be read.' };
  }

  if (document.getElementsByTagName('parsererror').length > 0) {
    return { ok: false, error: 'That SVG file is not valid XML.' };
  }

  const root = document.documentElement;
  if (!root || root.localName.toLowerCase() !== 'svg') {
    return { ok: false, error: 'That file is not an SVG image.' };
  }

  // Anything outside the root element — a doctype (whose internal subset can
  // declare entities) or a processing instruction such as
  // `<?xml-stylesheet href="…"?>` (an external CSS load) — is dropped by
  // rebuilding from the root alone.
  for (const node of Array.from(document.childNodes)) {
    if (node !== root) document.removeChild(node);
  }

  sanitizeElement(root);
  root.setAttribute('xmlns', SVG_NAMESPACE);
  root.removeAttributeNS(XLINK_NAMESPACE, 'href');

  const viewBox = parseViewBox(root.getAttribute('viewBox'));
  const declaredWidth = parseLength(root.getAttribute('width'));
  const declaredHeight = parseLength(root.getAttribute('height'));
  const width = declaredWidth ?? viewBox?.width ?? DEFAULT_SVG_SIZE;
  const height = declaredHeight ?? viewBox?.height ?? DEFAULT_SVG_SIZE;

  // An `<img>` needs an explicit intrinsic size to rasterize predictably.
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  if (!viewBox) root.setAttribute('viewBox', `0 0 ${width} ${height}`);

  return { ok: true, markup: new XMLSerializer().serializeToString(root), width, height };
}
