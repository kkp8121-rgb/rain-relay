import * as THREE from 'three';
import { COLORS, DIRECTIONS, RULES, ports } from './data.js';

export const palette = {
  cream: 0xf3ead4,
  ceramic: 0xe8ddc4,
  ceramicShadow: 0xb9ae9c,
  moss: 0x607e65,
  mossDark: 0x2f514b,
  copper: 0xb66f4e,
  copperHot: 0xe0a067,
  glass: 0x75c5c4,
  brass: 0xd4ad63,
  red: 0xeb6b61,
  green: 0x75bd76,
  blue: 0x6c9ff2,
  gold: 0xf4c866,
  ink: 0x1a3047,
  wet: 0x9fe9e2
};

const mat = (color, options = {}) => new THREE.MeshStandardMaterial({
  color,
  roughness: options.roughness ?? .55,
  metalness: options.metalness ?? .12,
  emissive: options.emissive ?? 0,
  emissiveIntensity: options.emissiveIntensity ?? 0,
  transparent: !!options.transparent,
  opacity: options.opacity ?? 1,
  depthWrite: options.depthWrite ?? !options.transparent
});
const add = (parent, object, name) => { object.name = name; parent.add(object); return object; };
const bitColor = (mask = 0) => COLORS[mask].hex;
const directionVector = (dir) => [{ x: 0, z: -1 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }][((Number(dir) % 4) + 4) % 4];
const quotaLabel = (root) => { if (typeof document === 'undefined') return; const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 48; const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })); sprite.name = 'quota-label'; sprite.position.set(0, .93, 0); sprite.scale.set(.7, .26, 1); root.add(sprite); root.userData.quotaCanvas = canvas; root.userData.quotaTexture = texture; root.userData.quotaSprite = sprite; root.userData.quotaValue = ''; };

export function createCellModel() {
  const root = new THREE.Group(); root.name = 'ceramic-cell';
  add(root, new THREE.Mesh(new THREE.BoxGeometry(1.18, .12, 1.18), mat(palette.ceramic, { roughness: .86 }), 'cell-tile'), 'cell-tile').position.y = -.06;
  const rimMat = mat(palette.moss, { roughness: .9 });
  for (const [x, z, w, d] of [[0, -.58, 1.2, .035], [0, .58, 1.2, .035], [-.58, 0, .035, 1.2], [.58, 0, .035, 1.2]]) { const rim = add(root, new THREE.Mesh(new THREE.BoxGeometry(w, .035, d), rimMat), 'cell-rim'); rim.position.set(x, .018, z); }
  const inset = add(root, new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.05), mat(0xced1b5, { roughness: 1 }), 'cell-soil'), 'cell-soil'); inset.rotation.x = -Math.PI / 2; inset.position.y = .003;
  return root;
}


export function routePoint(kind, incoming, outgoing, t) {
  const half = RULES.cellSize / 2;
  const a = new THREE.Vector3(DIRECTIONS[incoming][0] * half, .22, DIRECTIONS[incoming][1] * half);
  const b = new THREE.Vector3(DIRECTIONS[outgoing][0] * half, .22, DIRECTIONS[outgoing][1] * half);
  if (kind === 'elbow') return new THREE.QuadraticBezierCurve3(a, new THREE.Vector3(0, .22, 0), b).getPoint(t);
  if (kind === 'splitter') return t < .5 ? a.multiplyScalar(1 - 2 * t).setY(.22) : b.multiplyScalar(2 * t - 1).setY(.22);
  const point = a.lerp(b, t);
  if (kind === 'bridge' && outgoing % 2 === 0) point.y += .26 * Math.sin(Math.PI * t) ** 2;
  return point;
}

class WaterCurve extends THREE.Curve {
  constructor(kind, incoming, outgoing) { super(); this.kind = kind; this.incoming = incoming; this.outgoing = outgoing; }
  getPoint(t, target = new THREE.Vector3()) { return target.copy(routePoint(this.kind, this.incoming, this.outgoing, t)); }
}

