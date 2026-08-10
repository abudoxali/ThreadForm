export interface Vector2 {
  x: number;
  y: number;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/** 2D placement of an artwork layer within a print zone, in zone-normalized units (0–1). */
export interface Transform2D {
  position: Vector2;
  rotationDegrees: number;
  scale: Vector2;
}
