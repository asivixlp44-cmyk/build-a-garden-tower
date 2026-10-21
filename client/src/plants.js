// The plants: every species is built from coloured blocks (like the reference's blocky plants) into
// one geometry, and drawn as ONE instanced mesh per species for every greenhouse at once.
// Growing up, the fruit ripening, the sway in the breeze, the bounce and glow of a ripe plant and the
// look of a mutation (golden, toxic, frozen, rainbow, celestial) all happen in the shader, from the
// plant's planting / fruit times: nothing is re-uploaded while plants grow. The instance buffers are
// rewritten only when a plant is planted, harvested, dug up or mutates.
import { T, V3, scene } from './engine.js';
import { Kit, rng } from './geo.js';
import { SPECIES, speciesById, speciesIndex } from '../../shared/config.js';
import { FRAMES, toWorld, floorY } from '../../shared/garden.js';

export const PU = { uNow: { value: 0 } };   // seconds since EPOCH (server clock)
export let EPOCH = 0;
export function setEpoch(ms) { EPOCH = ms; }
const SOIL = 0, STEM = 1, LEAF = 2, FRUIT = 3;

const shadeOf = (c, k) => { const col = new T.Color(c); col.multiplyScalar(k); return col.getHex(); };

// =====================================================================================
// The builders: one per kind of plant. Origin = the middle of the plant on the floor.
// =====================================================================================
function soil(k, r) {
    const w = r * 1.9;
    k.box(0, 0.12, 0, w, 0.24, w, 0x5a3418, { part: SOIL });
    k.box(0, 0.26, 0, w - 0.5, 0.06, w - 0.5, 0x7a4a26, { part: SOIL });
    // a few little clods
    const R = rng(Math.round(r * 100));
    for (let i = 0; i < 4; i++) k.box((R() - 0.5) * (w - 1), 0.33, (R() - 0.5) * (w - 1), 0.35, 0.14, 0.35, 0x6a3a1c, { part: SOIL });
}
const fruit = (k, x, y, z, s, c, o) => k.box(x, y, z, s, s, s, c, { part: FRUIT, cx: x, cy: y, cz: z, ...(o || {}) });
const leafC = (L, R) => (L.leaf2 && R() < 0.45 ? L.leaf2 : shadeOf(L.leaf, 0.9 + R() * 0.2));
function sphereDir(R) { const u = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - u * u); return [s * Math.cos(a), u, s * Math.sin(a)]; }

