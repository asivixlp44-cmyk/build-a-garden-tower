// The garden's middle. A wide, sunny square of studded grass with soft colour patches; the round
// MARKET in the middle (the Seed Shop and the SELL counter on a stone plaza, its keepers turning on a
// lazy-susan floor under a grand two-tier striped canopy with bunting and lanterns); brick paths
// lined with lamps from every greenhouse door to it; a promenade ring linking the stalls; four
// fountains; flower beds. On the lawn, well apart: the Egg Shop, the Beanstalk Wheel, Best Players
// (trophy + leaderboards), the Daily Quests board, the Gem Shop, the giant cherry tree, the Halloween
// pumpkin patch and the bed where the Giant Beanstalk sprouts. The ring road runs in front of the
// greenhouses; between each pair of greenhouses a little garden walk, in the corners ponds.
// Round it all: trees, hills, windmills, hot-air balloons, butterflies.
//
// Almost everything that doesn't move is written into a few vertex-coloured meshes (one draw each).
// Moving things are single objects (the market's floor, the wheel, eggs, balloons, windmill blades)
// or move in a shader (water, butterflies, guide chevrons, the sell ring).
import {
    T, V3, scene, camera, mat, texFrom, sharedTex, textCanvas, solids, prompts, tickers, solidBox, mergeChildren, fitFont, STUDS, studVCMaterial,
    studMaterial, buildRig,
} from './engine.js';
import { Kit, rbox, rng, bakeVC, glowVCMaterial } from './geo.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CFG, WHEEL, DAILY_QUESTS, speciesById, EGGS, fmt, clock, playtimeText } from '../../shared/config.js';
import {
    SPOTS, FOUNTAINS, PLAZA_R, ROAD_R, MARKET_R, COUNTER_R, BEAN, beanLeaves, BEAN_TOP, PLOTS, PLOT_R, PLOT_OFF, PLOT_W, PLOT_D, toWorld,
} from '../../shared/garden.js';
import { actions, S } from './state.js';
import { PU } from './plants.js';

export const worldRoot = new T.Group();
worldRoot.name = 'world';
scene.add(worldRoot);
const R = rng(4242);
const movers = [];   // objects that move every frame (everything else is frozen)
export function cv(n, draw, h) { const c = document.createElement('canvas'); c.width = n; c.height = h || n; draw(c.getContext('2d'), n, h || n); return c; }

// ----- shared materials (also used by the greenhouses) -----
export const vcMat = new T.MeshLambertMaterial({ vertexColors: true });
const vcDouble = new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide });
export const studMat = studVCMaterial();
// lit + glowing (+ bobbing) vertex-coloured parts in one material (greenhouses, the market's statics)
export const vcgMat = glowVCMaterial(PU.uNow);

// The kits for the merged statics: plain + glowing blocks (one mesh), studded blocks
const KP = new Kit({ glow: true }), KS = new Kit();
const KG = { box: (x, y, z, sx, sy, sz, c, o) => KP.box(x, y, z, sx, sy, sz, c, { ...(o || {}), glow: 1 }) };
const TILE = 16; // world size of one stud tile (8 x 8 studs)
const stud = (x, y, z, sx, sy, sz, c, o) => KS.box(x, y, z, sx, sy, sz, c, { tile: TILE, ...(o || {}) });
// solid squares along a line from local (x0, z0) to (x1, z1) of a turned frame (collision boxes are
// axis-aligned: a chain of small ones follows a turned wall)
function solidLine(F, x0, z0, x1, z1, thick, h, y0) {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / (thick * 0.6)));
    for (let i = 0; i <= n; i++) { const [x, z] = F(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n); solidBox(x, (y0 || 0) + h / 2, z, thick, h, thick, { mat: 'wood' }); }
}
// a frame turned by ry round (ox, oz): local (x, z) -> world [x, z]
function inFrame(ox, oz, ry) {
    const c = Math.cos(ry), s = Math.sin(ry);
    return (lx, lz) => [ox + lx * c + lz * s, oz - lx * s + lz * c];
}
// boxes in a turned frame
function framed(F, ry) {
    return {
        box: (lx, y, lz, sx, sy, sz, c, o) => { const [x, z] = F(lx, lz); KP.box(x, y, z, sx, sy, sz, c, { ...(o || {}), ry: ry + ((o && o.ry) || 0), order: 'YXZ' }); },
        glow: (lx, y, lz, sx, sy, sz, c, o) => { const [x, z] = F(lx, lz); KP.box(x, y, z, sx, sy, sz, c, { ...(o || {}), ry: ry + ((o && o.ry) || 0), glow: 1, order: 'YXZ' }); },
        stud: (lx, y, lz, sx, sy, sz, c, o) => { const [x, z] = F(lx, lz); stud(x, y, z, sx, sy, sz, c, { ...(o || {}), ry: ry + ((o && o.ry) || 0), order: 'YXZ' }); },
        at: F,
    };
}
const FLOWER_COLS = [0xff5a8a, 0xffd21e, 0xff8a2a, 0xc45aff, 0xffffff, 0x5ad0ff, 0xff3a4a];

