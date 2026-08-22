import { describe, expect, it } from 'vitest';
import { sanitizeSvg } from './sanitizeSvg';

/**
 * These are regression tests for a security boundary, not for formatting:
 * each case is a way an uploaded SVG could otherwise run script, reach the
 * network, or smuggle markup into the app's own origin
 * (`docs/PRIVACY_SECURITY.md`). Assertions are on what is *absent* from the
 * rebuilt document, because that is what actually protects the user.
 */

function sanitized(markup: string): string {
  const result = sanitizeSvg(markup);
  if (!result.ok) throw new Error(`expected sanitization to succeed: ${result.error}`);
  return result.markup;
}

const OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">';

describe('sanitizeSvg — script removal', () => {
  it('strips <script> elements and their contents', () => {
    const output = sanitized(
      `${OPEN}<script>alert(1)</script><rect width="10" height="10"/></svg>`,
    );
    expect(output).not.toContain('script');
    expect(output).not.toContain('alert');
    expect(output).toContain('rect');
  });

  it('strips event-handler attributes wherever they appear', () => {
    const output = sanitized(
      `${OPEN}<rect width="10" height="10" onload="alert(1)" onclick="alert(2)"/></svg>`,
    );
    expect(output).not.toContain('onload');
    expect(output).not.toContain('onclick');
    expect(output).not.toContain('alert');
  });

  it('strips an event handler on the root element itself', () => {
    const result = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" onload="alert(1)"/>',
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.markup).not.toContain('onload');
  });

  it('strips <foreignObject>, which can embed arbitrary HTML', () => {
    const output = sanitized(
      `${OPEN}<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><img src="x"/></body></foreignObject></svg>`,
    );
    expect(output).not.toContain('foreignObject');
    expect(output).not.toContain('img');
  });

  it('strips animation elements that could retarget an attribute at runtime', () => {
    const output = sanitized(
      `${OPEN}<rect width="10" height="10"><set attributeName="onload" to="alert(1)"/></rect></svg>`,
    );
    expect(output).not.toContain('<set');
    expect(output).not.toContain('alert');
  });
});

describe('sanitizeSvg — external resource references', () => {
  it('strips href values pointing off-document', () => {
    const output = sanitized(
      `${OPEN}<image href="https://example.com/pixel.png" width="10" height="10"/></svg>`,
    );
    expect(output).not.toContain('example.com');
  });

  it('strips xlink:href values pointing off-document', () => {
    const output = sanitized(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="100"><use xlink:href="https://example.com/evil.svg#x"/></svg>`,
    );
    expect(output).not.toContain('example.com');
  });

  it('keeps same-document fragment references, which are how SVG reuse works', () => {
    const output = sanitized(
      `${OPEN}<defs><rect id="tile" width="10" height="10"/></defs><use href="#tile"/></svg>`,
    );
    expect(output).toContain('#tile');
  });

  it('keeps an inline raster data URI', () => {
    const dataUri =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const output = sanitized(`${OPEN}<image href="${dataUri}" width="10" height="10"/></svg>`);
    expect(output).toContain('data:image/png;base64,');
  });

  it('strips a data URI that is not a raster image', () => {
    const output = sanitized(
      `${OPEN}<image href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" width="10" height="10"/></svg>`,
    );
    expect(output).not.toContain('data:image/svg');
  });

  it('strips @import and external url() from <style> and style attributes', () => {
    const output = sanitized(
      `${OPEN}<style>@import url("https://example.com/x.css"); rect { fill: red }</style><rect style="fill:url(https://example.com/p.svg#g)" width="10" height="10"/></svg>`,
    );
    expect(output).not.toContain('@import');
    expect(output).not.toContain('example.com');
    expect(output).toContain('fill: red');
  });

  it('drops a processing instruction that would load an external stylesheet', () => {
    const output = sanitized(
      `<?xml-stylesheet type="text/css" href="https://example.com/x.css"?>${OPEN}<rect width="10" height="10"/></svg>`,
    );
    expect(output).not.toContain('xml-stylesheet');
    expect(output).not.toContain('example.com');
  });
});

describe('sanitizeSvg — document shape', () => {
  it('rejects markup that is not valid XML', () => {
    const result = sanitizeSvg('<svg><rect></svg>');
    expect(result.ok).toBe(false);
  });

  it('rejects a well-formed XML document whose root is not <svg>', () => {
    const result = sanitizeSvg('<rss xmlns="http://example.com"><channel/></rss>');
    expect(result).toEqual({ ok: false, error: 'That file is not an SVG image.' });
  });

  it('reports the declared intrinsic size', () => {
    const result = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"></svg>',
    );
    expect(result.ok && result.width).toBe(320);
    expect(result.ok && result.height).toBe(180);
  });

  it('derives a size from the viewBox when width/height are missing or relative', () => {
    const result = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 64 32"></svg>',
    );
    expect(result.ok && result.width).toBe(64);
    expect(result.ok && result.height).toBe(32);
    // An <img> needs a concrete size to rasterize predictably.
    expect(result.ok && result.markup).toContain('width="64"');
  });

  it('falls back to a fixed size for an SVG that declares none at all', () => {
    const result = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(result.ok && result.width).toBe(512);
    expect(result.ok && result.markup).toContain('viewBox="0 0 512 512"');
  });

  it('leaves ordinary drawing content intact', () => {
    const output = sanitized(
      `${OPEN}<g><circle cx="50" cy="50" r="20" fill="#ff00aa"/><path d="M0 0 L10 10"/></g></svg>`,
    );
    expect(output).toContain('circle');
    expect(output).toContain('#ff00aa');
    expect(output).toContain('path');
  });
});