const BUILD = {
    tree(k, L, R, s) {
        const th = 5 * s, w = 1.3 * s;
        for (let i = 0; i < 3; i++) k.box((i % 2) * 0.12 * s, th * (i + 0.5) / 3, 0, w, th / 3 + 0.02, w, shadeOf(L.trunk, i % 2 ? 0.88 : 1), { part: STEM });
        // roots
        for (const [x, z] of [[0.9, 0], [-0.9, 0.2], [0, 0.9], [0.2, -0.9]]) k.box(x * s, 0.35 * s, z * s, 0.7 * s, 0.7 * s, 0.7 * s, shadeOf(L.trunk, 0.85), { part: STEM });
        const cy = th + 1.7 * s;
        k.box(0, cy, 0, 4.2 * s, 3.4 * s, 4.2 * s, L.leaf, { part: LEAF });
        const blobs = [[2.1, -0.3, 0.4], [-2, 0.1, -0.6], [0.3, 0.4, 2.1], [-0.5, -0.4, -2.1], [1.2, 1.6, -1], [-1.1, 1.5, 1.1], [1.6, -0.8, 1.6], [-1.6, -0.6, 1.4]];
        for (const [x, y, z] of blobs) { const b = (2.2 + R() * 0.9) * s; k.box(x * s, cy + y * s, z * s, b, b * 0.85, b, leafC(L, R), { part: LEAF }); }
        if (L.blossom) for (let i = 0; i < 16; i++) { const d = sphereDir(R); k.box(d[0] * 2.9 * s, cy + Math.abs(d[1]) * 2.2 * s, d[2] * 2.9 * s, 0.7 * s, 0.7 * s, 0.7 * s, i % 2 ? 0xffffff : 0xffc0e0, { part: LEAF }); }
        const n = L.star ? 8 : 10;
        for (let i = 0; i < n; i++) {
            const d = sphereDir(R);
            const x = d[0] * 2.7 * s, y = cy + Math.max(-1.1, d[1] * 1.9) * s, z = d[2] * 2.7 * s, c = L.fruit2 && i % 2 ? L.fruit2 : L.fruit;
            if (L.star) { const f = 0.95 * s; k.box(x, y, z, f, f * 0.32, f * 0.32, c, { part: FRUIT, cx: x, cy: y, cz: z }); k.box(x, y, z, f * 0.32, f, f * 0.32, c, { part: FRUIT, cx: x, cy: y, cz: z }); k.box(x, y, z, f * 0.32, f * 0.32, f, c, { part: FRUIT, cx: x, cy: y, cz: z }); }
            else if (L.blossom) { fruit(k, x, y - 0.3 * s, z, 0.5 * s, c); fruit(k, x + 0.45 * s, y - 0.35 * s, z, 0.5 * s, c); }
            else fruit(k, x, y, z, 0.95 * s, c);
        }
    },
    bush(k, L, R, s) {
        const cy = 1.3 * s;
        k.box(0, 0.5 * s, 0, 0.5 * s, 1 * s, 0.5 * s, shadeOf(L.leaf, 0.7), { part: STEM });
        const blobs = [[0, 0.3, 0, 2.2], [1.1, 0, 0.3, 1.7], [-1, 0.1, -0.4, 1.8], [0.2, -0.1, 1.1, 1.6], [-0.3, 0, -1.1, 1.6], [0.4, 1.1, -0.2, 1.5]];
        for (const [x, y, z, b] of blobs) k.box(x * s, cy + y * s, z * s, b * s, b * 0.85 * s, b * s, leafC(L, R), { part: LEAF });
        if (L.cage) for (const [x, z] of [[1.6, 1.6], [-1.6, 1.6], [1.6, -1.6], [-1.6, -1.6]]) k.box(x * s, 1.9 * s, z * s, 0.16, 3.8 * s, 0.16, 0xb8a888, { part: STEM });
        if (L.cage) for (const y of [1.3, 3.1]) { k.box(0, y * s, 1.6 * s, 3.3 * s, 0.14, 0.14, 0xb8a888, { part: STEM }); k.box(0, y * s, -1.6 * s, 3.3 * s, 0.14, 0.14, 0xb8a888, { part: STEM }); k.box(1.6 * s, y * s, 0, 0.14, 0.14, 3.3 * s, 0xb8a888, { part: STEM }); k.box(-1.6 * s, y * s, 0, 0.14, 0.14, 3.3 * s, 0xb8a888, { part: STEM }); }
        if (L.flowers) for (let i = 0; i < 6; i++) { const d = sphereDir(R); k.box(d[0] * 1.6 * s, cy + Math.abs(d[1]) * 1.4 * s, d[2] * 1.6 * s, 0.4, 0.4, 0.4, L.flowers, { part: LEAF }); }
        const n = L.many ? 14 : L.fruitShape === 'long' ? 5 : 7;
        for (let i = 0; i < n; i++) {
            const a = i / n * Math.PI * 2 + R() * 0.4, rr = 1.55 * s + R() * 0.3 * s;
            const x = Math.cos(a) * rr, z = Math.sin(a) * rr, y = cy + (R() - 0.35) * 1.4 * s, c = L.fruit2 && i % 2 ? L.fruit2 : L.fruit;
            if (L.fruitShape === 'long') k.box(x, y - 0.3 * s, z, 0.5 * s, 1.5 * s, 0.5 * s, c, { part: FRUIT, cx: x, cy: y, cz: z, rz: (R() - 0.5) * 0.5 });
            else if (L.many) { fruit(k, x, y, z, 0.48 * s, c); if (L.flowers) k.box(x, y + 0.3 * s, z, 0.3 * s, 0.12 * s, 0.3 * s, 0x3ab83a, { part: FRUIT, cx: x, cy: y, cz: z }); }
            else fruit(k, x, y, z, 0.95 * s, c);
        }
    },
    bulb(k, L, R, s) {
        for (let i = 0; i < 5; i++) {
            const a = i / 5 * Math.PI * 2, h = (2.2 + R() * 1.2) * s;
            k.box(Math.cos(a) * 0.25 * s, 0.9 * s + h / 2, Math.sin(a) * 0.25 * s, 0.28 * s, h, 0.28 * s, leafC(L, R), { part: LEAF, rx: Math.sin(a) * 0.22, rz: -Math.cos(a) * 0.22 });
        }
        fruit(k, 0, 0.75 * s, 0, 1.45 * s, L.fruit);
        k.box(0, 1.55 * s, 0, 0.7 * s, 0.5 * s, 0.7 * s, shadeOf(L.fruit, 1.1), { part: FRUIT, cx: 0, cy: 0.75 * s, cz: 0 });
    },
    root(k, L, R, s) {
        const stem = L.stem || shadeOf(L.leaf, 0.8);
        for (let i = 0; i < 6; i++) {
            const a = i / 6 * Math.PI * 2 + R() * 0.3, h = (1.6 + R() * 1) * s;
            k.box(Math.cos(a) * 0.35 * s, 0.6 * s + h / 2, Math.sin(a) * 0.35 * s, 0.2 * s, h, 0.2 * s, stem, { part: STEM, rx: Math.sin(a) * 0.35, rz: -Math.cos(a) * 0.35 });
            k.box(Math.cos(a) * (0.35 + h * 0.36) * s, 0.6 * s + h, Math.sin(a) * (0.35 + h * 0.36) * s, 0.9 * s, 0.2 * s, 0.7 * s, leafC(L, R), { part: LEAF, ry: -a });
        }
        if (L.round) {
            for (const [x, z, b] of [[0, 0, 1.2], [0.85, 0.4, 0.85], [-0.7, 0.6, 0.8], [0.2, -0.85, 0.8]]) fruit(k, x * s, b * 0.35 * s, z * s, b * s, shadeOf(L.fruit, 0.9 + R() * 0.2));
        } else {
            fruit(k, 0, 0.45 * s, 0, 1.15 * s, L.fruit);
            k.box(0, 0.05 * s, 0, 0.8 * s, 0.4 * s, 0.8 * s, shadeOf(L.fruit, 0.9), { part: FRUIT, cx: 0, cy: 0.45 * s, cz: 0 });
        }
    },
    leafy(k, L, R, s) {
        for (let i = 0; i < 7; i++) {
            const a = i / 7 * Math.PI * 2;
            k.box(Math.cos(a) * 1.1 * s, 0.75 * s, Math.sin(a) * 1.1 * s, 2.1 * s, 0.32 * s, 1.5 * s, leafC(L, R), { part: LEAF, ry: -a, rz: 0.55 });
        }
        fruit(k, 0, 0.9 * s, 0, 1.75 * s, L.fruit);
        k.box(0, 1.6 * s, 0, 1.2 * s, 0.5 * s, 1.2 * s, shadeOf(L.fruit, 1.08), { part: FRUIT, cx: 0, cy: 0.9 * s, cz: 0 });
    },
    stalk(k, L, R, s) {
        const h = 7 * s;
        for (let i = 0; i < 4; i++) k.box(0, h * (i + 0.5) / 4, 0, 0.55 * s - i * 0.05, h / 4 + 0.02, 0.55 * s - i * 0.05, shadeOf(L.leaf, i % 2 ? 0.85 : 0.95), { part: STEM });
        for (let i = 0; i < 7; i++) {
            const a = i * 2.1, y = (1.2 + i * 0.8) * s;
            k.box(Math.cos(a) * 1.2 * s, y + 0.6 * s, Math.sin(a) * 1.2 * s, 2.8 * s, 0.14, 0.42 * s, leafC(L, R), { part: LEAF, ry: -a, rz: 0.55 });
        }
        k.box(0, h + 0.5 * s, 0, 0.2, 1.2 * s, 0.2, 0xe8d08a, { part: LEAF });
        for (const [a, y] of [[0.4, 3.3], [3.4, 4.5]]) {
            const x = Math.cos(a) * 0.6 * s, z = Math.sin(a) * 0.6 * s, yy = y * s;
            k.box(x, yy, z, 0.65 * s, 1.8 * s, 0.65 * s, L.fruit, { part: FRUIT, cx: x, cy: yy, cz: z, rz: 0.25 * Math.cos(a), rx: -0.25 * Math.sin(a) });
            k.box(x * 1.15, yy - 0.3 * s, z * 1.15, 0.75 * s, 1.3 * s, 0.4 * s, L.husk, { part: FRUIT, cx: x, cy: yy, cz: z, ry: -a, rz: 0.2 });
        }
    },
    vine(k, L, R, s) {
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2 + 0.4;
            k.box(Math.cos(a) * 1.4 * s, 0.32, Math.sin(a) * 1.4 * s, 2.8 * s, 0.22, 0.22, shadeOf(L.leaf, 0.75), { part: STEM, ry: -a });
            const lx = Math.cos(a) * 2.2 * s, lz = Math.sin(a) * 2.2 * s;
            k.box(lx, 0.7 * s, lz, 0.18, 0.8 * s, 0.18, shadeOf(L.leaf, 0.8), { part: STEM });
            k.box(lx, 1.15 * s, lz, 1.6 * s, 0.18, 1.6 * s, leafC(L, R), { part: LEAF, ry: a, rx: 0.15 });
        }
        const fy = 1.05 * s;
        if (L.long) {
            k.box(0, fy, 0, 3 * s, 1.9 * s, 1.9 * s, L.fruit, { part: FRUIT, cx: 0, cy: fy, cz: 0 });
            for (const z of [-0.55, 0, 0.55]) k.box(0, fy + 0.96 * s, z * s, 3.02 * s, 0.06, 0.28 * s, L.stripe, { part: FRUIT, cx: 0, cy: fy, cz: 0 });
            for (const sz of [-1, 1]) for (const y of [-0.45, 0.25]) k.box(0, fy + y * s, sz * 0.96 * s, 3.02 * s, 0.26 * s, 0.06, L.stripe, { part: FRUIT, cx: 0, cy: fy, cz: 0 });
        } else {
            const c = L.fruit;
            k.box(0, fy, 0, 2.3 * s, 1.9 * s, 2.3 * s, c, { part: FRUIT, cx: 0, cy: fy, cz: 0 });
            for (const [x, z] of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) k.box(x * s, fy, z * s, (x ? 0.45 : 1.7) * s, 1.7 * s, (z ? 0.45 : 1.7) * s, shadeOf(c, 0.9), { part: FRUIT, cx: 0, cy: fy, cz: 0 });
            if (L.stripe) for (const x of [-0.6, 0.6]) k.box(x * s, fy + 0.96 * s, 0, 0.25 * s, 0.06, 2.32 * s, L.stripe, { part: FRUIT, cx: 0, cy: fy, cz: 0 });
            k.box(0, fy + 1.15 * s, 0, 0.3 * s, 0.6 * s, 0.3 * s, 0x6a4a24, { part: FRUIT, cx: 0, cy: fy, cz: 0 });
            if (L.carved) {
                const fz = 1.21 * s, dark = 0x2a1204;
                for (const x of [-0.5, 0.5]) k.box(x * s, fy + 0.35 * s, fz, 0.45 * s, 0.4 * s, 0.06, dark, { part: FRUIT, cx: 0, cy: fy, cz: 0 });
                k.box(0, fy - 0.35 * s, fz, 1.3 * s, 0.3 * s, 0.06, dark, { part: FRUIT, cx: 0, cy: fy, cz: 0 });
                for (const x of [-0.35, 0.35]) k.box(x * s, fy - 0.17 * s, fz, 0.22 * s, 0.16 * s, 0.06, dark, { part: FRUIT, cx: 0, cy: fy, cz: 0 });
            }
        }
    },
    pine(k, L, R, s) {
        for (let i = 0; i < 9; i++) {
            const a = i / 9 * Math.PI * 2;
            k.box(Math.cos(a) * 1.0 * s, 0.9 * s, Math.sin(a) * 1.0 * s, 2.4 * s, 0.25 * s, 0.4 * s, leafC(L, R), { part: LEAF, ry: -a, rz: 0.6 + R() * 0.2 });
        }
        const fy = 1.9 * s;
        k.box(0, fy, 0, 1.5 * s, 2.1 * s, 1.5 * s, L.fruit, { part: FRUIT, cx: 0, cy: fy, cz: 0 });
        for (let i = 0; i < 12; i++) { const a = (i % 4) * Math.PI / 2, y = fy - 0.7 * s + Math.floor(i / 4) * 0.7 * s; k.box(Math.cos(a) * 0.76 * s, y, Math.sin(a) * 0.76 * s, 0.35 * s, 0.35 * s, 0.35 * s, shadeOf(L.fruit, 0.7), { part: FRUIT, cx: 0, cy: fy, cz: 0, ry: a + Math.PI / 4 }); }
        for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; k.box(Math.cos(a) * 0.3 * s, fy + 1.5 * s, Math.sin(a) * 0.3 * s, 0.22 * s, 1.2 * s, 0.4 * s, 0x3a9a4a, { part: FRUIT, cx: 0, cy: fy, cz: 0, rx: Math.sin(a) * 0.4, rz: -Math.cos(a) * 0.4 }); }
    },
    trellis(k, L, R, s) {
        const H = 5 * s, X = 2.3 * s;
        for (const x of [-X, X]) k.box(x, H / 2, 0, 0.45 * s, H, 0.45 * s, L.trunk, { part: STEM });
        k.box(0, H, 0, X * 2 + 0.6 * s, 0.4 * s, 0.45 * s, shadeOf(L.trunk, 1.1), { part: STEM });
        for (let i = 0; i < 9; i++) {
            const x = -X + (i / 8) * X * 2, y = H + 0.4 * s;
            k.box(x, y + (R() - 0.5) * 0.4, (R() - 0.5) * 0.8, 1.3 * s, 0.2, 1.3 * s, leafC(L, R), { part: LEAF, ry: R() * 2 });
        }
        for (const x of [-X, X]) for (let i = 0; i < 3; i++) k.box(x + (R() - 0.5) * 0.5, (1 + i * 1.3) * s, 0.35 * s, 1 * s, 1 * s, 0.18, leafC(L, R), { part: LEAF });
        for (const cx of [-1.3, 0, 1.3]) {
            const x0 = cx * s, y0 = H - 1.1 * s;
            const pts = [[0, 0.55], [-0.38, 0.3], [0.38, 0.3], [0, 0.1], [-0.2, -0.15], [0.2, -0.15], [0, -0.42], [-0.38, 0.62], [0.38, 0.62]];
            for (const [dx, dy] of pts) k.box(x0 + dx * s, y0 + dy * 1.4 * s, (R() - 0.5) * 0.3 * s, 0.4 * s, 0.4 * s, 0.4 * s, shadeOf(L.fruit, 0.85 + R() * 0.3), { part: FRUIT, cx: x0, cy: y0 + 0.4 * s, cz: 0 });
            k.box(x0, H - 0.25 * s, 0, 0.12, 0.5 * s, 0.12, 0x6a4a24, { part: STEM });
        }
    },
    palm(k, L, R, s) {
        const n = 6, seg = 1.05 * s;
        let x = 0;
        for (let i = 0; i < n; i++) { x = Math.sin(i / n * 1.3) * 0.9 * s; k.box(x, seg * (i + 0.5), 0, (0.95 - i * 0.04) * s, seg + 0.02, (0.95 - i * 0.04) * s, shadeOf(L.trunk, i % 2 ? 0.85 : 1), { part: STEM }); }
        const top = seg * n + 0.2 * s;
        for (let i = 0; i < 7; i++) {
            const a = i / 7 * Math.PI * 2;
            k.box(x + Math.cos(a) * 2.1 * s, top - 0.2 * s, Math.sin(a) * 2.1 * s, 4.4 * s, 0.18, 1 * s, leafC(L, R), { part: LEAF, ry: -a, rz: -0.35 });
        }
        k.box(x, top, 0, 1.1 * s, 0.6 * s, 1.1 * s, shadeOf(L.leaf, 0.75), { part: LEAF });
        if (L.bunch) {
            const fx = x + 0.7 * s, fy = top - 1.1 * s;
            for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; k.box(fx + Math.cos(a) * 0.38 * s, fy + (i % 2) * 0.35 * s, Math.sin(a) * 0.38 * s, 0.28 * s, 1.05 * s, 0.28 * s, L.fruit, { part: FRUIT, cx: fx, cy: fy, cz: 0, rz: Math.cos(a) * 0.35, rx: -Math.sin(a) * 0.35 }); }
        } else for (const [dx, dz] of [[0.65, 0.2], [-0.4, 0.55], [0.05, -0.65]]) fruit(k, x + dx * s, top - 0.75 * s, dz * s, 0.9 * s, L.fruit);
    },
    cactus(k, L, R, s) {
        const H = 4.6 * s;
        for (let i = 0; i < 4; i++) k.box(0, H * (i + 0.5) / 4, 0, 1.3 * s, H / 4 + 0.02, 1.3 * s, shadeOf(L.leaf, i % 2 ? 0.9 : 1), { part: STEM });
        for (const sx of [-1, 1]) {
            const y = (1.8 + (sx > 0 ? 0.4 : 0)) * s;
            k.box(sx * 1.1 * s, y, 0, 1.2 * s, 0.85 * s, 0.85 * s, L.leaf, { part: LEAF });
            k.box(sx * 1.5 * s, y + 1.05 * s, 0, 0.85 * s, 1.8 * s, 0.85 * s, shadeOf(L.leaf, 0.95), { part: LEAF });
            fruit(k, sx * 1.5 * s, y + 2.3 * s, 0, 0.85 * s, L.fruit);
            k.box(sx * 1.5 * s, y + 2.75 * s, 0, 0.5 * s, 0.25 * s, 0.5 * s, 0x5ad83a, { part: FRUIT, cx: sx * 1.5 * s, cy: y + 2.3 * s, cz: 0 });
        }
        fruit(k, 0, H + 0.45 * s, 0, 0.9 * s, L.fruit);
        for (let i = 0; i < 10; i++) k.box((R() - 0.5) * 1.34 * s, R() * H, (R() < 0.5 ? -1 : 1) * 0.67 * s, 0.12, 0.12, 0.12, 0xffffff, { part: STEM });
    },
    flower(k, L, R, s) {
        const H = (L.tall ? 5.4 : 2.8) * s;
        k.box(0, H / 2, 0, 0.26 * s, H, 0.26 * s, shadeOf(L.leaf, 0.85), { part: STEM });
        for (const [y, a] of [[0.35, 0.5], [0.6, 3.6]]) k.box(Math.cos(a) * 0.6 * s, H * y, Math.sin(a) * 0.6 * s, 1.1 * s, 0.14, 0.55 * s, leafC(L, R), { part: LEAF, ry: -a, rz: 0.3 });
        if (L.tall) {
            const fy = H + 0.4 * s;
            for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; k.box(Math.cos(a) * 1.05 * s, fy + Math.sin(a) * 1.05 * s, 0.1, 0.75 * s, 0.75 * s, 0.2 * s, i % 2 ? L.fruit : shadeOf(L.fruit, 1.1), { part: FRUIT, cx: 0, cy: fy, cz: 0, rz: a }); }
            k.box(0, fy, 0.22 * s, 1.3 * s, 1.3 * s, 0.3 * s, L.center, { part: FRUIT, cx: 0, cy: fy, cz: 0 });
        } else {
            const fy = H + 0.35 * s;
            fruit(k, 0, fy, 0, 0.75 * s, shadeOf(L.fruit, 0.85));
            for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; k.box(Math.cos(a) * 0.42 * s, fy - 0.05 * s, Math.sin(a) * 0.42 * s, 0.6 * s, 0.6 * s, 0.25 * s, L.fruit, { part: FRUIT, cx: 0, cy: fy, cz: 0, ry: -a, rx: 0.35 }); }
        }
    },
    bonsai(k, L, R, s) {
        const pts = [[0, 0.8], [0.6, 1.9], [0.1, 3], [-0.5, 3.8]];
        for (const [x, y] of pts) k.box(x * s, y * s, 0, 0.75 * s, 1.25 * s, 0.75 * s, L.trunk, { part: STEM });
        for (const [x, y, z, w] of [[-0.8, 4.3, 0, 3.6], [1.4, 3.1, 0.4, 2.6], [-0.4, 2.5, -1, 2.2]]) {
            k.box(x * s, y * s, z * s, w * s, 0.8 * s, w * 0.8 * s, L.leaf, { part: LEAF });
            k.box(x * s, (y + 0.55) * s, z * s, w * 0.7 * s, 0.4 * s, w * 0.6 * s, L.leaf2, { part: LEAF });
            for (let i = 0; i < 3; i++) fruit(k, (x + (R() - 0.5) * w * 0.8) * s, (y + 0.65) * s, (z + (R() - 0.5) * w * 0.5) * s, 0.42 * s, L.fruit);
        }
    },
    beanstalk(k, L, R, s) {
        for (let i = 0; i < 12; i++) {
            const a = i * 0.9, y = (0.4 + i * 0.58) * s;
            k.box(Math.cos(a) * 0.35 * s, y, Math.sin(a) * 0.35 * s, 0.55 * s, 0.62 * s, 0.55 * s, shadeOf(L.leaf, i % 2 ? 0.8 : 0.95), { part: STEM });
            if (i % 3 === 1) k.box(Math.cos(a) * 1.3 * s, y + 0.2 * s, Math.sin(a) * 1.3 * s, 1.6 * s, 0.16, 1.2 * s, leafC(L, R), { part: LEAF, ry: -a });
        }
        for (const [a, y] of [[0.5, 3.2], [2.6, 4.6], [4.6, 6.2]]) {
            const x = Math.cos(a) * 0.95 * s, z = Math.sin(a) * 0.95 * s;
            k.box(x, y * s, z, 0.5 * s, 1.5 * s, 0.5 * s, L.fruit, { part: FRUIT, cx: x, cy: y * s, cz: z, rz: 0.3 });
        }
    },
};