// =====================================================================================
// Water (fountains and ponds): one shader for every pool, ripples and glints moving on it
// =====================================================================================
const waterMat = new T.ShaderMaterial({
    uniforms: { uNow: PU.uNow },
    vertexShader: 'varying vec2 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */`uniform float uNow; varying vec2 vW;
        void main(){
            vec2 p = vW * 0.22;
            float r = sin(p.x * 2.1 + uNow * 1.3) * sin(p.y * 1.7 - uNow * 1.1) + sin((p.x + p.y) * 1.3 + uNow * 0.9) * 0.6;
            float c = smoothstep(0.75, 1.4, r);
            vec3 col = mix(vec3(0.16, 0.62, 0.95), vec3(0.42, 0.86, 1.0), 0.5 + 0.25 * r);
            col += vec3(1.0) * c * 0.55;
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
        }`,
});
// falling water (the fountains' jets): stripes running down a column
const jetMat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.DoubleSide, forceSinglePass: true,
    uniforms: { uNow: PU.uNow },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`uniform float uNow; varying vec2 vUv;
        void main(){
            float s = 0.55 + 0.45 * sin(vUv.y * 22.0 + uNow * 9.0 + sin(vUv.x * 25.0) * 1.5);
            gl_FragColor = vec4(mix(vec3(0.55, 0.88, 1.0), vec3(1.0), s * 0.6), 0.55 * (0.6 + 0.4 * s));
            #include <colorspace_fragment>
        }`,
});
const waterGeos = [], jetGeos = [];
function pool(x, z, r, y) { waterGeos.push(new T.CircleGeometry(r, 40).rotateX(-Math.PI / 2).translate(x, y, z)); }
function jet(x, z, r0, r1, y0, y1) { jetGeos.push(new T.CylinderGeometry(r1, r0, y1 - y0, 16, 1, true).translate(x, (y0 + y1) / 2, z)); }

// =====================================================================================
// Ground
// =====================================================================================
function buildGround() {
    // the field: studded lime grass, with soft lighter / darker patches so it never looks flat
    const gm = STUDS.map.clone(), gn = STUDS.nrm.clone();
    for (const t of [gm, gn]) { t.repeat.set(1800 / TILE, 1800 / TILE); t.needsUpdate = true; }
    const grassMat = new T.MeshLambertMaterial({ color: 0x5ad83a, map: gm, normalMap: gn, normalScale: new T.Vector2(0.7, 0.7) });
    grassMat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vGW;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vGW;')
            .replace('#include <color_fragment>', `#include <color_fragment>
                float gn = sin(vGW.x * 0.021 + sin(vGW.y * 0.017) * 2.0) * sin(vGW.y * 0.025 + sin(vGW.x * 0.013) * 1.7);
                float gs = sin(vGW.x * 0.11 + vGW.y * 0.07) * sin(vGW.y * 0.09 - vGW.x * 0.05);
                diffuseColor.rgb *= 1.0 + gn * 0.09 + gs * 0.04;
                diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.06, 1.02, 0.86), smoothstep(0.3, 1.0, gn) * 0.5);`);
    };
    grassMat.customProgramCacheKey = () => 'bgt-grass';
    const g = new T.Mesh(new T.PlaneGeometry(1800, 1800).rotateX(-Math.PI / 2), grassMat);
    g.receiveShadow = true;
    worldRoot.add(g);
    // the ring road (lavender, studded, a square band in front of the greenhouses) with white kerbs
    const mid = (PLAZA_R + ROAD_R) / 2, wd = ROAD_R - PLAZA_R, len = ROAD_R * 2;
    for (const [x, z, sx, sz] of [[0, mid, len, wd], [0, -mid, len, wd], [mid, 0, wd, len - wd * 2], [-mid, 0, wd, len - wd * 2]]) stud(x, 0.06, z, sx, 0.12, sz, 0xb4a8dc);
    for (const r of [PLAZA_R, ROAD_R]) {
        const L = r * 2 + 1.2;
        for (const [x, z, sx, sz] of [[0, r, L, 1.2], [0, -r, L, 1.2], [r, 0, 1.2, L], [-r, 0, 1.2, L]]) KP.box(x, 0.2, z, sx, 0.4, sz, 0xf4f0ff);
    }
    // painted arrows along the middle of the road (the reference's light-blue chevrons)
    for (let k = -4; k <= 4; k++) for (const side of [0, 1, 2, 3]) {
        const t = k * 22, a = side * Math.PI / 2;
        const [x, z] = side === 0 ? [t, mid] : side === 1 ? [mid, -t] : side === 2 ? [-t, -mid] : [-mid, t];
        if (Math.abs(t) > ROAD_R - 14) continue;
        for (const sx of [-1, 1]) KP.box(x + Math.cos(a) * sx * 0.9, 0.14, z - Math.sin(a) * sx * 0.9, 0.6, 0.04, 2.6, 0xe8f6ff, { ry: a + sx * 0.6 });
    }
    // the market's round stone plaza (walk onto it with crates to sell them)
    const plazaTex = texFrom(cv(1024, (x, N) => {
        const c = N / 2;
        for (let r = 16; r >= 0; r--) {
            x.beginPath(); x.arc(c, c, c * (r + 1) / 17, 0, Math.PI * 2);
            x.fillStyle = r % 2 ? '#efe4d2' : '#e2d2bc'; x.fill();
        }
        x.strokeStyle = 'rgba(150,120,90,0.35)'; x.lineWidth = 3;
        for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2; x.beginPath(); x.moveTo(c + Math.cos(a) * c * 0.55, c + Math.sin(a) * c * 0.55); x.lineTo(c + Math.cos(a) * c, c + Math.sin(a) * c); x.stroke(); }
        for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; x.fillStyle = k % 2 ? '#7dc8ff' : '#ffb84a'; x.beginPath(); x.arc(c + Math.cos(a) * c * 0.78, c + Math.sin(a) * c * 0.78, 18, 0, Math.PI * 2); x.fill(); }
        x.lineWidth = 14; x.strokeStyle = '#a8583a'; x.beginPath(); x.arc(c, c, c - 8, 0, Math.PI * 2); x.stroke();
    }));
    const PR = CFG.sellReach + 2;
    const pm = new T.Mesh(new T.CircleGeometry(PR, 72).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ map: plazaTex }));
    pm.position.y = 0.16; pm.receiveShadow = true; worldRoot.add(pm);
    // the promenade: a brick ring linking the stalls
    const ringMat = studMaterial(0xa8583a, { rx: 8, ry: 8 });
    const prom = new T.Mesh(new T.RingGeometry(58, 64, 96, 1).rotateX(-Math.PI / 2), ringMat);
    prom.position.y = 0.1; prom.receiveShadow = true; worldRoot.add(prom);
    for (const r of [57.6, 64.4]) { const k = new T.Mesh(new T.TorusGeometry(r, 0.35, 5, 96).rotateX(Math.PI / 2), mat(0x7a3a24)); k.position.y = 0.2; worldRoot.add(k); }
    // brick paths from each greenhouse door to the market plaza, lamps along them
    for (let i = 0; i < PLOTS; i++) {
        const d = toWorld(i, 0, PLOT_D / 2 + 1), L = Math.hypot(d.x, d.z), ux = d.x / L, uz = d.z / L, r0 = PR - 1, len2 = L - r0, a = Math.atan2(ux, uz);
        const cx = ux * (r0 + len2 / 2), cz = uz * (r0 + len2 / 2);
        stud(cx, 0.12, cz, 12, 0.18, len2, 0xb8644a, { ry: a });
        for (const sx of [-1, 1]) KP.box(cx + uz * 6.4 * sx, 0.24, cz - ux * 6.4 * sx, 0.8, 0.45, len2, 0x7a3a24, { ry: a });
        for (let k = 0; k < 3; k++) {
            const t = r0 + 14 + k * 26, sx = k % 2 ? 1 : -1;
            if (t > 92) continue;
            lamp(ux * t + uz * 8.4 * sx, uz * t - ux * 8.4 * sx, (i + k) % 3);
        }
    }
    // flower beds between the market and the promenade, on the axes
    for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2;
        flowerBed(Math.sin(a) * 46, Math.cos(a) * 46, 5.5, k, a);
    }
}
function flowerBed(cx, cz, r, seed, ry) {
    const rr = rng(seed * 31 + 7), F = framed(inFrame(cx, cz, ry || 0), ry || 0);
    F.box(0, 0.2, 0, r * 2 + 1.2, 0.4, r * 1.4 + 1.2, 0xffffff);
    F.stud(0, 0.36, 0, r * 2 - 0.4, 0.4, r * 1.4 - 0.4, 0x6a3e1e);
    for (let i = 0; i < 22; i++) {
        const x = (rr() - 0.5) * (r * 2 - 1.2), z = (rr() - 0.5) * (r * 1.4 - 1.2), h = 0.7 + rr() * 1.1, c = FLOWER_COLS[(rr() * FLOWER_COLS.length) | 0];
        F.box(x, 0.56 + h / 2, z, 0.2, h, 0.2, 0x3a9a2a);
        F.box(x + 0.3, 0.56 + h * 0.5, z, 0.5, 0.12, 0.3, 0x5ac83a);
        F.box(x, 0.66 + h, z, 0.6, 0.42, 0.6, c);
        F.box(x, 0.92 + h, z, 0.24, 0.12, 0.24, 0xffe85a);
    }
}
// a garden lamp: dark post, a glowing lantern, a little hanging flower basket on some
function lamp(x, z, style) {
    KP.box(x, 0.4, z, 1.5, 0.8, 1.5, 0x3a3a4a);
    KP.box(x, 5.2, z, 0.55, 10, 0.55, 0x2a2a3a);
    KP.box(x, 10.4, z, 1.9, 0.35, 1.9, 0x2a2a3a);
    KG.box(x, 9.5, z, 1.3, 1.5, 1.3, style === 1 ? 0xffe0b0 : 0xfff4c8);
    KP.box(x, 8.6, z, 1.6, 0.3, 1.6, 0x2a2a3a);
    if (style === 2) { KP.box(x + 1.4, 7.4, z, 1.2, 0.9, 1.2, 0x8a5a2a); KP.box(x + 1.4, 8, z, 1.4, 0.6, 1.4, FLOWER_COLS[(x * 7 + z) & 3 & 7] || 0xff5a8a); }
    solidBox(x, 5, z, 1, 10, 1, { mat: 'metal' });
}
// a fountain: a stone basin, a tiered column with water pouring off it
function fountain(x, z, r) {
    for (let k = 0; k < 20; k++) {
        const a = (k + 0.5) / 20 * Math.PI * 2, l = 2 * Math.PI * r / 20 + 0.3;
        KP.box(x + Math.sin(a) * r, 0.9, z + Math.cos(a) * r, l, 1.8, 1.4, k % 2 ? 0xe8e0f0 : 0xd8cce8, { ry: a + Math.PI / 2 });
        KP.box(x + Math.sin(a) * r, 1.9, z + Math.cos(a) * r, l + 0.1, 0.3, 1.8, 0xffffff, { ry: a + Math.PI / 2 });
    }
    pool(x, z, r - 0.5, 1.2);
    KP.box(x, 2.5, z, 1.6, 5, 1.6, 0xe8e0f0);
    KP.box(x, 4.9, z, 4.4, 0.6, 4.4, 0xffffff);
    pool(x, z, 2, 5.25);
    KP.box(x, 6.5, z, 1, 2.6, 1, 0xe8e0f0);
    KP.box(x, 7.9, z, 2, 0.4, 2, 0xffffff);
    KG.box(x, 8.4, z, 0.7, 0.6, 0.7, 0x9ae8ff);
    jet(x, z, 2.3, 2.1, 1.3, 4.9);
    jet(x, z, 0.6, 0.9, 7.9, 9.4);
    for (let a = 0; a < 360; a += 30) solidBox(x + Math.sin(a * Math.PI / 180) * r, 1, z + Math.cos(a * Math.PI / 180) * r, 2.2, 2, 2.2, { mat: 'tile' });
    solidBox(x, 2.5, z, 4, 5, 4, { mat: 'tile' });
}

// =====================================================================================
// The MARKET: the Seed Shop and the SELL counter, all round
// =====================================================================================
let marketSpin = null, packets = null, sellRingMat = null;
const keepers = [];
// a shop keeper (the reference's yellow noobs): baked into one mesh, swaying as a whole (one draw)
function noob(shirt) {
    const r = buildRig({ shirt, shorts: 0x2a8a3a, socks: 0x2a8a3a, skin: 0xffd21e, hair: 0x3a2618 });
    r.userData.arms[0].rotation.set(-0.35, 0, 0.12); r.userData.arms[1].rotation.set(-0.35, 0, -0.12);
    bakeVC(r, vcMat);
    const g = new T.Group(); g.add(r);
    return g;
}
function buildMarket() {
    // the counter: a ring of pink bricks with a wooden top (the reference's stall bricks), produce on it
    const N = 36, mid = (MARKET_R + COUNTER_R) / 2;
    for (let i = 0; i < N; i++) {
        const a = (i + 0.5) / N * Math.PI * 2, l = 2 * Math.PI * COUNTER_R / N + 0.2;
        stud(Math.sin(a) * mid, 1.8, Math.cos(a) * mid, l, 3.6, COUNTER_R - MARKET_R, 0xc8806a, { ry: a + Math.PI / 2 });
        KP.box(Math.sin(a) * (mid + 0.2), 3.8, Math.cos(a) * (mid + 0.2), l + 0.1, 0.45, COUNTER_R - MARKET_R + 1, 0xe0a868, { ry: a + Math.PI / 2 });
        const cx = Math.sin(a) * mid, cz = Math.cos(a) * mid;
        if (i % 3 === 1) {
            KP.box(cx, 4.6, cz, 2.6, 1.3, 1.8, 0xb8783a, { ry: a });
            const fc = [0xe8283a, 0xff8a1a, 0x5ad83a, 0xffd21e, 0x8a3ad8, 0xff3a2a, 0x3a5aff, 0xff7ab8, 0x46c83a, 0xffb81c, 0x9a1a4a, 0xffe03a][(i / 3) | 0];
            for (let k = 0; k < 6; k++) KP.box(cx + (k % 3 - 1) * 0.7 * Math.cos(a), 5.45, cz - (k % 3 - 1) * 0.7 * Math.sin(a) + ((k / 3 | 0) - 0.5) * 0.6, 0.6, 0.6, 0.6, fc, { ry: a });
        } else if (i % 3 === 2) {
            KP.box(cx, 5.3, cz, 1.7, 2.6, 0.5, 0xd8b888, { ry: a + Math.PI / 2 });
            KP.box(cx, 5.7, cz, 1.1, 0.9, 0.52, FLOWER_COLS[i % FLOWER_COLS.length], { ry: a + Math.PI / 2 });
        }
    }
    for (let a = 0; a < 360; a += 2.5) solidBox(Math.sin(a * Math.PI / 180) * (COUNTER_R - 2), 2, Math.cos(a * Math.PI / 180) * (COUNTER_R - 2), 3.6, 4, 3.6, { mat: 'wood' });
    // the posts (white with gold caps and lanterns)
    for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2, x = Math.sin(a) * (COUNTER_R - 1.8), z = Math.cos(a) * (COUNTER_R - 1.8);
        KP.box(x, 9.6, z, 1.1, 11.6, 1.1, 0xffffff);
        KP.box(x, 15.4, z, 1.5, 0.6, 1.5, 0xffc21e);
        KG.box(x + Math.sin(a) * 0.9, 12.6, z + Math.cos(a) * 0.9, 0.9, 1.1, 0.9, 0xfff0b8);
    }
    // the grand canopy: a wide striped skirt, then a tall striped cone, a gold finial; bunting round its edge
    const CR = COUNTER_R + 7;
    const canopy = new T.Mesh(mergeGeometries([stripedCone(CR, 15.2, 12.5, 19.6, 24), stripedCone(13.5, 19.8, 1.6, 30.2, 24)]), vcDouble);
    canopy.castShadow = true; canopy.receiveShadow = true;
    worldRoot.add(canopy);
    for (let k = 0; k < 48; k++) {
        const a = (k + 0.5) / 48 * Math.PI * 2;
        // scalloped valance and pennants hanging below it
        KP.box(Math.sin(a) * CR, 14.5, Math.cos(a) * CR, 2 * Math.PI * CR / 48 + 0.05, 1.4, 0.3, k % 2 ? 0x2a8aff : 0xffffff, { ry: a + Math.PI / 2 });
        KP.box(Math.sin(a) * (CR + 0.1), 13.2, Math.cos(a) * (CR + 0.1), 1.6, 1.6, 0.12, FLOWER_COLS[k % FLOWER_COLS.length], { ry: a + Math.PI / 2, rz: Math.PI / 4 });
    }
    KP.box(0, 30.8, 0, 1.4, 2, 1.4, 0xffc21e);
    KG.box(0, 32.4, 0, 2, 2, 2, 0xffe24a, { ry: Math.PI / 4, rx: Math.PI / 4 });
    // the SEED SHOP / SELL band round the canopy, turning slowly
    const bandTex = sharedTex('marketBand', () => cv(2048, (x, W, H) => {
        x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
        const words = [['🌱 SEED SHOP', '#2ac83a'], ['💰 SELL', '#ffb81c'], ['🌱 SEED SHOP', '#2ac83a'], ['💰 SELL', '#ffb81c']];
        words.forEach(([t, c], i) => {
            const cx = (i + 0.5) * W / 4;
            x.textAlign = 'center'; x.textBaseline = 'middle';
            const px = fitFont(x, t, W / 4 - 40, 110, 900, 'Fredoka, sans-serif', 0.2);
            x.lineJoin = 'round'; x.lineWidth = px * 0.2; x.strokeStyle = '#10203a'; x.strokeText(t, cx, H / 2 + 6);
            x.fillStyle = c; x.fillText(t, cx, H / 2 + 6);
        });
        x.fillStyle = '#2a8aff'; x.fillRect(0, 0, W, 14); x.fillRect(0, H - 14, W, 14);
    }, 160));
    const band = new T.Mesh(new T.CylinderGeometry(14.2, 14.2, 4.6, 64, 1, true), new T.MeshBasicMaterial({ map: bandTex, side: T.DoubleSide }));
    band.position.y = 22.4;
    worldRoot.add(band); movers.push(band);
    tickers.push((dt, t) => { band.rotation.y = -t * 0.15; });
    // the lazy-susan floor inside, with the two keepers and the seed sacks: it turns slowly so a
    // keeper always faces you
    marketSpin = new T.Group();
    const fl = new T.Mesh(new T.CylinderGeometry(MARKET_R - 0.2, MARKET_R - 0.2, 0.6, 48), mat(0xf4e8d8));
    fl.position.y = 0.6; fl.receiveShadow = true; marketSpin.add(fl);
    const fr = new T.Mesh(new T.TorusGeometry(MARKET_R - 0.4, 0.25, 6, 48).rotateX(Math.PI / 2), mat(0x2a8aff));
    fr.position.y = 0.95; marketSpin.add(fr);
    bakeVC(marketSpin, vcMat);
    for (const [shirt, ang] of [[0x2a8aff, 0], [0x46c83a, Math.PI]]) {
        const k = noob(shirt);
        k.position.set(Math.sin(ang) * 10, 0.9, Math.cos(ang) * 10); k.rotation.y = ang;
        k.scale.setScalar(1.4);
        marketSpin.add(k);
        keepers.push(k);
    }
    const sackK = new Kit();
    for (let k = 0; k < 7; k++) {
        const a = k / 7 * Math.PI * 2, x = Math.sin(a) * 3.6, z = Math.cos(a) * 3.6;
        sackK.box(x, 2.4, z, 2.8, 3.6, 2.8, 0xd8b888, { ry: a });
        sackK.box(x, 4.4, z, 2, 0.7, 2, 0xc8a070, { ry: a });
        sackK.box(x + Math.sin(a) * 1.42, 2.6, z + Math.cos(a) * 1.42, 1.5, 1.5, 0.05, [0xe8283a, 0xff7a1a, 0x5ad83a, 0xb83a8a, 0xffd21e, 0x3a5aff, 0xff3a2a][k], { ry: a });
    }
    sackK.box(0, 5, 0, 2.2, 9, 2.2, 0xb8783a);
    sackK.box(0, 9.8, 0, 4.5, 0.6, 4.5, 0xe0a868);
    const sacks = new T.Mesh(sackK.geometry(), vcMat); sacks.castShadow = sacks.receiveShadow = true;
    marketSpin.add(sacks);
    worldRoot.add(marketSpin); movers.push(marketSpin);
    tickers.push((dt, t) => {
        marketSpin.rotation.y = t * 0.12;
        for (let i = 0; i < keepers.length; i++) { const k = keepers[i].children[0]; k.rotation.z = Math.sin(t * 1.6 + i) * 0.04; k.position.y = Math.abs(Math.sin(t * 1.6 + i)) * 0.12; }
    });
    // seed packets drifting round above the canopy
    packets = new T.Group();
    const pk = new Kit();
    SPECIES_ICONS.forEach((c, i) => {
        const a = i / SPECIES_ICONS.length * Math.PI * 2, x = Math.sin(a) * 12, z = Math.cos(a) * 12, y = (i % 2) * 1.8;
        pk.box(x, y, z, 2.6, 3.5, 0.3, 0xf4e8c8, { ry: a });
        pk.box(x, y + 0.2, z, 1.9, 1.8, 0.32, c, { ry: a });
        pk.box(x, y + 1.6, z, 2.6, 0.35, 0.32, 0xd8483a, { ry: a });
    });
    packets.add(new T.Mesh(pk.geometry(), vcMat));
    packets.position.y = 37;
    worldRoot.add(packets); movers.push(packets);
    tickers.push((dt, t) => { packets.rotation.y = t * 0.3; packets.position.y = 37 + Math.sin(t * 1.3) * 0.7; });
    // the SELL ring at the plaza's edge: glows when you're carrying crates
    sellRingMat = new T.ShaderMaterial({
        transparent: true, depthWrite: false, side: T.DoubleSide, forceSinglePass: true,
        uniforms: { uNow: PU.uNow, uOn: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uNow; uniform float uOn; varying vec2 vUv;
            void main(){
                float a = atan(vUv.y - 0.5, vUv.x - 0.5);
                float d = length(vUv - 0.5) * 2.0;
                float band = smoothstep(0.9, 0.93, d) * (1.0 - smoothstep(0.97, 1.0, d));
                float dash = step(0.5, fract(a * 16.0 / 6.2831 + uNow * 0.4));
                float al = band * (0.55 + 0.45 * dash) * uOn * (0.75 + 0.25 * sin(uNow * 5.0));
                gl_FragColor = vec4(vec3(0.5, 1.0, 0.45) * 1.2, al);
            }`,
    });
    const sellRing = new T.Mesh(new T.PlaneGeometry(CFG.sellReach * 2, CFG.sellReach * 2).rotateX(-Math.PI / 2), sellRingMat);
    sellRing.position.y = 0.4; sellRing.renderOrder = 3;
    worldRoot.add(sellRing);
    prompts.push({
        pos: new V3(0, 2, 0), r: COUNTER_R + 10,
        label: () => (S.carry > 0 ? 'Sell crates' : 'Seed Shop'),
        act: () => (S.carry > 0 ? actions.sell && actions.sell() : actions.openSeeds && actions.openSeeds()),
    });
}
// a striped cone (a tent roof): radius r0 at height y0 up to r1 at y1, blue and white segments
function stripedCone(r0, y0, r1, y1, segs) {
    const g = new T.CylinderGeometry(r1, r0, y1 - y0, segs, 1, true).toNonIndexed().translate(0, (y0 + y1) / 2, 0);
    const n = g.attributes.position.count, col = new Float32Array(n * 3), a = new T.Color(0x2a8aff), b = new T.Color(0xffffff);
    for (let i = 0; i < n; i++) { const c = ((i / 6) | 0) % 2 ? a : b; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    return g;
}
const SPECIES_ICONS = [0xe8283a, 0xb83a8a, 0xff7a1a, 0x8ae86a, 0xc8964a, 0x2a8a2a, 0xffc21e, 0xff3a2a, 0x9a1a4a, 0x3a5aff];
export function sellRingOn(on) { if (sellRingMat) sellRingMat.uniforms.uOn.value += ((on ? 1 : 0) - sellRingMat.uniforms.uOn.value) * 0.15; }

// =====================================================================================
// Stalls (front = local +z, toward the market)
// =====================================================================================
const signs = [];
export function sign(text, color, stroke, x, y, z, w, face, parent) {
    const map = sharedTex('sign|' + text + color, () => textCanvas([{ t: text, c: color, s: stroke, px: 96, w: 700 }], 1024));
    const h = w * map.image.height / map.image.width;
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, side: T.DoubleSide, forceSinglePass: true }));
    m.position.set(x, y, z);
    m.rotation.y = face || 0;
    m.renderOrder = 3;
    (parent || worldRoot).add(m);
    signs.push(m);
    return m;
}
function prompt(spot, label, act, r) { prompts.push({ pos: new V3(spot.x, 2, spot.z), r: r || 13, label: typeof label === 'function' ? label : () => label, act }); }
// a market stall on its own little stone yard: brick counter with a wooden top, a back wall with
// shelves of goods, white posts with lanterns, a striped awning with a scalloped edge, potted plants
function stall(spot, a, b, w, goods) {
    const F = framed(inFrame(spot.x, spot.z, spot.ry), spot.ry), D = 12;
    F.stud(0, 0.2, 0, w + 8, 0.4, D + 6, 0xe2dccf);
    F.box(0, 0.25, 0, w + 8.6, 0.3, D + 6.6, 0xc8bca8);
    F.stud(0, 1.7, 3, w, 3.4, 2.6, 0xc8806a);
    F.box(0, 3.55, 3.2, w + 0.5, 0.4, 3.1, 0xe0a868);
    F.stud(0, 5.6, -5, w + 1, 11.2, 1, 0xd8907a);
    // shelves on the back wall, goods on them
    for (const y of [4.4, 7.4]) {
        F.box(0, y, -4.1, w - 1, 0.35, 1.4, 0xb8783a);
        for (let k = 0; k < Math.floor(w / 2.2); k++) {
            const x = -w / 2 + 1.6 + k * 2.2, c = (goods || FLOWER_COLS)[(k + (y > 5 ? 3 : 0)) % (goods || FLOWER_COLS).length];
            F.box(x, y + 0.75, -4.1, 1.3, 1.1, 1, c);
        }
    }
    for (const sx of [-1, 1]) {
        F.box(sx * (w / 2 + 0.4), 6, 5, 0.8, 12, 0.8, 0xffffff);
        F.box(sx * (w / 2 + 0.4), 12.1, 5, 1.2, 0.5, 1.2, 0xffc21e);
        F.glow(sx * (w / 2 + 0.4), 9.2, 5.8, 0.8, 1, 0.8, 0xfff0b8);
        F.box(sx * (w / 2 + 0.4), 5.6, -5, 0.8, 11.2, 0.8, 0xffffff);
        // potted plants by the counter
        F.box(sx * (w / 2 + 2.6), 0.9, 6, 1.8, 1.8, 1.8, 0xc8643a);
        F.box(sx * (w / 2 + 2.6), 2.4, 6, 2.2, 1.6, 2.2, 0x46c83a);
        F.box(sx * (w / 2 + 2.6), 3.4, 6, 0.7, 0.6, 0.7, FLOWER_COLS[(w + sx) & 3]);
    }
    const n = Math.round((w + 2) / 2.4);
    for (let k = 0; k < n; k++) {
        const x = -w / 2 - 1 + (k + 0.5) * (w + 2) / n, c = k % 2 ? a : b;
        F.box(x, 12.4, 0, (w + 2) / n + 0.02, 0.5, 11.8, c, { rx: 0.16 });
        F.box(x, 10.95, 5.95, (w + 2) / n + 0.02, 1.5, 0.3, c);
    }
    solidLine(F.at, -w / 2, 3, w / 2, 3, 2.8, 4);
    solidLine(F.at, -w / 2 - 0.5, -5, w / 2 + 0.5, -5, 1.4, 11);
    solidLine(F.at, -w / 2, -4.5, -w / 2, 3, 1.4, 6);
    solidLine(F.at, w / 2, -4.5, w / 2, 3, 1.4, 6);
    return F;
}
function buildEggShop() {
    const s = SPOTS.pets;
    const F = stall(s, 0xff7ab8, 0xffffff, 24, [0xa8e87a, 0xffd86a, 0x9ad8ff, 0x5ac85a, 0x8a5aff]);
    const k = noob(0xff7ab8);
    const [kx, kz] = F.at(0, -1);
    k.position.set(kx, 0, kz); k.rotation.y = s.ry; k.scale.setScalar(1.3);
    worldRoot.add(k); keepers.push(k); movers.push(k);
    // the eggs on their pedestals in front of the stall, bobbing and turning
    const eggs = [];
    EGGS.forEach((e, i) => {
        const [px, pz] = F.at((i - 2) * 6.4, 10.5);
        KP.box(px, 1.2, pz, 3.8, 2.4, 3.8, 0xffffff);
        KG.box(px, 2.45, pz, 4, 0.15, 4, e.color);
        const g = new T.Group();
        const body = new T.Mesh(new T.SphereGeometry(1.8, 18, 14), mat(e.color));
        body.scale.set(1, 1.3, 1); body.castShadow = true; g.add(body);
        const spots = new T.Mesh(new T.SphereGeometry(1.82, 10, 8, 0, Math.PI * 2, 0.6, 0.5), mat(0xffffff));
        spots.scale.set(1, 1.3, 1); g.add(spots);
        bakeVC(g, vcMat);
        g.position.set(px, 5, pz);
        worldRoot.add(g); movers.push(g);
        eggs.push(g);
        solidBox(px, 1.2, pz, 3.8, 2.4, 3.8, { mat: 'wood' });
    });
    tickers.push((dt, t) => { eggs.forEach((g, i) => { g.rotation.y = t * 0.8 + i; g.position.y = 5 + Math.sin(t * 2 + i) * 0.35; }); });
    sign('🥚 EGGS & PETS', '#ffffff', '#c8287a', s.x, 16.8, s.z, 18, s.ry);
    prompt(s, 'Eggs & Pets', () => actions.openPets && actions.openPets('eggs'), 19);
}
function buildGemShop() {
    const s = SPOTS.gems;
    const F = stall(s, 0xa84aff, 0xffffff, 22, [0xc47aff, 0x5ad0ff, 0xff7ad8, 0x9a5aff]);
    const k = noob(0xa84aff);
    const [kx, kz] = F.at(0, -1);
    k.position.set(kx, 0, kz); k.rotation.y = s.ry; k.scale.setScalar(1.3);
    worldRoot.add(k); keepers.push(k); movers.push(k);
    const gem = new T.Mesh(new T.OctahedronGeometry(3.2, 0), new T.MeshLambertMaterial({ color: 0x9a5aff, emissive: 0x6a2ad8, emissiveIntensity: 0.55, flatShading: true }));
    const [gx, gz] = F.at(0, 13);
    gem.position.set(gx, 9, gz); gem.scale.y = 1.4; gem.castShadow = true;
    worldRoot.add(gem); movers.push(gem);
    KP.box(gx, 1.4, gz, 3.6, 2.8, 3.6, 0xffffff);
    KG.box(gx, 2.85, gz, 3.8, 0.15, 3.8, 0xc47aff);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; KG.box(gx + Math.sin(a) * 4.5, 0.5, gz + Math.cos(a) * 4.5, 0.9, 0.9, 0.9, [0xc47aff, 0x5ad0ff, 0xff7ad8][i % 3], { ry: a, rx: 0.6 }); }
    solidBox(gx, 1.4, gz, 3.6, 2.8, 3.6, { mat: 'wood' });
    tickers.push((dt, t) => { gem.rotation.y = t; gem.position.y = 9 + Math.sin(t * 1.7) * 0.7; });
    sign('💎 GEM SHOP', '#ffffff', '#6a1aa8', s.x, 16.8, s.z, 15, s.ry);
    prompt(s, 'Gem Shop', () => actions.openShop && actions.openShop(), 19);
}
// ----- the Beanstalk Wheel -----
let wheel = null, wheelSpin = 0, wheelTarget = null;
const wheelTex = () => sharedTex('wheel', () => cv(512, (x, N) => {
    const c = N / 2, n = WHEEL.length;
    for (let i = 0; i < n; i++) {
        x.beginPath(); x.moveTo(c, c); x.arc(c, c, c - 4, (i / n) * Math.PI * 2 - Math.PI / 2, ((i + 1) / n) * Math.PI * 2 - Math.PI / 2); x.closePath();
        x.fillStyle = WHEEL[i].color; x.fill(); x.strokeStyle = '#ffffff'; x.lineWidth = 6; x.stroke();
        const a = (i + 0.5) / n * Math.PI * 2 - Math.PI / 2;
        x.save(); x.translate(c + Math.cos(a) * c * 0.62, c + Math.sin(a) * c * 0.62); x.rotate(a + Math.PI / 2);
        x.font = '64px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        const w = WHEEL[i];
        x.fillText(w.cash ? '💵' : w.gems ? '💎' : w.seed ? speciesById[w.seed].ic : w.egg ? '🥚' : '⏩', 0, 0);
        x.restore();
    }
    x.beginPath(); x.arc(c, c, 46, 0, Math.PI * 2); x.fillStyle = '#ffffff'; x.fill(); x.lineWidth = 8; x.strokeStyle = '#ffd21e'; x.stroke();
    x.font = '56px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('🌱', c, c + 2);
    x.beginPath(); x.arc(c, c, c - 4, 0, Math.PI * 2); x.lineWidth = 10; x.strokeStyle = '#ffd21e'; x.stroke();
}));
function buildWheel() {
    const s = SPOTS.wheel, ry = s.ry, F = framed(inFrame(s.x, s.z, ry), ry);
    F.stud(0, 0.5, 0, 22, 1, 12, 0xe2dccf);
    F.box(0, 1.15, 0, 18, 0.3, 8, 0xffd21e);
    for (const sx of [-1, 1]) F.box(sx * 4.6, 9, -1, 1.4, 17, 1.4, 0xffd21e, { rz: sx * 0.22 });
    F.box(0, 17, -1, 3, 1.6, 2, 0xffd21e);
    // carnival bulbs on a ring behind the wheel
    for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; F.glow(Math.cos(a) * 11, 17 + Math.sin(a) * 11, -1.6, 0.7, 0.7, 0.5, k % 2 ? 0xfff0a8 : 0xff8ad8); }
    for (const sx of [-1, 1]) { F.box(sx * 9, 1.6, 4.5, 1.2, 1.2, 1.2, 0xffffff); F.box(sx * 9, 3.2, 4.5, 0.3, 2.4, 0.3, 0xffffff); F.glow(sx * 9, 4.6, 4.5, 0.8, 0.8, 0.8, 0xffd21e); }
    wheel = new T.Mesh(new T.CylinderGeometry(10, 10, 1, 64).rotateX(Math.PI / 2), [new T.MeshLambertMaterial({ color: 0xffd21e }), new T.MeshBasicMaterial({ map: wheelTex() }), new T.MeshBasicMaterial({ map: wheelTex() })]);
    const [wx, wz] = F.at(0, 0.2);
    wheel.position.set(wx, 17, wz); wheel.rotation.y = ry; wheel.castShadow = true;
    worldRoot.add(wheel); movers.push(wheel);
    const [px, pz] = F.at(0, 0.9);
    const ptr = new T.Mesh(new T.ConeGeometry(1.2, 2.6, 4), mat(0xe8283a));
    ptr.position.set(px, 28, pz); ptr.rotation.z = Math.PI; ptr.castShadow = true; worldRoot.add(ptr);
    solidLine(F.at, -7, -1, 7, -1, 4, 2);
    sign('🎡 BEANSTALK WHEEL', '#ffffff', '#b8641a', s.x, 32, s.z, 19, ry);
    prompt(s, 'Spin the Wheel', () => actions.openWheel && actions.openWheel(), 16);
    tickers.push((dt) => {
        if (wheelTarget !== null) { wheelSpin += (wheelTarget - wheelSpin) * Math.min(1, dt * 1.6); if (Math.abs(wheelTarget - wheelSpin) < 0.002) wheelTarget = null; }
        else wheelSpin += dt * 0.25;
        wheel.rotation.set(0, ry, 0); wheel.rotateZ(wheelSpin);
    });
}
// the wheel in the world spins to the prize too
export function spinWorldWheel(k) {
    const n = WHEEL.length, seg = Math.PI * 2 / n;
    const want = -(k + 0.5) * seg;
    wheelTarget = wheelSpin + Math.PI * 8 + ((want - wheelSpin) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
}
// ----- Best Players: the trophy on a red carpet, the leaderboards behind it -----
const BOARDS = [
    { key: 'floors', title: '🏢 TALLEST GARDENS', color: '#ffd84a', fmt: (v) => v + ' floor' + (v > 1 ? 's' : '') },
    { key: 'cash', title: '💰 MOST CASH EARNED', color: '#7dff6b', fmt: (v) => '$' + fmt(v) },
    { key: 'time', title: '⏱️ TIME PLAYED', color: '#5ad8ff', fmt: (v) => playtimeText(v) },
];
const boardTex = [];
function buildBest() {
    const s = SPOTS.boards, ry = s.ry, F = framed(inFrame(s.x, s.z, ry), ry);
    F.stud(0, 0.15, 2, 40, 0.3, 22, 0xe2dccf);
    F.box(0, 0.35, 8, 6, 0.1, 14, 0xd8283a);
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) { F.box(sx * 4.2, 1.2, 2 + k * 4, 0.5, 2.4, 0.5, 0xffc21e); F.box(sx * 4.2, 2.5, 2 + k * 4, 0.8, 0.4, 0.8, 0xffe24a); }
    for (const sx of [-1, 1]) F.box(sx * 4.2, 2, 8, 0.15, 0.15, 12, 0xc8283a);
    BOARDS.forEach((b, i) => {
        const [x, z] = F.at((i - 1) * 13.5, -6 + Math.abs(i - 1) * 3), r2 = ry - (i - 1) * 0.28;
        const grp = new T.Group(); grp.position.set(x, 0, z); grp.rotation.y = r2;
        const P = (geo, m, px, py, pz) => { const o = new T.Mesh(geo, m); o.position.set(px, py, pz); o.castShadow = o.receiveShadow = true; grp.add(o); return o; };
        P(rbox(12.4, 15.6, 1.2, 0.4), mat(0x2a6ae8), 0, 16, 0);
        P(rbox(13, 1.2, 1.6, 0.3), mat(0xffc21e), 0, 24.2, 0);
        for (const sx of [-4.2, 4.2]) P(new T.CylinderGeometry(0.6, 0.7, 8.2, 12), mat(0xf6f9fe), sx, 4.1, 0);
        bakeVC(grp, vcMat);
        const c = cv(512, () => {}, 640), tex = texFrom(c);
        boardTex.push({ c, tex, b });
        const face = new T.Mesh(new T.PlaneGeometry(11.4, 14.25), new T.MeshBasicMaterial({ map: tex }));
        face.position.set(0, 16, 0.62); grp.add(face);
        worldRoot.add(grp);
        solidBox(x, 4, z, 4, 8, 4, { mat: 'metal' });
        drawBoard(boardTex[boardTex.length - 1], lastBoards[b.key] || []);
    });
    // the golden trophy (the reference's BEST PLAYERS cup) on its pedestal
    const [tx, tz] = F.at(0, 4);
    const t = new T.Group(); t.position.set(tx, 0, tz);
    const gold = new T.MeshLambertMaterial({ color: 0xffc21e, emissive: 0x8a5a00, emissiveIntensity: 0.25 });
    const P = (geo, m, y) => { const o = new T.Mesh(geo, m); o.position.y = y; o.castShadow = true; t.add(o); return o; };
    P(new T.CylinderGeometry(3, 3.5, 2.4, 8), mat(0x3a2a6a), 1.2);
    P(new T.CylinderGeometry(2, 2.4, 1, 16), gold, 2.9);
    P(new T.CylinderGeometry(0.6, 1, 2.8, 12), gold, 4.8);
    P(new T.CylinderGeometry(3, 1.1, 4, 20), gold, 8.2);
    for (const sx of [-1, 1]) { const h = P(new T.TorusGeometry(1.2, 0.34, 8, 16, Math.PI), gold, 8.4); h.position.x = sx * 3; h.rotation.z = sx > 0 ? -Math.PI / 2 : Math.PI / 2; }
    mergeChildren(t);
    worldRoot.add(t);
    solidBox(tx, 1.5, tz, 6, 3, 6, { mat: 'metal' });
    sign('🏆 BEST PLAYERS', '#ffe24a', '#7a4a00', s.x - Math.sin(ry) * 6, 30, s.z - Math.cos(ry) * 6, 20, ry);
}
let lastBoards = {};
function drawBoard(bt, rows) {
    const x = bt.c.getContext('2d'), W = 512, H = 640;
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#163a7a'); g.addColorStop(1, '#0a1a3a');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(0, 0, W, 86);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    fitFont(x, bt.b.title, W - 30, 40, 700, 'Fredoka, sans-serif', 0);
    x.fillStyle = bt.b.color; x.fillText(bt.b.title, W / 2, 46);
    for (let i = 0; i < 10; i++) {
        const y = 118 + i * 51, r = rows[i];
        x.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)';
        x.fillRect(16, y - 23, W - 32, 46);
        x.textAlign = 'left';
        x.font = '700 28px Fredoka, sans-serif';
        x.fillStyle = i === 0 ? '#ffd84a' : i === 1 ? '#d8e4f0' : i === 2 ? '#ffb07a' : '#ffffff';
        x.fillText('#' + (i + 1), 26, y);
        if (r) {
            fitFont(x, r.n, 230, 28, 700, 'Fredoka, sans-serif', 0);
            x.fillStyle = '#ffffff'; x.fillText(r.n, 92, y);
            x.textAlign = 'right'; x.font = '700 26px Fredoka, sans-serif'; x.fillStyle = bt.b.color;
            x.fillText(bt.b.fmt(r.v), W - 28, y);
        }
    }
    bt.tex.needsUpdate = true;
}
let boardKey = '';
export function renderBoards(m) {
    const key = JSON.stringify(m);
    if (key === boardKey) return;
    boardKey = key;
    lastBoards = m;
    for (const bt of boardTex) drawBoard(bt, m[bt.b.key] || []);
}
// ----- the Daily Quests board (your own quests on it) -----
let questTex = null, questCv = null, questKey = '';
function buildQuestBoard() {
    const s = SPOTS.quests, F = framed(inFrame(s.x, s.z, s.ry), s.ry);
    F.stud(0, 0.15, 0, 26, 0.3, 14, 0xe2dccf);
    const [x, z] = F.at(0, -1);
    const grp = new T.Group(); grp.position.set(x, 0, z); grp.rotation.y = s.ry;
    const P = (geo, m, px, py, pz) => { const o = new T.Mesh(geo, m); o.position.set(px, py, pz); o.castShadow = o.receiveShadow = true; grp.add(o); return o; };
    P(rbox(18, 14, 1, 0.4), mat(0x8a5a2a), 0, 11, 0);
    for (const sx of [-7.5, 7.5]) P(new T.BoxGeometry(1.2, 11, 1.2), mat(0x6a4020), sx, 5.5, 0);
    P(rbox(19.5, 1.4, 2.4, 0.3), mat(0x5ad83a), 0, 18.7, 0.2);
    bakeVC(grp, vcMat);
    questCv = cv(640, () => {}, 480);
    questTex = texFrom(questCv);
    const face = new T.Mesh(new T.PlaneGeometry(16.8, 12.6), new T.MeshBasicMaterial({ map: questTex }));
    face.position.set(0, 11, 0.55); grp.add(face);
    worldRoot.add(grp);
    for (const sx of [-1, 1]) { F.box(sx * 11, 1, 3, 3, 2, 3, 0xc8643a); F.box(sx * 11, 2.6, 3, 3.4, 1.8, 3.4, 0x46c83a); for (let k = 0; k < 3; k++) F.box(sx * 11 + (k - 1) * 0.9, 3.7, 3, 0.7, 0.6, 0.7, FLOWER_COLS[k + 2]); }
    solidLine(F.at, -7.5, -1, 7.5, -1, 1.6, 18);
    sign('📋 DAILY QUESTS', '#ffffff', '#2a7a1a', s.x, 22, s.z, 16, s.ry);
    prompt(s, 'Daily Quests', () => actions.openQuests && actions.openQuests(), 15);
    drawQuests();
}
export function drawQuests() {
    if (!questCv) return;
    const dq = S.dq || { p: {}, c: {} }, key = JSON.stringify(dq);
    if (key === questKey) return;
    questKey = key;
    const x = questCv.getContext('2d'), W = 640, H = 480;
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#fff8e8'); g.addColorStop(1, '#f0dcb8');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.textBaseline = 'middle';
    DAILY_QUESTS.forEach((q, i) => {
        const y = 52 + i * 90, done = !!(dq.c || {})[q.id], p = Math.min(q.n, (dq.p || {})[q.id] || 0);
        x.fillStyle = done ? 'rgba(70,236,80,0.25)' : 'rgba(0,0,0,0.06)'; x.fillRect(16, y - 38, W - 32, 78);
        x.textAlign = 'left'; x.fillStyle = '#3a2410';
        fitFont(x, q.text, 400, 34, 700, 'Fredoka, sans-serif', 0);
        x.fillText((done ? '✅ ' : '') + q.text, 30, y - 12);
        x.fillStyle = 'rgba(0,0,0,0.15)'; x.fillRect(30, y + 14, 420, 14);
        x.fillStyle = done ? '#2ac83a' : '#ffb81c'; x.fillRect(30, y + 14, 420 * p / q.n, 14);
        x.textAlign = 'right'; x.font = '700 30px Fredoka, sans-serif'; x.fillStyle = '#7a3ad8';
        x.fillText('💎 ' + q.gems, W - 30, y - 12);
        x.font = '700 24px Fredoka, sans-serif'; x.fillStyle = '#3a2410';
        x.fillText(p + '/' + q.n, W - 30, y + 20);
    });
    questTex.needsUpdate = true;
}
// ----- the big cherry blossom tree (west) with a ring of benches, petals drifting off it -----
export let petalAt = null;
function buildCherry() {
    const s = SPOTS.tree, R2 = rng(99);
    // a round lawn of pink petals and a stone rim
    for (let i = 0; i < 14; i++) { const a = R2() * Math.PI * 2, d = R2() * 12; KP.box(s.x + Math.cos(a) * d, 0.05, s.z + Math.sin(a) * d, 2 + R2() * 2, 0.06, 2 + R2() * 2, 0xffc8e4, { ry: R2() * 3 }); }
    for (let k = 0; k < 24; k++) { const a = (k + 0.5) / 24 * Math.PI * 2; KP.box(s.x + Math.sin(a) * 15, 0.35, s.z + Math.cos(a) * 15, 4.1, 0.7, 1.2, 0xe8e0f0, { ry: a + Math.PI / 2 }); }
    for (let i = 0; i < 6; i++) KP.box(s.x + (i % 2) * 0.5, 2.6 + i * 3.6, s.z, 4, 3.8, 4, i % 2 ? 0x5a3a3a : 0x6a4444);
    for (const [x, z] of [[3.2, 0], [-3.2, 0.5], [0, 3.2], [0.3, -3.2]]) KP.box(s.x + x, 1.2, s.z + z, 2, 2.4, 2, 0x5a3a3a);
    for (const [x, y, z, l, a] of [[4, 18, 0, 8, 0.6], [-4, 19, 1, 8, -0.6], [0, 20, 4, 7, 0.5]]) KP.box(s.x + x, y, s.z + z, l, 1.6, 1.6, 0x5a3a3a, { rz: a, ry: x === 0 ? Math.PI / 2 : 0 });
    const cy = 25;
    for (let i = 0; i < 34; i++) {
        const u = R2() * 2 - 1, a = R2() * Math.PI * 2, rr = Math.sqrt(1 - u * u), d = 7 + R2() * 6, b = 4.5 + R2() * 4;
        KP.box(s.x + Math.cos(a) * rr * d, cy + u * 5.5, s.z + Math.sin(a) * rr * d, b, b * 0.8, b, [0xffa8d8, 0xffc0e4, 0xff8ac8, 0xffd8ec][i % 4]);
    }
    KP.box(s.x, cy, s.z, 11, 8, 11, 0xffb8dc);
    solidBox(s.x, 10, s.z, 4.4, 20, 4.4, { mat: 'wood' });
    // benches round it, facing out
    for (let k = 0; k < 6; k++) {
        const a = k / 6 * Math.PI * 2 + 0.25, bx = s.x + Math.sin(a) * 10, bz = s.z + Math.cos(a) * 10, F = framed(inFrame(bx, bz, a), a);
        F.box(0, 1.4, 0, 5, 0.4, 1.8, 0xb8783a); F.box(0, 2.6, -0.8, 5, 2, 0.3, 0xb8783a);
        for (const lx of [-2, 2]) F.box(lx, 0.7, 0, 0.4, 1.4, 1.6, 0x3a3a3a);
        solidLine(F.at, -2, 0, 2, 0, 1.8, 1.6);
    }
    petalAt = new V3(s.x, cy, s.z);
}
// ----- Halloween: the pumpkin patch (glowing jack-o'-lanterns, hay, a scarecrow, a little fence) -----
function buildSpooky() {
    const s = SPOTS.spooky, R3 = rng(31), F = framed(inFrame(s.x, s.z, s.ry), s.ry);
    F.stud(0, 0.2, 0, 26, 0.4, 20, 0x6a4a2a);
    // a low picket fence round it, open toward the market
    for (let x = -13; x <= 13; x += 2.6) { F.box(x, 1.1, -10, 0.5, 2.2, 0.3, 0xf0e8d8); if (Math.abs(x) > 4) F.box(x, 1.1, 10, 0.5, 2.2, 0.3, 0xf0e8d8); }
    for (let z = -10; z <= 10; z += 2.5) for (const sx of [-13, 13]) F.box(sx, 1.1, z, 0.3, 2.2, 0.5, 0xf0e8d8);
    for (const sx of [-13, 13]) F.box(sx, 1.5, 0, 0.2, 0.25, 20, 0xf0e8d8);
    F.box(0, 1.5, -10, 26, 0.25, 0.2, 0xf0e8d8);
    for (let i = 0; i < 14; i++) {
        const lx = (R3() - 0.5) * 22, lz = (R3() - 0.5) * 16;
        const [x, z] = F.at(lx, lz), b = 1.7 + R3() * 1.6, y = 0.4 + b / 2, a = s.ry + (R3() - 0.5) * 0.8;
        KP.box(x, y, z, b * 1.25, b, b * 1.25, 0xff7a0a, { ry: a });
        for (const o of [-0.4, 0.4]) KP.box(x + Math.sin(a) * o * b, y, z + Math.cos(a) * o * b, b * 0.3, b * 0.96, b * 1.27, 0xe86a0a, { ry: a + Math.PI / 2 });
        KP.box(x, y + b * 0.6, z, 0.3, 0.6, 0.3, 0x4a6a2a);
        const fx = x + Math.sin(a) * b * 0.64, fz = z + Math.cos(a) * b * 0.64;
        for (const o of [-0.3, 0.3]) KG.box(fx + Math.cos(a) * o * b, y + b * 0.15, fz - Math.sin(a) * o * b, b * 0.22, b * 0.22, 0.08, 0xffc83a, { ry: a });
        KG.box(fx, y - b * 0.2, fz, b * 0.6, b * 0.14, 0.08, 0xffc83a, { ry: a });
    }
    for (const [lx, lz] of [[-9, -7], [9, -7], [-9, 6], [9, 6]]) { const [x, z] = F.at(lx, lz); KP.box(x, 1.1, z, 3.8, 2.2, 2.4, 0xe8c85a, { ry: s.ry }); KP.box(x, 1.4, z, 3.9, 0.3, 2.5, 0xc8a83a, { ry: s.ry }); solidBox(x, 1.1, z, 3.8, 2.2, 3.8, { mat: 'wood' }); }
    // orange lantern posts
    for (const sx of [-1, 1]) { F.box(sx * 5, 4, 10, 0.5, 8, 0.5, 0x2a2a3a); F.glow(sx * 5, 7.6, 10, 1.4, 1.4, 1.4, 0xffa83a); }
    // the scarecrow
    const [sx, sz] = F.at(0, -4);
    KP.box(sx, 4, sz, 0.6, 8, 0.6, 0x7a5a2a);
    KP.box(sx, 6.4, sz, 7, 0.5, 0.5, 0x7a5a2a, { ry: s.ry });
    KP.box(sx, 5.7, sz, 2.6, 3, 1.4, 0x8a3ad8, { ry: s.ry });
    KP.box(sx, 8.3, sz, 1.9, 1.9, 1.9, 0xf0d8a0, { ry: s.ry });
    KP.box(sx, 9.6, sz, 3, 0.3, 3, 0x2a2a3a, { ry: s.ry });
    KP.box(sx, 10.6, sz, 1.4, 1.9, 1.4, 0x2a2a3a, { ry: s.ry, rz: 0.15 });
    KG.box(sx + Math.sin(s.ry) * 0.96, 8.5, sz + Math.cos(s.ry) * 0.96, 1.1, 0.3, 0.06, 0xff8a1a, { ry: s.ry });
    solidBox(sx, 4, sz, 1.6, 8, 1.6, { mat: 'wood' });
    sign('🎃 HALLOWEEN PATCH', '#ff9a2a', '#2a0a3a', s.x, 15, s.z, 17, s.ry);
    prompt(s, 'Halloween seeds', () => actions.spookyInfo && actions.spookyInfo(), 9);
}

