export interface Vector2 {
  x: number;
  y: number;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * 2D placement of an artwork layer within a print zone, in zone-normalized
 * units (0–1). `position` is the artwork's *center*: `{x: 0.5, y: 0.5}` is
 * the middle of the zone, `y: 1` its top edge (zone-normalized space is
 * y-up, matching the garment's own UV orientation, not screen coordinates).
 * `scale` is the artwork's extent as a fraction of the zone — `scale.x:
 * 0.5` means the artwork spans half the zone's width. `rotationDegrees` is
 * clockwise from the viewer's perspective.
 */
export interface Transform2D {
  position: Vector2;
  rotationDegrees: number;
  scale: Vector2;
}
