/**
 * Deterministic export filenames.
 *
 * Deliberately **no timestamp**. Re-exporting the same project at the same
 * settings should produce the same name: it lets a user overwrite a previous
 * attempt instead of accumulating a folder of near-identical files, and it
 * is what makes the export path testable at all. A timestamp would make
 * every identical job produce a different name for no product value.
 */

const MAX_NAME_SEGMENT = 48;

/** Combining diacritical marks, written as escapes so the source stays ASCII-safe. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Reduces a project name to something safe on every filesystem.
 *
 * Project names are user input rendered into a filename, so this strips
 * anything with meaning to a path (separators, traversal, device names) and
 * everything non-ASCII rather than trying to decide which Unicode is safe.
 * A name that reduces to nothing falls back rather than producing a file
 * called `-1080x1080.png`.
 */
export function slugifyProjectName(name: string, fallback = 'project'): string {
  const slug = name
    // Decompose accents, then drop the marks, so "Café" becomes "cafe"
    // rather than "caf".
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_NAME_SEGMENT)
    .replace(/-+$/g, '');

  return slug || fallback;
}

export interface ExportFilenameParts {
  projectName: string;
  width: number;
  height: number;
  extension: string;
}

/**
 * `threadform-my-project-1080x1920.png`.
 *
 * The dimensions are in the name because they are the one thing a user
 * cannot see from a file listing and most often needs to tell two exports
 * apart.
 */
export function exportFilename({
  projectName,
  width,
  height,
  extension,
}: ExportFilenameParts): string {
  return `threadform-${slugifyProjectName(projectName)}-${width}x${height}.${extension}`;
}