// =====================================================================================
// The Giant Beanstalk (an event): a flower bed with a sprout and a countdown sign the rest of the time
// =====================================================================================
let beanGroup = null, beanK = 0, beanOn = false, beanSolids = [], beanSignTex = null, beanSignCv = null, beanSignKey = '', beanPod = null;
function buildBeanSpot() {
    const b = BEAN, F = framed(inFrame(b.x, b.z, SPOTS.beanstalk.ry), SPOTS.beanstalk.ry);
    KP.box(b.x, 0.5, b.z, 17, 1, 17, 0x8a5a2a);
    stud(b.x, 1.05, b.z, 15.4, 0.2, 15.4, 0x6a4024);
    for (let i = 0; i < 4; i++) KP.box(b.x + Math.cos(i * 1.7) * 0.6, 1.5 + i * 0.7, b.z + Math.sin(i * 1.7) * 0.6, 0.7, 0.8, 0.7, 0x46c83a);
    KP.box(b.x + 1, 3.6, b.z, 1.6, 0.15, 1, 0x7aef4a);
    KP.box(b.x - 0.8, 4.1, b.z + 0.4, 1.4, 0.15, 1, 0x7aef4a);
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; KP.box(b.x + Math.sin(a) * 6.6, 1.5, b.z + Math.cos(a) * 6.6, 0.7, 0.9, 0.7, FLOWER_COLS[i % FLOWER_COLS.length]); }
    solidBox(b.x, 0.5, b.z, 17, 1, 17, { mat: 'wood' });
    beanSignCv = cv(512, () => {}, 256);
    beanSignTex = texFrom(beanSignCv);
    const [sx, sz] = F.at(0, 10);
    F.box(0, 3.3, 10, 0.7, 6.6, 0.7, 0x7a5a2a);
    const board = new T.Mesh(new T.PlaneGeometry(10, 5), new T.MeshBasicMaterial({ map: beanSignTex, side: T.DoubleSide }));
    board.position.set(sx, 7.4, sz); board.rotation.y = SPOTS.beanstalk.ry; worldRoot.add(board);
    // the beanstalk itself (hidden until the event)
    beanGroup = new T.Group();
    const k = new Kit();
    const H = BEAN_TOP.y;
    for (let i = 0; i * 3 < H; i++) {
        const a = i * 0.5, ox = Math.cos(a) * 0.5, oz = Math.sin(a) * 0.5;
        k.box(b.x + ox, i * 3 + 1.5, b.z + oz, b.stalkR * 2 - (i % 2) * 0.4, 3.1, b.stalkR * 2 - (i % 2) * 0.4, i % 2 ? 0x3ab83a : 0x46d046, { ry: a });
        if (i % 3 === 0) k.box(b.x + ox * 3, i * 3 + 2.6, b.z + oz * 3, 1.2, 0.4, 2.6, 0x5ae84a, { ry: a + 0.8 });
    }
    for (const L of beanLeaves()) {
        k.box(L.x, L.y - 0.5, L.z, b.leaf, 1, b.leaf, 0x5ad83a, { ry: L.a });
        k.box(L.x, L.y - 0.02, L.z, b.leaf - 2, 0.1, 0.5, 0x8aef6a, { ry: L.a });
        k.box(L.x, L.y - 0.02, L.z, 0.5, 0.1, b.leaf - 2, 0x8aef6a, { ry: L.a });
        const mx = (L.x + b.x) / 2, mz = (L.z + b.z) / 2;
        k.box(mx, L.y - 0.8, mz, 0.8, 0.8, b.leafR - b.stalkR, 0x3ab83a, { ry: L.a });
        beanSolids.push({ x: L.x, y: L.y - 0.5, z: L.z, s: b.leaf - 1 });
    }
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; k.box(BEAN_TOP.x + Math.cos(a) * 6, BEAN_TOP.y - 2, BEAN_TOP.z + Math.sin(a) * 6, 7, 3.4, 7, 0xffffff, { ry: a }); }
    k.box(BEAN_TOP.x, BEAN_TOP.y - 2.2, BEAN_TOP.z, 12, 3.6, 12, 0xffffff);
    beanSolids.push({ x: BEAN_TOP.x, y: BEAN_TOP.y - 2.2, z: BEAN_TOP.z, s: 16, h: 3.6 });
    const sm = new T.Mesh(k.geometry(), vcMat); sm.castShadow = sm.receiveShadow = true;
    beanGroup.add(sm);
    beanPod = new T.Group();
    const pod = new T.Mesh(new T.CapsuleGeometry(1.2, 2.4, 6, 12), new T.MeshLambertMaterial({ color: 0xffd21e, emissive: 0xff9a1a, emissiveIntensity: 0.5 }));
    pod.rotation.z = Math.PI / 2; pod.castShadow = true; beanPod.add(pod);
    beanPod.position.set(BEAN_TOP.x, BEAN_TOP.y + 2.6, BEAN_TOP.z);
    beanGroup.add(beanPod);
    beanGroup.visible = false;
    beanGroup.scale.set(1, 0.001, 1);
    worldRoot.add(beanGroup); movers.push(beanGroup);
    tickers.push((dt, t) => {
        const want = beanOn ? 1 : 0;
        if (beanK !== want) {
            beanK = beanOn ? Math.min(1, beanK + dt / 5) : Math.max(0, beanK - dt / 3);
            const e = beanOn ? 1 - Math.pow(1 - beanK, 3) : beanK;
            beanGroup.visible = beanK > 0.001;
            beanGroup.scale.set(1, Math.max(0.001, e), 1);
        }
        if (beanPod.visible) { beanPod.rotation.y = t * 1.5; beanPod.position.y = BEAN_TOP.y + 2.6 + Math.sin(t * 2) * 0.5; }
    });
}
// show / hide the beanstalk (its leaves become solid once it has grown)
export function setBeanstalk(on, claimed) {
    if (beanPod) beanPod.visible = !claimed;
    if (on === beanOn) return;
    beanOn = on;
    for (const o of beanList) { const i = solids.indexOf(o); if (i >= 0) solids.splice(i, 1); }
    beanList.length = 0;
    if (on) for (const L of beanSolids) beanList.push(solidBox(L.x, L.y, L.z, L.s, L.h || 1, L.s, { mat: 'leaf' }));
}
const beanList = [];
export const beanstalkUp = () => beanOn && beanK > 0.95;
// the sign: "GIANT BEANSTALK in 7:12" / "CLIMB NOW! 2:31"
export function drawBeanSign(active, secs, name) {
    if (!beanSignCv) return;
    const key = active + '|' + Math.ceil(secs) + '|' + name;
    if (key === beanSignKey) return;
    beanSignKey = key;
    const x = beanSignCv.getContext('2d'), W = 512, H = 256;
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, active ? '#5ad83a' : '#fff4d8'); g.addColorStop(1, active ? '#2a9a2a' : '#f0d8a8');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#6a4020'; x.lineWidth = 14; x.strokeRect(7, 7, W - 14, H - 14);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = active ? '#ffffff' : '#2a6a1a';
    fitFont(x, '🌱 GIANT BEANSTALK', W - 50, 54, 900, 'Fredoka, sans-serif', 0);
    x.fillText('🌱 GIANT BEANSTALK', W / 2, 80);
    x.fillStyle = active ? '#fff46a' : '#6a4020';
    const line = active ? 'CLIMB IT NOW! ' + clock(secs) : (name || 'Next') + ' in ' + clock(secs);
    fitFont(x, line, W - 50, 46, 700, 'Fredoka, sans-serif', 0);
    x.fillText(line, W / 2, 170);
    beanSignTex.needsUpdate = true;
}