export const geoCache = new Map();
export function plantGeometry(spId) {
    let g = geoCache.get(spId);
    if (g) return g;
    const sp = speciesById[spId], L = sp.look, k = new Kit({ parts: true }), R = rng(speciesIndex[spId] * 977 + 13);
    soil(k, sp.r);
    BUILD[L.kind](k, L, R, L.size || 1);
    g = k.geometry();
    // the plant's height, for its label and the camera
    g.computeBoundingBox();
    geoCache.set(spId, g);
    return g;
}
export const plantHeight = (spId) => plantGeometry(spId).boundingBox.max.y;

// =====================================================================================
// The shader: growth, fruit, sway, ripe bounce + glow, mutations
// =====================================================================================
const VERT_HEAD = /* glsl */`
attribute float aPart;
attribute vec3 aC;
attribute vec4 iT;   // planted, fruit started, ripe (seconds since the epoch), mutation
attribute float iR;  // a random number per plant
uniform float uNow;
varying float vPart; varying float vRipe; varying float vMut; varying float vGrown; varying vec3 vLocal; varying float vRnd; varying float vNy;
float easeBack(float x) { float c1 = 1.4; float c3 = c1 + 1.0; return 1.0 + c3 * pow(x - 1.0, 3.0) + c1 * pow(x - 1.0, 2.0); }
`;
const VERT_BODY = /* glsl */`
float kb = clamp((uNow - iT.x) / max(0.05, iT.y - iT.x), 0.0, 1.0);
float sb = 0.14 + 0.86 * (kb * kb * (3.0 - 2.0 * kb)) + sin(kb * 3.14159) * 0.06 * kb;
float kf = clamp((uNow - iT.y) / max(0.05, iT.z - iT.y), 0.0, 1.0);
float ripe = step(iT.z, uNow) * step(0.999, kb);
vec3 p = position;
if (aPart > 0.5) {
    if (aPart > 2.5) {
        float sf = kf < 0.001 ? 0.0 : 0.1 + 0.9 * smoothstep(0.0, 1.0, kf);
        sf *= 1.0 + ripe * 0.14 * (0.5 + 0.5 * sin(uNow * 6.5 + iR * 40.0));
        p = aC * sb + (p - aC) * sf * sb;
    } else p *= sb;
    float sw = sin(uNow * 1.6 + iR * 6.28 + p.y * 0.3) * 0.03 * p.y * (aPart > 1.5 ? 1.4 : 0.7);
    p.x += sw; p.z += sw * 0.7;
    // a ripe plant does a happy little hop now and then
    p.y += ripe * max(0.0, sin(uNow * 3.2 + iR * 20.0) - 0.9) * 2.5 * step(0.5, aPart);
}
vec3 transformed = p;
vPart = aPart; vRipe = ripe; vMut = iT.w; vGrown = kb; vLocal = position; vRnd = iR; vNy = normal.y;
`;
const FRAG_HEAD = /* glsl */`
uniform float uNow; uniform vec3 uGlow;
varying float vPart; varying float vRipe; varying float vMut; varying float vGrown; varying vec3 vLocal; varying float vRnd; varying float vNy;
vec3 hue2rgb(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
`;
const FRAG_COLOR = /* glsl */`
float mk = smoothstep(0.9, 1.0, vGrown) * step(0.5, vPart);
int mut = int(vMut + 0.5);
vec3 base = diffuseColor.rgb;
float lum = dot(base, vec3(0.3, 0.59, 0.11));
vec3 mutGlow = vec3(0.0);
if (mut == 1) {          // golden: everything gold, a shine sweeping up
    float sh = pow(0.5 + 0.5 * sin(vLocal.y * 1.6 + vLocal.x * 0.9 - uNow * 2.6), 6.0);
    vec3 g = vec3(1.0, 0.76, 0.16) * (0.5 + lum * 1.1);
    diffuseColor.rgb = mix(base, g, 0.82 * mk);
    mutGlow = vec3(1.0, 0.85, 0.35) * (0.12 + sh * 0.5) * mk;
} else if (mut == 2) {   // toxic: neon green fruit, sickly leaves, a slow pulse
    float pu = 0.5 + 0.5 * sin(uNow * 3.0 + vLocal.y);
    diffuseColor.rgb = mix(base, vPart > 2.5 ? vec3(0.45, 1.0, 0.12) : base * vec3(0.7, 1.05, 0.55), 0.8 * mk);
    mutGlow = vec3(0.3, 0.9, 0.05) * (vPart > 2.5 ? 0.35 + pu * 0.35 : 0.05) * mk;
} else if (mut == 3) {   // frozen: icy blue, frosted tops
    vec3 ice = mix(vec3(0.55, 0.85, 1.0), vec3(1.0), smoothstep(0.2, 1.0, vNy));
    diffuseColor.rgb = mix(base, ice * (0.6 + lum * 0.6), 0.72 * mk);
    mutGlow = vec3(0.2, 0.45, 0.6) * 0.18 * mk;
} else if (mut == 4) {   // rainbow: colours flowing up the plant
    vec3 rb = hue2rgb(fract(vLocal.y * 0.12 + vLocal.x * 0.05 - uNow * 0.35));
    diffuseColor.rgb = mix(base, rb * (0.55 + lum * 0.6), 0.78 * mk);
    mutGlow = rb * 0.28 * mk;
} else if (mut == 5) {   // celestial: deep violet with twinkling stars
    float st = step(0.985, fract(sin(dot(floor(vLocal * 4.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453));
    float tw = 0.5 + 0.5 * sin(uNow * 4.0 + vLocal.x * 9.0);
    diffuseColor.rgb = mix(base, vec3(0.32, 0.18, 0.62) * (0.7 + lum * 0.7), 0.8 * mk);
    mutGlow = (vec3(0.45, 0.25, 0.85) * 0.25 + vec3(1.0) * st * tw * 1.4) * mk;
}
`;
const FRAG_EMISSIVE = /* glsl */`
totalEmissiveRadiance += mutGlow;
// the species' own glow (moon melon, spooky pumpkin...) on its fruit, and every ripe fruit pulsing
float fr = step(2.5, vPart);
totalEmissiveRadiance += uGlow * fr * (0.55 + 0.25 * sin(uNow * 2.0 + vRnd * 9.0));
totalEmissiveRadiance += diffuseColor.rgb * fr * vRipe * (0.22 + 0.16 * sin(uNow * 5.0 + vRnd * 30.0));
`;
function patchVertex(sh) {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_HEAD)
        .replace('#include <begin_vertex>', VERT_BODY);
}
const plantMats = new Map();
function plantMaterial(spId) {
    let m = plantMats.get(spId);
    if (m) return m;
    const sp = speciesById[spId];
    m = new T.MeshLambertMaterial({ vertexColors: true });
    const glow = new T.Color(sp.look.glow || 0x000000).multiplyScalar(sp.look.glow ? 0.6 : 0);
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uNow = PU.uNow;
        sh.uniforms.uGlow = { value: glow };
        patchVertex(sh);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
            .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR)
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_EMISSIVE);
    };
    // one program for every species (only the uniforms differ)
    m.customProgramCacheKey = () => 'bgt-plant';
    plantMats.set(spId, m);
    return m;
}
// The shadow of a growing plant grows with it
const depthMat = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking });
depthMat.onBeforeCompile = (sh) => { sh.uniforms.uNow = PU.uNow; patchVertex(sh); };
depthMat.customProgramCacheKey = () => 'bgt-plant-depth';

