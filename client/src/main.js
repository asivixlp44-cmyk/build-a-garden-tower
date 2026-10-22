import { Client } from '@colyseus/sdk';
import {
    T, V3, $, canvas, scene, camera, sun, renderer, solids, prompts, tickers, billboard, buildRig, animRig, airPose,
    floatText, updateEffects, lerpAngle, updateSky, SUN_DIRECTION, setMood,
} from './engine.js';
import { S, actions, net } from './state.js';
import { initAudio, resumeAudio, audioDebug, startMusic, sfx, sfxSome, step as surfStep, setVolume, audioSuspended, setMusicIntensity } from './audio.js';
import * as BX from './bloxity.js';
import { createAvatar, loadBase, packAvatar, unpackAvatar } from './avatar.js';
import { pad, pollGamepad, rumble, onGamepadConnection } from './gamepad.js';
import {
    render, updateFx, dust, sparkleColumn, ring, fireworks, setQuality, getQuality, autoQualityAllowed, confetti, updateAmbient, setResScale, getResScale,
    fxWarmGroup, fxShowAll, leafPuff, harvestBurst, cashBurst, ripeSparkle, petal,
} from './fx.js';
import { buildWorld, warmUp, renderBoards, setGuide, guideGoal, sellRingOn, drawQuests, setBeanstalk, beanstalkUp, drawBeanSign, spinWorldWheel, petalAt } from './world.js';
import { plots, buildPlots, syncPlot, setMyPlot, addPlotPrompts, liftAt, crateGeo, crateMat, crateCount, CRATE_H, setOnFloorRise } from './plots.js';
import {
    PU, setEpoch, EPOCH, setPlant, removePlant, getPlant, plantsOf, plantWorld, flushPlants, plantWarmGroup, showGhost, hideGhost, flyFruit, flyWarm, plantHeight,
} from './plants.js';
import { PetPack, petWarmGroup } from './pets.js';
import {
    promptEl, promptTxtEl, animateCounters, bumpCash, bumpGems, updateHud, renderHotbar, seedKeys, toast, questPop, bigText, flash, notEnough,
    openModal, closeModal, refreshModal, modalIs, codeResult, openDailyOnJoin, refreshDaily, closeTop, anyPopup, openDaily, showHatch, spinWheelTo,
    setPlantTag, setPlaceBar, askConfirm, myFloors, buyFloor, stockLeft, canBuyAny,
} from './ui.js';
import {
    CFG, SPECIES, SHOP_SEEDS, speciesById, MUTATIONS, TUTORIAL, GOALS, KITS, SKINS, FLOORS, MAX_FLOORS, eventAt, restockWindow, fmt, money, clamp, petById,
} from '../../shared/config.js';
import {
    FRAMES, PLOT_SPAWN, PLOT_W, PLOT_D, toWorld, toLocal, floorY, floorAt, canPlace, snap, CRATE, LIFT_UP, LIFT_DOWN, PLANT_AREA, BOARD,
    SPOTS, BEAN_TOP, PLAZA_R, ROAD_R, COUNTER_R, FLOOR_H,
} from '../../shared/garden.js';

const T0 = performance.now();
const gt = () => (performance.now() - T0) / 1000;
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hexOf = (c) => '#' + c.toString(16).padStart(6, '0');

// =====================================================================================
// Local player
// =====================================================================================
const HW = 1, PH = 5, STEP = 1.25, PIVOT = 2.6;
const P = {
    pos: new V3(0, 0, 36), vel: new V3(), hv: new V3(), onGround: true, ground: null, facing: Math.PI, moving: false,
    animPhase: 0, airTime: 0, peakY: 0, lastStepN: 0, squash: 1, squashV: 0, jumpPress: -9, coyote: 0, lean: 0,
};
let shake = 0;
function addShake(a) { if (!reduceMotion) shake = Math.min(1.1, shake + a); }
let rig = null;
let myPlot = -1;

// ----- a character: rig (feet, yaw) -> pivot (hips) -> body (blocky or Bloxity); crates over the head -----
function buildCharacter(kit, skin) {
    const g = new T.Group();
    const pivot = new T.Group(); pivot.position.y = PIVOT; g.add(pivot);
    const k = KITS[kit % KITS.length];
    const body = buildRig({ ...k, skin: SKINS[skin % SKINS.length] });
    body.position.y = -PIVOT;
    pivot.add(body);
    g.userData = { pivot, body, baseBody: body, blox: null, crates: null, crateN: 0 };
    return g;
}
// the stack of crates you're carrying, held up over your head (the reference's)
function setCarryStack(g, value) {
    const u = g.userData, n = Math.min(10, crateCount(value));
    if (n === u.crateN) return;
    u.crateN = n;
    if (u.crates) { u.pivot.remove(u.crates); u.crates = null; }
    if (n > 0) {
        u.crates = new T.Mesh(crateGeo(n), crateMat);
        u.crates.scale.setScalar(0.62);
        u.crates.position.set(0, 5.6 - PIVOT, 0.2);
        u.crates.castShadow = true;
        u.pivot.add(u.crates);
    }
}
function dressRig(group, avatar) {
    const u = group.userData, body = u.baseBody;
    body.children.forEach((c) => { c.visible = false; });
    body.add(avatar.root);
    u.blox = avatar;
}
let localAvatar = null, localAvatarReq = 0;
async function setupLocalAvatar() {
    const req = ++localAvatarReq;
    const a = await createAvatar(BX.currentAvatar(), BX.getSkinTextureUrl());
    if (!a) return;
    if (req !== localAvatarReq || !rig) { a.dispose(); return; }
    if (localAvatar) localAvatar.dispose();
    localAvatar = a;
    dressRig(rig, a);
}
function syncMyAvatar() {
    const av = BX.currentAvatar();
    if (localAvatar && av) { localAvatar.setProportions(av.proportions); localAvatar.setEquipped(av, BX.getSkinTextureUrl()); }
    net.send('avatar', { av: packAvatar(av) });
}
async function playEmoteOn(avatar, id) {
    if (!avatar) return;
    const cat = await BX.loadEmotes();
    const e = cat.get(id);
    if (e && e.clip) avatar.playEmote(e.clip);
}
function chatBubble(group, text) {
    if (!group) return;
    if (group.userData.bubbleLbl) { group.remove(group.userData.bubbleLbl); group.userData.bubbleLbl.material.map.dispose(); }
    const b = billboard([{ t: '💬 ' + text, c: '#ffffff', s: '#10203a', px: 44 }], 9, 1024, new V3(0, 11, 0), group);
    group.userData.bubbleLbl = b;
    setTimeout(() => { if (group.userData.bubbleLbl === b) { group.remove(b); b.material.map.dispose(); group.userData.bubbleLbl = null; } }, 5000);
}
const nameLines = (name, floors) => [{ t: name || ' ', c: '#ffffff', s: '#10203a', px: 60 }, ...(floors > 1 ? [{ t: '🏢 ' + floors + ' floors', c: '#9affb8', s: '#10203a', px: 38 }] : [])];
let myPets = new PetPack();
function buildPlayer(kit, skin) {
    if (rig) scene.remove(rig);
    rig = buildCharacter(kit, skin);
    scene.add(rig);
    rig.position.copy(P.pos);
    localAvatar = null;
    setupLocalAvatar();
}

// =====================================================================================
// Collision: the boxes near you (greenhouse floors and walls, stalls, the beanstalk) and the ground
// =====================================================================================
// (camOnly boxes stop only the camera: the greenhouse doorways, so it stays inside with you)
let nearBoxes = [], nearCam = [], nearT = -9;
function refreshNear() {
    nearBoxes = []; nearCam = [];
    for (const c of solids) {
        const cx = (c.min.x + c.max.x) / 2, cz = (c.min.z + c.max.z) / 2, r = Math.max(c.max.x - c.min.x, c.max.z - c.min.z) / 2 + 30;
        if ((cx - P.pos.x) ** 2 + (cz - P.pos.z) ** 2 < r * r) (c.camOnly ? nearCam : nearBoxes).push(c);
    }
}
const GRASS = { mat: 'grass' }, TILE = { mat: 'tile' };
function groundMat() {
    const ax = Math.abs(P.pos.x), az = Math.abs(P.pos.z), m = Math.max(ax, az);
    return (m > PLAZA_R && m < ROAD_R) || P.pos.x ** 2 + P.pos.z ** 2 < (COUNTER_R + 7) ** 2 ? TILE : GRASS;
}
const overlaps = (c, x, y, z) => c.max.x > x - HW && c.min.x < x + HW && c.max.y > y && c.min.y < y + PH && c.max.z > z - HW && c.min.z < z + HW;
function freeAt(x, y, z) {
    for (const c of nearBoxes) if (overlaps(c, x, y, z)) return false;
    return true;
}
function moveAxis(axis, d) {
    if (d === 0) return;
    const p = P.pos;
    p[axis] += d;
    for (const c of nearBoxes) {
        if (!overlaps(c, p.x, p.y, p.z)) continue;
        if (axis === 'y') {
            if (d < 0) { if (c.max.y - p.y > Math.max(STEP, -d + 0.05)) continue; p.y = c.max.y; P.vel.y = Math.max(0, P.vel.y); P.onGround = true; P.ground = c; }
            else { if (p.y + PH - c.min.y > d + 0.05) continue; p.y = c.min.y - PH - 1e-4; if (P.vel.y > 0) P.vel.y = 0; }
        } else {
            const rise = c.max.y - p.y;
            if (rise > 0 && rise <= STEP && (P.onGround || P.vel.y <= 0) && freeAt(p.x, c.max.y + 0.01, p.z)) { p.y = c.max.y + 0.001; continue; }
            if (d > 0) p[axis] = c.min[axis] - HW - 1e-4; else p[axis] = c.max[axis] + HW + 1e-4;
        }
    }
    if (axis === 'y' && p.y <= 0) { p.y = 0; P.vel.y = Math.max(0, P.vel.y); P.onGround = true; P.ground = groundMat(); }
}
function groundProbe(maxDrop) {
    const p = P.pos;
    let best = -Infinity, bs = null;
    for (const c of nearBoxes) {
        if (c.max.x <= p.x - HW || c.min.x >= p.x + HW || c.max.z <= p.z - HW || c.min.z >= p.z + HW) continue;
        if (c.max.y <= p.y + 0.01 && c.max.y >= p.y - maxDrop && c.max.y > best) { best = c.max.y; bs = c; }
    }
    if (!bs && p.y - maxDrop <= 0) { best = 0; bs = groundMat(); }
    if (bs) { p.y = best; P.onGround = true; P.ground = bs; P.vel.y = Math.max(0, P.vel.y); }
    return !!bs;
}
// Ray against the boxes near the player (the camera); glass walls and thin posts don't stop it
const AXES = ['x', 'y', 'z'];
function rayHit(o, d, maxT) {
    return rayList(nearCam, o, d, rayList(nearBoxes, o, d, maxT));
}
function rayList(list, o, d, maxT) {
    let best = maxT;
    for (const c of list) {
        if (c.noCam || (c.max.x - c.min.x < 1.5 && c.max.z - c.min.z < 1.5)) continue;
        let t0 = 0, t1 = best, miss = false;
        for (const a of AXES) {
            if (Math.abs(d[a]) < 1e-9) { if (o[a] < c.min[a] || o[a] > c.max[a]) { miss = true; break; } continue; }
            let ta = (c.min[a] - o[a]) / d[a], tb = (c.max[a] - o[a]) / d[a];
            if (ta > tb) { const q = ta; ta = tb; tb = q; }
            t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
            if (t0 > t1) { miss = true; break; }
        }
        if (!miss && t0 > 0 && t0 < best) best = t0;
    }
    return best;
}

function teleport(pos, yaw) {
    P.pos.copy(pos); P.vel.set(0, 0, 0); P.hv.set(0, 0, 0);
    if (yaw !== undefined) { P.facing = yaw; cam.yaw = yaw + Math.PI; }
    P.peakY = pos.y; P.airTime = 0;
    refreshNear(); nearT = clockT;
    liftT = 0; liftLock = true;
    sendMove(true);
}
function spawnPos() {
    if (myPlot < 0) return { pos: new V3((Math.random() - 0.5) * 8, 0, COUNTER_R + 10), yaw: 0 };
    const w = toWorld(myPlot, PLOT_SPAWN.x + (Math.random() - 0.5) * 6, PLOT_SPAWN.z);
    return { pos: new V3(w.x, 0, w.z), yaw: FRAMES[myPlot].yaw };
}
function respawn() { const s = spawnPos(); teleport(s.pos, s.yaw); }
// inside your own greenhouse? which floor?
function myLocal() { return myPlot >= 0 ? toLocal(myPlot, P.pos.x, P.pos.z) : null; }
function inMyPlot() {
    const l = myLocal();
    return !!l && Math.abs(l.x) < PLOT_W / 2 && Math.abs(l.z) < PLOT_D / 2;
}
actions.onMyPlot = () => inMyPlot();

