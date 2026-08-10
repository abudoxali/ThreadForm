/** Stable id generator for projects, artwork layers and effects. */
export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