// =====================================================================================
// The instanced meshes: one per species, holding every plant of that species in the garden
// =====================================================================================
const all = new Map();          // key "plot:id" -> { plot, id, sp, f, x, z, r, m, t0, fs, fa, rnd }
const bySp = new Map();         // species id -> { mesh, cap, dirty, list }
const byPlot = new Map();       // plot -> cached array of its plants (null when it changed)
const m4 = new T.Matrix4(), q4 = new T.Quaternion(), p4 = new V3(), s4 = new V3(1, 1, 1), YA = new V3(0, 1, 0);
function bucket(spId) {
    let b = bySp.get(spId);
    if (!b) { b = { mesh: null, cap: 0, dirty: true, list: [] }; bySp.set(spId, b); }
    return b;
}
function makeMesh(b, spId, cap) {
    if (b.mesh) { scene.remove(b.mesh); b.mesh.dispose(); }
    const g = plantGeometry(spId).clone();
    g.setAttribute('iT', new T.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
    g.setAttribute('iR', new T.InstancedBufferAttribute(new Float32Array(cap), 1));
    const mesh = new T.InstancedMesh(g, plantMaterial(spId), cap);
    mesh.count = 0;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.customDepthMaterial = depthMat;
    // the plants are spread over the whole ring: the bounding sphere is worked out on each rebuild
    mesh.frustumCulled = true;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    b.mesh = mesh; b.cap = cap;
}
const rel = (ms) => (ms - EPOCH) / 1000;
export function setPlant(plot, id, d) {
    const key = plot + ':' + id, old = all.get(key);
    const sp = SPECIES[d.sp] ? SPECIES[d.sp].id : 'apple';
    if (old && old.sp !== sp) bucket(old.sp).dirty = true;
    const p = old || { plot, id, rnd: Math.random() };
    Object.assign(p, { sp, f: d.f, x: d.x, z: d.z, r: d.r, m: d.m, t0: d.t0, fs: d.fs, fa: d.fa });
    all.set(key, p);
    bucket(sp).dirty = true;
    if (!old) byPlot.set(plot, null);
    return p;
}
export function removePlant(plot, id) {
    const key = plot + ':' + id, p = all.get(key);
    if (!p) return;
    all.delete(key);
    bucket(p.sp).dirty = true;
    byPlot.set(plot, null);
}
export function clearPlot(plot) { for (const [k, p] of all) if (p.plot === plot) { all.delete(k); bucket(p.sp).dirty = true; } byPlot.set(plot, null); }
export const getPlant = (plot, id) => all.get(plot + ':' + id);
// the plants of one greenhouse (a cached array: don't change it)
export function plantsOf(plot) {
    let list = byPlot.get(plot);
    if (!list) { list = []; for (const p of all.values()) if (p.plot === plot) list.push(p); byPlot.set(plot, list); }
    return list;
}
// where a plant stands in the world
export function plantWorld(p, out) {
    const w = toWorld(p.plot, p.x, p.z);
    return (out || new V3()).set(w.x, floorY(p.f), w.z);
}
export function flushPlants() {
    for (const [spId, b] of bySp) {
        if (!b.dirty) continue;
        b.dirty = false;
        const list = [];
        for (const p of all.values()) if (p.sp === spId) list.push(p);
        if (!list.length && !b.mesh) continue;
        if (list.length > b.cap) makeMesh(b, spId, Math.max(16, 1 << Math.ceil(Math.log2(list.length + 4))));
        const mesh = b.mesh, iT = mesh.geometry.attributes.iT, iR = mesh.geometry.attributes.iR;
        list.forEach((p, i) => {
            plantWorld(p, p4);
            q4.setFromAxisAngle(YA, FRAMES[p.plot].yaw + p.r * Math.PI / 4);
            m4.compose(p4, q4, s4);
            mesh.setMatrixAt(i, m4);
            iT.setXYZW(i, rel(p.t0), rel(p.fs), rel(p.fa), p.m);
            iR.setX(i, p.rnd);
        });
        mesh.count = list.length;
        mesh.instanceMatrix.needsUpdate = true;
        iT.needsUpdate = true; iR.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.visible = list.length > 0;
    }
}
// re-times every plant after the clock's epoch moved (only at start-up)
export function retimeAll() { for (const b of bySp.values()) b.dirty = true; }

// One of each species in front of the camera for the loading warm-up (their program is shared, but
// each geometry still uploads)
export function plantWarmGroup() {
    const g = new T.Group();
    for (const sp of SPECIES) {
        const geo = plantGeometry(sp.id).clone();
        geo.setAttribute('iT', new T.InstancedBufferAttribute(new Float32Array([0, 0, 0, 0]), 4));
        geo.setAttribute('iR', new T.InstancedBufferAttribute(new Float32Array([0]), 1));
        const m = new T.InstancedMesh(geo, plantMaterial(sp.id), 1);
        m.castShadow = true; m.receiveShadow = true; m.customDepthMaterial = depthMat;
        m.setMatrixAt(0, new T.Matrix4());
        g.add(m);
    }
    return g;
}

// =====================================================================================
// The ghost: where a seed will go while you're planting (green: OK, red: can't)
// =====================================================================================
let ghost = null, ghostSp = '', ghostRing = null;
const ghostMat = new T.MeshBasicMaterial({ color: 0x7dff6b, transparent: true, opacity: 0.45, depthWrite: false, vertexColors: true });
const ringMat = new T.MeshBasicMaterial({ color: 0x7dff6b, transparent: true, opacity: 0.7, depthWrite: false, side: T.DoubleSide });
export function showGhost(spId, pos, yaw, ok, t) {
    if (!ghost || ghostSp !== spId) {
        if (ghost) scene.remove(ghost);
        ghost = new T.Mesh(plantGeometry(spId), ghostMat);
        ghost.renderOrder = 8;
        ghostSp = spId;
        scene.add(ghost);
        if (!ghostRing) { ghostRing = new T.Mesh(new T.RingGeometry(0.88, 1, 40).rotateX(-Math.PI / 2), ringMat); ghostRing.renderOrder = 8; scene.add(ghostRing); }
    }
    ghost.visible = ghostRing.visible = true;
    ghost.position.copy(pos);
    ghost.rotation.y = yaw;
    const c = ok ? 0x7dff6b : 0xff4a5a;
    ghostMat.color.set(c); ringMat.color.set(c);
    ghostMat.opacity = 0.42 + Math.sin((t || 0) * 6) * 0.08;
    const r = speciesById[spId].r;
    ghostRing.position.set(pos.x, pos.y + 0.35, pos.z);
    ghostRing.scale.set(r, 1, r);
}
export function hideGhost() { if (ghost) ghost.visible = false; if (ghostRing) ghostRing.visible = false; }

// =====================================================================================
// Fruit flying from a harvested plant into the crates: a pool of little blocks, each written once
// when it sets off and flown along its arc by the GPU
// =====================================================================================
const FLY_N = 160;
const flyGeo = new T.InstancedBufferGeometry().copy(new T.BoxGeometry(1, 1, 1));
const fA = new T.InstancedBufferAttribute(new Float32Array(FLY_N * 4), 4), fB = new T.InstancedBufferAttribute(new Float32Array(FLY_N * 4), 4), fC = new T.InstancedBufferAttribute(new Float32Array(FLY_N * 4), 4);
for (let i = 0; i < FLY_N; i++) fA.setW(i, -99);
flyGeo.setAttribute('fA', fA); flyGeo.setAttribute('fB', fB); flyGeo.setAttribute('fC', fC);
flyGeo.instanceCount = FLY_N;
const flyMat = new T.ShaderMaterial({
    uniforms: { uNow: PU.uNow },
    vertexShader: /* glsl */`
        attribute vec4 fA; attribute vec4 fB; attribute vec4 fC;
        uniform float uNow;
        varying vec3 vCol; varying vec3 vN;
        void main() {
            float k = (uNow - fA.w) / fB.w;
            if (k < 0.0 || k > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
            float e = k * k * (3.0 - 2.0 * k);
            vec3 a = fA.xyz, b = fB.xyz;
            vec3 m = mix(a, b, e);
            m.y += sin(k * 3.14159) * (6.0 + distance(a.xz, b.xz) * 0.25);
            float s = fC.w * (1.0 - smoothstep(0.82, 1.0, k)) * (0.6 + 0.4 * smoothstep(0.0, 0.15, k));
            float ang = uNow * 9.0 + fA.w * 13.0;
            mat3 R = mat3(cos(ang), 0.0, -sin(ang), 0.0, 1.0, 0.0, sin(ang), 0.0, cos(ang));
            vN = R * normal;
            vCol = fC.rgb;
            gl_Position = projectionMatrix * viewMatrix * vec4(m + R * position * s, 1.0);
        }`,
    fragmentShader: /* glsl */`
        varying vec3 vCol; varying vec3 vN;
        void main() {
            float l = 0.62 + 0.38 * max(0.0, dot(normalize(vN), normalize(vec3(0.5, 0.8, 0.4))));
            gl_FragColor = vec4(vCol * l * 1.15, 1.0);
            #include <colorspace_fragment>
        }`,
});
const flyers = new T.Mesh(flyGeo, flyMat);
flyers.frustumCulled = false;
flyers.renderOrder = 7;
scene.add(flyers);
let flyNext = 0;
const flyC = new T.Color();
export function flyFruit(from, to, color, n, size) {
    const now = PU.uNow.value;
    flyC.set(color);
    let lo = FLY_N, hi = -1;
    for (let k = 0; k < (n || 4); k++) {
        const i = flyNext; flyNext = (flyNext + 1) % FLY_N;
        lo = Math.min(lo, i); hi = Math.max(hi, i);
        fA.setXYZW(i, from.x + (Math.random() - 0.5) * 1.5, from.y + Math.random(), from.z + (Math.random() - 0.5) * 1.5, now + k * 0.06);
        fB.setXYZW(i, to.x + (Math.random() - 0.5) * 1.2, to.y, to.z + (Math.random() - 0.5) * 1.2, 0.75 + Math.random() * 0.25);
        fC.setXYZW(i, flyC.r, flyC.g, flyC.b, (size || 0.7) * (0.8 + Math.random() * 0.4));
    }
    for (const a of [fA, fB, fC]) {
        a.clearUpdateRanges();
        if (hi - lo + 1 < FLY_N && lo <= hi) a.addUpdateRange(lo * 4, (hi - lo + 1) * 4);
        a.needsUpdate = true;
    }
}
export const flyWarm = () => flyers;
void LEAF; void SOIL;
