// Where everything stands, shared by the client and the server.
// The market is in the middle (0, 0). Eight greenhouse plots stand round it, two on each side of a
// square, their doors facing the market across the ring road (square: every wall is lined up with
// the world's axes, so the collision boxes fit them exactly); brick paths lead from each door to the
// market's round counter (the Seed Shop and the SELL counter). The other stalls stand on the lawn
// between the paths.
import { CFG } from './config.js';

export const PLOTS = 8;
export const PLOT_R = 146;              // plot centre: distance from the middle (across)
export const PLOT_OFF = 52;             // ...and sideways (two plots per side, a garden strip between)
export const PLOT_W = 72, PLOT_D = 58;  // outer size (x across, z deep); the door is at local +z
export const FLOOR_H = 20;              // height of one floor
export const SLAB = 1;                  // floor slab thickness
export const PLAZA_R = 96;              // the lawn round the market (a square, half-size)
export const ROAD_R = 112;              // the ring road runs from PLAZA_R to here (square)
export const MARKET_R = 16;             // the market's round counter
export const COUNTER_R = 20;            // ...and how far out its counter top reaches
export const DOOR_W = 16, DOOR_H = 13;

// the greenhouse interior (local): walls 1 thick inside the outer size
export const IN_X = PLOT_W / 2 - 1, IN_Z = PLOT_D / 2 - 1;
// where plants may go (local): clear of the door walkway, the lift pads and the upgrade board
export const PLANT_AREA = { x0: -31, x1: 31, z0: -23, z1: 15 };
export const LIFT_UP = { x: 28, z: 22, r: 3.4 };
export const LIFT_DOWN = { x: -28, z: 22, r: 3.4 };
export const BOARD = { x: 0, z: -IN_Z + 0.6 };     // the floor upgrade board on the back wall
export const CRATE = { x: 20, z: 40 };              // the FRUITS crates outside, right of the door
export const SIGN = { x: -20, z: 39 };              // the "Upgrade Floor" sign, left of the door
export const PLOT_SPAWN = { x: 0, z: 47 };          // you appear in front of your own door

// side 0 north (doors face south), 1 east, 2 south, 3 west; two plots per side
const SIDES = [
    { yaw: Math.PI, c: (o) => [o, PLOT_R] },
    { yaw: -Math.PI / 2, c: (o) => [PLOT_R, -o] },
    { yaw: 0, c: (o) => [-o, -PLOT_R] },
    { yaw: Math.PI / 2, c: (o) => [-PLOT_R, o] },
];
export function plotFrame(i) {
    const side = SIDES[i >> 1], o = (i & 1 ? 1 : -1) * PLOT_OFF, [cx, cz] = side.c(o), yaw = side.yaw;
    // exact quarter turns (no 6e-17 noise)
    return { i, yaw, cx, cz, cos: Math.round(Math.cos(yaw)), sin: Math.round(Math.sin(yaw)) };
}
export const FRAMES = Array.from({ length: PLOTS }, (_, i) => plotFrame(i));
// local (x, z) of plot i -> world {x, z} (the same turn three.js gives a group with rotation.y = yaw)
export function toWorld(i, lx, lz) {
    const f = FRAMES[i];
    return { x: f.cx + lx * f.cos + lz * f.sin, z: f.cz - lx * f.sin + lz * f.cos };
}
export function toLocal(i, wx, wz) {
    const f = FRAMES[i], dx = wx - f.cx, dz = wz - f.cz;
    return { x: dx * f.cos - dz * f.sin, z: dx * f.sin + dz * f.cos };
}
// the floor (0-based) whose slab top is at about height y, and that slab's top
export const floorY = (f) => f * FLOOR_H + SLAB;
export const floorAt = (y) => Math.max(0, Math.floor((y - SLAB + 2) / FLOOR_H));
// which plot (if any) a world point is inside
export function plotAt(wx, wz) {
    for (let i = 0; i < PLOTS; i++) {
        const l = toLocal(i, wx, wz);
        if (Math.abs(l.x) <= PLOT_W / 2 && Math.abs(l.z) <= PLOT_D / 2) return i;
    }
    return -1;
}
export const inPlantArea = (lx, lz, r) => lx - r >= PLANT_AREA.x0 && lx + r <= PLANT_AREA.x1 && lz - r >= PLANT_AREA.z0 && lz + r <= PLANT_AREA.z1;
// Can a plant of footprint r go at local (x, z) on floor f? plants: [{ f, x, z, r }]
export function canPlace(plants, f, x, z, r, skip) {
    if (!inPlantArea(x, z, r)) return 'Too close to the wall';
    let n = 0;
    for (const p of plants) {
        if (p.f !== f || p === skip) continue;
        n++;
        if ((p.x - x) ** 2 + (p.z - z) ** 2 < (p.r + r - 0.4) ** 2) return 'Too close to another plant';
    }
    if (n >= CFG.floorCap) return 'This floor is full (' + CFG.floorCap + ' plants)';
    return '';
}
// snap a planting spot to a half-stud grid (tidy rows)
export const snap = (v) => Math.round(v * 2) / 2;

// ----- the market and the stalls (world) -----
// The stalls stand on the lawn between the brick paths (at the gaps between plots: angles k * 45°)
const at = (deg, r) => ({ x: Math.round(Math.sin(deg * Math.PI / 180) * r * 100) / 100, z: Math.round(Math.cos(deg * Math.PI / 180) * r * 100) / 100, ry: deg * Math.PI / 180 + Math.PI });
export const SPOTS = {
    market: { x: 0, z: 0 },
    pets: at(0, 76),        // the Egg Shop (north)
    wheel: at(45, 92),      // the Beanstalk Wheel
    boards: at(90, 78),     // Best Players: trophy and leaderboards (east)
    quests: at(135, 92),    // the Daily Quests board
    beanstalk: at(180, 74), // the Giant Beanstalk event (south)
    gems: at(225, 92),      // the Gem Shop
    tree: at(270, 80),      // the big cherry blossom tree (west)
    spooky: at(315, 92),    // the Halloween pumpkin patch
};
// fountains on the lawn between the market and the corner stalls
export const FOUNTAINS = [45, 135, 225, 315].map((d) => at(d, 50));
// The Giant Beanstalk: leaf platforms spiralling up a stalk; the cloud at the top pays a Magic Bean
export const BEAN = {
    // a jump rises about 6.4 studs: each leaf is 5.2 higher than the last
    x: SPOTS.beanstalk.x, z: SPOTS.beanstalk.z, stalkR: 3.2, leafR: 9, steps: 30, rise: 5.2, turn: 0.8, leaf: 8,
};
export function beanLeaves() {
    const out = [];
    for (let k = 0; k < BEAN.steps; k++) {
        const a = k * BEAN.turn;
        out.push({ x: BEAN.x + Math.sin(a) * BEAN.leafR, z: BEAN.z + Math.cos(a) * BEAN.leafR, y: 5 + k * BEAN.rise, a });
    }
    return out;
}
export const BEAN_TOP = { x: BEAN.x, z: BEAN.z, y: 5 + BEAN.steps * BEAN.rise + 2 };

export const nearMarket = (x, z, extra) => x * x + z * z < (CFG.sellReach + (extra || 0)) ** 2;
