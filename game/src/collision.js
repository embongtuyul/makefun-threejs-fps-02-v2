// SANDLINE — collision.js: axis-aligned boxes for the whole map.
// Walls, crates, buildings and the ground plane are all AABBs. Two queries:
//   raycast(origin, dir, maxDist) — nearest solid hit for bullets and sight
//   resolveCircle(pos, radius, height) — push a capsule out of every box
// Both reuse module scratch, so they allocate nothing per call.

// A box: min/max corners. `solid` boxes block movement and bullets;
// `cover` boxes (low crates) block bullets but are low enough to see over.
export const boxes = [];
export function addBox(minX, minY, minZ, maxX, maxY, maxZ) {
  boxes.push({ minX, minY, minZ, maxX, maxY, maxZ });
  return boxes[boxes.length - 1];
}
export function clearBoxes() { boxes.length = 0; }

// Slab-method ray vs AABB. Returns distance along the ray, or Infinity.
function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = Infinity;
  if (Math.abs(dx) < 1e-9) {
    if (ox < b.minX || ox > b.maxX) return Infinity;
  } else {
    let t1 = (b.minX - ox) / dx, t2 = (b.maxX - ox) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dy) < 1e-9) {
    if (oy < b.minY || oy > b.maxY) return Infinity;
  } else {
    let t1 = (b.minY - oy) / dy, t2 = (b.maxY - oy) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dz) < 1e-9) {
    if (oz < b.minZ || oz > b.maxZ) return Infinity;
  } else {
    let t1 = (b.minZ - oz) / dz, t2 = (b.maxZ - oz) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

// Nearest box hit along a ray. `out` (optional) receives the hit point.
// Returns { dist, box } or null. The ground plane (y=0) counts as a box too.
const _hit = { dist: 0, box: null };
export function raycastBoxes(ox, oy, oz, dx, dy, dz, maxDist, out) {
  let best = Infinity, bestBox = null;
  for (let i = 0; i < boxes.length; i++) {
    const d = rayBox(ox, oy, oz, dx, dy, dz, boxes[i]);
    if (d < best && d <= maxDist) { best = d; bestBox = boxes[i]; }
  }
  // Ground plane.
  if (dy < -1e-9) {
    const d = -oy / dy;
    if (d >= 0 && d < best && d <= maxDist) { best = d; bestBox = null; }
  }
  if (best === Infinity) return null;
  if (out) { out.set(ox + dx * best, oy + dy * best, oz + dz * best); }
  _hit.dist = best; _hit.box = bestBox;
  return _hit;
}

// True when nothing solid stands between two points (sight lines).
export function hasLineOfSight(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-6) return true;
  const hit = raycastBoxes(ax, ay, az, dx / len, dy / len, dz / len, len - 0.05, null);
  return hit === null;
}

// Highest walkable surface under a circle: the ground (y = 0) or the top of
// a box the capsule can step onto (at most STEP above its feet). Used for
// gravity, landing and stepping onto low crates and the depot platform.
export const STEP_HEIGHT = 0.65;

export function groundHeightAt(x, z, radius, feetY) {
  let g = 0;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.maxY > feetY + STEP_HEIGHT || b.maxY <= g) continue;
    if (b.minY > feetY + STEP_HEIGHT) continue;
    // Circle vs box overlap in XZ (with the capsule radius).
    const cx = Math.max(b.minX, Math.min(x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    const dx = x - cx, dz = z - cz;
    if (dx * dx + dz * dz <= radius * radius) g = b.maxY;
  }
  return g;
}

// Push a vertical capsule (circle in XZ, height h) out of every box it
// overlaps. Mutates `pos` (a Vector3 holding feet position). Returns true
// when a push happened. The player never climbs: boxes taller than the step
// height block; low boxes (<= 0.55 m) are stepped onto via `onGround` logic
// in player.js — here they only block sideways when their top is above the
// capsule's feet + step height.
export function resolveCircle(pos, radius, height) {
  let pushed = false;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    // Boxes below the capsule's top don't block; boxes low enough to step
    // onto (top within STEP_HEIGHT of the feet) don't block either — the
    // ground-height step in player.js lifts the capsule onto them.
    if (pos.y + height <= b.minY || pos.y + STEP_HEIGHT >= b.maxY) continue;
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 < 1e-8) {
      // Centre inside the box: push out along the smallest penetration axis.
      const pl = pos.x - b.minX, pr = b.maxX - pos.x;
      const pn = pos.z - b.minZ, pf = b.maxZ - pos.z;
      const m = Math.min(pl, pr, pn, pf);
      if (m === pl) pos.x = b.minX - radius;
      else if (m === pr) pos.x = b.maxX + radius;
      else if (m === pn) pos.z = b.minZ - radius;
      else pos.z = b.maxZ + radius;
    } else {
      const d = Math.sqrt(d2);
      const push = (radius - d) / d;
      pos.x += dx * push;
      pos.z += dz * push;
    }
    pushed = true;
  }
  return pushed;
}

// Ray vs a vertical capsule (bot hitbox): cylinder + head sphere.
// Returns { dist, part } ('head' | 'body' | 'legs') or null.
export function rayCapsule(ox, oy, oz, dx, dy, dz, maxDist, cx, cz, feetY, height) {
  // Cylinder body: horizontal distance from the ray to the axis.
  const radius = 0.42;
  const ex = ox - cx, ez = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return null;
  const b = 2 * (ex * dx + ez * dz);
  const c = ex * ex + ez * ez - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0 || t > maxDist) return null;
  const hitY = oy + dy * t;
  const rel = hitY - feetY;
  if (rel < 0 || rel > height) {
    // Ray passed over/under the cylinder: check the head sphere instead.
    return raySphere(ox, oy, oz, dx, dy, dz, maxDist, cx, feetY + height - 0.18, cz, 0.26, 'head');
  }
  // Head sphere takes priority when the ray crosses it.
  const head = raySphere(ox, oy, oz, dx, dy, dz, maxDist, cx, feetY + height - 0.18, cz, 0.26, 'head');
  if (head && head.dist <= t + 0.05) return head;
  const part = rel < height * 0.45 ? 'legs' : 'body';
  return { dist: t, part };
}

function raySphere(ox, oy, oz, dx, dy, dz, maxDist, sx, sy, sz, r, part) {
  const ex = ox - sx, ey = oy - sy, ez = oz - sz;
  const b = ex * dx + ey * dy + ez * dz;
  const c = ex * ex + ey * ey + ez * ez - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t < 0 || t > maxDist) return null;
  return { dist: t, part };
}
