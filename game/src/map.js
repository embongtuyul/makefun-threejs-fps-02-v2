// SANDLINE — map.js: builds YARD-7, an original desert freight depot.
// 64 x 44 m, two bomb sites, three lanes (A Long, Mid, B Tunnel). Every
// solid structure registers an AABB collider in collision.js; meshes and
// colliders are created together so they can never drift apart. Textures are
// procedural canvas art (no external assets, no network).

import * as THREE from 'three';
import { addBox } from './collision.js';
import { mulberry32 } from './utils.js';

export const SITES = [
  { id: 'A', name: 'WAREHOUSE', x: 24, z: -14, r: 5.5 },
  { id: 'B', name: 'DEPOT', x: 24, z: 14, r: 5.5 },
];

// Named callout zones (rectangles, checked in order): the minimap shows the
// player's current callout, and bot radio chatter names locations ("contact,
// MID"). Zones cover the whole yard — the last entry is the fallback.
export const CALLOUTS = [
  { name: 'SITE A', x0: 15, z0: -20, x1: 32, z1: -8 },
  { name: 'SITE B', x0: 15, z0: 8, x1: 32, z1: 20 },
  { name: 'A LONG', x0: -32, z0: -22, x1: 15, z1: -12 },
  { name: 'B TUNNEL', x0: -32, z0: 12, x1: 15, z1: 22 },
  { name: 'MID', x0: -8, z0: -12, x1: 15, z1: 12 },
  { name: 'ATTACK SPAWN', x0: -32, z0: -12, x1: -8, z1: 12 },
  { name: 'DEFEND SPAWN', x0: 15, z0: -8, x1: 32, z1: 8 },
  { name: 'YARD-7', x0: -32, z0: -22, x1: 32, z1: 22 },
];

export function locationAt(x, z) {
  for (const c of CALLOUTS) {
    if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) return c.name;
  }
  return 'YARD-7';
}

export const SPAWNS = {
  attackers: [
    { x: -28, z: -4 }, { x: -28.5, z: 0 }, { x: -28, z: 4 }, { x: -26, z: -1 }, { x: -26, z: 8 },
  ],
  defenders: [
    { x: 28, z: -4 }, { x: 28.5, z: 0 }, { x: 28, z: 4 }, { x: 26, z: 1 }, { x: 26, z: -8 },
  ],
};

// Waypoint graph: bots walk these routes. Links are neighbour indices.
export const WAYPOINTS = [
  // id: 0-3 attacker spawn area
  { x: -28, z: 0, links: [4, 8, 12] },
  { x: -26, z: -8, links: [0, 5] },
  { x: -26, z: 8, links: [0, 9] },
  { x: -22, z: 0, links: [0, 5, 9] },
  // mid lane
  { x: -16, z: 0, links: [3, 5, 9, 6] },
  { x: -8, z: -3, links: [4, 1, 6, 10] },
  { x: -2, z: 0, links: [4, 5, 7, 11] }, // mid doors
  { x: 6, z: 0, links: [6, 10, 11, 13] },
  // A long (north)
  { x: -20, z: -16, links: [1, 9, 14] },
  { x: -10, z: -18, links: [8, 5, 15] },
  { x: 0, z: -18, links: [9, 6, 16] },
  { x: 10, z: -16, links: [10, 7, 17] },
  // B tunnel (south)
  { x: -20, z: 16, links: [2, 4, 18] },
  { x: -10, z: 18, links: [12, 6, 19] },
  { x: 0, z: 18, links: [13, 7, 20] },
  { x: 10, z: 16, links: [14, 7, 21] },
  // site approaches + sites
  { x: 17, z: -12, links: [11, 17, 22] },
  { x: 22, z: -14, links: [16, 22, 23] }, // site A
  { x: 17, z: 12, links: [15, 21, 24] },
  { x: 22, z: 14, links: [18, 24, 25] }, // site B
  { x: 26, z: -8, links: [17, 23, 26] },
  { x: 26, z: 8, links: [19, 25, 26] },
  { x: 28, z: 0, links: [20, 21, 27] }, // defender spawn
  { x: 14, z: 0, links: [7, 16, 18] }, // mid-east connector
  { x: 18, z: -6, links: [16, 23, 27] },
  { x: 18, z: 6, links: [18, 25, 27] },
  { x: 24, z: 0, links: [20, 21, 22] }, // defender mid hold
  { x: 12, z: -8, links: [11, 23, 24] },
];

// Breadth-first path between waypoint ids. Returns an array of ids.
export function findPath(from, to) {
  if (from === to) return [from];
  const prev = new Map([[from, -1]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const n of WAYPOINTS[cur].links) {
      if (prev.has(n)) continue;
      prev.set(n, cur);
      if (n === to) {
        const path = [n];
        let p = cur;
        while (p !== -1) { path.unshift(p); p = prev.get(p); }
        return path;
      }
      queue.push(n);
    }
  }
  return [from, to];
}