export function createPipeModel(kind = 'straight', rot = 0, portDirs = ports(kind, rot)) {
  const root = new THREE.Group(); root.name = 'pipe-' + kind + '-' + rot;
  root.userData.kind = kind; root.userData.rotation = rot; root.userData.portDirs = [...portDirs];
  const copper = mat(palette.copper, { metalness: .55, roughness: .28 });
  const water = mat(palette.glass, { emissive: palette.glass, emissiveIntensity: .25, transparent: true, opacity: .78, roughness: .2 });
  const half = RULES.cellSize / 2;
  function channel(incoming, outgoing, name) {
    const curve = new WaterCurve(kind, incoming, outgoing);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, .105, 8, false), water);
    mesh.name = name; root.add(mesh);
  }
  if (kind === 'bridge') { channel(0, 2, 'bridge-ns-curve'); channel(1, 3, 'bridge-ew-curve'); }
  else if (kind === 'splitter') { channel(portDirs[0], portDirs[1], 'splitter-left'); channel(portDirs[0], portDirs[2], 'splitter-right'); }
  else channel(portDirs[0], portDirs[1], kind === 'elbow' ? 'elbow-quarter-curve' : 'straight-channel');
  for (const dir of portDirs) {
    const [x, z] = DIRECTIONS[dir];
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, .1, 12, 1, true), copper);
    sleeve.name = 'pipe-mouth-' + dir;
    sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, 0, z));
    sleeve.position.set(x * (half - .05), .22, z * (half - .05)); root.add(sleeve);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(.04, .065, .14, 8), copper);
    foot.position.set(x * (half - .08), .07, z * (half - .08)); root.add(foot);
  }
  if (kind === 'bridge') {
    const arch = new THREE.Mesh(new THREE.BoxGeometry(.55, .05, .12), copper);
    arch.position.y = .35; root.add(arch);
    for (const x of [-.22, .22]) {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(.035, .05, .325, 8), copper);
      foot.position.set(x, .1625, 0); root.add(foot);
    }
  }
  if (kind === 'splitter') {
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .15, 12), copper);
    axle.name = 'splitter-lever'; axle.position.y = .275; root.add(axle);
    const rotor = new THREE.Mesh(new THREE.ConeGeometry(.075, .2, 3), mat(palette.brass, { metalness: .7 }));
    rotor.name = 'splitter-rotor'; root.add(rotor); pointSplitter(root, 0);
  }
  return root;
}

export function pointSplitter(root, count) {
  const dir = ports('splitter', root.userData.rotation)[1 + count % 2];
  const [x, z] = DIRECTIONS[dir], rotor = root.getObjectByName('splitter-rotor');
  rotor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, 0, z));
  rotor.position.set(x * .18, .4, z * .18);
}

export function createFlowerModel(tile = {}, receiver = false) {
  const root = new THREE.Group(); root.name = receiver ? `collector-${tile.x}-${tile.z}` : `prism-flower-${tile.x}-${tile.z}`; root.userData.mask = tile.mask ?? tile.need ?? 0; root.userData.receiver = receiver;
  const color = bitColor(tile.mask ?? tile.need ?? 0); const stemMat = mat(palette.mossDark, { roughness: .8 }); const petalMat = mat(color, { emissive: color, emissiveIntensity: receiver ? .12 : .32, transparent: receiver, opacity: receiver ? .78 : 1 });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.035, .055, .45, 8), stemMat); stem.position.y = .23; root.add(stem);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(receiver ? .17 : .13, 1), petalMat); core.position.y = .5; core.name = receiver ? 'collector-core' : 'prism-core'; root.add(core);
  for (let i = 0; i < 5; i++) { const petal = new THREE.Mesh(new THREE.CapsuleGeometry(receiver ? .09 : .075, receiver ? .24 : .2, 3, 6), petalMat); const a = i * Math.PI * 2 / 5; petal.position.set(Math.cos(a) * (receiver ? .2 : .15), .5, Math.sin(a) * (receiver ? .2 : .15)); petal.rotation.z = Math.PI / 2; petal.rotation.y = -a; petal.name = `petal-${i}`; root.add(petal); }
  const pipeMat = mat(palette.glass, { emissive: palette.glass, emissiveIntensity: .25, transparent: true, opacity: .72, roughness: .2 }); const copper = mat(palette.copper, { metalness: .55, roughness: .3 }); const flowerRot = Number(tile.rot) || 0; const flowerDirs = receiver ? [flowerRot] : [(flowerRot + 2) % 4, flowerRot];
  for (const dir of flowerDirs) { const v = directionVector(dir); const channel = new THREE.Mesh(new THREE.BoxGeometry(.22, .11, .625), pipeMat); channel.position.set(v.x * .3125, .22, v.z * .3125); channel.rotation.y = v.x ? Math.PI / 2 : 0; channel.name = `flower-port-${dir}`; root.add(channel); const mouth = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .1, 10), copper); mouth.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(v.x, 0, v.z)); mouth.position.set(v.x * (.625 - .05), .22, v.z * (.625 - .05)); mouth.name = `flower-mouth-${dir}`; root.add(mouth); }
  const arrowDir = directionVector(flowerRot); const arrowVector = receiver ? -1 : 1; const arrow = new THREE.Mesh(new THREE.ConeGeometry(.08, .2, 3), mat(color, { emissive: color, emissiveIntensity: .45 })); arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(arrowDir.x * arrowVector, 0, arrowDir.z * arrowVector)); arrow.position.set(arrowDir.x * .22, .4, arrowDir.z * .22); arrow.name = receiver ? 'collector-mouth-arrow' : 'flower-direction-arrow'; root.add(arrow);
  if (receiver) { const ring = new THREE.Mesh(new THREE.TorusGeometry(.3, .025, 6, 18), mat(palette.gold, { emissive: palette.gold, emissiveIntensity: .3, metalness: .55 })); ring.rotation.x = Math.PI / 2; ring.position.y = .06; ring.name = 'quota-ring'; root.add(ring); quotaLabel(root); }
  return root;
}