// =====================================================================================
// Round the greenhouses: garden walks between the pairs, ponds in the corners, lamps on the road,
// trees, hills, windmills, balloons
// =====================================================================================
function voxelTree(k, x, z, s, leaf) {
    const th = 4 * s;
    k.box(x, th / 2, z, 1.2 * s, th, 1.2 * s, 0x8a5a2a);
    const cy = th + 1.6 * s;
    k.box(x, cy, z, 4.2 * s, 3.4 * s, 4.2 * s, leaf);
    for (const [dx, dy, dz] of [[1.9, -0.4, 0.3], [-1.8, 0, -0.4], [0.3, 0.5, 1.9], [-0.4, -0.5, -1.9], [0.8, 1.6, -0.6]]) k.box(x + dx * s, cy + dy * s, z + dz * s, 2.4 * s, 2 * s, 2.4 * s, leaf === 0x46c83a ? 0x5ad84a : leaf);
}
function buildScenery() {
    // the garden walk between the two greenhouses of each side: a stone path out to the fields,
    // flower borders, a rose arch, a bench and lamps
    const gap = PLOT_OFF * 2 - PLOT_W;
    for (let side = 0; side < 4; side++) {
        const yaw = [Math.PI, -Math.PI / 2, 0, Math.PI / 2][side], cx = [0, PLOT_R, 0, -PLOT_R][side], cz = [PLOT_R, 0, -PLOT_R, 0][side];
        const F = framed(inFrame(cx, cz, yaw), yaw), L = PLOT_D + 10;
        F.stud(0, 0.1, 0, 6, 0.2, L, 0xd8cfc0);
        for (const sx of [-1, 1]) {
            F.box(sx * (gap / 2 - 2.2), 0.35, 0, 2.6, 0.7, L - 4, 0x6a3e1e);
            for (let k = 0; k < 9; k++) {
                const z = -L / 2 + 4 + k * (L - 8) / 8;
                F.box(sx * (gap / 2 - 2.2), 1.3, z, 1.8, 1.4, 1.8, 0x46c83a);
                F.box(sx * (gap / 2 - 2.2), 2.2, z, 0.8, 0.6, 0.8, FLOWER_COLS[(k + side + (sx > 0 ? 2 : 0)) % FLOWER_COLS.length]);
            }
            const [hx, hz] = F.at(sx * (gap / 2 - 2.2), 0);
            solidBox(hx, 1, hz, side % 2 ? L - 4 : 2.6, 2, side % 2 ? 2.6 : L - 4, { mat: 'wood' });
        }
        // the rose arch where the walk meets the road
        const az = PLOT_D / 2 + 2;
        for (const sx of [-1, 1]) { F.box(sx * 4, 4.5, az, 0.8, 9, 0.8, 0xffffff); for (let k = 0; k < 5; k++) F.box(sx * 4 + (k % 2 ? 0.5 : -0.5), 1.5 + k * 1.7, az + 0.5, 0.9, 0.9, 0.9, k % 2 ? 0xff5a8a : 0x46c83a); }
        for (let k = 0; k < 9; k++) { const a = k / 8 * Math.PI, x = Math.cos(a) * 4, y = 9 + Math.sin(a) * 2.6; F.box(x, y, az, 1.3, 0.9, 1, k % 2 ? 0xff7ab8 : 0x5ad83a); }
        F.box(0, 0.8, -4, 4.4, 0.35, 1.6, 0xb8783a); F.box(0, 1.8, -4.7, 4.4, 1.6, 0.25, 0xb8783a);
        for (const sx of [-1, 1]) { const [lx, lz] = F.at(sx * 7, -PLOT_D / 2 + 2); lamp(lx, lz, 0); }
    }
    // lamps along the ring road's inner kerb
    for (const t of [-12, 12, -66, 66, -88, 88]) for (const [x, z] of [[t, PLAZA_R - 2.6], [t, -PLAZA_R + 2.6], [PLAZA_R - 2.6, t], [-PLAZA_R + 2.6, t]]) lamp(x, z, Math.abs(t) % 3);
    // the four corners behind the road: a pond with lily pads, rocks and reeds, trees round it
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const cx = sx * (ROAD_R + 34), cz = sz * (ROAD_R + 34);
        for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2; KP.box(cx + Math.sin(a) * 15, 0.4, cz + Math.cos(a) * 15, 5.6, 0.8, 2.4, k % 3 ? 0xc8c0d0 : 0xb0a8c0, { ry: a + Math.PI / 2 }); }
        pool(cx, cz, 14.5, 0.3);
        for (let k = 0; k < 7; k++) { const a = k * 2.3, d = 4 + (k % 3) * 3; KP.box(cx + Math.sin(a) * d, 0.42, cz + Math.cos(a) * d, 2.4, 0.08, 2.4, 0x3aa83a, { ry: a }); if (k % 2) KP.box(cx + Math.sin(a) * d + 0.3, 0.7, cz + Math.cos(a) * d, 0.7, 0.5, 0.7, 0xff9ad8); }
        for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + 0.3; KP.box(cx + Math.sin(a) * 16.5, 1.6, cz + Math.cos(a) * 16.5, 0.3, 3.2, 0.3, 0x5a8a3a); }
        for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + sx; const tx = cx + Math.sin(a) * 23, tz = cz + Math.cos(a) * 23; voxelTree(KP, tx, tz, 1.4 + (k % 2) * 0.5, k % 3 ? 0x46c83a : 0xffa8d8); solidBox(tx, 3, tz, 2.4, 6, 2.4, { mat: 'wood' }); }
        for (let a = 0; a < 360; a += 20) solidBox(cx + Math.sin(a * Math.PI / 180) * 15, 1, cz + Math.cos(a * Math.PI / 180) * 15, 3, 2, 3, { mat: 'tile' });
    }
    // the lawn's inner corners (inside the road): a couple of trees, bushes and a bench under them
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const cx = sx * (PLAZA_R - 12), cz = sz * (PLAZA_R - 12);
        for (const [dx, dz, s, c] of [[0, 0, 1.6, 0x46c83a], [-sx * 9, sz * 2, 1.2, 0xffa8d8], [sx * 2, -sz * 9, 1.25, 0x5ad84a]]) {
            voxelTree(KP, cx + dx, cz + dz, s, c); solidBox(cx + dx, 3, cz + dz, 1.4 * s, 6, 1.4 * s, { mat: 'wood' });
        }
        for (let k = 0; k < 7; k++) { const a = k * 0.9, d = 6 + (k % 3) * 2.2; KP.box(cx - sx * Math.abs(Math.cos(a)) * d, 0.9, cz - sz * Math.abs(Math.sin(a)) * d, 2.4, 1.8, 2.4, 0x46c83a); KP.box(cx - sx * Math.abs(Math.cos(a)) * d, 2, cz - sz * Math.abs(Math.sin(a)) * d, 0.7, 0.5, 0.7, FLOWER_COLS[(k + sx + 3) & 7] || 0xffd21e); }
    }
    // trees in clumps out in the fields
    let placed = 0;
    for (let n = 0; placed < 110 && n < 800; n++) {
        const a = R() * Math.PI * 2, d = 205 + R() * 300, x = Math.sin(a) * d, z = Math.cos(a) * d, s = 1.2 + R() * 1.2;
        if (Math.max(Math.abs(x), Math.abs(z)) < 200) continue;
        voxelTree(KP, x, z, s, [0x46c83a, 0x3ab83a, 0x5ad84a, 0xffa8d8][placed % 9 === 0 ? 3 : placed % 3]);
        if (d < 260) solidBox(x, 4 * s, z, 1.6 * s, 8 * s, 1.6 * s, { mat: 'wood' });
        placed++;
    }
    for (let i = 0; i < 70; i++) {
        const a = R() * Math.PI * 2, d = 200 + R() * 150, x = Math.sin(a) * d, z = Math.cos(a) * d;
        if (Math.max(Math.abs(x), Math.abs(z)) < 195) continue;
        KP.box(x, 1, z, 2.6 + R() * 2, 2 + R(), 2.6 + R() * 2, [0x46c83a, 0x5ad84a, 0x3aa83a][i % 3]);
        if (i % 2) KP.box(x + 0.8, 2.2, z, 0.6, 0.6, 0.6, FLOWER_COLS[i % FLOWER_COLS.length]);
    }
    // hills on the horizon
    const hills = new T.Group(), hm = mat(0x58c840);
    for (let i = 0; i < 18; i++) {
        const a = i / 18 * Math.PI * 2 + R() * 0.2, d = 600 + R() * 240, r = 120 + R() * 140;
        const h = new T.Mesh(new T.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), hm);
        h.position.set(Math.cos(a) * d, -2, Math.sin(a) * d); h.scale.set(r, r * (0.3 + R() * 0.25), r); h.receiveShadow = true;
        hills.add(h);
    }
    mergeChildren(hills);
    worldRoot.add(hills);
    // windmills out in the fields, their sails turning
    const sails = [];
    for (const [x, z, s] of [[-330, -260, 1.3], [360, -220, 1.1], [300, 330, 1.2], [-380, 280, 1]]) {
        const w = new T.Group(); w.position.set(x, 0, z); w.scale.setScalar(s); w.rotation.y = Math.atan2(-x, -z);
        const k = new Kit();
        for (let i = 0; i < 6; i++) k.box(0, 4 + i * 7, 0, 9 - i * 0.9, 7.2, 9 - i * 0.9, i % 2 ? 0xf4ece0 : 0xffffff);
        k.box(0, 46, 0, 6, 5, 7, 0xd8483a); k.box(0, 49.2, 0, 4, 2, 6, 0xb8383a);
        k.box(0, 4, 4.6, 3, 6, 0.4, 0x8a5a2a);
        const body = new T.Mesh(k.geometry(), vcMat); body.castShadow = true; w.add(body);
        const hub = new T.Group(); hub.position.set(0, 46, 4.2);
        const sk = new Kit();
        for (let a = 0; a < 4; a++) { const r = a * Math.PI / 2; sk.box(Math.sin(r) * 9, Math.cos(r) * 9, 0, 0.8, 18, 0.5, 0x8a5a2a, { rz: -r }); sk.box(Math.sin(r) * 10 + Math.cos(r) * 1.6, Math.cos(r) * 10 - Math.sin(r) * 1.6, 0.2, 2.6, 14, 0.2, 0xfff8ec, { rz: -r }); }
        hub.add(new T.Mesh(sk.geometry(), vcMat));
        w.add(hub); sails.push(hub);
        worldRoot.add(w); movers.push(hub);
    }
    tickers.push((dt, t) => { for (const h of sails) h.rotation.z = t * 0.5; });
    // hot-air balloons drifting round the garden (the reference has one)
    const balloons = new T.Group();
    for (let i = 0; i < 5; i++) {
        const b = new T.Group(), cols = [[0xff5a7a, 0xffffff], [0x5ad0ff, 0xffd21e], [0x7dff6b, 0xff8ad8], [0xffb84a, 0x8a5aff], [0xffffff, 0x3a8aff]][i];
        for (let k = 0; k < 8; k++) {
            const seg = new T.Mesh(new T.SphereGeometry(8, 4, 14, k / 8 * Math.PI * 2, Math.PI / 4), mat(cols[k % 2]));
            seg.scale.y = 1.15; b.add(seg);
        }
        const basket = new T.Mesh(new T.BoxGeometry(3.4, 2.6, 3.4), mat(0xb8783a)); basket.position.y = -12.5; b.add(basket);
        for (const [x, z] of [[1.4, 1.4], [-1.4, 1.4], [1.4, -1.4], [-1.4, -1.4]]) { const r = new T.Mesh(new T.BoxGeometry(0.14, 4.4, 0.14), mat(0x5a4a3a)); r.position.set(x, -9.2, z); b.add(r); }
        bakeVC(b, vcMat);
        b.children[0].castShadow = false;
        const a = i / 5 * Math.PI * 2, d = 240 + i * 40;
        b.userData.a = a; b.userData.d = d; b.userData.h = 100 + i * 20;
        b.position.set(Math.sin(a) * d, b.userData.h, Math.cos(a) * d);
        balloons.add(b);
    }
    worldRoot.add(balloons); movers.push(balloons);
    tickers.push((dt, t) => {
        for (const b of balloons.children) {
            const a = b.userData.a + t * 0.012;
            b.position.set(Math.sin(a) * b.userData.d, b.userData.h + Math.sin(t * 0.4 + b.userData.a) * 4, Math.cos(a) * b.userData.d);
        }
    });
}

