/**
 * A restrained product-photography rig, not a dramatic/cinematic setup.
 * `hemisphereLight` stands in for a cheap "environment contribution" —
 * a soft sky/ground split tint instead of flat ambient — so mid-tones read
 * with some dimensionality without the cost or external-asset dependency of
 * an HDRI environment map (drei's `<Environment>` fetches one from a CDN,
 * which this local-first app deliberately avoids — see
 * docs/PRIVACY_SECURITY.md). Key light establishes form and shadow
 * direction; fill lifts the shadow side without flattening it; rim
 * separates the garment from the dark studio background.
 *
 * The rim light is intentionally stronger than a typical three-point ratio:
 * a dark (e.g. black) garment against the dark `--tf-color-bg-canvas`
 * background has very little diffuse response to key/fill light, so without
 * a pronounced edge highlight it disappears into the backdrop entirely —
 * confirmed visually (M02 design review, re-confirmed M02.5) at every
 * viewport with the "Black" color swatch selected.
 */
export function StudioLighting() {
  return (
    <>
      <hemisphereLight args={['#3a3d45', '#0e0e10', 0.55]} />
      <ambientLight intensity={0.22} />
      <directionalLight position={[1.6, 2.4, 2.2]} intensity={1.2} color="#fff2e2" />
      <directionalLight position={[-2.2, 0.8, -0.6]} intensity={0.5} color="#dce6ff" />
      <directionalLight position={[-0.4, 1.6, -2.6]} intensity={1.35} color="#ffffff" />
    </>
  );
}
