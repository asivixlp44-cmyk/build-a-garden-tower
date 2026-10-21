// Pets: little block animals that follow their owner round (up to four). Hoppers bounce along
// behind you; the fliers (bees, birds, butterflies, dragons) bob at shoulder height. Each pet is one
// small vertex-coloured mesh.
import { T, V3, scene, lerpAngle } from './engine.js';
import { Kit } from './geo.js';
import { vcMat } from './world.js';
import { petById } from '../../shared/config.js';

const geos = new Map();
const shade = (c, k) => new T.Color(c).multiplyScalar(k).getHex();
const FLY = { bird: true, bee: true, butterfly: true, dragon: true };
function eyes(k, x, y, z, s) {
    for (const sx of [-1, 1]) { k.box(x + sx * 0.32 * s, y, z, 0.22 * s, 0.26 * s, 0.06, 0xffffff); k.box(x + sx * 0.32 * s, y - 0.02 * s, z + 0.03, 0.12 * s, 0.16 * s, 0.05, 0x10102a); }
}
function petGeometry(id) {
    let g = geos.get(id);
    if (g) return g;
    const d = petById[id], L = d.look, b = L.body, a = L.accent, k = new Kit();
    switch (L.kind) {
        case 'bunny':
            k.box(0, 0.7, 0, 1.3, 1.1, 1.5, b); k.box(0, 1.5, 0.55, 1.1, 1, 1, b);
            for (const sx of [-1, 1]) { k.box(sx * 0.28, 2.4, 0.45, 0.28, 1, 0.22, b); k.box(sx * 0.28, 2.4, 0.5, 0.14, 0.75, 0.14, a); }
            k.box(0, 0.75, -0.85, 0.45, 0.45, 0.4, 0xffffff); k.box(0, 1.35, 1.07, 0.22, 0.16, 0.08, a);
            eyes(k, 0, 1.6, 1.06, 1); break;
        case 'bird': {
            k.box(0, 0.9, 0, 1.2, 1.2, 1.3, b); k.box(0, 1.75, 0.35, 0.95, 0.9, 0.9, b);
            k.box(0, 1.65, 0.95, 0.35, 0.25, 0.4, a);
            for (const sx of [-1, 1]) k.box(sx * 0.72, 1, -0.1, 0.25, 0.8, 1, shade(b, 0.85));
            k.box(0, 0.8, -0.8, 0.8, 0.25, 0.5, shade(b, 0.8));
            eyes(k, 0, 1.9, 0.82, 0.8); break;
        }
        case 'bug':
            k.box(0, 0.55, 0, 1.4, 0.8, 1.6, b); k.box(0, 0.62, 0.95, 0.9, 0.6, 0.5, a);
            k.box(0, 0.96, 0, 0.08, 0.06, 1.62, a);
            for (const [x, z] of [[-0.35, 0.3], [0.4, -0.2], [-0.3, -0.5], [0.35, 0.5]]) k.box(x, 0.97, z, 0.3, 0.05, 0.3, a);
            eyes(k, 0, 0.72, 1.21, 0.7); break;
        case 'frog':
            k.box(0, 0.55, 0, 1.6, 0.9, 1.5, b); k.box(0, 0.6, 0.55, 1.5, 0.5, 0.6, shade(b, 1.1));
            for (const sx of [-1, 1]) { k.box(sx * 0.5, 1.2, 0.4, 0.5, 0.5, 0.5, b); k.box(sx * 0.5, 1.25, 0.66, 0.3, 0.3, 0.05, 0xffffff); k.box(sx * 0.5, 1.25, 0.69, 0.15, 0.2, 0.04, 0x10102a); k.box(sx * 0.75, 0.25, -0.3, 0.5, 0.5, 0.9, shade(b, 0.85)); }
            k.box(0, 0.45, 0.81, 0.9, 0.08, 0.04, 0x2a5a1a); break;
        case 'bee':
            k.box(0, 0.9, 0, 1.2, 1.1, 1.5, b);
            for (const z of [-0.3, 0.25]) k.box(0, 0.9, z, 1.24, 1.14, 0.25, a);
            k.box(0, 0.9, -0.85, 0.3, 0.3, 0.3, a);
            for (const sx of [-1, 1]) k.box(sx * 0.65, 1.6, -0.1, 0.9, 0.08, 0.6, 0xe8f8ff, { rz: sx * 0.4 });
            for (const sx of [-1, 1]) k.box(sx * 0.25, 1.6, 0.75, 0.06, 0.5, 0.06, a);
            eyes(k, 0, 1.05, 0.76, 0.8); break;
        case 'fox':
            k.box(0, 0.8, 0, 1.1, 1, 1.7, b); k.box(0, 1.5, 0.75, 1.2, 1, 1, b); k.box(0, 1.3, 1.35, 0.55, 0.45, 0.4, a);
            for (const sx of [-1, 1]) { k.box(sx * 0.38, 2.15, 0.65, 0.35, 0.5, 0.2, b); k.box(sx * 0.4, 0.25, 0.5, 0.3, 0.5, 0.3, shade(b, 0.8)); k.box(sx * 0.4, 0.25, -0.5, 0.3, 0.5, 0.3, shade(b, 0.8)); }
            k.box(0, 1.1, -1.1, 0.6, 0.6, 0.9, b); k.box(0, 1.1, -1.6, 0.5, 0.5, 0.3, a);
            eyes(k, 0, 1.65, 1.26, 0.8); break;
        case 'hedgehog':
            k.box(0, 0.6, 0, 1.4, 1, 1.5, a); k.box(0, 0.8, -0.1, 1.6, 1.1, 1.5, b);
            for (let i = 0; i < 10; i++) k.box(Math.sin(i * 2.1) * 0.55, 1.35 + (i % 3) * 0.1, -0.5 + (i % 5) * 0.25, 0.25, 0.4, 0.25, shade(b, 0.75), { rx: -0.5 });
            k.box(0, 0.65, 0.85, 0.5, 0.45, 0.4, a); k.box(0, 0.65, 1.08, 0.18, 0.16, 0.08, 0x10102a);
            eyes(k, 0, 0.9, 0.86, 0.6); break;
        case 'butterfly':
            k.box(0, 1, 0, 0.22, 0.22, 1.1, 0x2a2a3a);
            for (const sx of [-1, 1]) { k.box(sx * 0.75, 1.05, 0.2, 1.2, 0.06, 0.9, b); k.box(sx * 0.6, 1.0, -0.45, 0.9, 0.06, 0.6, a); k.box(sx * 0.8, 1.08, 0.25, 0.35, 0.07, 0.3, 0xffffff); }
            for (const sx of [-1, 1]) k.box(sx * 0.15, 1.3, 0.7, 0.05, 0.5, 0.05, 0x2a2a3a); break;
        case 'bear':
            k.box(0, 0.85, 0, 1.4, 1.3, 1.4, b); k.box(0, 1.85, 0.3, 1.25, 1.05, 1.05, b);
            for (const sx of [-1, 1]) { k.box(sx * 0.5, 2.45, 0.25, 0.4, 0.4, 0.3, a); k.box(sx * 0.33, 1.95, 0.84, 0.36, 0.32, 0.04, a); k.box(sx * 0.55, 1.2, 0.3, 0.4, 0.8, 0.4, a); k.box(sx * 0.4, 0.3, 0, 0.45, 0.6, 0.6, a); }
            k.box(0, 1.65, 0.84, 0.25, 0.15, 0.06, a);
            for (const sx of [-1, 1]) { k.box(sx * 0.33, 1.95, 0.87, 0.12, 0.14, 0.03, 0xffffff); } break;
        case 'unicorn':
        case 'dragon': {
            const dragon = L.kind === 'dragon';
            k.box(0, 1.1, 0, 1.1, 1.1, 1.8, b); k.box(0, 2, 0.85, 0.9, 0.95, 1.1, b); k.box(0, 1.85, 1.5, 0.7, 0.6, 0.5, shade(b, 1.05));
            for (const [x, z] of [[-0.35, 0.6], [0.35, 0.6], [-0.35, -0.6], [0.35, -0.6]]) k.box(x, 0.35, z, 0.35, 0.7, 0.35, dragon ? shade(b, 0.8) : b);
            if (dragon) {
                for (const sx of [-1, 1]) k.box(sx * 1.1, 1.8, -0.1, 1.6, 0.1, 1, a, { rz: sx * 0.35 });
                for (let i = 0; i < 4; i++) k.box(0, 1.75 + (i === 0 ? 0.9 : 0), -0.2 + i * 0.35, 0.18, 0.3, 0.2, a);
                k.box(0, 1, -1.3, 0.45, 0.45, 0.9, b); k.box(0, 1, -1.85, 0.6, 0.15, 0.4, a);
                for (const sx of [-1, 1]) k.box(sx * 0.3, 2.65, 0.75, 0.15, 0.4, 0.15, a);
            } else {
                k.box(0, 2.85, 1.05, 0.18, 0.8, 0.18, 0xffd21e, { rx: 0.4 });
                for (let i = 0; i < 4; i++) k.box(0, 2.3 - i * 0.15, 0.5 - i * 0.35, 0.3, 0.55, 0.3, [0xff7ad8, 0x7ad8ff, 0xffd21e, 0xb87aff][i]);
                k.box(0, 1.15, -1.1, 0.35, 0.35, 0.6, a);
            }
            eyes(k, 0, 2.15, 1.41, 0.7); break;
        }
        case 'cat':
            k.box(0, 0.8, 0, 1.1, 1, 1.6, b); k.box(0, 1.6, 0.65, 1.15, 0.95, 0.9, b);
            for (const sx of [-1, 1]) { k.box(sx * 0.35, 2.2, 0.55, 0.3, 0.4, 0.2, b); k.box(sx * 0.35, 2.2, 0.6, 0.15, 0.25, 0.15, a); }
            k.box(0, 1.3, -1, 0.3, 0.3, 0.9, b, { rx: -0.6 });
            for (let i = 0; i < 6; i++) k.box(Math.sin(i * 1.7) * 0.4, 0.9 + (i % 3) * 0.3, Math.cos(i * 2.3) * 0.6, 0.15, 0.15, 0.15, 0xffffff);
            eyes(k, 0, 1.7, 1.11, 0.8); break;
        case 'blob':
        default:
            k.box(0, 0.8, 0, 1.6, 1.4, 1.6, b); k.box(0, 1.6, 0, 1.2, 0.4, 1.2, shade(b, 1.08));
            k.box(0, 2.0, 0, 1.5, 0.35, 1.5, a); k.box(0, 2.25, 0, 0.9, 0.3, 0.9, a);
            for (const sx of [-1, 1]) k.box(sx * 0.4, 2.0, 0.6, 0.25, 0.2, 0.3, 0xffffff);
            eyes(k, 0, 1, 0.81, 0.9);
            k.box(0, 0.7, 0.81, 0.3, 0.1, 0.04, 0x2a1a3a);
    }
    g = k.geometry();
    geos.set(id, g);
    return g;
}
export function petMesh(id) {
    const m = new T.Mesh(petGeometry(id), vcMat);
    m.castShadow = true; m.receiveShadow = true;
    return m;
}

