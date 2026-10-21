// The eight greenhouses: glass walls in a lavender truss frame, a checkered floor on every storey, a
// gable roof with the owner's name on it, a door with string lights, lift pads (up / down) on every
// floor, a FLOOR UPGRADES board on each back wall, the "Upgrade Floor" sign outside and the FRUITS
// crates stacking up beside the door. Each greenhouse is a handful of merged meshes, rebuilt only when
// it changes hands or grows a floor; its collision boxes line up with the world's axes exactly.
import { T, V3, scene, solids, prompts, solidBox, texFrom, sharedTex, fitFont, billboard } from './engine.js';
import { Kit } from './geo.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { vcgMat, cv } from './world.js';
import { PU } from './plants.js';
import {
    PLOTS, FRAMES, PLOT_W, PLOT_D, FLOOR_H, SLAB, DOOR_W, DOOR_H, IN_X, IN_Z, LIFT_UP, LIFT_DOWN, BOARD, CRATE, SIGN, PLANT_AREA, toWorld, floorY,
} from '../../shared/garden.js';
import { FLOORS, MAX_FLOORS, FLOOR_UPS, FLOOR_UP_MAX, upValueMult, upSpeedMult, upDoubleChance, fmt, money } from '../../shared/config.js';
import { actions, S } from './state.js';

// each plot's colour (trims, neon, its name)
export const PLOT_COLORS = [0xff5a8a, 0xffa82a, 0xffe03a, 0x5ae84a, 0x3ad8ff, 0x4a7aff, 0xb05aff, 0xff4a4a];
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const W2 = PLOT_W / 2, D2 = PLOT_D / 2, ROOF_H = 12;
const PLANTER_FLOWERS = [0xff5a8a, 0xffd21e, 0xffffff, 0xc45aff, 0xff8a2a, 0x5ad0ff];

// ----- textures -----
const checkerTex = texFrom(cv(256, (x, N) => {
    const h = N / 2;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        x.fillStyle = (i + j) % 2 ? '#d6c8f2' : '#e8def8'; x.fillRect(i * h, j * h, h, h);
        // faint studs
        for (let b = 0; b < 4; b++) for (let a = 0; a < 4; a++) {
            const cx = i * h + (a + 0.5) * h / 4, cy = j * h + (b + 0.5) * h / 4;
            x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(cx - 9, cy - 9, 18, 18);
            x.fillStyle = 'rgba(80,60,140,0.08)'; x.fillRect(cx - 9, cy + 7, 18, 3);
        }
    }
}), true);
const floorMat = new T.MeshLambertMaterial({ vertexColors: true, map: checkerTex });
const trussTex = texFrom(cv(128, (x, N) => {
    x.fillStyle = '#d2cdea'; x.fillRect(0, 0, N, N);
    x.fillStyle = '#a49ccc'; x.fillRect(N * 0.22, N * 0.22, N * 0.56, N * 0.56);
    x.fillStyle = '#8a82b8'; x.fillRect(N * 0.22, N * 0.22, N * 0.56, N * 0.1);
    x.strokeStyle = '#ece8fa'; x.lineWidth = 6; x.strokeRect(3, 3, N - 6, N - 6);
}), true);
const trussMat = new T.MeshLambertMaterial({ vertexColors: true, map: trussTex });
const glassTex = texFrom(cv(256, (x, N) => {
    const g = x.createLinearGradient(0, 0, 0, N); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#d8f4ff');
    x.fillStyle = g; x.fillRect(0, 0, N, N);
    x.globalAlpha = 0.5; x.fillStyle = '#ffffff';
    x.beginPath(); x.moveTo(N * 0.1, N); x.lineTo(N * 0.3, N); x.lineTo(N * 0.62, 0); x.lineTo(N * 0.42, 0); x.fill();
    x.beginPath(); x.moveTo(N * 0.42, N); x.lineTo(N * 0.47, N); x.lineTo(N * 0.79, 0); x.lineTo(N * 0.74, 0); x.fill();
}), true);
const glassMat = new T.MeshLambertMaterial({ color: 0xbff0ff, map: glassTex, transparent: true, opacity: 0.26, depthWrite: false, side: T.DoubleSide, forceSinglePass: true });
const crateTex = texFrom(cv(256, (x, N) => {
    x.fillStyle = '#b8805a'; x.fillRect(0, 0, N, N);
    for (let i = 0; i < 4; i++) { x.fillStyle = i % 2 ? '#a87048' : '#c08a62'; x.fillRect(0, i * N / 4 + 4, N, N / 4 - 8); }
    x.strokeStyle = '#7a4a2a'; x.lineWidth = 16; x.strokeRect(8, 8, N - 16, N - 16);
    x.save(); x.translate(N / 2, N / 2); x.rotate(-0.12);
    x.font = 'italic 900 58px Fredoka, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 8; x.strokeStyle = 'rgba(90,50,30,0.6)'; x.strokeText('FRUITS', 0, 0);
    x.fillStyle = '#fff4e8'; x.fillText('FRUITS', 0, 0);
    x.restore();
}));
const crateMat = new T.MeshLambertMaterial({ map: crateTex, vertexColors: true });
// the boards of other people's floors: one texture holding "FLOOR n UPGRADES" for every floor
const boardAtlas = texFrom(cv(512, (x, W, H) => {
    for (let f = 0; f < MAX_FLOORS; f++) {
        const y0 = f * H / MAX_FLOORS, h = H / MAX_FLOORS;
        const g = x.createLinearGradient(0, y0, 0, y0 + h); g.addColorStop(0, '#2a4a8a'); g.addColorStop(1, '#16285a');
        x.fillStyle = g; x.fillRect(0, y0, W, h);
        x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ffe24a';
        x.font = '900 40px Fredoka, sans-serif'; x.fillText('FLOOR ' + (f + 1), W / 2, y0 + h * 0.36);
        x.fillStyle = '#ffffff'; x.font = '700 30px Fredoka, sans-serif'; x.fillText('UPGRADES', W / 2, y0 + h * 0.7);
    }
}, 1024));
const boardAtlasMat = new T.MeshBasicMaterial({ map: boardAtlas });

