// Verifies the generated Essential Tee GLB against the contract its
// manifest promises: mesh/triangle counts, bounds, normals, UVs, and - as
// of M03 - that the torso's UV layout actually anchors the front and back
// print zones where `manifest.json` says they are. A print zone that points
// at the wrong part of the texture is invisible to a schema check and very
// visible to a user, so it is asserted here rather than eyeballed.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetDir = path.resolve(__dirname, '../assets/garments/threadform-essential-tee');
const modelPath = path.join(assetDir, 'model.glb');
const buffer = await readFile(modelPath);
const manifest = JSON.parse(await readFile(path.join(assetDir, 'manifest.json'), 'utf8'));

const loader = new GLTFLoader();
const gltf = await new Promise((resolve, reject) => {
  loader.parse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    '',
    resolve,
    reject,
  );
});

let meshCount = 0;
let triangleCount = 0;
const box = new THREE.Box3();
const meshesByName = new Map();
gltf.scene.traverse((node) => {
  if (node.isMesh) {
    meshCount++;
    meshesByName.set(node.name, node);
    const geom = node.geometry;
    const posAttr = geom.getAttribute('position');
    const hasNormals = !!geom.getAttribute('normal');
    const hasUV = !!geom.getAttribute('uv');
    const triCount = geom.index ? geom.index.count / 3 : posAttr.count / 3;
    triangleCount += triCount;
    node.updateWorldMatrix(true, false);
    const nodeBox = new THREE.Box3().setFromObject(node);
    box.union(nodeBox);
    console.log(
      `Mesh "${node.name}": ${posAttr.count} verts, ${triCount} tris, normals=${hasNormals}, uv=${hasUV}, material="${node.material?.name}"`,
    );
  }
});

const size = new THREE.Vector3();
box.getSize(size);
const center = new THREE.Vector3();
box.getCenter(center);

console.log(`Total meshes: ${meshCount}`);
console.log(`Total triangles: ${triangleCount}`);
console.log(
  `Bounds size (m): x=${size.x.toFixed(3)} y=${size.y.toFixed(3)} z=${size.z.toFixed(3)}`,
);
console.log(
  `Bounds center (m): x=${center.x.toFixed(3)} y=${center.y.toFixed(3)} z=${center.z.toFixed(3)}`,
);
console.log(`File size: ${(buffer.byteLength / 1024).toFixed(1)} KB`);

// --- Print-zone UV verification ------------------------------------------

const failures = [];

/** The UV of the torso vertex closest to a given world point. */
function uvNearest(mesh, target) {
  const position = mesh.geometry.getAttribute('position');
  const uv = mesh.geometry.getAttribute('uv');
  let best = -1;
  let bestDistance = Infinity;
  const vertex = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    vertex.fromBufferAttribute(position, i);
    const distance = vertex.distanceTo(target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return { u: uv.getX(best), v: uv.getY(best), distance: bestDistance };
}

const torso = meshesByName.get(manifest.model.meshNaming.front);
if (!torso) {
  failures.push(`manifest meshNaming.front "${manifest.model.meshNaming.front}" is not in the GLB`);
} else {
  const torsoBox = new THREE.Box3().setFromObject(torso);
  const chestY = torsoBox.min.y + (torsoBox.max.y - torsoBox.min.y) * 0.66;
  const depth = torsoBox.max.z;

  // Garments face +Z: the front centerline is the +Z side, the back the -Z.
  const front = uvNearest(torso, new THREE.Vector3(0, chestY, depth));
  const back = uvNearest(torso, new THREE.Vector3(0, chestY, -depth));
  console.log(
    `Front centerline UV: u=${front.u.toFixed(4)} v=${front.v.toFixed(4)} (vertex ${front.distance.toFixed(4)}m away)`,
  );
  console.log(
    `Back centerline UV:  u=${back.u.toFixed(4)} v=${back.v.toFixed(4)} (vertex ${back.distance.toFixed(4)}m away)`,
  );

  for (const zone of manifest.printZones) {
    const probe = zone.id === 'front' ? front : zone.id === 'back' ? back : null;
    if (!probe) continue;
    const centerU = zone.uvRect.x + zone.uvRect.width / 2;
    if (Math.abs(probe.u - centerU) > 0.02) {
      failures.push(
        `print zone "${zone.id}" is centered at u=${centerU} but the garment's ${zone.id} centerline is at u=${probe.u.toFixed(4)}`,
      );
    }
    if (probe.v < zone.uvRect.y || probe.v > zone.uvRect.y + zone.uvRect.height) {
      failures.push(
        `print zone "${zone.id}" spans v=${zone.uvRect.y}..${(zone.uvRect.y + zone.uvRect.height).toFixed(3)}, which does not contain the chest at v=${probe.v.toFixed(4)}`,
      );
    }
  }

  // The front and back zones must not overlap, or artwork on one would
  // bleed onto the other.
  const [a, b] = manifest.printZones;
  if (
    a &&
    b &&
    a.uvRect.x < b.uvRect.x + b.uvRect.width &&
    b.uvRect.x < a.uvRect.x + a.uvRect.width
  ) {
    failures.push(`print zones "${a.id}" and "${b.id}" overlap in UV space`);
  }
}

if (failures.length > 0) {
  console.error('\nFAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log('\nPrint-zone UV anchors verified against manifest.json.');
}