export function createCisternModel() {
  const root = new THREE.Group(); root.name = 'source-cistern'; const ceramic = mat(palette.ceramic, { roughness: .7 }); const copper = mat(palette.copper, { metalness: .58, roughness: .3 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.48, .56, .62, 16), ceramic); body.position.y = .31; root.add(body); const rim = new THREE.Mesh(new THREE.TorusGeometry(.44, .06, 8, 20), copper); rim.rotation.x = Math.PI / 2; rim.position.y = .64; root.add(rim); const spout = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, .5, 10), copper); spout.rotation.z = -Math.PI / 2; spout.position.set(.375, .22, 0); spout.name = 'cistern-outlet'; root.add(spout); const drop = new THREE.Mesh(new THREE.SphereGeometry(.11, 10, 8), mat(palette.wet, { emissive: palette.wet, emissiveIntensity: .85 })); drop.position.set(.625, .25, 0); drop.name = 'cistern-drop'; root.add(drop); return root;
}

export function createRockModel(index = 0) { const root = new THREE.Group(); root.name = `rock-${index}`; const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(.28 + (index % 3) * .06, 0), mat(palette.mossDark, { roughness: .95 })); rock.scale.y = .75; rock.position.y = .2; root.add(rock); const moss = new THREE.Mesh(new THREE.ConeGeometry(.18, .08, 6), mat(palette.moss, { roughness: 1 })); moss.position.y = .42; root.add(moss); return root; }

export function createPacketModel(mask = 0) { const root = new THREE.Group(); root.name = 'water-packet'; root.userData.mask = mask; const color = bitColor(mask); const drop = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 8), mat(color, { emissive: color, emissiveIntensity: .9, transparent: true, opacity: .94 })); drop.scale.y = 1.3; root.add(drop); const glint = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 6), mat(palette.cream, { emissive: palette.cream, emissiveIntensity: 1 })); glint.name = 'packet-glint'; glint.position.set(-.05, .09, -.07); root.add(glint); return root; }

export function createCursorModel(kind = 'straight', rot = 0, portDirs = []) { const root = createPipeModel(kind, rot, portDirs); root.name = 'cursor-ghost'; root.traverse((object) => { if (object.isMesh) { object.material = object.material.clone(); object.material.transparent = true; object.material.opacity = .36; object.material.depthWrite = false; } }); return root; }

export function disposeModel(root) { if (!root) return; const geometries = new Set(), materials = new Set(), textures = new Set(); root.traverse((object) => { if (object.geometry) geometries.add(object.geometry); if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach((item) => { materials.add(item); if (item.map) textures.add(item.map); }); }); geometries.forEach((item) => item.dispose?.()); materials.forEach((item) => item.dispose?.()); textures.forEach((item) => item.dispose?.()); root.clear(); }
