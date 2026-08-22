// Generates ThreadForm's first original garment asset: a procedural
// development-grade T-shirt mesh, exported as GLB.
//
// This is NOT a scan, a downloaded asset, or a third-party model — every
// vertex is constructed here from explicit coordinates. See
// assets/garments/threadform-essential-tee/PROVENANCE.md for the full
// record. Run with: node scripts/generate-essential-tee.mjs
//
// M02.5 rebuild: the torso is now a lofted body of revolution
// (THREE.LatheGeometry) instead of a flat 2D silhouette pushed straight
// through with THREE.ExtrudeGeometry — it has real chest/back curvature, a
// smooth shoulder-to-neck taper, and a genuine (if simplified, symmetric)
// crew-neck opening, rather than a flat panel with a notch cut in its
// outline. Sleeves are now capped (no open tube ends) and seated deep
// enough into the shoulder to remove the visible seam gap documented as a
// known M02 limitation.
import * as THREE from 'three';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * three.js's GLTFExporter assembles both its binary (.glb) and embedded-
 * base64 (.gltf) output through the browser's `FileReader`, which doesn't
 * exist in plain Node. This shim covers exactly the two methods/events the
 * exporter actually calls (`readAsArrayBuffer`/`readAsDataURL`, both
 * resolved via `onloadend`) using Node's built-in `Blob.arrayBuffer()` —
 * no DOM or browser dependency involved in what it's actually doing.
 */