// One player's pets, following them
const tmp = new V3();
export class PetPack {
    constructor() { this.list = []; this.key = ''; }
    set(ids) {
        const key = ids.join(',');
        if (key === this.key) return;
        this.key = key;
        const old = this.list;
        this.list = ids.filter((id) => petById[id]).slice(0, 4).map((id, i) => {
            const prev = old.find((p) => p.id === id && !p.used);
            if (prev) { prev.used = true; return prev; }
            const m = petMesh(id);
            m.scale.setScalar(0.001);
            scene.add(m);
            return { id, m, pos: new V3(), yaw: 0, hop: Math.random() * 6, fly: FLY[petById[id].look.kind] || id === 'phoenix', born: 0, i };
        });
        for (const p of old) { if (!p.used) scene.remove(p.m); p.used = false; }
        this.list.forEach((p, i) => { p.i = i; });
    }
    // pos: the owner's feet, facing: their yaw
    update(dt, t, pos, facing, moving, visible) {
        const n = this.list.length;
        for (const p of this.list) {
            if (!p.placed) { p.pos.copy(pos); p.placed = true; }
            p.m.visible = visible !== false;
            if (!p.m.visible) continue;
            // a fan behind the owner
            const a = facing + Math.PI + (p.i - (n - 1) / 2) * 0.62, d = 4.2 + (p.i % 2) * 0.8;
            tmp.set(pos.x + Math.sin(a) * d, pos.y, pos.z + Math.cos(a) * d);
            const far = p.pos.distanceToSquared(tmp) > 900;
            if (far) p.pos.copy(tmp);
            else p.pos.lerp(tmp, 1 - Math.exp(-dt * 6));
            const dx = tmp.x - p.pos.x, dz = tmp.z - p.pos.z, sp = Math.hypot(dx, dz);
            const want = sp > 0.3 ? Math.atan2(dx, dz) : facing;
            p.yaw = lerpAngle(p.yaw, want, 1 - Math.exp(-dt * 8));
            let y = p.pos.y;
            if (p.fly) y += 2.6 + Math.sin(t * 2.2 + p.hop) * 0.45;
            else { p.hop += dt * (moving || sp > 0.6 ? 11 : 3.5); y += Math.abs(Math.sin(p.hop)) * (moving || sp > 0.6 ? 0.9 : 0.15); }
            p.born = Math.min(1, p.born + dt * 2.5);
            const sq = p.fly ? 1 : 1 + Math.sin(p.hop * 2) * 0.05;
            p.m.scale.set(p.born / Math.sqrt(sq), p.born * sq, p.born / Math.sqrt(sq));
            p.m.position.set(p.pos.x, y, p.pos.z);
            p.m.rotation.set(p.fly ? Math.sin(t * 3 + p.hop) * 0.1 : 0, p.yaw, 0);
        }
    }
    dispose() { for (const p of this.list) scene.remove(p.m); this.list = []; this.key = ''; }
}
// one of each pet for the loading warm-up (they share one material: only the geometry uploads)
export function petWarmGroup() { const g = new T.Group(); for (const id of Object.keys(petById)) { const m = petMesh(id); m.position.set(0, -50, 0); g.add(m); } return g; }