// =====================================================================================
// One greenhouse
// =====================================================================================
class Plot {
    constructor(i) {
        this.i = i; this.f = FRAMES[i];
        this.group = new T.Group();
        this.group.position.set(this.f.cx, 0, this.f.cz);
        this.group.rotation.y = this.f.yaw;
        scene.add(this.group);
        this.floors = 0; this.owner = null; this.name = ''; this.mine = false; this.crate = -1; this.ups = '';
        this.meshes = []; this.solids = []; this.boardTex = []; this.boardCv = [];
        this.crateMesh = null; this.crateN = -1;
        this.label = null; this.labelKey = '';
        this.signTex = null; this.signKey = '';
        this.nameTex = null; this.nameKey = '';
        this.color = PLOT_COLORS[i];
    }
    // local box -> world AABB (quarter turns only)
    worldBox(lx, y, lz, sx, sy, sz, o) {
        const w = toWorld(this.i, lx, lz), q = this.f.cos !== 0;
        const c = solidBox(w.x, y, w.z, q ? sx : sz, sy, q ? sz : sx, { mat: 'floor', plot: this.i, ...(o || {}) });
        this.solids.push(c);
        return c;
    }
    clearSolids() { for (const c of this.solids) { const k = solids.indexOf(c); if (k >= 0) solids.splice(k, 1); } this.solids.length = 0; }
    build(floors) {
        for (const m of this.meshes) { this.group.remove(m); m.geometry.dispose(); if (m.userData.ownMat) m.material.dispose(); }
        this.meshes.length = 0;
        this.clearSolids();
        this.floors = floors;
        // plain, neon (glow 1) and the lift arrows (glow 2: they bob) all in one mesh
        const KF = new Kit(), KT = new Kit(), KP = new Kit({ glow: true }), KGl = new Kit(), KB = new Kit({ noShade: true });
        const KG = { box: (x, y, z, sx, sy, sz, c, o) => KP.box(x, y, z, sx, sy, sz, c, { ...(o || {}), glow: 1 }) };
        const KA = { box: (x, y, z, sx, sy, sz, c, o) => KP.box(x, y, z, sx, sy, sz, c, { ...(o || {}), glow: 2 }) };
        const col = this.color, dark = 0x6a5aa8, frame = 0xffffff;
        const H = floors * FLOOR_H;
        // the foundation and its step up to the door
        KP.box(0, 0.35, 0, PLOT_W + 2, 0.7, PLOT_D + 2, 0xb8b0d0);
        for (let s = 0; s < 2; s++) KP.box(0, 0.25 + s * 0.25, D2 + 1.6 + (1 - s) * 1.2, DOOR_W + 4, 0.5 + s * 0.5, 2.4, 0xcfc8e4);
        for (let f = 0; f < floors; f++) {
            const y0 = f * FLOOR_H;
            // the floor slab (checkered top)
            KF.box(0, y0 + SLAB / 2, 0, PLOT_W, SLAB, PLOT_D, 0xffffff, { tile: 16 });
            this.worldBox(0, y0 + SLAB / 2, 0, PLOT_W, SLAB, PLOT_D);
            // walls: glass panes between truss posts; the front of the ground floor has the door
            const wy = y0 + SLAB + (FLOOR_H - SLAB) / 2, wh = FLOOR_H - SLAB;
            const pane = (x, z, sx, sz, h, y) => KGl.box(x, y ?? wy, z, sx, h ?? wh, sz, 0xffffff, { uv: [0, 0, Math.max(sx, sz) / 18, (h ?? wh) / 18] });
            pane(0, -D2 + 0.5, PLOT_W - 2, 0.2);
            pane(-W2 + 0.5, 0, 0.2, PLOT_D - 2);
            pane(W2 - 0.5, 0, 0.2, PLOT_D - 2);
            this.worldBox(0, wy, -D2 + 0.5, PLOT_W, wh, 1, { mat: 'glass' });
            this.worldBox(-W2 + 0.5, wy, 0, 1, wh, PLOT_D, { mat: 'glass' });
            this.worldBox(W2 - 0.5, wy, 0, 1, wh, PLOT_D, { mat: 'glass' });
            if (f === 0) {
                const side = (PLOT_W - DOOR_W) / 2 - 1;
                for (const sx of [-1, 1]) { pane(sx * (DOOR_W / 2 + side / 2), D2 - 0.5, side, 0.2); this.worldBox(sx * (DOOR_W / 2 + side / 2), wy, D2 - 0.5, side, wh, 1, { mat: 'glass' }); }
                const top = wh - DOOR_H;
                pane(0, D2 - 0.5, DOOR_W, 0.2, top, y0 + SLAB + DOOR_H + top / 2);
                this.worldBox(0, y0 + SLAB + DOOR_H + top / 2, D2 - 0.5, DOOR_W, top, 1, { mat: 'glass' });
                this.worldBox(0, y0 + SLAB + DOOR_H / 2, D2 - 0.5, DOOR_W, DOOR_H, 1, { camOnly: true });
                // the door frame
                for (const sx of [-1, 1]) KP.box(sx * (DOOR_W / 2 + 0.4), y0 + SLAB + DOOR_H / 2, D2 - 0.2, 0.8, DOOR_H, 1.4, col);
                KP.box(0, y0 + SLAB + DOOR_H + 0.4, D2 - 0.2, DOOR_W + 1.6, 0.8, 1.4, col);
            } else {
                pane(0, D2 - 0.5, PLOT_W - 2, 0.2);
                this.worldBox(0, wy, D2 - 0.5, PLOT_W, wh, 1, { mat: 'glass' });
            }
            // the truss frame: corner posts, posts along the walls, beams round the top and bottom
            for (const [x, z] of [[-W2 + 0.8, -D2 + 0.8], [W2 - 0.8, -D2 + 0.8], [-W2 + 0.8, D2 - 0.8], [W2 - 0.8, D2 - 0.8]]) KT.box(x, wy, z, 1.6, wh, 1.6, frame, { tile: 1.6 });
            for (let k = 1; k < 5; k++) {
                const x = -W2 + k * PLOT_W / 5;
                KT.box(x, wy, -D2 + 0.6, 1, wh, 1, frame, { tile: 1.6 });
                if (f > 0 || Math.abs(x) > DOOR_W / 2 + 1) KT.box(x, wy, D2 - 0.6, 1, wh, 1, frame, { tile: 1.6 });
            }
            for (let k = 1; k < 4; k++) { const z = -D2 + k * PLOT_D / 4; for (const sx of [-1, 1]) KT.box(sx * (W2 - 0.6), wy, z, 1, wh, 1, frame, { tile: 1.6 }); }
            for (const yy of [y0 + FLOOR_H - 0.8, y0 + SLAB + 0.6]) {
                KT.box(0, yy, -D2 + 0.8, PLOT_W, 1.6, 1.6, frame, { tile: 1.6 });
                KT.box(0, yy, D2 - 0.8, PLOT_W, 1.6, 1.6, frame, { tile: 1.6 });
                for (const sx of [-1, 1]) KT.box(sx * (W2 - 0.8), yy, 0, 1.6, 1.6, PLOT_D, frame, { tile: 1.6 });
            }
            // a neon trim in the plot's colour round each floor, outside
            KG.box(0, y0 + FLOOR_H - 0.05, D2 + 0.12, PLOT_W + 0.2, 0.3, 0.2, col);
            KG.box(0, y0 + FLOOR_H - 0.05, -D2 - 0.12, PLOT_W + 0.2, 0.3, 0.2, col);
            for (const sx of [-1, 1]) KG.box(sx * (W2 + 0.12), y0 + FLOOR_H - 0.05, 0, 0.2, 0.3, PLOT_D + 0.2, col);
            // the planting bed: a low wooden edging round it, a stake at each corner
            {
                const A = PLANT_AREA, ex = (A.x1 - A.x0) + 1.2, ez = (A.z1 - A.z0) + 1.2, mx = (A.x0 + A.x1) / 2, mz = (A.z0 + A.z1) / 2, ey = y0 + SLAB + 0.12;
                for (const sz of [-1, 1]) KP.box(mx, ey, mz + sz * ez / 2, ex + 0.6, 0.24, 0.6, 0x9a6a3a);
                for (const sx of [-1, 1]) KP.box(mx + sx * ex / 2, ey, mz, 0.6, 0.24, ez - 0.6, 0x9a6a3a);
                for (const sx of [-1, 1]) for (const sz of [-1, 1]) { KP.box(mx + sx * ex / 2, ey + 0.35, mz + sz * ez / 2, 1, 0.9, 1, 0x7a4a2a); KP.box(mx + sx * ex / 2, ey + 0.86, mz + sz * ez / 2, 0.7, 0.14, 0.7, col); }
            }
            // lift pads: UP on the right of the door (every floor but the top one... where it offers the next
            // floor), DOWN on the left (every floor but the ground)
            const pad = (p, c, up) => {
                KP.box(p.x, y0 + SLAB + 0.1, p.z, p.r * 2 + 0.6, 0.2, p.r * 2 + 0.6, 0xffffff);
                KG.box(p.x, y0 + SLAB + 0.22, p.z, p.r * 2, 0.06, p.r * 2, c);
                KP.box(p.x, y0 + SLAB + 0.26, p.z, p.r * 2 - 0.8, 0.06, p.r * 2 - 0.8, 0xffffff);
                // a chunky arrow floating over it
                const ay = y0 + SLAB + 3.4, d = up ? 1 : -1;
                KA.box(p.x, ay - d * 0.4, p.z, 0.7, 1.6, 0.7, c);
                KA.box(p.x, ay + d * 0.5, p.z, 1.9, 0.5, 0.7, c);
                KA.box(p.x, ay + d * 0.9, p.z, 1.1, 0.4, 0.7, c);
                KA.box(p.x, ay + d * 1.2, p.z, 0.45, 0.35, 0.7, c);
            };
            if (f < floors - 1 || f < MAX_FLOORS - 1) pad(LIFT_UP, f < floors - 1 ? 0x46ec50 : 0xffd21e, true);
            if (f > 0) pad(LIFT_DOWN, 0xff9a2a, false);
            // the FLOOR UPGRADES board on the back wall
            const by = y0 + SLAB + 7;
            // the board: light like the frame from behind (it shows through the glass), a coloured rim in front
            KP.box(BOARD.x, by, BOARD.z, 13, 9, 0.5, 0xf0ecff);
            KG.box(BOARD.x, by, BOARD.z + 0.27, 12.8, 8.8, 0.04, col);
            KP.box(BOARD.x, by - 5.2, BOARD.z + 0.2, 2.2, 1.4, 0.7, 0xd8d0f0);
            if (!this.mine) KB.box(BOARD.x, by, BOARD.z + 0.36, 12, 8, 0.05, 0xffffff, { uv: [0, 1 - (f + 1) / MAX_FLOORS, 1, 1 - f / MAX_FLOORS] });
        }
        // the gable roof (glass on a truss frame), the owner's name on its front
        const ry0 = H, rh = ROOF_H;
        KF.box(0, ry0 + SLAB / 2, 0, PLOT_W, SLAB, PLOT_D, 0xffffff, { tile: 16 });
        this.worldBox(0, ry0 + SLAB / 2, 0, PLOT_W, SLAB, PLOT_D);
        const slope = Math.atan2(rh, W2), len = Math.hypot(rh, W2);
        for (const sx of [-1, 1]) {
            KGl.box(sx * W2 / 2, ry0 + SLAB + rh / 2, 0, len, 0.2, PLOT_D - 1, 0xffffff, { rz: -sx * slope, uv: [0, 0, len / 18, PLOT_D / 18] });
            KT.box(sx * W2 / 2, ry0 + SLAB + rh / 2, -D2 + 0.8, len, 1.2, 1.2, frame, { rz: -sx * slope, tile: 1.6 });
            KT.box(sx * W2 / 2, ry0 + SLAB + rh / 2, D2 - 0.8, len, 1.2, 1.2, frame, { rz: -sx * slope, tile: 1.6 });
            KT.box(sx * W2 / 2, ry0 + SLAB + rh / 2, 0, len, 1, 1, frame, { rz: -sx * slope, tile: 1.6 });
        }
        KT.box(0, ry0 + SLAB + rh, 0, 1.6, 1.6, PLOT_D + 0.4, frame, { tile: 1.6 });
        KG.box(0, ry0 + SLAB + rh + 0.9, 0, 0.5, 0.3, PLOT_D + 0.4, col);
        // gable ends (glass triangles approximated by steps)
        for (const z of [-D2 + 0.5, D2 - 0.5]) for (let k = 0; k < 6; k++) { const w = PLOT_W * (1 - (k + 0.5) / 6); KGl.box(0, ry0 + SLAB + (k + 0.5) * rh / 6, z, w, rh / 6, 0.2, 0xffffff, { uv: [0, 0, w / 18, 0.08] }); }
        // string lights over the door (the reference's), and the name board on the front gable
        // high enough to stay over the camera when you stand in front of your door
        const LH = 18;
        for (const sx of [-1, 1]) { KP.box(sx * (DOOR_W / 2 + 4), LH / 2, D2 + 6, 0.6, LH, 0.6, 0x2a2a3a); KP.box(sx * (DOOR_W / 2 + 4), 0.4, D2 + 6, 1.4, 0.8, 1.4, 0x3a3a4a); this.worldBox(sx * (DOOR_W / 2 + 4), LH / 2, D2 + 6, 0.8, LH, 0.8, { mat: 'metal' }); }
        for (let k = 0; k <= 12; k++) {
            const t = k / 12, x = (t - 0.5) * (DOOR_W + 8), y = LH - 0.4 - Math.sin(t * Math.PI) * 1.6;
            if (k < 12) KP.box(x + (DOOR_W + 8) / 24, y - 0.1 - Math.cos(t * Math.PI) * 0.2, D2 + 6, (DOOR_W + 8) / 12, 0.08, 0.08, 0x2a2a3a);
            KG.box(x, y - 0.5, D2 + 6, 0.45, 0.6, 0.45, [0xfff0a8, 0xffd0e8, 0xc8f0ff][k % 3]);
        }
        // planter boxes full of flowers along the front wall, either side of the door
        for (const sx of [-1, 1]) {
            const x0 = DOOR_W / 2 + 5, x1 = W2 - 2, cx = sx * (x0 + x1) / 2, len = x1 - x0, pz = D2 + 1.7;
            KP.box(cx, 0.95, pz, len, 1.9, 2.4, 0xb8783a);
            KP.box(cx, 1.95, pz, len + 0.4, 0.3, 2.8, 0xd8a060);
            KP.box(cx, 1.9, pz, len - 0.6, 0.2, 1.8, 0x5a3a1e);
            for (let k = 0; k < Math.floor(len / 1.6); k++) {
                const x = cx - len / 2 + 0.9 + k * 1.6, h = 0.7 + ((k * 7) % 5) * 0.16;
                KP.box(x, 2 + h / 2, pz, 0.9, h, 0.9, 0x46c83a);
                KP.box(x, 2.2 + h, pz + ((k % 2) - 0.5) * 0.5, 0.7, 0.5, 0.7, PLANTER_FLOWERS[(k + (sx > 0 ? 2 : 0) + this.i) % PLANTER_FLOWERS.length]);
            }
            this.worldBox(cx, 1, pz, len, 2, 2.4, { mat: 'wood' });
            // a lantern each side of the door
            KP.box(sx * (DOOR_W / 2 + 1.5), SLAB + DOOR_H - 2.6, D2 + 0.5, 0.9, 0.3, 0.9, 0x2a2a3a);
            KG.box(sx * (DOOR_W / 2 + 1.5), SLAB + DOOR_H - 3.5, D2 + 0.5, 0.7, 1.2, 0.7, 0xfff0b8);
            KP.box(sx * (DOOR_W / 2 + 1.5), SLAB + DOOR_H - 4.2, D2 + 0.5, 0.9, 0.25, 0.9, 0x2a2a3a);
        }
        // a pediment over the door (flat on the wall: nothing sticks out where the camera goes), and a
        // clipped topiary in a pot each side of the steps
        KP.box(0, SLAB + DOOR_H + 1.5, D2 + 0.1, DOOR_W + 3.4, 1.3, 0.9, col);
        KP.box(0, SLAB + DOOR_H + 2.3, D2 + 0.1, DOOR_W + 4, 0.35, 1.1, 0xffc21e);
        for (const sx of [-1, 1]) {
            const tx = sx * (DOOR_W / 2 + 2.2), tz = D2 + 2.6;
            KP.box(tx, 0.8, tz, 2, 1.6, 2, 0xc8643a);
            KP.box(tx, 1.7, tz, 2.3, 0.3, 2.3, 0xe08a5a);
            KP.box(tx, 2.6, tz, 0.4, 1.6, 0.4, 0x7a4a2a);
            KP.box(tx, 4.1, tz, 2.4, 2.4, 2.4, 0x3ab83a);
            KP.box(tx, 4.1, tz, 2.8, 1.6, 1.6, 0x46c83a);
            KP.box(tx, 4.1, tz, 1.6, 1.6, 2.8, 0x46c83a);
            KP.box(tx, 5.9, tz, 1.3, 1.3, 1.3, 0x5ad84a);
            KG.box(tx, 6.8, tz, 0.5, 0.5, 0.5, 0xfff0a8);
            this.worldBox(tx, 1.2, tz, 2, 2.4, 2, { mat: 'wood' });
        }
        // a flag in the plot's colour on the roof's ridge
        {
            const fy = H + SLAB + ROOF_H;
            KP.box(0, fy + 4, D2 - 2, 0.4, 8, 0.4, 0xffffff);
            KP.box(0, fy + 8.2, D2 - 2, 0.8, 0.8, 0.8, 0xffc21e);
            KP.box(2.4, fy + 6.6, D2 - 2, 4.4, 2.6, 0.15, col);
            KP.box(2.4, fy + 6.6, D2 - 1.9, 1.4, 1.4, 0.05, 0xffffff, { rz: Math.PI / 4 });
        }
        // the Upgrade Floor sign outside (its face is drawn per plot)
        KP.box(SIGN.x, 2.2, SIGN.z, 0.6, 4.4, 0.6, 0x8a5a2a);
        KP.box(SIGN.x, 5.2, SIGN.z, 8.4, 3.4, 0.5, 0x8a5a2a);
        this.worldBox(SIGN.x, 2.2, SIGN.z, 1, 4.4, 1, { mat: 'wood' });
        // the crate stand
        KP.box(CRATE.x, 0.25, CRATE.z, 5.2, 0.5, 4.4, 0x9a9ab8);
        const add = (k, m, cast) => { if (!k.count) return; const mesh = new T.Mesh(k.geometry(), m); mesh.castShadow = cast; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; this.group.add(mesh); this.meshes.push(mesh); return mesh; };
        add(KF, floorMat, false);
        add(KT, trussMat, true);
        add(KP, vcgMat, true);
        const g = add(KGl, glassMat, false);
        if (g) g.renderOrder = 4;
        add(KB, boardAtlasMat, false);
        // own boards (with your levels on them)
        this.ownBoards();
        this.nameBoard(true);
        this.signFace(true);
        this.atlasMesh();
        this.group.updateMatrixWorld(true);
        for (const m of this.meshes) m.updateMatrix();
    }
    ownBoards() {
        if (!this.mine) return;
        for (let f = 0; f < this.floors; f++) {
            if (!this.boardCv[f]) { this.boardCv[f] = cv(512, () => {}, 384); this.boardTex[f] = texFrom(this.boardCv[f]); }
            const m = new T.Mesh(new T.PlaneGeometry(12, 9), new T.MeshBasicMaterial({ map: this.boardTex[f] }));
            m.userData.ownMat = true;
            m.position.set(BOARD.x, f * FLOOR_H + SLAB + 7, BOARD.z + 0.4);
            this.group.add(m); this.meshes.push(m);
        }
        this.drawBoards(true);
    }
    drawBoards(force) {
        if (!this.mine) return;
        const key = this.ups;
        if (!force && key === this.boardKey) return;
        this.boardKey = key;
        const ups = String(this.ups).split('|').map((x) => x.split(',').map((n) => n | 0));
        for (let f = 0; f < this.floors; f++) {
            const c = this.boardCv[f];
            if (!c) continue;
            const x = c.getContext('2d'), W = 512, H = 384, u = ups[f] || [0, 0, 0];
            const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a4a8a'); g.addColorStop(1, '#16285a');
            x.fillStyle = g; x.fillRect(0, 0, W, H);
            x.textAlign = 'center'; x.textBaseline = 'middle';
            x.fillStyle = '#ffe24a'; x.font = '900 34px Fredoka, sans-serif'; x.fillText('FLOOR ' + (f + 1) + ' UPGRADES', W / 2, 36);
            const vals = [u[0] ? '+' + Math.round((upValueMult(u[0]) - 1) * 100) + '% value' : '', u[1] ? '+' + Math.round((upSpeedMult(u[1]) - 1) * 100) + '% speed' : '', u[2] ? Math.round(upDoubleChance(u[2]) * 100) + '% double' : ''];
            FLOOR_UPS.forEach((up, k) => {
                const y = 100 + k * 96, lv = u[k] || 0;
                x.fillStyle = ['#e8283a', '#2ac83a', '#ffb81c'][k]; x.fillRect(24, y - 34, W - 48, 70);
                x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(24, y + 20, W - 48, 16);
                x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillRect(24, y + 20, (W - 48) * lv / FLOOR_UP_MAX, 16);
                x.textAlign = 'left'; x.fillStyle = '#ffffff';
                fitFont(x, up.ic + ' ' + up.name, 300, 30, 700, 'Fredoka, sans-serif', 0);
                x.fillText(up.ic + ' ' + up.name, 40, y - 6);
                x.textAlign = 'right'; x.font = '700 26px Fredoka, sans-serif';
                x.fillText(lv >= FLOOR_UP_MAX ? 'MAX' : 'Level ' + lv + '/' + FLOOR_UP_MAX, W - 40, y - 14);
                x.font = '600 20px Fredoka, sans-serif'; x.fillText(vals[k], W - 40, y + 8);
            });
            x.textAlign = 'center'; x.fillStyle = '#ffffff'; x.font = '700 22px Fredoka, sans-serif';
            x.fillText('Press E (or tap) to upgrade', W / 2, H - 22);
            this.boardTex[f].needsUpdate = true;
        }
    }
    // the name board on the front gable: "Name's Garden"
    nameBoard(rebuild) {
        const key = this.name + '|' + this.floors;
        if (!rebuild && key === this.nameKey) return;
        this.nameKey = key;
        this.atlas();
        const x = this.atlasCv.getContext('2d'), W = 1024, H = 256;
        x.clearRect(0, 0, W, H);
        const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e8e0ff');
        x.fillStyle = g; x.beginPath(); x.roundRect(8, 8, W - 16, H - 16, 40); x.fill();
        x.lineWidth = 14; x.strokeStyle = hex(this.color); x.stroke();
        x.textAlign = 'center'; x.textBaseline = 'middle';
        const t = this.name ? this.name + "'s Garden" : 'Empty Garden';
        const px = fitFont(x, t, W - 120, 110, 900, 'Fredoka, sans-serif', 0.2);
        x.lineJoin = 'round'; x.lineWidth = px * 0.18; x.strokeStyle = '#10203a'; x.strokeText(t, W / 2, H / 2 - 22);
        x.fillStyle = this.name ? hex(this.color) : '#c8c8d8'; x.fillText(t, W / 2, H / 2 - 22);
        x.font = '700 52px Fredoka, sans-serif'; x.fillStyle = '#3a2a6a';
        x.fillText(this.name ? '🏢 ' + this.floors + ' floor' + (this.floors > 1 ? 's' : '') : 'Join to claim it!', W / 2, H / 2 + 64);
        this.atlasTex.needsUpdate = true;
    }
    // the name boards and the Upgrade Floor sign share one texture (name on top, the sign below): one draw
    atlas() {
        if (this.atlasCv) return;
        this.atlasCv = cv(1024, () => {}, 512);
        this.atlasTex = texFrom(this.atlasCv);
        this.atlasMat = new T.MeshBasicMaterial({ map: this.atlasTex, transparent: true });
    }
    atlasMesh() {
        // a plane showing the canvas region (x0, y0, w, h) (canvas pixels, y down)
        const region = (g, x0, y0, w, h) => {
            const uv = g.attributes.uv;
            for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * w) / 1024, 1 - (y0 + (1 - uv.getY(i)) * h) / 512);
            return g;
        };
        const g1 = region(new T.PlaneGeometry(28, 7), 0, 0, 1024, 256).translate(0, this.floors * FLOOR_H + SLAB + 4.2, D2 + 0.25);
        const g2 = region(new T.PlaneGeometry(14, 3.5), 0, 0, 1024, 256).translate(0, SLAB + DOOR_H + 4.2, D2 + 0.3);
        const g3 = region(new T.PlaneGeometry(7.8, 3.05), 0, 256, 640, 250).translate(SIGN.x, 5.2, SIGN.z + 0.27);
        const m = new T.Mesh(mergeGeometries([g1, g2, g3]), this.atlasMat);
        m.renderOrder = 3;
        this.group.add(m); this.meshes.push(m);
    }
    // the sign outside: "Upgrade Floor $30,000"
    signFace(rebuild) {
        const max = this.floors >= MAX_FLOORS, price = max ? 0 : FLOORS[this.floors].price;
        const key = this.floors + '|' + this.mine + '|' + this.name;
        if (!rebuild && key === this.signKey) return;
        this.signKey = key;
        this.atlas();
        const x = this.atlasCv.getContext('2d'), W = 512, H = 200;
        x.save(); x.translate(0, 256); x.scale(1.25, 1.25);
        x.fillStyle = '#f4e4c4'; x.fillRect(0, 0, W, H);
        x.strokeStyle = '#8a5a2a'; x.lineWidth = 10; x.strokeRect(5, 5, W - 10, H - 10);
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillStyle = '#4a2a10';
        fitFont(x, max ? '🏆 Tallest it gets!' : 'Upgrade Floor', W - 40, 54, 900, 'Fredoka, sans-serif', 0);
        x.fillText(max ? '🏆 Tallest it gets!' : 'Upgrade Floor', W / 2, 62);
        if (!max) {
            x.fillStyle = '#2ac83a'; x.beginPath(); x.roundRect(80, 106, W - 160, 70, 18); x.fill();
            x.fillStyle = '#ffffff'; fitFont(x, money(price), W - 200, 50, 900, 'Fredoka, sans-serif', 0);
            x.fillText(money(price), W / 2, 142);
        }
        x.restore();
        this.atlasTex.needsUpdate = true;
    }
    // the FRUITS crates: a stack that grows with the Cash in it
    setCrate(v) {
        this.crate = v;
        const n = crateCount(v);
        if (n !== this.crateN) {
            this.crateN = n;
            if (this.crateMesh) { this.group.remove(this.crateMesh); this.crateMesh = null; }
            if (n > 0) {
                this.crateMesh = new T.Mesh(crateGeo(n), crateMat);
                this.crateMesh.castShadow = true; this.crateMesh.receiveShadow = true;
                this.crateMesh.position.set(CRATE.x, 0.5, CRATE.z);
                this.group.add(this.crateMesh);
                this.crateMesh.updateMatrixWorld(true);
            }
        }
        const key = n > 0 ? money(v) : '';
        if (key !== this.labelKey) {
            this.labelKey = key;
            if (!this.label) {
                const w = toWorld(this.i, CRATE.x, CRATE.z);
                this.label = billboard([{ t: ' ', c: '#7dff6b', s: '#0a3a10', px: 80 }], 7, 512, new V3(w.x, 4, w.z));
                this.label.renderOrder = 9;
            }
            this.label.visible = n > 0;
            if (n > 0) { this.label.userData.set([{ t: key, c: '#7dff6b', s: '#0a3a10', px: 80 }]); this.label.position.y = 0.5 + n * CRATE_H + 2.6; }
        }
    }
}
export const CRATE_H = 2.05;
export function crateCount(v) { return v <= 0 ? 0 : Math.max(1, Math.min(14, 1 + Math.floor(Math.log10(Math.max(1, v)) * 1.3))); }
const crateGeos = new Map();
export function crateGeo(n) {
    let g = crateGeos.get(n);
    if (g) return g;
    const k = new Kit(), R = (i) => Math.sin(i * 12.9898) * 0.5;
    for (let i = 0; i < n; i++) {
        const ry = R(i + 1) * 0.35, ox = R(i + 7) * 0.25, oz = R(i + 3) * 0.25;
        k.box(ox, i * CRATE_H + CRATE_H / 2, oz, 3.4, CRATE_H - 0.05, 2.8, 0xffffff, { ry, uv: [0, 0, 1, 1] });
    }
    g = k.geometry();
    crateGeos.set(n, g);
    return g;
}
export { crateMat };

