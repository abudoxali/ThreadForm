/**
 * A minimal, deliberate three-point rig for inspecting garment shape and
 * color — not a dramatic/cinematic setup. Key light establishes form and
 * shadow direction; fill lifts the shadow side without flattening it; rim
 * separates the garment from the dark studio background.
 *
 * The rim light is intentionally stronger than a typical three-point ratio:
 * a dark (e.g. black) garment against the dark `--tf-color-bg-canvas`
 * background has very little diffuse response to key/fill light, so without
 * a pronounced edge highlight it disappears into the backdrop entirely —
 * confirmed visually (M02 design review) at every viewport with the
 * "Black" color swatch selected.
 */
export function StudioLighting() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[1.6, 2.4, 2.2]} intensity={1.15} color="#fff2e2" />
      <directionalLight position={[-2.2, 0.8, -0.6]} intensity={0.5} color="#dce6ff" />
      <directionalLight position={[-0.4, 1.6, -2.6]} intensity={1.3} color="#ffffff" />
    </>
  );
}