export function nearestWaypoint(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const dx = WAYPOINTS[i].x - x, dz = WAYPOINTS[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// ---- procedural canvas textures (seeded, identical every load) ----
function canvasTexture(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function groundTexture() {
  return canvasTexture(512, (g, s) => {
    const rnd = mulberry32(7);
    g.fillStyle = '#b89a6b';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) {
      const v = rnd();
      g.fillStyle = v < 0.5 ? 'rgba(120,90,50,0.16)' : 'rgba(230,205,160,0.14)';
      g.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    // tyre tracks
    g.strokeStyle = 'rgba(90,66,36,0.35)';
    g.lineWidth = 9;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      const y = rnd() * s;
      g.moveTo(0, y);
      g.bezierCurveTo(s * 0.3, y + rnd() * 60 - 30, s * 0.7, y + rnd() * 60 - 30, s, y);
      g.stroke();
    }
    // painted hazard stripe
    g.fillStyle = 'rgba(220,150,40,0.5)';
    g.fillRect(0, s * 0.48, s, 6);
  }, 8);
}

function wallTexture(base, line) {
  return canvasTexture(256, (g, s) => {
    const rnd = mulberry32(21);
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(0,0,0,${rnd() * 0.08})`;
      g.fillRect(rnd() * s, rnd() * s, 2 + rnd() * 6, 2 + rnd() * 6);
    }
    g.strokeStyle = line;
    g.lineWidth = 3;
    g.strokeRect(2, 2, s - 4, s - 4);
    g.beginPath(); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
  }, 2);
}

function makeTextSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.font = '900 84px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, 128, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(m);
  s.scale.set(4, 2, 1);
  return s;
}

// ---- map build ----
const _boxGeo = new THREE.BoxGeometry(1, 1, 1);

export function buildMap(scene) {
  const mats = {
    ground: new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 }),
    wall: new THREE.MeshStandardMaterial({ map: wallTexture('#8d8578', 'rgba(0,0,0,0.25)'), roughness: 0.95 }),
    wallDark: new THREE.MeshStandardMaterial({ map: wallTexture('#6e675c', 'rgba(0,0,0,0.3)'), roughness: 0.95 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x9a4a28, roughness: 0.8, metalness: 0.35 }),
    teal: new THREE.MeshStandardMaterial({ color: 0x2e7f86, roughness: 0.7, metalness: 0.4 }),
    sandbag: new THREE.MeshStandardMaterial({ color: 0xa88f5e, roughness: 1 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x3a352e, roughness: 0.9 }),
    amber: new THREE.MeshStandardMaterial({ color: 0xe8912d, roughness: 0.6, metalness: 0.2 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd977, emissiveIntensity: 2.2 }),
  };

  // One helper for every solid: a scaled unit box mesh + a matching collider.
  function solid(mat, cx, cy, cz, sx, sy, sz, collider = true) {
    const m = new THREE.Mesh(_boxGeo, mat);
    m.position.set(cx, cy, cz);
    m.scale.set(sx, sy, sz);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    if (collider) addBox(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2);
    return m;
  }

  // Ground.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 44), mats.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Perimeter walls (height 4).
  solid(mats.wall, 0, 2, -22, 64, 4, 1);
  solid(mats.wall, 0, 2, 22, 64, 4, 1);
  solid(mats.wall, -32, 2, 0, 1, 4, 44);
  solid(mats.wall, 32, 2, 0, 1, 4, 44);

  // Mid wall (x = 0) with two door gaps at z = -6 and z = +6, plus a window.
  solid(mats.wallDark, 0, 2, -15.5, 1, 4, 13);
  solid(mats.wallDark, 0, 2, 15.5, 1, 4, 13);
  solid(mats.wallDark, 0, 2, 0, 1, 4, 7);
  solid(mats.wallDark, 0, 3.4, -6, 1, 1.2, 3); // lintel over north door
  solid(mats.wallDark, 0, 3.4, 6, 1, 1.2, 3); // lintel over south door

  // Site A — warehouse: three walls + roof, open to the west.
  solid(mats.wall, 26.5, 2.5, -14, 1, 5, 12);
  solid(mats.wall, 21, 2.5, -19.5, 12, 5, 1);
  solid(mats.wall, 21, 2.5, -8.5, 12, 5, 1);
  solid(mats.wallDark, 21, 5.2, -14, 12, 0.4, 12, false);
  // Fuel tank prop inside A.
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.6, 20), mats.teal);
  tank.position.set(26, 1.3, -17.5); tank.castShadow = true; scene.add(tank);
  addBox(24.4, 0, -19.1, 27.6, 2.6, -15.9);

  // Site B — depot: raised platform + container stack, open to the west.
  solid(mats.wallDark, 24, 0.3, 14, 12, 0.6, 11); // step-on platform
  solid(mats.rust, 28.5, 1.9, 14, 1.2, 2.6, 8);
  solid(mats.teal, 24, 1.9, 18.5, 8, 2.6, 1.2);

  // Containers as lane cover (6 x 2.6 x 2.4).
  const containers = [
    [-14, -10, 0], [-14, 10, 0], [4, -12, 1], [4, 12, 1],
    [-6, -18, 0], [12, -17, 1], [-6, 18, 1], [12, 17, 0],
    [-20, 0, 1], [18, 0, 0],
  ];
  for (const [x, z, rot] of containers) {
    // rot = 1 turns the container 90 degrees: swap its footprint so the
    // collider always matches the mesh (no rotated colliders anywhere).
    const sx = rot ? 2.4 : 6, sz = rot ? 6 : 2.4;
    solid(rot ? mats.teal : mats.rust, x, 1.3, z, sx, 2.6, sz);
  }

  // Crate clusters (1.2 m cubes, step-on height for vantage).
  const crates = [
    [-10, -6], [-9, -5], [-10, 6], [8, -4], [8, 4], [20, -10],
    [20, 10], [-2, -14], [-2, 14], [26, -11], [26, 11], [-24, -12],
    [-24, 12], [14, -3], [14, 3],
  ];
  for (const [x, z] of crates) {
    solid(mats.sandbag, x, 0.6, z, 1.2, 1.2, 1.2);
    if ((x * 7 + z * 13) % 3 === 0) solid(mats.sandbag, x + 0.2, 1.8, z + 0.1, 1.2, 1.2, 1.2);
  }

  // Sandbag lines at lane mouths (low cover you can shoot over).
  for (const [x, z] of [[-4, -6], [-4, 6], [16, -8], [16, 8], [-18, -16], [-18, 16]]) {
    solid(mats.sandbag, x, 0.55, z, 2.4, 1.1, 0.8);
  }

  // Barrels (visual + collider).
  const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.1, 12);
  for (const [x, z] of [[-12, -2], [-11, -1], [10, -8], [10, 8], [26, 0], [-26, 6]]) {
    const b = new THREE.Mesh(barrelGeo, mats.rust);
    b.position.set(x, 0.55, z); b.castShadow = true; scene.add(b);
    addBox(x - 0.45, 0, z - 0.45, x + 0.45, 1.1, z + 0.45);
  }

  // Light poles with glowing lamps.
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.09, 5.5, 8);
  for (const [x, z] of [[-16, -12], [-16, 12], [8, -14], [8, 14], [24, -4], [24, 4]]) {
    const p = new THREE.Mesh(poleGeo, mats.dark);
    p.position.set(x, 2.75, z); scene.add(p);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), mats.lamp);
    lamp.position.set(x, 5.6, z); scene.add(lamp);
    addBox(x - 0.1, 0, z - 0.1, x + 0.1, 5.5, z + 0.1);
  }

  // Site markers: glowing ring + floating letter.
  for (const site of SITES) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.25, site.r, 48),
      new THREE.MeshBasicMaterial({ color: 0xffb648, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.05, site.z);
    scene.add(ring);
    const sprite = makeTextSprite(site.id, '#ffb648');
    sprite.position.set(site.x, 4.6, site.z);
    scene.add(sprite);
    // Site name board.
    const board = makeTextSprite(site.name, '#f2ead9');
    board.scale.set(6, 1.2, 1);
    board.position.set(site.x, 3.4, site.z);
    scene.add(board);
  }

  // Sky dome: gradient from warm horizon to dusty blue zenith.
  const skyGeo = new THREE.SphereGeometry(180, 16, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x7fa8c9) },
      mid: { value: new THREE.Color(0xd8b98a) },
      bot: { value: new THREE.Color(0x8a6f4d) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; void main(){ float h = normalize(vP).y; vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.6, h)) : mix(bot, mid, smoothstep(-0.1, 0.12, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // Golden-hour lighting.
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.6);
  sun.position.set(-30, 42, -18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x9db8d6, 0x8a6f4d, 0.9));
  const fill = new THREE.DirectionalLight(0xbfd4ff, 0.5);
  fill.position.set(30, 20, 20);
  scene.add(fill);

  scene.fog = new THREE.Fog(0xd8b98a, 55, 130);

  // Distant dunes + water tower silhouettes outside the walls.
  const duneMat = new THREE.MeshStandardMaterial({ color: 0xa8895c, roughness: 1 });
  for (let i = 0; i < 7; i++) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(18 + i * 3, 12, 8), duneMat);
    d.scale.y = 0.22;
    d.position.set(-60 + i * 22, -1, -45 - (i % 3) * 8);
    scene.add(d);
  }
  const tower = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 12, 6), mats.dark);
  legs.position.y = 6; tower.add(legs);
  const tankTop = new THREE.Mesh(new THREE.SphereGeometry(3.2, 14, 10), mats.rust);
  tankTop.position.y = 13; tankTop.scale.y = 0.8; tower.add(tankTop);
  tower.position.set(48, 0, -30);
  scene.add(tower);
}