// =====================================================================================
export const plots = [];
for (let i = 0; i < PLOTS; i++) plots.push(new Plot(i));
let myPlot = -1;
export function setMyPlot(i) {
    myPlot = i;
    for (const p of plots) { const was = p.mine; p.mine = p.i === i; if (was !== p.mine && p.floors) p.build(p.floors); }
}
export const getMyPlot = () => myPlot;
// the room state's plot changed (owner, name, floors, crates, upgrades)
export function syncPlot(i, st, animate) {
    const p = plots[i];
    const floors = Math.max(1, st.floors | 0), name = st.owner ? st.name : '';
    const rebuild = floors !== p.floors;
    p.name = name; p.owner = st.owner || null; p.ups = st.ups || '';
    if (rebuild) {
        if (animate && p.floors && floors > p.floors) { if (p.pendingFloor !== floors) { p.pendingFloor = floors; floorRise(p, floors); } if (st.crate !== p.crate) p.setCrate(st.crate || 0); return; }
        p.build(floors);
    } else { p.nameBoard(false); p.signFace(false); p.drawBoards(false); }
    if (st.crate !== p.crate) p.setCrate(st.crate || 0);
}
// a new floor: a glowing block rises where it will be, then the greenhouse grows into it
const riseMat = new T.MeshBasicMaterial({ color: 0x9affb8, transparent: true, opacity: 0.35, depthWrite: false });
export let onFloorRise = null;
export function setOnFloorRise(fn) { onFloorRise = fn; }
function floorRise(p, floors) {
    const m = new T.Mesh(new T.BoxGeometry(PLOT_W, FLOOR_H, PLOT_D), riseMat);
    m.position.set(0, (floors - 1) * FLOOR_H + FLOOR_H / 2, 0);
    m.scale.y = 0.01;
    p.group.add(m);
    if (onFloorRise) onFloorRise(p, floors);
    const t0 = performance.now();
    const step = () => {
        const k = Math.min(1, (performance.now() - t0) / 1300);
        m.scale.y = Math.max(0.01, 1 - Math.pow(1 - k, 3));
        m.position.y = (floors - 1) * FLOOR_H + FLOOR_H * m.scale.y / 2;
        if (k < 1) requestAnimationFrame(step);
        else { p.group.remove(m); m.geometry.dispose(); p.pendingFloor = 0; p.build(floors); }
    };
    requestAnimationFrame(step);
}
export function buildPlots() { for (const p of plots) if (!p.floors) p.build(1); for (const p of plots) p.setCrate(0); }

