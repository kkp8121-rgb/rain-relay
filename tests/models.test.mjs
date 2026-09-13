import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DIRECTIONS, RULES, ports } from '../src/data.js';
import { createCellModel, createCisternModel, createFlowerModel, createPacketModel, createPipeModel, createRockModel } from '../src/models.js';

const EPS = 1e-3;
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= EPS, `${label}: ${actual} !== ${expected}`);
const vec = (dir) => { const [x, z] = DIRECTIONS[dir]; return new THREE.Vector3(x, 0, z); };
const mouthNodes = (root) => root.children.filter((node) => node.isMesh && node.geometry?.parameters?.height === .1 && Math.hypot(node.position.x, node.position.z) > RULES.cellSize / 2 - .08);
const sameXZ = (actual, expected) => Math.hypot(actual.x - expected.x, actual.z - expected.z) < EPS;

test('every pipe rotation places a real mouth at each RULES port', () => {
  for (const kind of ['straight', 'elbow', 'splitter', 'bridge']) for (let rot = 0; rot < 4; rot++) {
    const expectedDirs = ports(kind, rot); const root = createPipeModel(kind, rot, expectedDirs); root.updateMatrixWorld(true); const mouths = mouthNodes(root); const mouthHalf = mouths[0].geometry.parameters.height / 2;
    assert.equal(mouths.length, expectedDirs.length, `${kind}/${rot} mouth count`);
    for (const dir of expectedDirs) {
      const expected = vec(dir).multiplyScalar(RULES.cellSize / 2); const center = expected.clone().multiplyScalar(1 - mouthHalf / (RULES.cellSize / 2)); const found = mouths.find((mouth) => sameXZ(mouth.position, center));
      assert.ok(found, `${kind}/${rot} missing mouth center for port ${dir}`); const endpoint = found.localToWorld(new THREE.Vector3(0, mouthHalf, 0)); assert.ok(sameXZ(endpoint, expected), `${kind}/${rot} mouth end misses port ${dir}`); close(found.position.y, .22, `${kind}/${rot} port height`);
    }
  }
});

test('splitter has exactly one input and two distinct output branches', () => {
  for (let rot = 0; rot < 4; rot++) {
    const dirs = ports('splitter', rot); const root = createPipeModel('splitter', rot, dirs); const mouths = mouthNodes(root); const mouthHalf = mouths[0].geometry.parameters.height / 2; assert.equal(dirs.length, 3); assert.equal(new Set(dirs).size, 3);
    for (const dir of dirs) { const expected = vec(dir).multiplyScalar(RULES.cellSize / 2); const center = expected.clone().multiplyScalar(1 - mouthHalf / (RULES.cellSize / 2)); const mouth = mouths.find((item) => sameXZ(item.position, center)); assert.ok(mouth, `splitter ${rot} branch ${dir}`); assert.ok(sameXZ(mouth.localToWorld(new THREE.Vector3(0, mouthHalf, 0)), expected), `splitter ${rot} endpoint ${dir}`); }
    assert.ok(root.getObjectByName('splitter-rotor')); assert.ok(root.getObjectByName('splitter-lever'));
  }
});

test('source outlet maps to each cardinal output direction', () => {
  for (let rot = 0; rot < 4; rot++) {
    const holder = new THREE.Group(); holder.rotation.y = (1 - rot) * Math.PI / 2; const cistern = createCisternModel(); holder.add(cistern); holder.updateMatrixWorld(true);
    const spout = cistern.getObjectByName('cistern-outlet'); const endpoint = spout.localToWorld(new THREE.Vector3(0, spout.geometry.parameters.height / 2, 0)); const expected = vec(rot).multiplyScalar(RULES.cellSize / 2); close(endpoint.x, expected.x, `source ${rot} x`); close(endpoint.z, expected.z, `source ${rot} z`);
  }
});