globalThis.FileReader = class FileReaderShim {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      const base64 = Buffer.from(buffer).toString('base64');
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${base64}`;
      this.onloadend?.();
    });
  }
};

const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// Front-to-back flattening applied to the (circular, by construction) lathe
// cross-section — a torso reads as an oval, not a cylinder. 1.0 would leave
// it perfectly round; lower is flatter front-to-back.
const DEPTH_RATIO = 0.62;
const LATHE_SEGMENTS = 32;

/**
 * Where the lathe starts its revolution, and therefore where the torso's UV
 * seam falls. This is a *print-zone* decision, not a modelling one (M03).
 *
 * `THREE.LatheGeometry` places vertex `i` at `phi = phiStart + i/segments *
 * 2PI` and assigns it `u = i / segments`, with `x = r*sin(phi)`,
 * `z = r*cos(phi)`. Garments face +Z (docs/GARMENT_SPEC.md), so the front
 * centerline is `phi = 0` and the back centerline is `phi = PI`.
 *
 * Starting at `-PI/2` puts:
 *   - the seam (u = 0 / u = 1, where the texture wraps) on the garment's
 *     left side, away from every print zone;
 *   - the front centerline at u = 0.25;
 *   - the back centerline at u = 0.75.
 *
 * With the default `phiStart = 0` the seam ran straight down the middle of
 * the chest, so any front artwork would have been torn in half across the
 * texture wrap. That - plus per-face UVs that made front and back
 * indistinguishable - is the "front and back both map to Mesh_Torso"
 * limitation M02 documented; this is the minimum change that fixes it,
 * and it leaves the silhouette itself untouched.
 */
const LATHE_PHI_START = -Math.PI / 2;

/**
 * The torso's radial profile, hem to collar, as (radius, height) pairs in
 * meters — revolved a full turn around the Y axis. `radius` becomes the
 * half-*width* (X) directly; half-*depth* (Z) is `radius * DEPTH_RATIO`,
 * applied after revolution by scaling the Z axis (see `buildTorsoGeometry`).
 * This is the same "outline" idea the previous flat-panel version used,
 * just revolved into a volumetric body instead of extruded through a fixed
 * depth — so it gains chest/back curvature and a smooth shoulder taper for
 * free, and a real (if simplified, rotationally-symmetric) crew-neck
 * opening instead of a notch cut into a flat outline.
 */
const TORSO_PROFILE = [
  [0.3, -0.38], // hem
  [0.312, -0.36], // hem taper-out
  [0.318, -0.2], // lower torso
  [0.322, -0.02], // waist / ribcage
  [0.332, 0.13], // chest — widest point, most volume
  [0.326, 0.22], // upper chest, shoulder taper begins
  [0.288, 0.29], // shoulder line — sleeves seat here
  [0.19, 0.335], // shoulder-to-neck slope
  [0.11, 0.358], // neck base
  [0.096, 0.368], // collar body
  [0.086, 0.376], // collar rim (top of profile — left open as the neck hole)
];

/**
 * Replaces the lathe's default vertical UVs with ones that are linear in
 * height.
 *
 * `LatheGeometry` assigns `v = j / (points.length - 1)` - the *index* of a
 * profile point, not its height. `TORSO_PROFILE` is deliberately denser
 * near the collar than through the body, so the default mapping compresses
 * the chest and stretches the shoulders: a print placed at v = 0.6 would
 * land in a different physical spot than the same v on a garment with an
 * evenly-sampled profile. Re-deriving v from the vertex's own Y makes the
 * zone rectangles in `manifest.json` mean a fixed distance up the garment,
 * which is what lets those rectangles be authored as real measurements.
 */
function applyHeightLinearUvs(geometry) {
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');

  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const span = maxY - minY || 1;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setY(i, (position.getY(i) - minY) / span);
  }
  uv.needsUpdate = true;

  return { minY, maxY };
}

function buildTorsoGeometry() {
  const points = TORSO_PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
  const geometry = new THREE.LatheGeometry(points, LATHE_SEGMENTS, LATHE_PHI_START, Math.PI * 2);
  geometry.scale(1, 1, DEPTH_RATIO);
  applyHeightLinearUvs(geometry);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.name = 'TorsoGeometry';
  return geometry;
}

/** A flat disc closing the hem opening the lathe body leaves at the bottom. */
function buildHemCapGeometry() {
  const [hemRadius, hemY] = TORSO_PROFILE[0];
  const geometry = new THREE.CircleGeometry(hemRadius, LATHE_SEGMENTS);
  geometry.scale(1, DEPTH_RATIO, 1); // circle lies in XY by default; pre-scale its "Y" (destined to become Z)
  geometry.rotateX(Math.PI / 2); // lay it flat into the XZ plane, normal now points -Y (down/outward)
  geometry.translate(0, hemY, 0);
  geometry.computeVertexNormals();
  geometry.name = 'HemCapGeometry';
  return geometry;
}

function buildSleeveGeometry() {
  const radiusTop = 0.096;
  const radiusBottom = 0.078;
  const length = 0.26;
  const radialSegments = 16;
  // `openEnded: false` (the default) gives real end caps — the previous
  // open-ended tube was exactly why a gap was visible where the sleeve met
  // the shoulder (you could see straight through it to the background).
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, radialSegments);
  geometry.translate(0, length / 2, 0); // base at origin, extends along +Y
  geometry.computeVertexNormals();
  return geometry;
}

function buildSleeveMesh(signX, geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = signX > 0 ? 'Mesh_Sleeve_R' : 'Mesh_Sleeve_L';
  mesh.rotation.z = -signX * (Math.PI / 2 + THREE.MathUtils.degToRad(22));
  // Seated well inside the shoulder ring's radius (~0.288 at y=0.29) and at
  // the ring's own height, so the capped sleeve base is embedded in the
  // torso volume rather than merely touching its surface — this is what
  // actually removes the seam gap (the geometric cap alone isn't enough
  // without real overlap).
  mesh.position.set(signX * 0.2, 0.285, 0);
  return mesh;
}

function buildScene() {
  const fabricMaterial = new THREE.MeshStandardMaterial({
    name: 'Fabric',
    color: new THREE.Color('#f5f5f0'),
    roughness: 0.88,
    metalness: 0.0,
  });

  const torso = new THREE.Mesh(buildTorsoGeometry(), fabricMaterial);
  torso.name = 'Mesh_Torso';

  const hemCap = new THREE.Mesh(buildHemCapGeometry(), fabricMaterial);
  hemCap.name = 'Mesh_HemCap';

  const sleeveGeometry = buildSleeveGeometry();
  const sleeveRight = buildSleeveMesh(1, sleeveGeometry, fabricMaterial);
  const sleeveLeft = buildSleeveMesh(-1, sleeveGeometry.clone(), fabricMaterial);

  const root = new THREE.Group();
  root.name = 'ThreadFormEssentialTee';
  root.add(torso, hemCap, sleeveRight, sleeveLeft);
  return root;
}

async function main() {
  const root = buildScene();

  const exporter = new GLTFExporter();
  const glb = await new Promise((resolve, reject) => {
    exporter.parse(root, resolve, reject, { binary: true });
  });

  const buffer = Buffer.from(glb);

  const assetDir = path.join(repoRoot, 'assets/garments/threadform-essential-tee');
  const publicDir = path.join(repoRoot, 'apps/web/public/garments/threadform-essential-tee');
  await mkdir(assetDir, { recursive: true });
  await mkdir(publicDir, { recursive: true });

  const modelPath = path.join(assetDir, 'model.glb');
  await writeFile(modelPath, buffer);
  await copyFile(modelPath, path.join(publicDir, 'model.glb'));

  // apps/web/public is the copy Next.js actually serves; assets/garments is
  // the documented, versioned source of truth (see PROVENANCE.md). Keep
  // manifest.json in sync too whenever the model is regenerated.
  const manifestSourcePath = path.join(assetDir, 'manifest.json');
  await copyFile(manifestSourcePath, path.join(publicDir, 'manifest.json'));

  console.log(`Wrote ${modelPath} (${(buffer.byteLength / 1024).toFixed(1)} KB)`);
  console.log(
    'Copied model.glb and manifest.json to apps/web/public/garments/threadform-essential-tee/',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