// =====================================================================================
// Camera: third person, orbiting the player (drag to turn it, wheel / pinch to zoom)
// =====================================================================================
const cam = { yaw: Math.PI * 2, pitch: 0.32, dist: isTouch ? 24 : 22 };
let camD = 19, camSens = 1;
const dirV = new V3(), pivotV = new V3(), backV = new V3(), camPos = new V3(), lookV = new V3();
let pivotY = 5;
function lookDir(out) { const p = cam.pitch, cp = Math.cos(p); return out.set(-Math.sin(cam.yaw) * cp, -Math.sin(p), -Math.cos(cam.yaw) * cp); }
// The sun's shadow camera follows you in steps of one shadow-map texel
const LZD = SUN_DIRECTION.clone().normalize(), LX = new V3(0, 1, 0).cross(LZD).normalize(), LY = LZD.clone().cross(LX), snapV = new V3();
function snapShadow(p) {
    const c = sun.shadow.camera, texel = (c.right - c.left) / sun.shadow.mapSize.x;
    const a = Math.round(p.dot(LX) / texel) * texel, b = Math.round(p.dot(LY) / texel) * texel;
    snapV.copy(LX).multiplyScalar(a).addScaledVector(LY, b).addScaledVector(LZD, p.dot(LZD));
    sun.target.position.copy(snapV);
    sun.position.copy(snapV).addScaledVector(LZD, 200);
}
let baseFov = camera.fov, ambCol = new T.Color(0xffffff), ambDir = 0.5, ambSnow = false, camOverride = null;
function updateCamera(dt) {
    const t = gt();
    lookDir(dirV);
    pivotY += (P.pos.y + 5.2 - pivotY) * (1 - Math.exp(-dt * 12));
    if (Math.abs(P.pos.y + 5.2 - pivotY) > 14) pivotY = P.pos.y + 5.2;
    pivotV.set(P.pos.x, pivotY, P.pos.z);
    backV.copy(dirV).negate();
    let lim = cam.dist;
    lim = Math.min(lim, rayHit(pivotV, backV, lim + 1) - 0.8);
    if (backV.y < -1e-3) lim = Math.min(lim, (0.7 - pivotV.y) / backV.y);
    lim = Math.max(1.5, lim);
    camD = lim < camD ? lim : camD + (lim - camD) * (1 - Math.exp(-dt * 4));
    camPos.copy(pivotV).addScaledVector(backV, camD);
    camera.position.copy(camPos);
    camera.lookAt(lookV.copy(camPos).addScaledVector(dirV, 30));
    if (camOverride) { camera.position.copy(camOverride[0]); camera.lookAt(camOverride[1]); }
    if (shake > 0.001) {
        const s = shake * shake * 0.8;
        camera.position.x += (Math.random() * 2 - 1) * s;
        camera.position.y += (Math.random() * 2 - 1) * s;
        shake = Math.max(0, shake - dt * 2.4);
    }
    const want = (innerWidth < innerHeight ? 80 : 70) + (sprinting ? 6 : 0);
    baseFov += (want - baseFov) * Math.min(1, dt * 6);
    if (Math.abs(camera.fov - baseFov) > 0.01) { camera.fov = baseFov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    snapShadow(P.pos);
    updateSky(camera.position, t, dt);
    updateAmbient(camera.position, t, { color: ambCol.getHex(), dir: ambDir, snow: ambSnow });
    if (rig) rig.visible = camD > 2.2;
}

// =====================================================================================
// Input: drag to look, click / tap for the seed you're planting; touch; controller
// =====================================================================================
const keys = {};
const touchMove = { x: 0, y: 0 };
let running = false;
function pressJump() { P.jumpPress = clockT; }
actions.onPanel = () => { for (const k in keys) keys[k] = false; };
addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) { if (e.key === 'Enter') e.target.blur(); return; }
    if (e.code === 'Space' && !e.repeat && running && !anyPopup()) pressJump();
    keys[e.code] = true;
    if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
    if (!running || e.repeat) return;
    if (e.code === 'Escape') { if (closeTop()) return; if (S.seedSel) { actions.selectSeed(''); return; } if (BX.isEmbedded()) BX.showPortalMenu(); return; }
    if (anyPopup()) return;
    if (e.code === 'KeyE') { if (activePrompt) usePrompt(); else if (S.seedSel && S.seedSel !== 'shovel' && inMyPlot()) confirmPlace(); }
    if (e.code === 'KeyR' && S.seedSel && S.seedSel !== 'shovel') { placeRot = (placeRot + 1) % 8; sfx('click'); }
    if (e.code === 'KeyQ') actions.selectSeed('');
    if (/^Digit[1-9]$/.test(e.code)) {
        const n = +e.code.slice(5), list = ['shovel', ...seedKeys()];
        if (list[n - 1]) actions.selectSeed(S.seedSel === list[n - 1] ? '' : list[n - 1]);
    }
    if (e.code === 'KeyF') { if (modalIs('floors')) closeModal(); else openModal('floors'); }
    if (e.code === 'KeyP') { if (modalIs('pets')) closeModal(); else openModal('pets'); }
    if (e.code === 'KeyI') { if (modalIs('index')) closeModal(); else openModal('index'); }
    if (e.code === 'KeyG') actions.travel('home');
    if (e.code === 'KeyM') actions.travel('market');
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
// drags turn the camera; a short click / tap without moving is an action (plant, dig, aim the seed)
const drags = new Map();
let mouseX = -1, mouseY = -1, pinchD = 0;
canvas.addEventListener('pointerdown', (e) => {
    canvas.focus();
    if (!running || anyPopup()) return;
    canvas.setPointerCapture(e.pointerId);
    drags.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false, mouse: e.pointerType === 'mouse', btn: e.button });
    if (drags.size === 2) { const [a, b] = [...drags.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); }
});
canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') { mouseX = e.clientX; mouseY = e.clientY; }
    const d = drags.get(e.pointerId);
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 8) d.moved = true;
    if (drags.size === 2) {
        const [a, b] = [...drags.values()], nd = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchD) cam.dist = clamp(cam.dist * pinchD / Math.max(20, nd), 8, 55);
        pinchD = nd;
    } else if (d.moved) {
        const k = (e.pointerType === 'touch' ? 0.0068 : 0.0045) * camSens;
        cam.yaw -= (e.clientX - d.x) * k;
        cam.pitch = clamp(cam.pitch + (e.clientY - d.y) * k, -0.9, 1.35);
    }
    d.x = e.clientX; d.y = e.clientY;
});
const endDrag = (e) => {
    const d = drags.get(e.pointerId);
    drags.delete(e.pointerId);
    if (drags.size < 2) pinchD = 0;
    if (d && e.type === 'pointerup' && !d.moved && performance.now() - d.t0 < 400 && running && !anyPopup()) tapAt(e.clientX, e.clientY, d.mouse && d.btn === 0);
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist + Math.sign(e.deltaY) * 2, 8, 55); e.preventDefault(); }, { passive: false });
(function touchControls() {
    const stick = $('#stick'), knob = $('#knob');
    let id = null;
    const set = (e) => {
        const r = stick.getBoundingClientRect();
        let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const max = r.width / 2, l = Math.hypot(dx, dy);
        if (l > max) { dx *= max / l; dy *= max / l; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        touchMove.x = dx / max; touchMove.y = dy / max;
    };
    stick.addEventListener('pointerdown', (e) => { id = e.pointerId; stick.setPointerCapture(id); set(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; touchMove.x = touchMove.y = 0; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    $('#jumpBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); pressJump(); });
    $('#plantBtn').addEventListener('click', () => confirmPlace());
    $('#rotBtn').addEventListener('click', () => { placeRot = (placeRot + 1) % 8; });
    $('#cancelBtn').addEventListener('click', () => actions.selectSeed(''));
})();

// Proximity prompts (the market, the stalls, your crates, signs and boards)
let activePrompt = null, promptX = -1, promptY = -1;
const projV = new V3();
function updatePrompt() {
    let best = null, bd = Infinity;
    for (const p of prompts) {
        const pos = p.pos;
        if (Math.abs(pos.y - 2 - P.pos.y) > 7 && !(pos.y < 3 && P.pos.y < 3)) continue;
        const d = Math.hypot(pos.x - P.pos.x, pos.z - P.pos.z);
        if (d < p.r && d < bd && (!p.show || p.show())) { bd = d; best = p; }
    }
    activePrompt = best;
    if (!best || anyPopup()) { promptEl.hidden = true; return; }
    projV.copy(best.pos).setY(best.pos.y + 4).project(camera);
    if (projV.z > 1) { promptEl.hidden = true; return; }
    promptEl.hidden = false;
    const px = Math.round(clamp((projV.x + 1) / 2 * innerWidth, 80, innerWidth - 80)), py = Math.round(clamp((1 - projV.y) / 2 * innerHeight, 90, innerHeight - 120));
    if (px !== promptX || py !== promptY) { promptX = px; promptY = py; promptEl.style.transform = `translate(${px}px, ${py}px) translate(-50%, -110%)`; }
    const txt = best.label();
    if (promptTxtEl.textContent !== txt) promptTxtEl.textContent = txt;
}
function usePrompt() { if (activePrompt) activePrompt.act(); }
promptEl.addEventListener('click', usePrompt);

// Controller: popups first, then gameplay
let padJumpWas = false;
function padButtons() {
    if (pad.jump && !padJumpWas && running && !anyPopup()) pressJump();
    padJumpWas = pad.jump;
    const p = pad.pressed;
    if (!p.size) return;
    if (p.has('B')) { if (closeTop()) return; if (S.seedSel) { actions.selectSeed(''); return; } }
    if (!running || anyPopup()) return;
    if (p.has('X') && activePrompt) usePrompt();
    if (p.has('RT') || p.has('Y')) { if (S.seedSel) confirmPlace(); }
    if (p.has('LB') || p.has('RB')) {
        const list = ['', 'shovel', ...seedKeys()], i = Math.max(0, list.indexOf(S.seedSel));
        actions.selectSeed(list[(i + (p.has('RB') ? 1 : -1) + list.length) % list.length]);
    }
    if (p.has('LT')) placeRot = (placeRot + 1) % 8;
    if (p.has('START')) openModal('floors');
    if (p.has('BACK')) openModal('pets');
    if (p.has('UP')) cam.dist = clamp(cam.dist - 3, 8, 55);
    if (p.has('DOWN')) cam.dist = clamp(cam.dist + 3, 8, 55);
}
onGamepadConnection((g, on) => { if (running) toast(on ? '🎮 Controller connected' : '🎮 Controller disconnected', on ? '#7dff6b' : '#ffb51c'); });

// =====================================================================================
// Planting: pick a seed on the hotbar, a ghost of the plant shows where it will go (green: OK)
// =====================================================================================
let placeRot = 0, placeOk = false, placeWhy = '', tapPoint = null, tapT = -9;
const place = { f: 0, x: 0, z: 0, world: new V3() };
const raycaster = new T.Raycaster(), ndc = new T.Vector2();
// the point on the floor (height y) under the screen point (sx, sy)
function floorPoint(sx, sy, y) {
    ndc.set((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const o = raycaster.ray.origin, d = raycaster.ray.direction;
    if (d.y > -1e-3) return null;
    const t = (y - o.y) / d.y;
    if (t < 0 || t > 160) return null;
    return new V3(o.x + d.x * t, y, o.z + d.z * t);
}
const myPlants = () => (myPlot >= 0 ? plantsOf(myPlot) : []);
const footprint = (p) => ({ f: p.f, x: p.x, z: p.z, r: speciesById[p.sp].r, p });
function updatePlacement(t) {
    const sel = S.seedSel;
    if (!sel || !running || myPlot < 0) { hideGhost(); setPlaceBar(false); return; }
    const f = clamp(floorAt(P.pos.y), 0, myFloors() - 1), y = floorY(f);
    const here = inMyPlot() && Math.abs(P.pos.y - y) < 2;
    if (!here) { hideGhost(); setPlaceBar(true, '👉 Go into your greenhouse to ' + (sel === 'shovel' ? 'dig' : 'plant')); placeOk = false; return; }
    // where: under the mouse (desktop), where you tapped (touch, for a few seconds), or in front of you
    let w = null;
    if (!isTouch && mouseX >= 0 && !drags.size) w = floorPoint(mouseX, mouseY, y);
    if (!w && tapPoint && clockT - tapT < 12 && Math.abs(tapPoint.y - y) < 1) w = tapPoint;
    if (!w) w = new V3(P.pos.x + Math.sin(P.facing) * 6, y, P.pos.z + Math.cos(P.facing) * 6);
    const l = toLocal(myPlot, w.x, w.z);
    if (sel === 'shovel') {
        // the plant nearest that spot
        let best = null, bd = 9;
        for (const p of myPlants()) { if (p.f !== f) continue; const d = (p.x - l.x) ** 2 + (p.z - l.z) ** 2; if (d < bd) { bd = d; best = p; } }
        place.dig = best;
        if (best) { plantWorld(best, place.world); showGhost(best.sp, place.world, FRAMES[myPlot].yaw + best.r * Math.PI / 4, false, t); }
        else hideGhost();
        placeOk = !!best;
        setPlaceBar(true, best ? '🪏 ' + speciesById[best.sp].name : 'Point at a plant to dig it up');
        return;
    }
    const id = sel.split('*')[0], sp = speciesById[id];
    let x = snap(l.x), z = snap(l.z);
    // keep it inside the planting area
    x = clamp(x, PLANT_AREA.x0 + sp.r, PLANT_AREA.x1 - sp.r); z = clamp(z, PLANT_AREA.z0 + sp.r, PLANT_AREA.z1 - sp.r);
    let why = canPlace(myPlants().map(footprint), f, x, z, sp.r);
    // a spot that's taken: the ghost moves to the nearest free one, so planting just works
    if (why === 'Too close to another plant') {
        const free = freeSpotNear(f, x, z, sp.r);
        if (free) { x = free[0]; z = free[1]; why = ''; }
    }
    placeOk = !why; placeWhy = why;
    Object.assign(place, { f, x, z });
    const ww = toWorld(myPlot, x, z);
    place.world.set(ww.x, y, ww.z);
    showGhost(id, place.world, FRAMES[myPlot].yaw + placeRot * Math.PI / 4, placeOk, t);
    setPlaceBar(true, why ? '🚫 ' + why : '');
}
// the free planting spot nearest (x, z) on floor f, or null (remembered while nothing changes)
const freeMemo = { key: '', spot: null };
function freeSpotNear(f, x, z, r) {
    const plants = myPlants(), key = f + ',' + x + ',' + z + ',' + r + ',' + plants.length + ',' + (plants.length ? plants[plants.length - 1].id : '');
    if (key === freeMemo.key) return freeMemo.spot;
    const fp = plants.map(footprint), A = PLANT_AREA;
    let spot = null;
    for (let d = 1; d <= 18 && !spot; d++) {
        const n = 8 + d * 4;
        for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2;
            const cx = clamp(snap(x + Math.cos(a) * d), A.x0 + r, A.x1 - r), cz = clamp(snap(z + Math.sin(a) * d), A.z0 + r, A.z1 - r);
            if (!canPlace(fp, f, cx, cz, r)) { spot = [cx, cz]; break; }
        }
    }
    freeMemo.key = key; freeMemo.spot = spot;
    return spot;
}
function confirmPlace() {
    const sel = S.seedSel;
    if (!sel || myPlot < 0) return;
    if (sel === 'shovel') {
        const p = place.dig;
        if (!p || !placeOk) { sfx('denied'); return; }
        const sp = speciesById[p.sp];
        askConfirm(sp.ic, 'Dig up the ' + sp.name + '?', sp.shop ? 'You get half its price back: ' + money(sp.price * CFG.digRefund) : 'Its seed goes back in your bag', '', '🪏 Dig it up', true, () => net.send('dig', { id: p.id }));
        return;
    }
    if (!placeOk) { sfx('denied'); toast('🚫 ' + (placeWhy || 'Can\'t plant there'), '#ff9a8a'); return; }
    sendMove(true);
    net.send('plant', { k: sel, f: place.f, x: place.x, z: place.z, r: placeRot });
}
function tapAt(sx, sy, leftClick) {
    if (S.seedSel) {
        if (!isTouch && leftClick) { confirmPlace(); return; }
        // touch: move the ghost to where you tapped on your floor
        const f = clamp(floorAt(P.pos.y), 0, myFloors() - 1), p = floorPoint(sx, sy, floorY(f));
        if (p) { tapPoint = p; tapT = clockT; }
    }
}
actions.selectSeed = (k) => {
    if (k && k !== 'shovel' && !(S.seeds[k] > 0)) k = '';
    S.seedSel = k || '';
    tapPoint = null;
    renderHotbar();
    if (k) sfx('equip');
    if (k && k !== 'shovel' && !inMyPlot()) toast('🌱 Go into your greenhouse to plant it!', '#9affb8');
};

// =====================================================================================
// Harvesting: step on a ripe plant; the crates; selling; the lift pads
// =====================================================================================
const pendingHv = new Map();
let harvestT = 0, combo = 0, comboT = -9, collectT = -9, sellT = -9;
function checkHarvest() {
    if (myPlot < 0 || !inMyPlot()) return;
    const f = floorAt(P.pos.y);
    if (Math.abs(P.pos.y - floorY(f)) > 1.6) return;
    const l = myLocal(), now = net.now(), ids = [];
    for (const p of myPlants()) {
        if (p.f !== f || now < p.fa) continue;
        const sp = speciesById[p.sp], r = sp.r + CFG.harvestReach;
        if ((p.x - l.x) ** 2 + (p.z - l.z) ** 2 > r * r) continue;
        const pend = pendingHv.get(p.id);
        if (pend && clockT - pend < 1.5) continue;
        pendingHv.set(p.id, clockT);
        ids.push(p.id);
    }
    if (ids.length) { sendMove(true); net.send('harvest', { ids }); }
}
function crateWorld() { const w = toWorld(myPlot, CRATE.x, CRATE.z); return new V3(w.x, 0.5, w.z); }
function checkCrates() {
    if (myPlot < 0) return;
    const pl = plots[myPlot];
    if (pl.crate > 0 && clockT - collectT > 1) {
        const c = crateWorld();
        if ((c.x - P.pos.x) ** 2 + (c.z - P.pos.z) ** 2 < 4.4 * 4.4 && P.pos.y < 3) { collectT = clockT; actions.collect(); }
    }
    if (S.carry > 0 && clockT - sellT > 1 && P.pos.x ** 2 + P.pos.z ** 2 < (CFG.sellReach - 2) ** 2) { sellT = clockT; actions.sell(); }
}
actions.collect = () => { sendMove(true); net.send('collect'); };
actions.sell = () => { sendMove(true); net.send('sell'); };
actions.spookyInfo = () => toast('🎃 Spooky Pumpkins glow at night! Win one on the Beanstalk Wheel, or try the code HALLOWEEN', '#ffb84a');
actions.guideSell = () => toast('📦 Carry your crates to the SELL counter in the middle of the market!', '#ffe24a');
// the lift pads: stand on one a moment to go up / down a floor
let liftT = 0, liftLock = false;
function checkLift(dt) {
    const L = P.onGround ? liftAt(P.pos) : null;
    if (!L) { liftT = 0; liftLock = false; return; }
    if (liftLock) return;
    liftT += dt;
    if (liftT < 0.35) return;
    liftLock = true;
    if (L.up && L.top) {
        if (L.plot === myPlot) { if (myFloors() < MAX_FLOORS) buyFloor(); }
        else toast('🏢 That\'s the top floor of this garden!', '#ffffff');
        return;
    }
    goToFloor(L.plot, L.up ? L.floor + 1 : L.floor - 1, L.up ? 'up' : 'down');
}
function goToFloor(plot, f, via) {
    const fl = FRAMES[plot];
    const lx = via === 'up' ? LIFT_UP.x - 6 : via === 'down' ? LIFT_DOWN.x + 6 : 0, lz = via ? (via === 'up' ? LIFT_UP.z : LIFT_DOWN.z) : 14;
    const w = toWorld(plot, lx, lz);
    $('#fade').style.opacity = 0.85;
    sfx('lift', via !== 'down');
    setTimeout(() => {
        teleport(new V3(w.x, floorY(f) + 0.05, w.z), fl.yaw + Math.PI);
        $('#fade').style.opacity = 0;
        if (plot === myPlot) { S.floor = f; bigText('FLOOR ' + (f + 1), '#ffffff'); }
        ring(P.pos, 0x9affb8, 6, 0.5);
    }, 160);
}
actions.goFloor = (f) => { if (myPlot >= 0) goToFloor(myPlot, f, ''); };
actions.plantCounts = () => { const c = []; for (const p of myPlants()) c[p.f] = (c[p.f] || 0) + 1; return c; };

// ----- the label over your nearest plant, and ripe plants twinkling -----
const tagV = new V3();
function updatePlantTag() {
    if (myPlot < 0 || !inMyPlot() || anyPopup()) { setPlantTag(null); return; }
    const f = floorAt(P.pos.y), l = myLocal(), now = net.now();
    let best = null, bd = 100;
    for (const p of myPlants()) { if (p.f !== f) continue; const d = (p.x - l.x) ** 2 + (p.z - l.z) ** 2; if (d < bd) { bd = d; best = p; } }
    if (!best) { setPlantTag(null); return; }
    const sp = speciesById[best.sp], mu = MUTATIONS[best.m], grown = now >= best.fs;
    plantWorld(best, tagV); tagV.y += plantHeight(sp.id) + 1;
    tagV.project(camera);
    if (tagV.z > 1) { setPlantTag(null); return; }
    const ready = now >= best.fa, secs = Math.max(0, Math.ceil((best.fa - now) / 1000));
    const name = (grown && mu.name ? mu.ic + ' ' + mu.name + ' ' : '') + sp.ic + ' ' + sp.name;
    setPlantTag({ html: name + '<small>' + (ready ? 'READY! Step on it ✨' : (grown ? '🍎 ripe in ' : '🌱 growing… ') + secs + 's') + '</small>', ready }, (tagV.x + 1) / 2 * innerWidth, (1 - tagV.y) / 2 * innerHeight);
}
const spV = new V3();
let sparkT = 0, ripeCount = 0;
function sparkles(dt) {
    sparkT -= dt;
    if (sparkT > 0) return;
    sparkT = 0.12;
    const now = net.now();
    let n = 0;
    ripeCount = 0;
    for (let i = 0; i < plots.length; i++) {
        const pl = plots[i];
        if (!pl.owner) continue;
        const near = (pl.f.cx - camera.position.x) ** 2 + (pl.f.cz - camera.position.z) ** 2 < 140 * 140;
        if (!near) continue;
        for (const p of plantsOf(i)) {
            const ripe = now >= p.fa;
            if (i === myPlot && ripe) ripeCount++;
            if ((!ripe && !p.m) || Math.random() > (p.m ? 0.12 : 0.05) || n > 8) continue;
            if (p.m && now < p.fs) continue;
            plantWorld(p, spV);
            const sp = speciesById[p.sp];
            spV.y += plantHeight(sp.id) * 0.5;
            ripeSparkle(spV, p.m ? MUTATIONS[p.m].color : sp.look.fruit);
            n++;
        }
    }
}

// =====================================================================================
// The guide: where to go next (the tutorial, crates to sell)
// =====================================================================================
// Every step of the tutorial (and carrying crates) shows the way: shining arrows on the ground from
// you to the goal (out of / into the greenhouse by its door, round its sides, to the lift pad from
// another floor), a glowing arrow and a beam of light over the goal, a pointer at the screen's edge
// when the goal is off screen, and a bouncing arrow on the button to press (the seed to buy, the
// seed on the hotbar, PLANT)
const guideV = new V3(), gPts = Array.from({ length: 8 }, () => new V3()), marketMark = new V3();
let lastRoute = null;
let ripeToastT = 0, ripeCheckT = 0;
function guide() {
    const q = S.q || {}, tut = q.tut < TUTORIAL.length ? TUTORIAL[q.tut].kind : null;
    pointUi(running && myPlot >= 0 ? uiTarget(q, tut) : null);
    if (!running || anyPopup() || myPlot < 0) { setGuide(null); hintTravel(null); return; }
    const hasSeed = seedKeys().length > 0, pl = plots[myPlot];
    const opt = { beam: 70, up: 0 };
    let aim = null;
    // the market: the way ends on the plaza on your side (close enough to sell and shop), the arrow
    // floats just outside the tent
    const market = () => {
        aim = 'market';
        const d = Math.hypot(P.pos.x, P.pos.z) || 1, r = COUNTER_R + 7;
        opt.beam = 0; opt.mark = marketMark.set(P.pos.x / d * (COUNTER_R + 13), 0, P.pos.z / d * (COUNTER_R + 13)); opt.max = 2;
        return guideV.set(P.pos.x / d * r, 0, P.pos.z / d * r);
    };
    const plotIn = () => { aim = 'home'; const w = toWorld(myPlot, 0, (PLANT_AREA.z0 + PLANT_AREA.z1) / 2); opt.beam = FLOOR_H - 3; return guideV.set(w.x, floorY(0), w.z); };
    const crate = () => { aim = 'home'; const w = toWorld(myPlot, CRATE.x, CRATE.z); opt.up = pl.crateN * CRATE_H; return guideV.set(w.x, 0, w.z); };
    // the plant that ripens first (the ripe ones first of all)
    const nextRipe = (onlyRipe) => {
        const now = net.now();
        let best = null, bt = Infinity;
        for (const p of myPlants()) { const k = Math.max(0, p.fa - now); if (k < bt) { bt = k; best = p; } }
        if (!best || (onlyRipe && bt > 0)) return null;
        aim = 'home'; plantWorld(best, guideV); opt.up = plantHeight(best.sp); opt.beam = FLOOR_H - 3;
        return guideV;
    };
    // in the greenhouse with a seed in hand: the arrow over where it will go
    const ghostSpot = () => {
        if (!S.seedSel || S.seedSel === 'shovel' || !placeOk) return null;
        aim = 'home'; opt.beam = FLOOR_H - 3; opt.max = 1.2;
        return guideV.copy(place.world);
    };
    // the goals after the tutorial: where each one is done
    const goal = !tut && (q.goal || 0) < GOALS.length ? GOALS[q.goal] : null;
    const earn = () => (pl.crate > 0 ? crate() : nextRipe() || plotIn());
    const atWorld = (x, y, z) => guideV.set(x, y, z);
    const goalTarget = (kind) => {
        const inPlot = inMyPlot(), f = inPlot ? clamp(floorAt(P.pos.y), 0, myFloors() - 1) : 0;
        if (kind === 'plants') return hasSeed ? (inPlot ? ghostSpot() : plotIn()) : canBuyAny(net.now()) ? market() : earn();
        if (kind === 'plantsUp') {
            if (inPlot && f >= 1) return hasSeed ? ghostSpot() : null;
            if (!hasSeed) return canBuyAny(net.now()) ? market() : earn();
            if (!inPlot) return plotIn();
            aim = 'home'; opt.beam = FLOOR_H - 3; const w = toWorld(myPlot, LIFT_UP.x, LIFT_UP.z); return atWorld(w.x, floorY(0), w.z);
        }
        if (kind === 'buy') return canBuyAny(net.now()) ? market() : earn();
        if (kind === 'sell') return pl.crate > 0 ? crate() : nextRipe(true);
        if (kind === 'harvest') return nextRipe(true);
        if (kind === 'fup') { aim = 'home'; opt.beam = FLOOR_H - 3; const w = toWorld(myPlot, BOARD.x, BOARD.z + 4); return atWorld(w.x, floorY(f), w.z); }
        if (kind === 'egg') { const s = SPOTS.pets, d = Math.hypot(s.x, s.z) || 1; return atWorld(s.x - s.x / d * 13, 0, s.z - s.z / d * 13); }
        return null;
    };
    // the last step ("buy another plant") with too little Cash for any seed: earn some first
    const broke = tut === 'buy' && q.tut === TUTORIAL.length - 1 && !canBuyAny(net.now());
    let target = null;
    if (S.carry > 0 && (!tut || tut === 'sell' || tut === 'collect' || broke)) target = market();
    else if (broke) target = pl.crate > 0 ? crate() : nextRipe() || plotIn();
    else if (!tut && goal) target = goalTarget(goal.kind);
    else if (tut === 'buy') target = hasSeed && q.tut === 0 ? plotIn() : market();
    else if (tut === 'plant') target = hasSeed ? (inMyPlot() ? ghostSpot() : plotIn()) : market();
    else if (tut === 'harvest') target = nextRipe();
    else if (tut === 'collect') target = pl.crate > 0 ? crate() : null;
    else if (tut === 'sell') target = pl.crate > 0 ? crate() : null;
    lastRoute = target ? guideRoute(target) : null;
    setGuide(lastRoute, opt);
    sellRingOn(S.carry > 0);
    // far from where the guide leads: the quick travel button there glows
    hintTravel(target && Math.hypot(target.x - P.pos.x, target.z - P.pos.z) > 50 ? aim : null);
    // after the tutorial: a nudge when plants are ripe at home and you're away from it
    if (!tut && clockT - ripeCheckT > 3) {
        ripeCheckT = clockT;
        const now = net.now(), ripe = inMyPlot() ? 0 : myPlants().filter((p) => now >= p.fa).length;
        if (ripe >= 3 && clockT - ripeToastT > 90) { ripeToastT = clockT; toast('🍎 ' + ripe + ' plants are ready to harvest! 🏡 Garden' + (isTouch ? '' : ' (G)'), '#9affb8'); }
    }
}
let hintAim = null;
function hintTravel(aim) {
    if (aim === hintAim) return;
    hintAim = aim;
    $('#btnHome').classList.toggle('hint', aim === 'home');
    $('#btnMarket').classList.toggle('hint', aim === 'market');
}
// Quick travel (the Garden / Market buttons, G / M): a blink to your greenhouse or to the market
let travelT = -9;
actions.travel = (where) => {
    if (!running || myPlot < 0 || clockT - travelT < 0.6) return;
    travelT = clockT;
    let pos, yaw;
    if (where === 'home') {
        const w = toWorld(myPlot, 0, PLOT_D / 2 - 8);
        pos = new V3(w.x, floorY(0) + 0.05, w.z); yaw = FRAMES[myPlot].yaw + Math.PI;
    } else {
        // the plaza on your greenhouse's side, facing the counter (close enough to sell and to shop)
        const c = toWorld(myPlot, 0, 0), d = Math.hypot(c.x, c.z) || 1, r = COUNTER_R + 8;
        pos = new V3(c.x / d * r, 0, c.z / d * r); yaw = Math.atan2(-c.x, -c.z);
    }
    $('#fade').style.opacity = 0.85;
    sfx('lift', where === 'home');
    setTimeout(() => {
        teleport(pos, yaw);
        $('#fade').style.opacity = 0;
        ring(P.pos, 0x9affb8, 6, 0.5);
    }, 160);
};
// the way from you to the target: round your greenhouse's sides, through its door, to a lift pad
function guideRoute(target) {
    const pts = [];
    const add = (x, y, z) => { pts.push(gPts[pts.length].set(x, y, z)); };
    add(P.pos.x, P.pos.y, P.pos.z);
    const W2 = PLOT_W / 2, D2 = PLOT_D / 2;
    const inside = (l) => Math.abs(l.x) < W2 && Math.abs(l.z) < D2;
    const me = toLocal(myPlot, P.pos.x, P.pos.z), tl = toLocal(myPlot, target.x, target.z);
    const meIn = inside(me), tIn = inside(tl), fMe = floorAt(P.pos.y), fT = floorAt(target.y);
    const at = (lx, lz, y) => { const w = toWorld(myPlot, lx, lz); add(w.x, y, w.z); };
    // up in your greenhouse on another floor: to the lift pad
    if (meIn && fMe > 0 && fMe !== fT) { const pad = fMe > fT ? LIFT_DOWN : LIFT_UP; at(pad.x, pad.z, floorY(fMe)); return pts; }
    // beside or behind your greenhouse: round its side to the front first
    if (!meIn && me.z < D2 + 2 && Math.abs(me.x) < W2 + 26) {
        const sx = me.x < 0 ? -1 : 1;
        if (me.z < -D2) at(sx * (W2 + 6), -D2 - 6, 0);
        at(sx * (W2 + 6), D2 + 7, 0);
    }
    if (meIn !== tIn) {
        if (meIn) { if (me.z < D2 - 6) at(0, D2 - 5, floorY(0)); at(0, D2 + 7, 0); }
        else { at(0, D2 + 7, 0); at(0, D2 - 5, floorY(0)); }
    }
    // a goal up on another floor: to the ground floor's lift pad
    if (tIn && fT > 0 && !(meIn && fMe === fT)) { at(LIFT_UP.x, LIFT_UP.z, floorY(0)); return aroundMarket(pts); }
    add(target.x, target.y, target.z);
    return aroundMarket(pts);
}
// a leg of the way that would cut through the market goes round it instead
function aroundMarket(pts) {
    const R = COUNTER_R + 5, RA = COUNTER_R + 14;
    for (let i = 0; i < pts.length - 1 && pts.length < gPts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
        if (L2 < 1) continue;
        const t = clamp(-(a.x * dx + a.z * dz) / L2, 0, 1);
        if (Math.hypot(a.x + dx * t, a.z + dz * t) > R || Math.hypot(a.x, a.z) < R || Math.hypot(b.x, b.z) < R) continue;
        const a0 = Math.atan2(a.z, a.x);
        let da = Math.atan2(b.z, b.x) - a0;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        const n = Math.min(gPts.length - pts.length, Math.max(1, Math.ceil(Math.abs(da) / (Math.PI * 0.42)) - 1));
        const ins = [];
        for (let k = 1; k <= n; k++) { const an = a0 + da * k / (n + 1); ins.push(new V3(Math.cos(an) * RA, 0, Math.sin(an) * RA)); }
        pts.splice(i + 1, 0, ...ins);
        i += n;
    }
    return pts;
}
// the seed the tutorial wants you to buy: the Apple, then the Onion, then anything you can afford
function buySeedId(step) {
    const now = net.now(), ok = (sp) => sp && stockLeft(sp.id, now) > 0 && S.cash >= sp.price;
    const want = speciesById[step === 0 ? 'apple' : step === 5 ? 'onion' : ''];
    if (ok(want)) return want.id;
    const any = SHOP_SEEDS.filter(ok).sort((a, b) => a.price - b.price)[0];
    return any ? any.id : null;
}
function uiTarget(q, tut) {
    if (anyPopup()) {
        if (tut === 'buy' && modalIs('seeds')) { const id = buySeedId(q.tut); return id ? $('#modalBody [data-buy="' + id + '"]') : null; }
        return null;
    }
    if (tut === 'plant' && inMyPlot()) {
        const k = seedKeys()[0];
        if (!k) return null;
        if (!S.seedSel || S.seedSel === 'shovel') return $('#hotbar [data-k="' + k + '"]');
        if (isTouch && placeOk) return $('#plantBtn');
    }
    return null;
}
// the bouncing arrow over a button (scrolled into view once when it changes)
let uiPtrFor = null;
function pointUi(el) {
    const ptr = $('#tutPtr');
    const r = el && !el.hidden ? el.getBoundingClientRect() : null;
    if (!r || r.width < 2) { ptr.hidden = true; uiPtrFor = null; return; }
    const key = el.dataset.buy || el.dataset.k || el.id;
    if (key !== uiPtrFor) { uiPtrFor = key; if (el.dataset.buy) el.scrollIntoView({ block: 'nearest' }); }
    ptr.hidden = false;
    const tip = ptr.firstElementChild.offsetHeight / 2;
    ptr.style.transform = 'translate(' + (r.left + r.width / 2) + 'px,' + (r.top - tip - 4) + 'px)';
}
// the pointer at the screen's edge toward a goal that's off screen
const edgeV = new V3();
function updateEdgePtr() {
    const el = $('#edgePtr'), g = running && !anyPopup() ? guideGoal() : null;
    // (right next to you it needs no pointer: the arrow on the ground is under your feet)
    if (!g || Math.hypot(g.x - P.pos.x, g.z - P.pos.z) < 18) { if (!el.hidden) el.hidden = true; return; }
    edgeV.copy(g).project(camera);
    const behind = edgeV.z > 1;
    if (!behind && Math.abs(edgeV.x) < 0.88 && Math.abs(edgeV.y) < 0.86) { if (!el.hidden) el.hidden = true; return; }
    const W = innerWidth, H = innerHeight;
    let dx = edgeV.x * W / 2, dy = -edgeV.y * H / 2;
    if (behind) { dx = -dx; dy = Math.max(0, -dy) + H * 0.6; }
    // round an ellipse inside the screen, kept above the hotbar
    const a = Math.atan2(dy, dx), rx = W / 2 - 60, ry = H / 2 - 100;
    const k = 1 / Math.hypot(Math.cos(a) / rx, Math.sin(a) / ry);
    const x = W / 2 + Math.cos(a) * k;
    let y = H / 2 - 20 + Math.sin(a) * k;
    if (x < 220 && y < 110) y = 110; // the top-left corner stays free
    el.hidden = false;
    el.style.transform = 'translate(' + x + 'px,' + y + 'px) rotate(' + (a - Math.PI / 2) + 'rad)';
}

// =====================================================================================
// Friend Boost
// =====================================================================================
let friendNames = [], friendsT = 3, friendSyncT = 5;
async function refreshFriends() {
    if (!BX.bloxity.ready || !BX.identity().loggedIn) return;
    const list = await BX.getFriends();
    friendNames = list.map((f) => f.displayName || f.username).filter(Boolean);
    syncFriends();
}
function syncFriends() {
    const room = net.room;
    if (!room || !room.state || !room.state.players || !friendNames.length) return;
    const here = [];
    room.state.players.forEach((p, id) => { if (id !== room.sessionId && friendNames.includes(p.name)) here.push(p.name); });
    net.send('friends', { names: here });
}

// =====================================================================================
// Other players
// =====================================================================================
const remotes = new Map();
let joinSynced = false;
class Remote {
    constructor(p) {
        this.rig = buildCharacter(p.kit, p.skin);
        this.rig.position.set(p.x, p.y, p.z);
        this.rig.rotation.y = p.ry;
        scene.add(this.rig);
        this.name = p.name;
        this.label = billboard(nameLines(p.name, p.floors), 6, 512, new V3(0, 8.2, 0), this.rig);
        this.labelKey = p.name + '|' + p.floors;
        this.av = null; this.blox = null; this.dead = false; this.phase = 0; this.vel = 0;
        this.lastX = p.x; this.lastZ = p.z; this.stepN = 0;
        this.pets = new PetPack();
        this.setAvatar(p.av);
    }
    setAvatar(av) {
        this.av = av;
        const data = av ? unpackAvatar(av) : null;
        if (this.blox) { this.blox.setProportions(data && data.proportions); this.blox.setEquipped(data || {}); return; }
        if (this.loading) return;
        this.loading = true;
        createAvatar(data).then((a) => {
            this.loading = false;
            if (!a) return;
            if (this.dead) { a.dispose(); return; }
            this.blox = a;
            dressRig(this.rig, a);
            if (this.av !== av) this.setAvatar(this.av);
        });
    }
    update(p, dt, t) {
        const r = this.rig, u = r.userData;
        this.name = p.name;
        const k = 1 - Math.exp(-dt * 12);
        const far = (r.position.x - p.x) ** 2 + (r.position.z - p.z) ** 2 + (r.position.y - p.y) ** 2 > 900;
        if (far) r.position.set(p.x, p.y, p.z);
        else { r.position.x += (p.x - r.position.x) * k; r.position.y += (p.y - r.position.y) * k; r.position.z += (p.z - r.position.z) * k; }
        r.rotation.y = lerpAngle(r.rotation.y, p.ry, k);
        const vis = camera.position.distanceToSquared(r.position) < 260 * 260;
        if (r.visible !== vis) r.visible = vis;
        if (p.av !== this.av) this.setAvatar(p.av);
        this.pets.set(p.pets ? p.pets.split(',') : []);
        this.pets.update(dt, t, r.position, r.rotation.y, this.vel > 1, vis);
        setCarryStack(r, p.carry);
        if (!vis) { this.lastX = r.position.x; this.lastZ = r.position.z; return; }
        const moved = Math.hypot(r.position.x - this.lastX, r.position.z - this.lastZ);
        this.vel += ((dt > 0 ? moved / dt : 0) - this.vel) * Math.min(1, dt * 6);
        this.lastX = r.position.x; this.lastZ = r.position.z;
        const air = p.anim === 2, moving = p.anim === 1 && this.vel > 1;
        this.phase += dt * (moving ? Math.min(18, 4 + this.vel * 0.3) : 0);
        if (air) airPose(u.body); else if (moving) animRig(u.body, this.phase, 0.85); else animRig(u.body, 0, 0);
        if (p.carry > 0) { u.body.userData.arms[0].rotation.set(-2.9, 0, 0); u.body.userData.arms[1].rotation.set(-2.9, 0, 0); }
        if (this.blox) this.blox.update(dt, { moving, air, speed: this.vel, t, carry: p.carry > 0 });
        const stepN = Math.floor(this.phase / Math.PI);
        if (moving && stepN !== this.stepN && camera.position.distanceToSquared(r.position) < 900) surfStep(r.position.y > 0.6 ? 'floor' : 'grass', false);
        this.stepN = stepN;
        const key = p.name + '|' + p.floors;
        if (key !== this.labelKey) { this.labelKey = key; this.label.userData.set(nameLines(p.name, p.floors)); }
    }
    dispose() {
        this.dead = true;
        if (this.blox) this.blox.dispose();
        this.pets.dispose();
        scene.remove(this.rig);
    }
}
const seenIds = new Set();
function syncRemotes(dt, t) {
    const room = net.room;
    if (!room || !room.state || !room.state.players) return;
    seenIds.clear();
    room.state.players.forEach((p, id) => {
        if (id === room.sessionId) {
            S.name = p.name; S.friends = p.friends;
            if (!rig || rig.userData.kit !== p.kit) { buildPlayer(p.kit, p.skin); rig.userData.kit = p.kit; }
            myPets.set(p.pets ? p.pets.split(',') : []);
            return;
        }
        seenIds.add(id);
        let r = remotes.get(id);
        if (!r) {
            r = new Remote(p); remotes.set(id, r);
            if (joinSynced) BX.playerJoined(p.name); else BX.playerInRoom(p.name);
        }
        r.update(p, dt, t);
    });
    for (const [id, r] of remotes) if (!seenIds.has(id)) { r.dispose(); remotes.delete(id); }
    joinSynced = true;
}
const sessionOf = (id) => (net.room && id === net.room.sessionId ? rig : remotes.get(id) && remotes.get(id).rig);

// ----- the gardens: the room state's plots and plants mirrored into the scene (10x a second) -----
const plantSig = new Map();
let gardenSynced = false;
function syncGarden() {
    const room = net.room;
    if (!room || !room.state || !room.state.plots) return;
    const seen = new Set();
    room.state.plots.forEach((pl, i) => {
        if (!pl) return;
        syncPlot(i, pl, gardenSynced);
        pl.plants.forEach((ps, id) => {
            const key = i + ':' + id, sig = ps.sp + '|' + ps.f + '|' + ps.x + '|' + ps.z + '|' + ps.r + '|' + ps.m + '|' + ps.t0 + '|' + ps.fs + '|' + ps.fa;
            seen.add(key);
            if (plantSig.get(key) === sig) return;
            plantSig.set(key, sig);
            setPlant(i, id, ps);
        });
    });
    for (const key of plantSig.keys()) if (!seen.has(key)) { const [i, id] = key.split(':'); removePlant(+i, id); plantSig.delete(key); pendingHv.delete(id); }
    gardenSynced = true;
}

// =====================================================================================
// Networking
// =====================================================================================
const BLOXITY_GAME_ID = import.meta.env.VITE_BLOXITY_GAME_ID || '';
const ON_BLOXITY_HOST = /\.play\.bloxity\.io$/.test(location.hostname);
const DEV_CHANNEL = /\.dev\.play\.bloxity\.io$/.test(location.hostname);
const SERVER_URL = import.meta.env.VITE_SERVER_URL
    || (ON_BLOXITY_HOST ? `https://${location.hostname.replace(/\.play\.bloxity\.io$/, '.host.bloxity.io')}`
        : BLOXITY_GAME_ID ? `https://${BLOXITY_GAME_ID}.host.bloxity.io`
        : import.meta.env.DEV ? `${location.protocol}//${location.hostname}:2681` : location.origin);
async function serverEndpoint() {
    let url = SERVER_URL;
    if (BLOXITY_GAME_ID) {
        const r = await BX.resolveEndpoint(BLOXITY_GAME_ID, DEV_CHANNEL ? 'preview' : undefined);
        if (r && r.cold) loadingText('Waking up a server…');
        url = (r && r.endpoint) || SERVER_URL;
    }
    if (!/^https?:/i.test(url)) return url;
    if (!(await serverUp(url))) {
        loadingText('Waking up a server…');
        const until = Date.now() + 60000;
        while (Date.now() < until) {
            await sleep(2000);
            if (await serverUp(url)) break;
        }
    }
    return url;
}
async function serverUp(url) {
    try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 4000);
        const r = await fetch(url.replace(/\/$/, '') + '/health', { signal: ctl.signal, cache: 'no-store' });
        clearTimeout(t);
        return r.ok;
    } catch (e) { return false; }
}
let lastMoveSent = 0, lastMoveKey = '';
function sendMove(force) {
    const now = performance.now();
    if (!force && now - lastMoveSent < 66) return;
    const a = !P.onGround ? 2 : P.moving ? 1 : 0;
    const m = { x: +P.pos.x.toFixed(2), y: +P.pos.y.toFixed(2), z: +P.pos.z.toFixed(2), ry: +P.facing.toFixed(3), a };
    const key = m.x + ',' + m.y + ',' + m.z + ',' + m.ry + ',' + a;
    if (!force && key === lastMoveKey && now - lastMoveSent < 500) return;
    lastMoveKey = key; lastMoveSent = now;
    net.send('move', m);
}
function playerUid() {
    let uid = storageGet('bgt_uid');
    if (!uid) {
        uid = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
        storageSet('bgt_uid', uid);
    }
    return uid;
}

let lastCash = null, lastGems = null, firstProfile = true, lastWindow = -1;
const harvestFxV = new V3(), crateFxV = new V3();
async function connect(name, endpoint) {
    const url = endpoint || await serverEndpoint();
    const client = new Client(url);
    const id = BX.identity();
    const room = await client.joinOrCreate('garden', {
        uid: playerUid(), name: name || id.name, token: id.token, av: packAvatar(BX.currentAvatar()),
        save: storageGet('bgt_save') || '',
    });
    net.room = room;
    joinSynced = false; gardenSynced = false;
    room.onMessage('hello', (m) => {
        net.offset = m.now - Date.now(); net.bloxity = !!m.bloxity;
        if (!EPOCH) setEpoch(m.now - 3600 * 1000);
        if (m.plot !== myPlot) { myPlot = m.plot; S.plot = m.plot; setMyPlot(m.plot); }
    });
    room.onMessage('authed', () => { net.bloxity = true; });
    room.onMessage('emote', (m) => { const r = remotes.get(m.s); if (r) playEmoteOn(r.blox, m.id); });
    room.onMessage('chat', (m) => { toast(m.name + ': ' + m.text, '#ffffff'); chatBubble(sessionOf(m.s), m.text); });
    BX.updateRoom(room.roomId);
    BX.gameplayStart();
    room.onMessage('profile', (m) => {
        if (m.save) storageSet('bgt_save', m.save);
        delete m.save;
        if (m.now) net.offset = m.now - Date.now();
        delete m.now;
        Object.assign(S, m);
        S.profileAt = Date.now();
        if (lastCash !== null && S.cash > lastCash) bumpCash();
        if (lastGems !== null && S.gems > lastGems) { bumpGems(); sfx('gem'); }
        lastCash = S.cash; lastGems = S.gems;
        if (S.seedSel && S.seedSel !== 'shovel' && !(S.seeds[S.seedSel] > 0)) S.seedSel = '';
        if (firstProfile) { firstProfile = false; }
        renderHotbar(); refreshModal(); refreshDaily(); drawQuests();
        openDailyOnJoin();
    });
    // harvests (anyone's): juice, the fruit flying into that garden's crates, the Cash it made
    room.onMessage('hv', (m) => {
        const mine = m.p === myPlot, h = m.h;
        const cw = toWorld(m.p, CRATE.x, CRATE.z);
        crateFxV.set(cw.x, 0.5 + plots[m.p].crateN * CRATE_H + 1, cw.z);
        for (let i = 0; i < h.length; i += 3) {
            const p = getPlant(m.p, h[i]);
            if (!p) continue;
            const sp = speciesById[p.sp];
            plantWorld(p, harvestFxV);
            const near = camera.position.distanceToSquared(harvestFxV) < 120 * 120;
            if (!near) continue;
            harvestFxV.y += plantHeight(sp.id) * 0.5;
            harvestBurst(harvestFxV, p.m ? MUTATIONS[p.m].color : sp.look.fruit, h[i + 2]);
            flyFruit(harvestFxV, crateFxV, p.m ? MUTATIONS[p.m].color : sp.look.fruit, mine ? 4 : 2, 0.6 + sp.r * 0.06);
            if (mine) {
                if (clockT - comboT > 2) combo = 0;
                comboT = clockT;
                sfxSome('harvest', combo++, 2);
                floatText('+' + money(h[i + 1]), h[i + 2] ? '#ffe24a' : '#7dff6b', harvestFxV.clone().setY(harvestFxV.y + 3), h[i + 2] ? 4.5 : 3.6, true);
                if (h[i + 2]) { sfx('double'); floatText('DOUBLE!', '#ffd23a', harvestFxV.clone().setY(harvestFxV.y + 6), 4, true); }
                pendingHv.delete(h[i]);
            }
        }
        if (mine) rumble(0.15, 40);
    });
    room.onMessage('mut', (m) => {
        const p = getPlant(m.p, m.id);
        if (!p) return;
        plantWorld(p, harvestFxV);
        if (camera.position.distanceToSquared(harvestFxV) > 160 * 160) return;
        sparkleColumn(harvestFxV, MUTATIONS[m.m].color);
        ring(harvestFxV, MUTATIONS[m.m].color, 6, 0.6);
        if (m.p === myPlot) sfx('mutate');
    });
    room.onMessage('floor', (m) => {
        if (m.p === myPlot) {
            sfx('floor'); bigText('🏢 FLOOR ' + m.floors + ' BUILT!', '#ffe24a'); questPop('FLOOR ' + m.floors + '!', 'Room for ' + CFG.floorCap + ' more plants', '🏢');
            rumble(0.6, 400); addShake(0.4);
        } else toast('🏢 ' + m.name + ' built Floor ' + m.floors + '!', '#9affb8');
    });
    room.onMessage('sold', (m) => {
        const me = m.s === room.sessionId, who = sessionOf(m.s);
        const at = who ? who.position.clone().setY(who.position.y + 4) : new V3(0, 5, 0);
        if (camera.position.distanceToSquared(at) < 150 * 150) cashBurst(at, me ? 36 : 14);
        if (!me) return;
        floatText('+' + money(m.cash), '#7dff6b', at.clone().setY(at.y + 4), 7, true);
        sfx('sell'); flash('#7dff6b', 400, 0.22); rumble(0.4, 150);
        toast('💰 Sold your crates for ' + money(m.cash) + '!', '#7dff6b');
        bumpCash();
    });
    room.onMessage('collected', () => { sfx('collect', crateCount(S.carry || 1)); dust(P.pos, 8, 1, 0xd8b888); toast('📦 Crates grabbed! Take them to the SELL counter at the market', '#ffe24a'); });
    room.onMessage('bought', (m) => {
        const sp = speciesById[m.id];
        sfx('buy');
        toast('🌱 ' + sp.ic + ' ' + sp.name + ' seed in your bag!' + (S.q.tut < TUTORIAL.length ? ' Plant it in your greenhouse' : ''), '#9affb8');
        if (!S.seedSel || S.q.tut < TUTORIAL.length) setTimeout(() => actions.selectSeed(m.id), 50);
    });
    room.onMessage('planted', (m) => {
        sfx('plant');
        setTimeout(() => { const p = getPlant(myPlot, m.id); if (p) { plantWorld(p, harvestFxV); leafPuff(harvestFxV, speciesById[p.sp].look.leaf); ring(harvestFxV, 0x9aff6a, 4, 0.5); } }, 120);
    });
    room.onMessage('dug', (m) => { sfx('dig'); leafPuff(P.pos.clone().add(new V3(Math.sin(P.facing) * 4, 0, Math.cos(P.facing) * 4)), 0x8a5a2a); toast(m.text, '#ffe8b8'); });
    room.onMessage('quest', (m) => {
        if (m.tut !== undefined) {
            sfx('quest');
            if (m.done) setTimeout(() => { questPop('+' + m.gems + ' GEMS', 'Tutorial complete!'); bigText('BUILD THE TALLEST GARDEN!', '#ffe24a'); sfx('questBig'); confetti(P.pos); toast('🏆 You completed the tutorial! Now build the tallest garden!', '#ffe24a'); }, 400);
            else if (!m.skipped) bigText('✔ ' + TUTORIAL[m.tut].text.replace(/[^\w !']/g, '').trim(), '#8aff7a');
        } else {
            questPop('+' + m.gems + ' GEMS', 'Daily quest complete!');
            bigText('QUEST COMPLETE!', '#ffffff');
            sfx('quest');
        }
        sparkleColumn(P.pos, 0xd23cff);
    });
    room.onMessage('goal', (m) => {
        const G = GOALS[m.k];
        if (!G) return;
        setTimeout(() => {
            questPop('🎯 GOAL COMPLETE!', G.text.replace(/[^\w !',]/g, '').trim() + ': ' + m.text, '🎯');
            bigText('GOAL COMPLETE!', '#ffe24a');
            sfx('questBig'); confetti(P.pos); sparkleColumn(P.pos, 0xffd21e);
        }, 300);
    });
    room.onMessage('discover', (m) => {
        const sp = speciesById[m.sp], mu = MUTATIONS[m.m];
        setTimeout(() => { questPop('+' + m.gems + ' 💎', 'New in your Index: ' + (m.m ? mu.name + ' ' : '') + sp.name + '!', m.m ? mu.ic : sp.ic); sfx('gem'); }, 700);
    });
    room.onMessage('hatch', (m) => { showHatch(m); });
    room.onMessage('spun', (m) => { spinWheelTo(m.k, m.text); spinWorldWheel(m.k); });
    room.onMessage('restocked', () => { sfx('restock'); toast('🔄 The Seed Shop restocked, just for you!', '#9affb8'); refreshModal(); });
    room.onMessage('upgraded', (m) => { sfx('upgrade'); sparkleColumn(P.pos, 0x5ae0ff); ring(P.pos, 0x5ae0ff, 9, 0.7); });
    room.onMessage('fx', (m) => { sfx(m.kind === 'boost' ? 'buy' : 'unlock'); sparkleColumn(P.pos, 0xffd21e); ring(P.pos, 0xffd21e, 10, 0.8); confetti(P.pos); });
    room.onMessage('away', (m) => { setTimeout(() => { questPop('+' + money(m.cash), '🧲 Auto Collect harvested while you were away (' + m.mins + ' min)', '🧲'); sfx('collect', 5); }, 2500); });
    room.onMessage('bean', (m) => { sfx('questBig'); bigText('🫛 MAGIC BEAN!', '#b8ff7a'); questPop('+' + m.gems + ' GEMS', 'You climbed the Giant Beanstalk! A Magic Beanstalk seed is in your bag', '🫛'); fireworks(P.pos, 8, () => sfxSome('firework', 1, 2)); confetti(P.pos); });
    room.onMessage('toast', (m) => toast(m.text, m.color));
    room.onMessage('broke', (m) => { notEnough(m); sfx('denied'); });
    room.onMessage('codeResult', (m) => codeResult(m));
    room.onMessage('boards', renderBoards);
    room.onLeave((code) => {
        if (net.room === room) net.room = null;
        if (code !== 1000 && code !== 4000) $('#offline').hidden = false;
    });
    return room;
}
setOnFloorRise((p) => {
    const w = toWorld(p.i, 0, 0);
    const at = new V3(w.x, p.floors * FLOOR_H + 4, w.z);
    if (camera.position.distanceToSquared(at) < 220 * 220) { sparkleColumn(at, 0x9affb8); fireworks(at, 6, () => sfxSome('firework', 1, 2)); confetti(at); }
});

// =====================================================================================
// Events (the same clock for everyone): the sky, the beanstalk, golden / rainbow rain
// =====================================================================================
let evKey = '';
function updateEvents() {
    const e = eventAt(net.now());
    const key = e.active ? e.ev.id + e.window : '';
    if (key !== evKey) {
        const was = evKey;
        evKey = key;
        setMood(e.active ? e.ev.mood : 'garden');
        if (e.active && running && was !== null) { sfx('event'); bigText(e.ev.ic + ' ' + e.ev.name.toUpperCase() + '!', '#ffffff'); toast(e.ev.desc, '#ffe24a'); }
        else if (!e.active && was && running) toast('The ' + EVENT_NAME(was) + ' is over! Next one in ' + Math.round(e.next / 60) + ' min', '#ffffff');
    }
    const id = e.active ? e.ev.id : '';
    setBeanstalk(id === 'beanstalk', S.bean === e.window);
    drawBeanSign(id === 'beanstalk', id === 'beanstalk' ? e.left : (3 - (e.window % 4)) * 600 + e.next, 'Giant Beanstalk');
    // the air: golden rain falling, rainbow glitter, frenzy sparks rising
    if (id === 'goldrain') { ambCol.set(0xffd21e); ambDir = -2.5; ambSnow = false; }
    else if (id === 'rainbow') { ambCol.setHSL((gt() * 0.1) % 1, 0.9, 0.65); ambDir = -1.2; ambSnow = false; }
    else if (id === 'frenzy') { ambCol.set(0x9aff6a); ambDir = 3; ambSnow = false; }
    else { ambCol.set(0xffffff); ambDir = 0.5; ambSnow = false; }
    // the beanstalk's top: claim the Magic Bean
    if (id === 'beanstalk' && S.bean !== e.window && beanstalkUp() && P.pos.y > BEAN_TOP.y - 6 && (P.pos.x - BEAN_TOP.x) ** 2 + (P.pos.z - BEAN_TOP.z) ** 2 < 14 * 14 && clockT - beanT > 2) { beanT = clockT; sendMove(true); net.send('bean'); }
    // the Seed Shop restocked (everyone's, every 5 minutes)
    const w = restockWindow(net.now());
    if (lastWindow >= 0 && w !== lastWindow && running) { sfx('restock'); toast('🌱 The Seed Shop has restocked!', '#9affb8'); }
    lastWindow = w;
    return e;
}
let beanT = -9;
const EVENT_NAME = (k) => ({ b: 'Giant Beanstalk', f: 'Growth Frenzy', g: 'Golden Rain', r: 'Rainbow Bloom' }[k[0]] || 'event');

// =====================================================================================
// Main update
// =====================================================================================
const botInput = { f: 0, r: 0 };
let clockT = 0, hudT = 0, metaT = 20, gardenT = 0, sprinting = false;
const tmpF = new V3(), tmpR = new V3(), mv = new V3();
function land(g, hard) {
    surfStep(surfaceOf(g), true);
    dust(P.pos, hard ? 10 : 5, hard ? 1.3 : 0.9);
    if (hard) ring(P.pos, 0xffffff, 4, 0.35);
    P.squashV -= hard ? 8 : 4;
}
const surfaceOf = (g) => (!g ? 'grass' : g.mat === 'floor' ? 'floor' : g.mat === 'leaf' ? 'leaf' : g.mat === 'wood' ? 'wood' : g.mat === 'metal' ? 'metal' : g.mat === 'tile' ? 'tile' : 'grass');
function update(dt) {
    clockT += dt;
    const t = clockT;
    PU.uNow.value = (net.now() - EPOCH) / 1000;
    let f = botInput.f, r = botInput.r;
    if (keys.KeyW || keys.ArrowUp) f += 1;
    if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) r += 1;
    if (keys.KeyA || keys.ArrowLeft) r -= 1;
    f -= touchMove.y + pad.ly; r += touchMove.x + pad.lx;
    cam.yaw -= pad.rx * 2.6 * dt * camSens;
    cam.pitch = clamp(cam.pitch + pad.ry * 1.7 * dt * camSens, -0.9, 1.35);
    tmpF.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
    tmpR.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
    mv.set(0, 0, 0).addScaledVector(tmpF, f).addScaledVector(tmpR, r);
    if (mv.lengthSq() > 1) mv.normalize();
    if (anyPopup() && !isTouch) mv.set(0, 0, 0);
    P.moving = mv.lengthSq() > 0.01;
    if (clockT - nearT > 0.25) { nearT = clockT; refreshNear(); }

    // ----- jumping, gravity -----
    const pressed = t - P.jumpPress < 0.2;
    if (P.onGround) P.coyote = 0.1; else P.coyote -= dt;
    if (pressed && (P.onGround || P.coyote > 0)) {
        P.vel.y = CFG.jumpV; P.onGround = false; P.coyote = 0; P.jumpPress = -9; P.ground = null;
        sfx('jump'); P.squashV += 5;
    }
    P.vel.y -= CFG.grav * dt;
    // ----- moving (sprint: Shift, L3, or the stick pushed all the way) -----
    const wantSprint = P.moving && (keys.ShiftLeft || keys.ShiftRight || pad.sprint || (isTouch && Math.hypot(touchMove.x, touchMove.y) > 0.92));
    if (wantSprint && !sprinting && P.onGround) sfx('whoosh');
    sprinting = wantSprint;
    const ws = CFG.walk * (sprinting ? CFG.sprint : 1) * (S.carry > 0 ? 0.92 : 1);
    P.hv.set(mv.x * ws, 0, mv.z * ws);
    const vx = P.hv.x, vz = P.hv.z;
    const dist = Math.max(Math.abs(vx), Math.abs(vz), Math.abs(P.vel.y)) * dt;
    const n = Math.max(1, Math.ceil(dist / 0.5));
    const sdt = dt / n;
    const wasOn = P.onGround;
    P.onGround = false; P.ground = null;
    let vy = P.vel.y + 0.5 * CFG.grav * dt;
    for (let i = 0; i < n; i++) {
        moveAxis('x', vx * sdt); moveAxis('z', vz * sdt);
        const before = P.vel.y;
        moveAxis('y', vy * sdt);
        if (P.vel.y !== before) vy = P.vel.y;
    }
    if (!P.onGround && wasOn && P.vel.y <= 0) groundProbe(0.7);
    else if (!P.onGround && P.vel.y <= 0) groundProbe(0.05);
    if (P.onGround) {
        if (P.airTime > 0.25 && P.ground) land(P.ground, P.airTime > 0.8);
        P.airTime = 0; P.peakY = P.pos.y;
    } else { P.airTime += dt; P.peakY = Math.max(P.peakY, P.pos.y); }
    const R2 = P.pos.x ** 2 + P.pos.z ** 2;
    if (R2 > 560 * 560) { const k = 560 / Math.sqrt(R2); P.pos.x *= k; P.pos.z *= k; }
    if (P.pos.y < -40) { respawn(); toast('🌱 Whoops! Back to your garden', '#ffffff'); }
    if (P.moving) P.facing = lerpAngle(P.facing, Math.atan2(mv.x, mv.z), 1 - Math.exp(-dt * 14));
    if (myPlot >= 0 && inMyPlot()) S.floor = clamp(floorAt(P.pos.y), 0, 7);

    // ----- the garden -----
    if (running && !anyPopup()) { checkLift(dt); checkCrates(); }
    harvestT -= dt;
    if (harvestT <= 0) { harvestT = 0.1; if (running) checkHarvest(); }
    gardenT -= dt;
    if (gardenT <= 0) { gardenT = 0.1; syncGarden(); }
    flushPlants();
    updatePlacement(t);
    sparkles(dt);
    if (petalAt && Math.random() < dt * 3 && camera.position.distanceToSquared(petalAt) < 160 * 160) petal(petalAt, 18);

    updateEffects(dt);
    updateFx(dt);
    for (const fn of tickers) fn(dt, t);
    syncRemotes(dt, t);
    friendsT -= dt; friendSyncT -= dt;
    if (friendsT <= 0) { friendsT = 30; friendSyncT = 5; refreshFriends(); }
    else if (friendSyncT <= 0) { friendSyncT = 5; syncFriends(); }

    // ----- the local character -----
    if (rig) {
        const u = rig.userData;
        rig.position.copy(P.pos);
        rig.rotation.y = P.facing;
        const hs = P.moving ? ws : 0;
        P.animPhase += dt * (P.onGround ? Math.min(18, 4 + hs * 0.3) : 0);
        if (!P.onGround) airPose(u.body); else if (P.moving) animRig(u.body, P.animPhase, 0.85); else animRig(u.body, 0, 0);
        const carrying = S.carry > 0;
        if (carrying) { u.body.userData.arms[0].rotation.set(-2.9, 0, 0); u.body.userData.arms[1].rotation.set(-2.9, 0, 0); }
        setCarryStack(rig, S.carry);
        if (localAvatar) localAvatar.update(dt, { moving: P.moving && P.onGround, air: !P.onGround, vy: P.vel.y, speed: hs, t, sprint: sprinting, carry: carrying });
        const stepN = Math.floor(P.animPhase / Math.PI);
        if (P.onGround && P.moving && stepN !== P.lastStepN && P.ground) surfStep(surfaceOf(P.ground), false);
        P.lastStepN = stepN;
        const own = !localAvatar;
        u.pivot.position.y = PIVOT + (own && P.onGround && P.moving ? Math.abs(Math.sin(P.animPhase)) * 0.18 : 0);
        const leanTo = !own ? 0 : P.onGround && P.moving ? 0.12 : !P.onGround ? -0.06 : 0;
        P.lean += (leanTo - P.lean) * Math.min(1, dt * 9);
        u.pivot.rotation.set(P.lean, 0, 0);
        P.squashV += (1 - P.squash) * 180 * dt;
        P.squashV *= Math.exp(-12 * dt);
        P.squash = clamp(P.squash + P.squashV * dt, 0.72, 1.28);
        const sq = own ? P.squash : 1;
        rig.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
        myPets.update(dt, t, P.pos, P.facing, P.moving, true);
    }
    sendMove(false);
    updatePrompt();
    updatePlantTag();
    animateCounters(dt);
    hudT -= dt;
    if (hudT <= 0) {
        hudT = 0.1;
        updateHud();
        renderHotbar();
        guide();
        const e = updateEvents();
        setMusicIntensity(anyPopup() ? 0 : e.active ? 2 : 1);
    }
    metaT -= dt;
    if (metaT <= 0) { metaT = 30; sendMeta(); }
}
let lastFps = 60;

// =====================================================================================
// The play stats: how the game runs on this device and any error it hit (the server keeps them
// with the session; /api/stats sums them up)
// =====================================================================================
const fpsWin = { sum: 0, n: 0 }, errSeen = new Set(), errQueue = [];
let metaFirst = true, loadSecs = 0;
function noteError(msg, src, line, col) {
    const file = src ? String(src).split('/').pop().split('?')[0] : '';
    const k = String(msg || '?').slice(0, 150) + (file ? ' @' + file + ':' + (line || 0) + ':' + (col || 0) : '');
    if (errSeen.has(k) || errSeen.size >= 20) return;
    errSeen.add(k);
    errQueue.push(k);
}
window.addEventListener('error', (e) => noteError(e.message, e.filename, e.lineno, e.colno));
window.addEventListener('unhandledrejection', (e) => noteError('promise: ' + ((e.reason && e.reason.message) || e.reason)));
// leaving: the last numbers go out before the connection closes
addEventListener('pagehide', () => { if (running) sendMeta(); });
function gpuName() {
    try {
        const gl = renderer.getContext(), x = gl.getExtension('WEBGL_debug_renderer_info');
        return String(x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).slice(0, 90);
    } catch (e) { return ''; }
}
function sendMeta() {
    const m = { touch: isTouch, fps: fpsWin.n ? Math.round(fpsWin.sum / fpsWin.n) : lastFps, q: getQuality(), errs: errQueue.splice(0, 5) };
    fpsWin.sum = 0; fpsWin.n = 0;
    if (metaFirst) {
        metaFirst = false;
        Object.assign(m, { gpu: gpuName(), load: loadSecs, dpr: Math.round(devicePixelRatio * 100) / 100, w: innerWidth, h: innerHeight, cores: navigator.hardwareConcurrency || 0, mem: navigator.deviceMemory || 0 });
    }
    net.send('meta', m);
}

// =====================================================================================
// Boot
// =====================================================================================
let frameErrors = 0;
let lastFrame = 0, loadingSignaled = false, fpsAcc = 0, fpsFrames = 0, showFps = false, skipOdd = false, oddFrame = false;
// The smoothness watch (every half second). First the resolution adapts: when the frame rate drops
// the game draws fewer pixels, keeping the step only if it helped (a slow processor isn't helped by
// fewer pixels), and draws them all again once it runs smoothly. Then, if it's still too slow, the
// quality steps down (in the first moments of play that includes taking the shadows out of the shaders).
const fpsWatch = { t: 0, avg: 60, low: 0, good: 0, trial: null, cpuUntil: 0, fails: 0, upAt: -99, upFrom: 1, ceil: 1, ceilUntil: 0 };
function watchFps(fps) {
    if (!running || document.hidden) return;
    const w = fpsWatch;
    w.t += 0.5;
    w.avg += (fps - w.avg) * 0.35;
    if (w.t < 3) return;
    if (w.t > w.ceilUntil) w.ceil = 1;
    if (w.trial) {
        if (w.t - w.trial.at < 2) return;
        // no better: the processor is the limit, so back to all the pixels (and wait longer each time)
        if (w.avg < w.trial.fps * 1.06) { setResScale(w.trial.prev); w.fails++; w.cpuUntil = w.t + Math.min(240, 30 * w.fails); } else w.fails = 0;
        w.trial = null;
        return;
    }
    const scale = getResScale();
    if (w.avg < 48 && w.t > w.cpuUntil && scale > 0.56) {
        // right after a step up: that was one step too far, stay below it for a while
        if (w.t - w.upAt < 6) { w.ceil = w.upFrom; w.ceilUntil = w.t + 60; }
        w.trial = { at: w.t, fps: w.avg, prev: scale };
        setResScale(scale * 0.85);
        w.good = 0;
        return;
    }
    if (w.avg >= 57) {
        w.good += 0.5;
        if (w.good >= 6 && scale < w.ceil - 0.01) { w.good = 0; w.upAt = w.t; w.upFrom = scale; setResScale(Math.min(w.ceil, scale / 0.88)); }
    } else w.good = 0;
    if (!autoQualityAllowed()) return;
    w.low = w.avg < 40 && (scale <= 0.56 || w.t < w.cpuUntil) ? w.low + 0.5 : 0;
    if (w.low < 3) return;
    w.low = 0;
    const next = { high: 'medium', medium: 'low' }[getQuality()];
    if (!next) return;
    setQuality(next, true, w.t < 45);
    storageSet('bgt_quality_auto', next);
    toast('⚙️ Graphics set to ' + (next === 'medium' ? 'Medium' : 'Low') + ' for smoother play', '#7de8ff');
}
function frame(now) {
    requestAnimationFrame(frame);
    // phones with 120 Hz screens: a steady 60 (cooler, no throttling later)
    if (skipOdd) { oddFrame = !oddFrame; if (oddFrame) return; }
    const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
    fpsAcc += (now - (lastFrame || now)) / 1000; fpsFrames++;
    if (fpsAcc >= 0.5) {
        const fps = fpsFrames / fpsAcc;
        lastFps = Math.round(fps);
        if (running && !document.hidden) { fpsWin.sum += fps; fpsWin.n++; }
        if (showFps) $('#fps').textContent = lastFps + ' FPS';
        if (isTouch && !skipOdd && fps > 100) skipOdd = true;
        watchFps(fps); fpsAcc = 0; fpsFrames = 0;
    }
    lastFrame = now;
    if (!loadingSignaled) { loadingSignaled = true; BX.triggerAllSettings(); }
    pollGamepad();
    padButtons();
    if (running) {
        const w0 = performance.now();
        try {
            update(dt);
            updateCamera(dt);
            updateEdgePtr();
            render();
        } catch (e) {
            if (frameErrors++ < 5) console.error('[frame]', e);
            const at = String((e && e.stack) || '').split('\n').find((l) => /:\d+:\d+/.test(l)) || '';
            noteError('[frame] ' + ((e && e.message) || e), '', 0, 0);
            if (at) noteError('[frame at] ' + at.trim().slice(-120));
        }
        const w = performance.now() - w0;
        perf.n++; perf.sum += w; perf.max = Math.max(perf.max, w);
    }
}
const perf = { n: 0, sum: 0, max: 0 };
function loadingText(t) { $('#loading').textContent = t; }

let joining = false, joinTask = null, worldReady = null;
async function joinServer() {
    const endpointTask = serverEndpoint();
    endpointTask.catch(() => {});
    await waitForLogin(400);
    const saved = (storageGet('bgt_name') || '').slice(0, 20);
    for (let attempt = 0; ; attempt++) {
        try { return await connect(BX.identity().loggedIn ? '' : saved, attempt === 0 ? await endpointTask : null); } catch (e) {
            if (attempt >= 4) throw e;
            console.warn('[join] attempt', attempt + 1, 'failed:', e && e.message);
            loadingText('Waking up a server…');
            await sleep(2000 * (attempt + 1));
        }
    }
}
async function play() {
    if (joining || running) return;
    joining = true;
    const err = $('#connectErr'), retry = $('#playBtn');
    err.hidden = true; retry.hidden = true;
    $('#loading').hidden = false;
    if (!joinTask) joinTask = joinServer();
    initAudio();
    try {
        await worldReady;
        loadingText('Joining a garden…');
        $('#loadBar').style.width = '90%';
        BX.loadingStep('Joining a server…');
        await joinTask;
        // the first state (the greenhouses and their plants)
        const t0 = performance.now();
        while ((myPlot < 0 || !net.room.state.plots || !net.room.state.plots.length) && performance.now() - t0 < 6000) await sleep(50);
        syncGarden();
    } catch (e) {
        joinTask = null;
        console.error(e);
        joining = false;
        loadingText('');
        err.hidden = false;
        err.textContent = 'Could not reach the game server. Check your connection and try again.';
        retry.hidden = false;
        BX.loadingEnd();
        return;
    }
    joining = false;
    running = true;
    S.joinedAt = Date.now();
    startMusic();
    $('#start').hidden = true;
    $('#hud').hidden = false;
    $('#touch').hidden = !isTouch;
    if (!rig) buildPlayer(0, 0);
    respawn();
    cam.pitch = 0.32;
    addPlotPrompts();
    showTips();
    setTimeout(() => bigText('🌱 BUILD A GARDEN TOWER!', '#7dff6b'), 500);
    toast(S.q.tut < TUTORIAL.length ? '👋 Welcome! This greenhouse is yours. Follow the arrows to the Seed Shop!' : '👋 Welcome back to your garden, ' + (S.name || 'gardener') + '!', '#ffffff');
    setTimeout(() => { if (audioSuspended()) toast('🔊 Click or tap anywhere for the sound!', '#7de8ff'); }, 3500);
    canvas.focus();
    loadSecs = Math.round(performance.now() / 100) / 10;
    metaT = 8;
    BX.loadingEnd();
}
function waitForLogin(ms) {
    if (!BX.bloxity.ready || BX.identity().loggedIn) return Promise.resolve();
    return new Promise((res) => {
        const t0 = performance.now();
        (function check() { if (BX.identity().loggedIn || performance.now() - t0 > ms) res(); else setTimeout(check, 100); })();
    });
}
function showTips() {
    if (isTouch) return;
    const el = $('#tips');
    const k = (key, what) => `<span><kbd>${key}</kbd>${what}</span>`;
    el.innerHTML = pad.connected
        ? k('L', 'Move') + k('R', 'Camera') + k('A', 'Jump') + k('X', 'Use') + k('LB/RB', 'Seeds') + k('RT', 'Plant')
        : k('WASD', 'Move') + k('Drag', 'Camera') + k('Space', 'Jump') + k('E', 'Use') + k('1-9', 'Seeds') + k('Click', 'Plant') + k('R', 'Turn') + k('F', 'Floors');
    el.hidden = false; el.style.opacity = 1;
    setTimeout(() => { el.style.opacity = 0; }, 14000);
    setTimeout(() => { el.hidden = true; }, 14900);
}
function unlockAudioOnGesture() {
    const unlock = () => {
        resumeAudio();
        if (!audioSuspended()) for (const ev of ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend', 'click']) removeEventListener(ev, unlock, true);
    };
    for (const ev of ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend', 'click']) addEventListener(ev, unlock, true);
}
function wirePortalSettings() {
    const embedded = (fn) => (v) => { if (BX.isEmbedded()) fn(v); };
    const pct = (v) => { const n = parseFloat(String(v)); if (!isFinite(n)) return undefined; return clamp(n > 1 ? n / 100 : n, 0, 1); };
    BX.listenSetting('master_volume', embedded((v) => { const p = pct(v); if (p !== undefined) setVolume('master', p); }));
    BX.listenSetting('music_volume', embedded((v) => { const p = pct(v); if (p !== undefined) setVolume('music', p); }));
    BX.listenSetting('graphics_quality', embedded((v) => setQuality(v === 'Low' ? 'low' : v === 'Medium' ? 'medium' : 'high', true)));
    BX.listenSetting('camera_sensitivity', embedded((v) => { camSens = clamp(parseFloat(v) || 1, 0.1, 5); }));
    BX.listenSetting('show_fps', (v) => { showFps = v === 'true'; $('#fps').hidden = !showFps; });
}
function wirePortalEvents() {
    BX.onPortalEvent((event, data) => {
        if (event === 'respawn_request') { if (running) respawn(); }
        else if (event === 'open_daily') openDaily();
        else if (event === 'chat_message_sent' && data) net.send('chat', { text: String(data) });
        else if (event === 'play_emote' && data) { playEmoteOn(localAvatar, String(data)); net.send('emote', { id: String(data) }); }
    });
    BX.onAvatarChanged(() => syncMyAvatar());
    BX.onProportionsChanged(() => syncMyAvatar());
}

// ----- build the garden and warm up the GPU while the loading screen is up -----
const pause = () => new Promise((r) => setTimeout(r, 0));
async function prepareWorld() {
    const step = (t, k) => { loadingText(t); BX.loadingStep(t); if (k) $('#loadBar').style.width = Math.round(k * 100) + '%'; };
    step('Loading fonts…', 0.12);
    try { await Promise.race([Promise.all([document.fonts.load('700 40px Fredoka'), document.fonts.load('900 40px Montserrat')]), sleep(2500)]); } catch (e) { /* fallback font */ }
    step('Planting the market…', 0.3);
    await buildWorld(pause);
    step('Building the greenhouses…', 0.45);
    buildPlots();
    await pause();
    refreshNear();
    step('Watering the seeds…', 0.6);
    camera.position.set(0, 30, 60); camera.lookAt(0, 8, 0); camera.updateMatrixWorld();
    // stand-ins for the warm-up: every plant, every pet, one of each effect, the player model.
    // Never disposed (that keeps their shaders alive).
    const extras = [fxWarmGroup(), plantWarmGroup(), petWarmGroup()];
    for (const g of extras.slice(1)) g.position.set(0, 0, 40);
    const blocky = buildRig({ ...KITS[0], skin: SKINS[0] }); blocky.position.set(0, 0, 40); extras.push(blocky);
    const crates = new T.Mesh(crateGeo(3), crateMat); crates.position.set(4, 0, 40); crates.castShadow = true; extras.push(crates);
    showGhost('apple', new V3(0, 0, 44), 0, true, 0);
    try {
        const base = await Promise.race([loadBase(), sleep(4000)]);
        const a = base ? await createAvatar(null) : null;
        if (a) {
            a.root.position.set(0, 0, 40);
            a.update(1 / 60, { t: 0, carry: true });
            extras.push(a.root, avatarVariants(a.root));
        }
    } catch (e) { /* the player model's shaders compile when it first shows instead */ }
    for (const o of extras) scene.add(o);
    fxShowAll(true);
    void flyWarm;
    step('Polishing the glass…', 0.75);
    await warmUp(renderer, camera, pause);
    render();
    fxShowAll(false);
    hideGhost();
    for (const o of extras) scene.remove(o);
    console.info('[prewarm] ready,', renderer.info.programs.length, 'shaders');
}
function avatarVariants(root) {
    const tex = new T.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    tex.needsUpdate = true;
    const g = new T.Group();
    g.position.set(0, 0, 40);
    let sk = null;
    root.traverse((c) => { if (!sk && c.isSkinnedMesh) sk = c; });
    if (sk) {
        const s = new T.SkinnedMesh(sk.geometry, new T.MeshLambertMaterial({ map: tex }));
        s.bind(sk.skeleton, sk.bindMatrix);
        s.castShadow = true; s.receiveShadow = true;
        g.add(s);
    }
    const m = new T.Mesh(new T.BoxGeometry(0.1, 0.1, 0.1), new T.MeshLambertMaterial({ map: tex }));
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    return g;
}
async function boot() {
    BX.initBloxity();
    joinTask = joinServer();
    joinTask.catch(() => {});
    loadBase().catch(() => {});
    worldReady = prepareWorld();
    wirePortalSettings();
    wirePortalEvents();
    BX.onIdentity((id) => {
        if (net.room && id.loggedIn && id.token && !net.bloxity) net.send('auth', { token: id.token });
        if (net.room) { setupLocalAvatar(); syncMyAvatar(); }
    });
    addEventListener('pagehide', () => { try { if (net.room) net.room.leave(true); } catch (e) { /* closing anyway */ } });
    $('#playBtn').addEventListener('click', play);
    $('#reconnectBtn').addEventListener('click', () => location.reload());
    unlockAudioOnGesture();
    requestAnimationFrame(frame);
    play();
}
boot();

// Dev-only hooks for automated QA runs (stripped from production builds)
if (import.meta.env.DEV || import.meta.env.VITE_QA) {
    window.__qa = {
        P, S, cam, net, scene, camera, plots, renderer: () => renderer, audio: () => audioDebug(),
        input: (o) => Object.assign(botInput, o), jump: () => pressJump(),
        teleport: (x, y, z, yaw) => teleport(new V3(x, y, z), yaw),
        look: (yaw, pitch, dist) => { cam.yaw = yaw; cam.pitch = pitch; if (dist !== undefined) cam.dist = dist; },
        quality: (q) => setQuality(q),
        myPlot: () => myPlot, myPlants: () => myPlants().map((p) => ({ id: p.id, sp: p.sp, f: p.f, x: p.x, z: p.z, m: p.m, fa: p.fa, ripeIn: Math.round((p.fa - net.now()) / 100) / 10 })),
        local: () => myLocal(), toWorld: (lx, lz) => toWorld(myPlot, lx, lz),
        // walk-free helpers: stand on a local spot of your greenhouse (floor f)
        goLocal: (lx, lz, f) => { const w = toWorld(myPlot, lx, lz); teleport(new V3(w.x, floorY(f || 0) + 0.05, w.z), FRAMES[myPlot].yaw + Math.PI); },
        select: (k) => actions.selectSeed(k), place: () => ({ ...place, ok: placeOk, why: placeWhy }), confirm: () => confirmPlace(), rot: (r) => { placeRot = r; },
        setTap: (x, y, z) => { tapPoint = new V3(x, y, z); tapT = clockT; },
        state: () => ({
            x: +P.pos.x.toFixed(2), y: +P.pos.y.toFixed(2), z: +P.pos.z.toFixed(2), onGround: P.onGround, ground: P.ground && P.ground.mat,
            cash: S.cash, gems: S.gems, carry: S.carry, seeds: S.seeds, tut: S.q && S.q.tut, plot: myPlot, floors: myFloors(), crate: myPlot >= 0 ? plots[myPlot].crate : 0,
            plants: myPlants().length, ripe: ripeCount, programs: renderer.info.programs.length, sel: S.seedSel, prompt: activePrompt && activePrompt.label(),
        }),
        sim: (secs, f, jumpEvery) => { for (let i = 0; i < Math.round(secs * 60); i++) { if (jumpEvery && i % jumpEvery === 0) pressJump(); botInput.f = f || 0; update(1 / 60); updateCamera(1 / 60); } botInput.f = 0; return window.__qa.state(); },
        step: (n) => { for (let i = 0; i < n; i++) { update(1 / 60); updateCamera(1 / 60); } return window.__qa.state(); },
        frame: () => { updateCamera(1 / 60); render(); },
        prompt: () => usePrompt(), lift: () => liftAt(P.pos),
        give: (o) => net.send('qa', o),
        plotYaw: () => FRAMES[myPlot].yaw,
        guide: () => lastRoute && lastRoute.map((p) => [Math.round(p.x), Math.round(p.y), Math.round(p.z)]),
        camPos: () => { const a = camera.position, l = toLocal(myPlot, a.x, a.z); return [+a.x.toFixed(1), +a.y.toFixed(1), +a.z.toFixed(1), +l.x.toFixed(1), +l.z.toFixed(1)]; },
        // render stats with groups of things hidden (bisecting what costs what)
        diag: () => {
            const out = {}, groups = { plants: (o) => o.isInstancedMesh && o.customDepthMaterial, plots: (o) => plots.some((p) => p.group === o), world: (o) => o.name === 'world', others: (o) => o.isGroup && remotes.size && [...remotes.values()].some((r) => r.rig === o) };
            const measure = () => { renderer.info.reset(); renderer.info.autoReset = false; render(); const r = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; renderer.info.autoReset = true; return r; };
            out.all = measure();
            for (const [k, f] of Object.entries(groups)) { const hid = []; scene.traverse((o) => { if (o.visible && f(o)) { o.visible = false; hid.push(o); } }); out['no_' + k] = { ...measure(), n: hid.length }; for (const o of hid) o.visible = true; }
            let inst = 0; scene.traverse((o) => { if (o.isInstancedMesh && o.customDepthMaterial) inst += o.count; }); out.plantInstances = inst;
            out.shadow = renderer.shadowMap.enabled; out.ratio = renderer.getPixelRatio();
            return out;
        },
        perf: (reset) => { const r = { frames: perf.n, avgMs: +(perf.sum / Math.max(1, perf.n)).toFixed(2), maxMs: +perf.max.toFixed(1), fps: lastFps, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; if (reset) { perf.n = 0; perf.sum = 0; perf.max = 0; } return r; },
        panel: (sel) => { closeTop(); closeTop(); document.querySelector(sel).click(); },
        camAt: (p, t) => { camOverride = p ? [new V3(...p), new V3(...t)] : null; },
        camLocal: (lx, ly, lz, tx, ty, tz) => { const a = toWorld(myPlot, lx, lz), b = toWorld(myPlot, tx, tz); camOverride = [new V3(a.x, ly, a.z), new V3(b.x, ty, b.z)]; },
        // every species (and every mutation) laid out on your ground floor, ripe (client-side only)
        showcase: (mutAll, stage) => {
            const now = net.now();
            SPECIES.forEach((sp, i) => {
                const x = -22 + (i % 7) * 7.3, z = -16 + Math.floor(i / 7) * 8.5;
                const t0 = stage === 'young' ? now - 1500 : now - 100000, fs = stage === 'young' ? now + 4000 : now - 50000, fa = stage === 'young' ? now + 9000 : now - 1000;
                setPlant(myPlot, 'demo' + i, { sp: i, f: 0, x, z, r: 0, m: mutAll === undefined ? 0 : mutAll < 0 ? i % 6 : mutAll, t0, fs, fa });
            });
        },
    };
}
void petById; void FLOORS; void SPOTS; void hexOf; void myPets; void SPECIES;