// ----- the prompts of your own greenhouse (positions worked out once: no allocations per frame) -----
export function addPlotPrompts() {
    if (myPlot < 0) return;
    const P = () => plots[myPlot];
    const at = (lx, lz, y) => { const w = toWorld(myPlot, lx, lz); return new V3(w.x, y, w.z); };
    prompts.push({ pos: at(CRATE.x, CRATE.z, 2), r: 9, show: () => P().crate > 0, label: () => 'Grab the crates (' + money(P().crate) + ')', act: () => actions.collect && actions.collect() });
    prompts.push({ pos: at(SIGN.x, SIGN.z, 2), r: 8, label: () => (P().floors >= MAX_FLOORS ? 'Floors' : 'Upgrade Floor (' + money(FLOORS[P().floors].price) + ')'), act: () => actions.openFloors && actions.openFloors() });
    for (let f = 0; f < MAX_FLOORS; f++) {
        prompts.push({ pos: at(BOARD.x, BOARD.z + 4, floorY(f) + 1), r: 9, show: () => f < P().floors, label: () => 'Floor ' + (f + 1) + ' Upgrades', act: () => actions.openUpgrades && actions.openUpgrades(f) });
    }
}
// which lift pad (if any) the player stands on: { plot, floor, up }
export function liftAt(pos) {
    for (const p of plots) {
        const dx = pos.x - p.f.cx, dz = pos.z - p.f.cz;
        if (Math.abs(dx) > W2 + 2 || Math.abs(dz) > D2 + 2) continue;
        const lx = dx * p.f.cos - dz * p.f.sin, lz = dx * p.f.sin + dz * p.f.cos;
        const f = Math.max(0, Math.round((pos.y - SLAB) / FLOOR_H)), floors = Math.max(p.floors, p.pendingFloor || 0);
        if (Math.abs(pos.y - floorY(f)) > 0.6 || f >= floors) continue;
        if ((lx - LIFT_UP.x) ** 2 + (lz - LIFT_UP.z) ** 2 < LIFT_UP.r ** 2) return { plot: p.i, floor: f, up: true, top: f >= floors - 1 };
        if (f > 0 && (lx - LIFT_DOWN.x) ** 2 + (lz - LIFT_DOWN.z) ** 2 < LIFT_DOWN.r ** 2) return { plot: p.i, floor: f, up: false };
    }
    return null;
}
void IN_X; void IN_Z; void sharedTex; void fmt;
