import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelPath = path.resolve(__dirname, '../assets/garments/threadform-essential-tee/model.glb');
const buffer = await readFile(modelPath);

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
gltf.scene.traverse((node) => {
  if (node.isMesh) {
    meshCount++;
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
