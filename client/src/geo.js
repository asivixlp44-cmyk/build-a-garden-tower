// Geometry helpers: a "voxel kit" that writes coloured boxes straight into one vertex array (one
// mesh, one draw, one material for a whole prop), rounded blocks, and merging.
import { T } from './engine.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const tc = new T.Color(), te = new T.Euler(), tq = new T.Quaternion(), tv = new T.Vector3(), tn = new T.Vector3();
// unit cube corners per face: normal, then 4 corners (counter-clockwise seen from outside)
const FACES = [
    [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
    [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
    [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
    [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
    [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
    [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
];
// Shading baked into the vertex colours (the reference's blocky plants have it): tops a touch
// brighter, bottoms darker, so stacked cubes read as separate blocks even in the shade
const SHADE = [0.94, 0.86, 1.06, 0.72, 0.98, 0.9];

export class Kit {
    constructor(o) {
        o = o || {};
        this.pos = []; this.nor = []; this.col = []; this.uv = [];
        this.part = o.parts ? [] : null;    // per-vertex part (plants: 0 soil, 1 stem, 2 leaf, 3 fruit)
        this.glow = o.glow ? [] : null;     // per-vertex glow (0 lit, 1 glowing / unlit, 2 glowing and bobbing)
        this.cen = o.parts ? [] : null;     // per-vertex pivot the part scales round (fruit centres)
        this.noShade = !!o.noShade;
    }
    // A box centred at (x, y, z), size (sx, sy, sz), colour c; o: { part, cx, cy, cz (pivot), rx, ry, rz (turn), shade,
    // uv: [u0,v0,u1,v1] (every face), tile: world size of one texture tile (studs line up on every face) }
    box(x, y, z, sx, sy, sz, c, o) {
        o = o || {};
        tc.set(c);
        const turned = o.rx || o.ry || o.rz;
        if (turned) tq.setFromEuler(te.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || 'XYZ'));
        const part = o.part || 0, pcx = o.cx ?? x, pcy = o.cy ?? y, pcz = o.cz ?? z;
        const shade = o.shade ?? 1;
        for (let f = 0; f < 6; f++) {
            const [n, corners] = FACES[f];
            tn.set(n[0], n[1], n[2]);
            if (turned) tn.applyQuaternion(tq);
            const k = (this.noShade || o.glow ? 1 : SHADE[f]) * shade;
            const idx = [0, 1, 2, 0, 2, 3];
            for (const i of idx) {
                const cn = corners[i];
                tv.set(cn[0] * sx / 2, cn[1] * sy / 2, cn[2] * sz / 2);
                if (turned) tv.applyQuaternion(tq);
                this.pos.push(x + tv.x, y + tv.y, z + tv.z);
                this.nor.push(tn.x, tn.y, tn.z);
                this.col.push(tc.r * k, tc.g * k, tc.b * k);
                if (o.uv) { const [u0, v0, u1, v1] = o.uv; this.uv.push(i === 0 || i === 3 ? u0 : u1, i < 2 ? v0 : v1); }
                else if (o.tile) { const fw = f < 2 ? sz : sx, fh = f === 2 || f === 3 ? sz : sy; this.uv.push(i === 0 || i === 3 ? 0 : fw / o.tile, i < 2 ? 0 : fh / o.tile); }
                else this.uv.push(i === 0 || i === 3 ? 0 : 1, i < 2 ? 0 : 1);
                if (this.part) { this.part.push(part); this.cen.push(pcx, pcy, pcz); }
                if (this.glow) this.glow.push(o.glow || 0);
            }
        }
        return this;
    }
    // a flat square (leaf, decal) lying in xz at height y, turned ry
    flat(x, y, z, sx, sz, c, o) { return this.box(x, y, z, sx, 0.12, sz, c, o); }
    get count() { return this.pos.length / 3; }
    geometry() {
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(this.pos, 3));
        g.setAttribute('normal', new T.Float32BufferAttribute(this.nor, 3));
        g.setAttribute('color', new T.Float32BufferAttribute(this.col, 3));
        g.setAttribute('uv', new T.Float32BufferAttribute(this.uv, 2));
        if (this.glow) g.setAttribute('aGlow', new T.Float32BufferAttribute(this.glow, 1));
        if (this.part) {
            g.setAttribute('aPart', new T.Float32BufferAttribute(this.part, 1));
            g.setAttribute('aC', new T.Float32BufferAttribute(this.cen, 3));
        }
        g.computeBoundingSphere();
        return g;
    }
}

// A cube with rounded edges (one bevel step, smooth normals), centred, side `size`, bevel r
export function roundedBlockGeo(size, r) {
    const h = size / 2, i = h - r;
    const pos = [], nor = [], idx = [];
    const faces = [
        [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
        [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
        [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    ];
    const ts = [-h, -i, i, h];
    for (const [N, Uu, V] of faces) {
        const base = pos.length / 3;
        for (let b = 0; b < 4; b++) for (let a = 0; a < 4; a++) {
            const u = ts[a], v = ts[b];
            const p = [N[0] * h + Uu[0] * u + V[0] * v, N[1] * h + Uu[1] * u + V[1] * v, N[2] * h + Uu[2] * u + V[2] * v];
            const q = p.map((x) => Math.max(-i, Math.min(i, x)));
            const d = [p[0] - q[0], p[1] - q[1], p[2] - q[2]], l = Math.hypot(d[0], d[1], d[2]);
            const nn = l > 1e-6 ? d.map((x) => x / l) : N;
            pos.push(q[0] + nn[0] * r, q[1] + nn[1] * r, q[2] + nn[2] * r);
            nor.push(nn[0], nn[1], nn[2]);
        }
        for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) {
            const k = base + b * 4 + a;
            idx.push(k, k + 1, k + 5, k, k + 5, k + 4);
        }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
}
// rounded box (w x h x l)
export function rbox(w, h, l, r) { const g = roundedBlockGeo(1, r ?? 0.2); g.scale(w, h, l); return g; }

// Several geometries (already placed) as one; drops attributes they don't all share
export function merge(list) {
    const keys = Object.keys(list[0].attributes).filter((k) => list.every((g) => g.attributes[k]));
    const ready = list.map((g) => {
        const x = g.index ? g.toNonIndexed() : g;
        for (const k of Object.keys(x.attributes)) if (!keys.includes(k)) x.deleteAttribute(k);
        return x;
    });
    return mergeGeometries(ready);
}

// A seeded random (the same layout every visit)
export function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Bakes every mesh under root into ONE vertex-coloured mesh (each part keeps its material's colour):
// a blocky figure or prop becomes a single draw. root keeps its transform.
export function bakeVC(root, material) {
    root.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(root.matrixWorld).invert(), m4 = new T.Matrix4(), list = [], done = [];
    root.traverse((o) => {
        if (!o.isMesh || Array.isArray(o.material)) return;
        const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
        for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
        g.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
        const c = o.material.color || new T.Color(1, 1, 1), n = g.attributes.position.count, col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
        g.setAttribute('color', new T.BufferAttribute(col, 3));
        list.push(g); done.push(o);
    });
    for (const o of done) o.parent.remove(o);
    for (const c of [...root.children]) if (c.isGroup && !c.children.length) root.remove(c);
    const mesh = new T.Mesh(mergeGeometries(list), material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh);
    for (const g of list) g.dispose();
    return mesh;
}

// One material for lit, glowing (unlit, a touch bright) and glowing-and-bobbing vertex-coloured parts,
// so a whole prop with neon trims and floating arrows is a single draw. Kit({ glow: true }), box o.glow.
export function glowVCMaterial(uNow) {
    const m = new T.MeshLambertMaterial({ vertexColors: true });
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uNow = uNow;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute float aGlow; uniform float uNow; varying float vGlow;`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
vGlow = min(aGlow, 1.0);
if (aGlow > 1.5) transformed.y += sin(uNow * 3.0 + position.x * 0.07 + position.z * 0.05) * 0.35;`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying float vGlow;`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * vGlow * 1.15;
diffuseColor.rgb *= 1.0 - vGlow;`);
    };
    m.customProgramCacheKey = () => 'bgt-glowvc';
    return m;
}
