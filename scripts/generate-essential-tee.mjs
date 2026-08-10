// Generates ThreadForm's first original garment asset: a procedural
// development-grade T-shirt mesh, exported as GLB.
//
// This is NOT a scan, a downloaded asset, or a third-party model — every
// vertex is constructed here from explicit coordinates. See
// assets/garments/threadform-essential-tee/PROVENANCE.md for the full
// record. Run with: node scripts/generate-essential-tee.mjs
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

const DEPTH = 0.16; // front-to-back torso thickness, meters

function buildTorsoShape() {
  const shape = new THREE.Shape();
  // Right-half outline, ascending from the hem to the neck, in meters.
  // Torso only — sleeves are separate cylinder meshes attached at the shoulder.
  const rightSide = [
    [0.3, -0.36], // hem, right corner
    [0.32, -0.1], // waist
    [0.3, 0.06], // underarm
    [0.34, 0.22], // shoulder edge (sleeve attaches near here)
    [0.2, 0.34], // shoulder, near neck
    [0.09, 0.365], // neck base, right
  ];

  shape.moveTo(rightSide[0][0], rightSide[0][1]);
  for (let i = 1; i < rightSide.length; i++) {
    shape.lineTo(rightSide[i][0], rightSide[i][1]);
  }
  // Neckline scoop.
  shape.quadraticCurveTo(0, 0.335, -0.09, 0.365);
  // Left half, descending, mirrored.
  for (let i = rightSide.length - 2; i >= 0; i--) {
    shape.lineTo(-rightSide[i][0], rightSide[i][1]);
  }
  shape.closePath();
  return shape;
}

function buildTorsoGeometry() {
  const shape = buildTorsoShape();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: DEPTH,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
    steps: 1,
  });
  geometry.translate(0, 0, -DEPTH / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.name = 'TorsoGeometry';
  return geometry;
}

function buildSleeveGeometry() {
  const radiusTop = 0.095;
  const radiusBottom = 0.078;
  const length = 0.24;
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 16, 1, true);
  geometry.translate(0, length / 2, 0); // base at origin, extends along +Y
  geometry.computeVertexNormals();
  return geometry;
}

function buildSleeveMesh(signX, geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = signX > 0 ? 'Mesh_Sleeve_R' : 'Mesh_Sleeve_L';
  // Point outward along X, then droop slightly downward — see the milestone
  // notes for the rotation derivation.
  mesh.rotation.z = -signX * (Math.PI / 2 + THREE.MathUtils.degToRad(18));
  mesh.position.set(signX * 0.335, 0.28, 0);
  return mesh;
}

function buildScene() {
  const fabricMaterial = new THREE.MeshStandardMaterial({
    name: 'Fabric',
    color: new THREE.Color('#f5f5f0'),
    roughness: 0.85,
    metalness: 0.0,
  });

  const torso = new THREE.Mesh(buildTorsoGeometry(), fabricMaterial);
  torso.name = 'Mesh_Torso';

  const sleeveGeometry = buildSleeveGeometry();
  const sleeveRight = buildSleeveMesh(1, sleeveGeometry, fabricMaterial);
  const sleeveLeft = buildSleeveMesh(-1, sleeveGeometry.clone(), fabricMaterial);

  const root = new THREE.Group();
  root.name = 'ThreadFormEssentialTee';
  root.add(torso, sleeveRight, sleeveLeft);
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