test('flowers expose only their actual forward and incoming mouths', () => {
  for (let rot = 0; rot < 4; rot++) {
    const flower = createFlowerModel({ x: 1, z: 1, rot, mask: 1 }, false); const flowerNodes = flower.children.filter((node) => node.name.startsWith('flower-mouth-')); const flowerMouths = flowerNodes.map((node) => Number(node.name.slice('flower-mouth-'.length))).sort(); assert.deepEqual(flowerMouths, [(rot + 2) % 4, rot].sort()); for (const mouth of flowerNodes) { const dir = Number(mouth.name.slice('flower-mouth-'.length)); const endpoint = mouth.localToWorld(new THREE.Vector3(0, mouth.geometry.parameters.height / 2, 0)); assert.ok(sameXZ(endpoint, vec(dir).multiplyScalar(RULES.cellSize / 2)), `flower ${rot} endpoint ${dir}`); }
    const sink = createFlowerModel({ x: 1, z: 1, rot, mask: 1, need: 2 }, true); const sinkNodes = sink.children.filter((node) => node.name.startsWith('flower-mouth-')); const sinkMouths = sinkNodes.map((node) => Number(node.name.slice('flower-mouth-'.length))); assert.deepEqual(sinkMouths, [rot]); const sinkEndpoint = sinkNodes[0].localToWorld(new THREE.Vector3(0, sinkNodes[0].geometry.parameters.height / 2, 0)); assert.ok(sameXZ(sinkEndpoint, vec(rot).multiplyScalar(RULES.cellSize / 2)), `sink ${rot} endpoint`);
  }
});

test('cell top keeps soil above playing surface while rim stays at edges', () => {
  const cell = createCellModel(); const soil = cell.getObjectByName('cell-soil'); const rims = cell.children.filter((node) => node.name === 'cell-rim'); assert.equal(rims.length, 4); close(soil.position.y, .003, 'soil height'); assert.ok(rims.every((rim) => Math.hypot(rim.position.x, rim.position.z) > .5)); const tile = cell.getObjectByName('cell-tile'); const box = new THREE.Box3().setFromObject(tile); close(box.max.y, 0, 'tile playing top');
});

test('bridge has a continuous elevated north/south curve, low east/west stream, and grounded supports', () => {
  const bridge = createPipeModel('bridge', 0, ports('bridge', 0));
  const curve = bridge.getObjectByName('bridge-ns-curve');
  assert.ok(curve?.geometry?.attributes?.position, 'bridge NS curve geometry');
  const eastWest = bridge.getObjectByName('bridge-ew-curve');
  assert.ok(eastWest?.geometry?.attributes?.position, 'bridge EW stream geometry');
  const curveBox = new THREE.Box3().setFromObject(curve);
  assert.ok(curveBox.min.z <= -RULES.cellSize / 2 + EPS, `NS curve misses north port ${curveBox.min.z}`);
  assert.ok(curveBox.max.z >= RULES.cellSize / 2 - EPS, `NS curve misses south port ${curveBox.max.z}`);
  close(curveBox.min.z, -RULES.cellSize / 2, 'NS stream north end');
  close(curveBox.max.z, RULES.cellSize / 2, 'NS stream south end');
  const ewBox = new THREE.Box3().setFromObject(eastWest);
  close(ewBox.min.x, -RULES.cellSize / 2, 'EW stream west end');
  close(ewBox.max.x, RULES.cellSize / 2, 'EW stream east end');
  assert.ok(curveBox.max.y > ewBox.max.y, 'NS stream is elevated over EW stream');
  bridge.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(bridge);
  assert.ok(box.min.y >= -EPS, `bridge support below surface ${box.min.y}`);
  assert.ok(curveBox.max.y > .48, `bridge crest too low ${curveBox.max.y}`);
});

test('fixed garden models and packets stay above the playing surface', () => {
  const packet = createPacketModel(4); const drop = packet.children.find((child) => child.isMesh); packet.position.y = drop.geometry.parameters.radius * drop.scale.y + EPS;
  const models = [createCisternModel(), createFlowerModel({ x: 0, z: 0, rot: 1, mask: 2 }), createFlowerModel({ x: 0, z: 0, rot: 1, mask: 5, need: 2 }, true), packet];
  for (const model of models) { model.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(model); assert.ok(box.min.y >= -EPS, `${model.name} below surface ${box.min.y}`); }
  const rock = createRockModel(1); rock.updateMatrixWorld(true); const rockBox = new THREE.Box3().setFromObject(rock); assert.ok(rockBox.min.y > -rockBox.max.y, `rock is buried beyond its visible height: ${rockBox.min.y}`);
});