// ----- butterflies fluttering over the lawn (the GPU flies them) -----
function buildButterflies() {
    const N = 64;
    const base = new T.BufferGeometry();
    const P = [], I = [];
    for (const side of [-1, 1]) {
        const o = P.length / 3;
        P.push(0, 0, -0.5, side * 1.1, 0, -0.7, side * 1.2, 0, 0.6, 0, 0, 0.4);
        I.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    base.setAttribute('position', new T.Float32BufferAttribute(P, 3));
    base.setIndex(I);
    const g = new T.InstancedBufferGeometry().copy(base);
    const seed = new Float32Array(N * 4), col = new Float32Array(N * 3), c = new T.Color();
    for (let i = 0; i < N; i++) {
        const a = R() * Math.PI * 2, d = 40 + R() * 45;
        seed[i * 4] = Math.sin(a) * d; seed[i * 4 + 1] = Math.cos(a) * d; seed[i * 4 + 2] = R() * 100; seed[i * 4 + 3] = 0.6 + R() * 0.6;
        c.set([0xff7ad8, 0xffd21e, 0x5ad0ff, 0xffffff, 0xff8a2a, 0xb87aff][i % 6]);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('aSeed', new T.InstancedBufferAttribute(seed, 4));
    g.setAttribute('aCol', new T.InstancedBufferAttribute(col, 3));
    g.instanceCount = N;
    const m = new T.ShaderMaterial({
        side: T.DoubleSide,
        uniforms: { uNow: PU.uNow },
        vertexShader: /* glsl */`
            attribute vec4 aSeed; attribute vec3 aCol; uniform float uNow; varying vec3 vCol;
            void main() {
                float t = uNow * aSeed.w + aSeed.z;
                vec3 c = vec3(aSeed.x + sin(t * 0.31) * 9.0 + sin(t * 0.73) * 3.0, 3.5 + sin(t * 0.9) * 1.6 + sin(t * 2.3) * 0.4, aSeed.y + cos(t * 0.27) * 9.0 + cos(t * 0.61) * 3.0);
                vec3 v = vec3(cos(t * 0.31) * 0.31 * 9.0, 0.0, -sin(t * 0.27) * 0.27 * 9.0);
                float yaw = atan(v.x, v.z);
                float flap = sin(uNow * 18.0 + aSeed.z * 7.0) * 1.1;
                vec3 p = position;
                p = vec3(p.x * cos(flap), abs(p.x) * sin(flap), p.z);
                p *= 0.55;
                mat3 Ry = mat3(cos(yaw), 0.0, -sin(yaw), 0.0, 1.0, 0.0, sin(yaw), 0.0, cos(yaw));
                vCol = aCol;
                gl_Position = projectionMatrix * viewMatrix * vec4(c + Ry * p, 1.0);
            }`,
        fragmentShader: 'varying vec3 vCol; void main(){ gl_FragColor = vec4(vCol, 1.0); }',
    });
    const mesh = new T.Mesh(g, m);
    mesh.frustumCulled = false;
    worldRoot.add(mesh);
}

// =====================================================================================
// The guide: shining golden arrows on the ground, flowing along the way to go (round by the
// greenhouse door when it's in the way), and over the goal a big glowing arrow bobbing in a beam of
// light, with a ring pulsing out under it
// =====================================================================================
const CHEV = 80, CHEV_GAP = 4.4, GP = 8;
let chevMat = null, chevMesh = null, mark = null, markMat = null, beam = null, beamMat = null, ring = null, ringMat = null, halo = null;
const guide = { on: false, at: new V3(), mark: new V3(), up: 0, max: 2.6, beamH: 70, top: new V3() };
function buildGuide() {
    // the ground arrows: a fat chevron on a dark rim (one geometry: aRim 1 = the rim), placed along the
    // path and flowed forward by the GPU
    const chevron = (s, cy) => {
        const sh = new T.Shape(), p = [[-1.9, -0.9], [0, 1.1], [1.9, -0.9], [1.9, 0.5], [0, 2.5], [-1.9, 0.5]];
        sh.moveTo(p[0][0] * s, (p[0][1] - cy) * s + cy);
        for (let i = 1; i < p.length; i++) sh.lineTo(p[i][0] * s, (p[i][1] - cy) * s + cy);
        sh.closePath();
        return new T.ShapeGeometry(sh).rotateX(Math.PI / 2);
    };
    const rimG = chevron(1.3, 0.8).translate(0, -0.03, 0), inG = chevron(1, 0.8);
    const merged = mergeGeometries([rimG, inG].map((g) => { g.deleteAttribute('uv'); g.deleteAttribute('normal'); return g; }));
    const rim = new Float32Array(merged.attributes.position.count);
    rim.fill(1, 0, rimG.attributes.position.count);
    merged.setAttribute('aRim', new T.BufferAttribute(rim, 1));
    const ig = new T.InstancedBufferGeometry().copy(merged);
    ig.instanceCount = CHEV;
    chevMat = new T.ShaderMaterial({
        transparent: true, depthWrite: false, side: T.DoubleSide, forceSinglePass: true,
        uniforms: {
            uNow: PU.uNow, uOn: { value: 0 }, uN: { value: 0 }, uLen: { value: 0 },
            uP: { value: Array.from({ length: GP }, () => new V3()) }, uC: { value: new Array(GP).fill(0) },
        },
        vertexShader: /* glsl */`
            #define GP ${GP}
            uniform float uNow, uOn, uLen; uniform int uN; uniform vec3 uP[GP]; uniform float uC[GP];
            attribute float aRim;
            varying float vA, vS, vRim, vTip;
            void main() {
                float s = mod(float(gl_InstanceID) * ${CHEV_GAP.toFixed(1)} + uNow * 8.0, ${(CHEV * CHEV_GAP).toFixed(1)});
                vec3 P = uP[0], D = vec3(0.0, 0.0, 1.0);
                for (int i = 0; i < GP - 1; i++) {
                    if (i < uN - 1 && s >= uC[i] && s <= uC[i + 1]) {
                        float t = (s - uC[i]) / max(0.001, uC[i + 1] - uC[i]);
                        P = mix(uP[i], uP[i + 1], t);
                        vec3 d = uP[i + 1] - uP[i]; d.y = 0.0;
                        if (dot(d, d) > 1e-4) D = normalize(d);
                    }
                }
                vec3 side = vec3(D.z, 0.0, -D.x);
                float k = 1.0 + 0.1 * sin(uNow * 6.0 - s * 0.3);
                vec3 w = P + side * position.x * k + D * position.z * k;
                w.y = P.y + 0.32 + position.y;
                vA = uOn * smoothstep(1.5, 5.0, s) * (1.0 - smoothstep(uLen - 7.0, uLen - 2.5, s)) * step(s, uLen);
                vS = s; vRim = aRim; vTip = position.z;
                gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
            }`,
        fragmentShader: /* glsl */`
            uniform float uNow;
            varying float vA, vS, vRim, vTip;
            void main() {
                if (vA < 0.01) discard;
                if (vRim > 0.5) { gl_FragColor = vec4(0.42, 0.22, 0.0, vA * 0.6); return; }
                float shine = pow(0.5 + 0.5 * sin(vS * 0.22 - uNow * 6.5), 6.0);
                vec3 gold = vec3(1.0, 0.8, 0.12) * (0.95 + 0.1 * sin(uNow * 5.0));
                vec3 c = mix(gold, vec3(1.0, 1.0, 0.86), clamp(shine * 0.85 + smoothstep(1.4, 2.6, vTip) * 0.35, 0.0, 1.0));
                gl_FragColor = vec4(c, vA);
                #include <colorspace_fragment>
            }`,
    });
    chevMesh = new T.Mesh(ig, chevMat);
    chevMesh.frustumCulled = false; chevMesh.renderOrder = 2; chevMesh.visible = false;
    scene.add(chevMesh);
    // the big arrow over the goal: gold with a band of light running down it
    markMat = new T.ShaderMaterial({
        uniforms: { uNow: PU.uNow },
        vertexShader: 'varying vec3 vN; varying float vY; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vY = position.y; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: /* glsl */`uniform float uNow; varying vec3 vN; varying float vY;
            void main(){
                float l = 0.72 + 0.38 * max(0.0, dot(normalize(vN), normalize(vec3(0.4, 0.8, 0.45))));
                float sh = pow(0.5 + 0.5 * sin(vY * 1.4 + uNow * 6.0), 8.0);
                vec3 c = vec3(1.0, 0.8, 0.14) * l * 1.1 + vec3(1.0, 1.0, 0.85) * sh * 0.75;
                gl_FragColor = vec4(c, 1.0);
                #include <colorspace_fragment>
            }`,
    });
    mark = new T.Group();
    const head = new T.ConeGeometry(2.7, 3.4, 4).rotateX(Math.PI).translate(0, 1.7, 0);
    const shaft = new T.BoxGeometry(1.7, 3.6, 1.7).translate(0, 5.2, 0);
    const am = new T.Mesh(mergeGeometries([head.toNonIndexed(), shaft.toNonIndexed()].map((g) => { g.deleteAttribute('uv'); return g; })), markMat);
    am.castShadow = true;
    mark.add(am);
    // a soft halo behind it
    const hTex = sharedTex('guideHalo', () => cv(128, (x, N) => {
        const g = x.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
        g.addColorStop(0, 'rgba(255,248,200,1)'); g.addColorStop(0.35, 'rgba(255,214,80,0.55)'); g.addColorStop(1, 'rgba(255,200,40,0)');
        x.fillStyle = g; x.fillRect(0, 0, N, N);
    }));
    halo = new T.Sprite(new T.SpriteMaterial({ map: hTex, blending: T.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    halo.scale.setScalar(11); halo.position.y = 3.6; halo.renderOrder = 5;
    mark.add(halo);
    mark.visible = false;
    scene.add(mark);
    // the beam of light rising from the goal, and the ring pulsing out on the ground
    beamMat = new T.ShaderMaterial({
        transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, forceSinglePass: true,
        uniforms: { uNow: PU.uNow },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: /* glsl */`uniform float uNow; varying vec2 vUv;
            void main(){
                float a = pow(1.0 - vUv.y, 1.7) * (0.42 + 0.12 * sin(uNow * 4.0 + vUv.y * 10.0));
                a *= 0.75 + 0.25 * sin(vUv.x * 6.2831 * 3.0 + uNow * 2.0);
                gl_FragColor = vec4(vec3(1.0, 0.86, 0.4) * a, 1.0);
            }`,
    });
    beam = new T.Mesh(new T.CylinderGeometry(1.5, 2.4, 1, 20, 1, true).translate(0, 0.5, 0), beamMat);
    beam.renderOrder = 4; beam.visible = false; beam.frustumCulled = false;
    scene.add(beam);
    ringMat = new T.MeshBasicMaterial({ color: 0xffd84a, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, toneMapped: false });
    ring = new T.Mesh(new T.RingGeometry(2.4, 3.2, 40).rotateX(-Math.PI / 2), ringMat);
    ring.renderOrder = 4; ring.visible = false;
    scene.add(ring);
    tickers.push((dt, t) => {
        if (!guide.on) return;
        // the arrow grows with the distance, so it stays easy to see from far away
        const m = guide.mark, sc = Math.min(guide.max, Math.max(1, camera.position.distanceTo(m) / 40)), b = Math.sin(t * 4) * 0.9;
        mark.scale.setScalar(sc);
        mark.position.set(m.x, m.y + guide.up + (6 + b) * sc, m.z);
        mark.rotation.y = t * 1.8;
        halo.scale.setScalar(10 + Math.sin(t * 5) * 1.2);
        beam.position.set(guide.at.x, guide.at.y + 0.1, guide.at.z);
        beam.scale.set(1.4, guide.beamH, 1.4);
        const k = (t * 0.9) % 1;
        ring.position.set(guide.at.x, guide.at.y + 0.3, guide.at.z);
        ring.scale.setScalar(0.7 + k * 1.3);
        ringMat.opacity = 1 - k;
    });
}
// pts: the way to go (the first point is where you stand, the last the goal), or null to hide it.
// o.arrow: show the arrow / beam / ring at the goal; o.beam: the beam's height (low under roofs);
// o.up: how much higher the arrow floats (over a tall plant); o.mark: the arrow somewhere else
// (over the market's tent) than the end of the way
export function setGuide(pts, o) {
    if (!chevMesh) return;
    o = o || {};
    guide.on = !!(pts && pts.length >= 2);
    const on = guide.on;
    chevMesh.visible = on;
    const showMark = on && o.arrow !== false;
    mark.visible = ring.visible = showMark;
    beam.visible = showMark && o.beam !== 0;
    if (!on) return;
    const n = Math.min(GP, pts.length), U = chevMat.uniforms;
    let len = 0;
    for (let i = 0; i < n; i++) {
        U.uP.value[i].copy(pts[i]);
        if (i > 0) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
        U.uC.value[i] = len;
    }
    U.uN.value = n; U.uLen.value = len; U.uOn.value = len > 6 ? 1 : 0;
    guide.at.copy(pts[n - 1]);
    guide.beamH = o.beam || 70;
    guide.up = o.up || 0;
    guide.mark.copy(o.mark || guide.at);
    guide.max = o.max || 2.6;
}
// where the arrow is (for the pointer at the screen's edge), or null
export const guideGoal = () => (guide.on && mark.visible ? guide.top.set(guide.mark.x, guide.mark.y + 9 * mark.scale.y + guide.up, guide.mark.z) : null);

// =====================================================================================
let built = false;
export async function buildWorld(pause) {
    if (built) return;
    built = true;
    buildGround(); await pause();
    buildMarket(); await pause();
    for (const f of FOUNTAINS) fountain(f.x, f.z, 7);
    buildEggShop(); buildGemShop(); buildWheel(); await pause();
    buildBest(); buildQuestBoard(); await pause();
    buildCherry(); buildSpooky(); buildBeanSpot(); await pause();
    buildScenery(); buildButterflies(); await pause();
    buildGuide();
    for (const [k, m] of [[KP, vcgMat], [KS, studMat]]) {
        const mesh = new T.Mesh(k.geometry(), m);
        mesh.castShadow = true; mesh.receiveShadow = true;
        worldRoot.add(mesh);
    }
    const water = new T.Mesh(mergeGeos(waterGeos), waterMat); water.receiveShadow = false; worldRoot.add(water);
    const jets = new T.Mesh(mergeGeos(jetGeos), jetMat); jets.renderOrder = 4; worldRoot.add(jets);
    // everything that never moves is frozen (no matrix work per frame); the movers keep updating
    worldRoot.updateMatrixWorld(true);
    for (const o of movers) o.traverse((c) => { c.userData.moving = true; });
    worldRoot.traverse((c) => { if (c !== worldRoot && !c.userData.moving) c.matrixAutoUpdate = false; });
}
function mergeGeos(list) {
    const parts = list.map((g) => { const x = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(x.attributes)) if (k !== 'position' && k !== 'uv' && k !== 'normal') x.deleteAttribute(k); return x; });
    const out = new T.BufferGeometry(), keys = ['position', 'normal', 'uv'];
    for (const k of keys) {
        const n = parts.reduce((a, g) => a + g.attributes[k].array.length, 0), arr = new Float32Array(n);
        let o = 0;
        for (const g of parts) { arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
        out.setAttribute(k, new T.BufferAttribute(arr, parts[0].attributes[k].itemSize));
    }
    out.computeBoundingSphere();
    return out;
}
// Every shader of the world in view for the loading warm-up
const SHADOW_SIDE = { [T.FrontSide]: T.BackSide, [T.BackSide]: T.FrontSide, [T.DoubleSide]: T.DoubleSide };
const warmKeep = [];
export async function warmUp(renderer, camera, pause, extraScenes) {
    // Hidden things are shown just for the (synchronous) gathering of their materials and hidden
    // again before anything is awaited
    const vis = [], waits = [];
    scene.traverse((o) => { if (o !== scene && !o.visible) { vis.push(o); o.visible = true; } });
    try { waits.push(renderer.compileAsync(scene, camera)); } catch (e) { renderer.compile(scene, camera); }
    for (const o of vis) o.visible = false;
    for (const sc of extraScenes || []) { try { waits.push(renderer.compileAsync(sc, camera)); } catch (e) { renderer.compile(sc, camera); } }
    for (const w of waits) { try { await w; } catch (e) { /* compiles on first use */ } }
    if (renderer.shadowMap.enabled) {
        const kinds = new Map();
        scene.traverse((o) => {
            if (!o.isMesh || !o.castShadow) return;
            for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
                if (o.customDepthMaterial) continue;
                const side = m.shadowSide ?? SHADOW_SIDE[m.side];
                const key = [o.isSkinnedMesh, o.isInstancedMesh, !!(o.isInstancedMesh && o.instanceColor), !!m.map, side, m.alphaTest > 0].join();
                if (kinds.has(key)) continue;
                const d = new T.MeshDepthMaterial({ side, map: m.map, alphaMap: m.alphaMap, alphaTest: m.alphaTest });
                let p;
                if (o.isSkinnedMesh) { p = new T.SkinnedMesh(o.geometry, d); p.bind(o.skeleton, o.bindMatrix); }
                else if (o.isInstancedMesh) { p = new T.InstancedMesh(o.geometry, d, 1); if (o.instanceColor) p.setColorAt(0, new T.Color(1, 1, 1)); }
                else p = new T.Mesh(o.geometry, d);
                kinds.set(key, p);
            }
        });
        const stand = new T.Group();
        for (const p of kinds.values()) stand.add(p);
        // the plants' own depth material (custom: their shadows grow with them)
        scene.traverse((o) => { if (o.isInstancedMesh && o.customDepthMaterial && !kinds.has('plant')) { const p = new T.InstancedMesh(o.geometry, o.customDepthMaterial, 1); kinds.set('plant', p); stand.add(p); } });
        const rt = new T.WebGLRenderTarget(1, 1);
        const prev = renderer.getRenderTarget(), fog = scene.fog;
        let ready = null;
        renderer.setRenderTarget(rt);
        scene.fog = null;
        try { ready = renderer.compileAsync(stand, camera, scene); } catch (e) { /* compiles on first use */ }
        scene.fog = fog;
        renderer.setRenderTarget(prev);
        if (ready) { try { await ready; } catch (e) { /* compiles on first use */ } }
        rt.dispose();
        warmKeep.push(stand);
        try { renderer.compile(new T.Group(), camera, scene); } catch (e) { /* next frame */ }
    }
    const texs = new Set();
    const collect = (o) => {
        const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of ms) {
            for (const k of ['map', 'normalMap', 'emissiveMap', 'alphaMap']) if (m[k]) texs.add(m[k]);
            if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isTexture) texs.add(v); }
        }
    };
    scene.traverse(collect);
    for (const sc of extraScenes || []) sc.traverse(collect);
    let n = 0;
    for (const tx of texs) {
        renderer.initTexture(tx);
        if (++n % 12 === 0) await pause();
    }
    const gl = renderer.getContext();
    if (gl.fenceSync) {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const t0 = performance.now();
        while (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED && performance.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 15));
        gl.deleteSync(sync);
    }
}
void signs; void solids;
