// HUD and panels: Cash and Gems at the top (the reference's big green $), the tutorial step with SKIP
// under them, the daily quest and the big Shop / Index / Floors / Pets buttons on the left (below the
// Bloxity overlay's corner), Auto Collect, the playtime gift, FREE PET and the wheel on the right, the
// hotbar of seeds at the bottom, the event timer bottom right. And every panel: the Seed Shop (with its
// stock and restock timer), floors, floor upgrades, pets and eggs, the Index, the Gem Shop, quests, the
// Beanstalk Wheel, gifts, settings and invites; the daily rewards and the egg hatching.
import { $ } from './engine.js';
import { S, actions, net } from './state.js';
import { sfx, setMusicDuck, getVolumes, setVolume } from './audio.js';
import * as BX from './bloxity.js';
import { getQuality, setQuality } from './fx.js';
import {
    CFG, SPECIES, SHOP_SEEDS, speciesById, RARITIES, MUTATIONS, FLOORS, MAX_FLOORS, FLOOR_UPS, FLOOR_UP_MAX, floorUpCost, upValueMult, upSpeedMult,
    upDoubleChance, unpackUps, PETS, petById, EGGS, eggById, PET_SLOTS, petBonus, PASSES, BOOSTS, eventAt, EVENTS, restockWindow, restockLeft, stockFor,
    TUTORIAL, GOALS, DAILY_QUESTS, INDEX_GEMS, INDEX_MUT_GEMS, GIFTS, FREE_PET_MINS, DAILY, WHEEL, WHEEL_SPIN_MINS, dailyStatus, rewardText, fmt, fmtComma,
    money, clock, playtimeText, clamp,
} from '../../shared/config.js';

const G = (n) => '💎 ' + fmt(n);
function setHtml(node, html) { if (node && node.innerHTML !== html) node.innerHTML = html; }
function setText(node, t) { if (node && node.textContent !== t) node.textContent = t; }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const promptEl = $('#promptBtn'), promptTxtEl = $('#promptTxt');
const rarTag = (r) => { const R = RARITIES[r]; return `<span class="rar o1" style="background:${R.rainbow ? 'linear-gradient(90deg,#ff5a7a,#ffd21e,#46ec50,#3ad8ff,#c45aff)' : R.css}">${R.name}</span>`; };
// Every button clicks
document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b) sfx(b.classList.contains('g-green') ? 'clickBuy' : 'click'); }, true);

// ----- Cash / Gems counters (count up smoothly) -----
let shownCash = 0, shownText = -1, shownGems = -1;
export function animateCounters(dt) {
    if (Math.abs(shownCash - S.cash) < 0.5) shownCash = S.cash;
    else shownCash += (S.cash - shownCash) * Math.min(1, dt * 8);
    const n = Math.round(shownCash);
    if (n !== shownText) { shownText = n; setText($('#cashVal'), money(n)); }
    if (S.gems !== shownGems) { shownGems = S.gems; setText($('#gemVal'), fmtComma(S.gems)); }
}
const replay = (el, cls) => { el.classList.remove(cls); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add(cls))); };
export function bumpCash() { replay($('#cashVal'), 'bump'); }
export function bumpGems() { replay($('#gemRow'), 'bump'); }

// =====================================================================================
// HUD refresh (10x a second, only touching what changed)
// =====================================================================================
export const sessionSecs = () => (S.sessionSecs || 0) + (Date.now() - S.profileAt) / 1000;
const playSecs = () => (S.playtime || 0) + (Date.now() - S.profileAt) / 1000;
export function myShop(now) {
    const w = restockWindow(now), sh = S.shop || {};
    return sh.w === w ? sh : { w, roll: w, bought: {} };
}
export function stockLeft(id, now) { const sh = myShop(now); return Math.max(0, (stockFor(sh.roll)[id] || 0) - ((sh.bought || {})[id] || 0)); }
export const myPlot = () => (net.room && S.plot >= 0 && net.room.state.plots ? net.room.state.plots[S.plot] : null);
export const myFloors = () => { const p = myPlot(); return p ? p.floors : 1; };
export const myUps = () => { const p = myPlot(); return p ? unpackUps(p.ups) : [[0, 0, 0]]; };
export function updateHud() {
    const now = net.now();
    // the tutorial (with SKIP), or nothing
    const q = S.q || {}, tut = q.tut < TUTORIAL.length ? TUTORIAL[q.tut] : null;
    // after it, the goals (with how far you are and what they pay)
    const goal = !tut && (q.goal || 0) < GOALS.length ? GOALS[q.goal] : null;
    $('#tutBanner').hidden = !tut && !goal;
    $('#skipBtn').hidden = !tut;
    if (tut) { setText($('#tutTxt'), tut.text); setText($('#tutTip'), tutTip(q, tut, now)); }
    else if (goal) {
        setText($('#tutTxt'), '🎯 ' + goal.text);
        setText($('#tutTip'), (goal.tip ? goal.tip + ' · ' : '') + fmtComma(Math.min(goal.n, S.goalP || 0)) + '/' + fmtComma(goal.n) + ' · 🎁 ' + rewardText(goal, S));
    }
    $('#btnWheel').classList.toggle('hint', !!goal && goal.kind === 'spin' && S.spins > 0);
    // the daily quest tracker: the first one not done yet
    const dq = S.dq || { p: {}, c: {} };
    const Q = DAILY_QUESTS.find((x) => !(dq.c || {})[x.id]);
    $('#questTrack').hidden = !Q;
    if (Q) {
        const p = Math.min(Q.n, (dq.p || {})[Q.id] || 0);
        setText($('#qtTxt'), Q.text); setText($('#qtNum'), p + '/' + Q.n + '  💎' + Q.gems);
        const w = Math.round(p / Q.n * 100) + '%'; if ($('#qtBar').style.width !== w) $('#qtBar').style.width = w;
    }
    // boosts
    const chip = (id, key, ic) => { const left = Math.max(0, Math.ceil(((S.boosts || {})[key] - now) / 1000)); $(id).hidden = !(left > 0); if (left > 0) setText($(id), ic + ' ' + clock(left)); };
    chip('#chipCash', 'cash2', '💵 x2 Cash'); chip('#chipGrow', 'grow2', '⏩ x2 Growth'); chip('#chipLuck', 'luck3', '🍀 x3 Luck');
    // right column
    $('#btnAuto').hidden = !!(S.passes || {}).AutoCollect;
    const secs = sessionSecs();
    const nextGift = GIFTS.findIndex((g, k) => !S.giftClaimed[k]);
    const giftReady = GIFTS.some((g, k) => !S.giftClaimed[k] && secs >= g.min * 60);
    $('#btnGift').hidden = nextGift < 0;
    $('#btnGift').classList.toggle('ready', giftReady);
    if (nextGift >= 0) setText($('#giftTime'), giftReady ? 'CLAIM!' : clock(GIFTS[nextGift].min * 60 - secs));
    const pl = playSecs(), petReady = pl >= FREE_PET_MINS * 60;
    $('#btnPet').hidden = !!S.freePet;
    $('#btnPet').classList.toggle('ready', petReady);
    setText($('#petTime'), petReady ? 'CLAIM!' : clock(FREE_PET_MINS * 60 - pl));
    const nextSpin = WHEEL_SPIN_MINS * 60 - ((S.spinSecs || 0) + (Date.now() - S.profileAt) / 1000);
    setText($('#wheelLb'), S.spins > 0 ? S.spins + ' spin' + (S.spins > 1 ? 's' : '') + '!' : clock(nextSpin));
    $('#wheelBadge').hidden = !(S.spins > 0);
    $('#dailyBadge').hidden = !dailyStatus(S.daily, now).can;
    const f = myFloors();
    $('#floorBadge').hidden = !(f < MAX_FLOORS && S.cash >= FLOORS[f].price);
    // the next floor: a bar filling up with your Cash (once the tutorial is done)
    // (shown once it's within reach: a fifth of the price saved, or when it's the goal)
    const fg = $('#floorGoal'), showFg = !tut && f < MAX_FLOORS && (S.cash >= FLOORS[f].price * 0.2 || (!!goal && goal.kind === 'floor'));
    fg.hidden = !showFg;
    if (showFg) {
        const F = FLOORS[f], ready = S.cash >= F.price;
        fg.classList.toggle('ready', ready);
        setText($('#fgTxt'), ready ? '🏢 BUILD ' + F.name.toUpperCase() + '!' : '🏢 ' + F.name + ': ' + money(S.cash) + ' / ' + money(F.price));
        const w = Math.round(Math.min(1, S.cash / F.price) * 100) + '%';
        if ($('#fgBar').style.width !== w) $('#fgBar').style.width = w;
    }
    $('#petBadge').hidden = !((S.pets || []).length > (S.eq || []).length && (S.eq || []).length < slots());
    // the event pill: what's on, or what's next
    const e = eventAt(now);
    $('#eventPill').classList.toggle('on', e.active);
    setText($('#evIc'), e.active ? e.ev.ic : '🕐');
    setText($('#evTxt'), e.active ? e.ev.name + ' ' + clock(e.left) : 'Next: ' + e.nextEv.name + ' ' + clock(e.next));
    setText($('#friendBoost'), 'Friend Boost: Grow Speed +' + Math.round(Math.min(CFG.friendMax, S.friends || 0) * CFG.friendBoost * 100) + '%');
    // carrying crates
    $('#carry').hidden = !(S.carry > 0);
    if (S.carry > 0) setText($('#carryTxt'), money(S.carry) + ' → SELL at the market!');
    if (modalKind === 'seeds' || modalKind === 'wheel' || modalKind === 'gifts' || modalKind === 'quests') refreshModal();
}
export const slots = () => PET_SLOTS + ((S.passes || {}).PetSlot ? 1 : 0);
// the tutorial's hint line: what to do right now
function tutTip(q, tut, now) {
    if (q.tut === TUTORIAL.length - 1 && !canBuyAny(now)) return 'Harvest and sell more crates to afford one! 📦';
    if (tut.kind === 'plant' && S.seedSel && S.seedSel !== 'shovel' && actions.onMyPlot && actions.onMyPlot()) return document.body.classList.contains('touch') ? 'Tap PLANT to plant it here! 🌱' : 'Click the floor to plant it here (or press E) 🌱';
    return tut.tip;
}
// can you afford any seed the Seed Shop has in stock right now?
export const canBuyAny = (now) => SHOP_SEEDS.some((sp) => S.cash >= sp.price && stockLeft(sp.id, now) > 0);

// ----- the hotbar: the shovel, then the seeds in your bag -----
let slotKey = '';
export function seedKeys() {
    return Object.keys(S.seeds || {}).filter((k) => S.seeds[k] > 0).sort((a, b) => {
        const sa = speciesById[a.split('*')[0]], sb = speciesById[b.split('*')[0]];
        return SPECIES.indexOf(sa) - SPECIES.indexOf(sb) || a.localeCompare(b);
    });
}
export function renderHotbar() {
    const keys = seedKeys();
    const key = keys.map((k) => k + ':' + S.seeds[k]).join(',') + '|' + S.seedSel;
    if (key === slotKey) return;
    slotKey = key;
    const box = $('#hotbar');
    box.innerHTML = '';
    const mk = (k, ic, name, count, cls, mut) => {
        const b = document.createElement('button');
        b.className = 'slot' + (S.seedSel === k ? ' on' : '') + (cls ? ' ' + cls : '');
        b.innerHTML = `<span class="si">${ic}</span><span class="sn o1">${esc(name)}</span>${count ? `<span class="sc o1">x${count}</span>` : ''}${mut ? `<span class="mut">${mut}</span>` : ''}`;
        b.title = name;
        b.dataset.k = k;
        b.addEventListener('click', () => actions.selectSeed && actions.selectSeed(S.seedSel === k ? '' : k));
        box.appendChild(b);
    };
    mk('shovel', '🪏', 'Shovel', 0, '');
    for (const k of keys) {
        const [id, m] = k.split('*'), sp = speciesById[id], mu = m !== undefined ? MUTATIONS[+m] : null;
        mk(k, sp.ic, (mu && mu.name ? mu.name + ' ' : '') + sp.name, S.seeds[k], 'r-' + sp.rarity, mu && mu.ic ? mu.ic : '');
    }
}

// ----- toasts, pop-ups, big words -----
export function toast(text, color) {
    const d = document.createElement('div');
    d.className = 'toast o';
    d.style.color = color || '#fff';
    d.textContent = text;
    const box = $('#toasts');
    box.appendChild(d);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => d.remove(), 3000);
}
let qpTimer;
export function questPop(title, sub, icon) {
    const el = $('#questPop');
    setText($('#qpTitle'), title); setText($('#qpSub'), sub);
    setText(el.querySelector('.gi'), icon || '💎');
    el.hidden = false; replay(el, 'go');
    clearTimeout(qpTimer);
    qpTimer = setTimeout(() => { el.hidden = true; }, 2800);
}
let bigTimer;
export function bigText(text, color) {
    const el = $('#bigText');
    setText(el, text); el.style.color = color || '#ffffff';
    el.hidden = false; replay(el, 'go');
    clearTimeout(bigTimer);
    bigTimer = setTimeout(() => { el.hidden = true; }, 2400);
}
export function flash(color, ms, peak) {
    const f = $('#flash');
    f.style.transition = 'none'; f.style.background = color || '#fff'; f.style.opacity = peak ?? 0.85;
    requestAnimationFrame(() => { f.style.transition = 'opacity ' + ((ms || 600) / 1000) + 's ease'; f.style.opacity = 0; });
}
export function notEnough(m) {
    toast('Not enough ' + (m.cur === 'gems' ? 'Gems' : 'Cash') + '! You need ' + (m.cur === 'gems' ? fmt(m.need) + ' more Gems' : money(m.need) + ' more') + ' for ' + m.name, '#ff7a8a');
}
// the label over your nearest plant: its name and how long until it's ripe (the reference's "3s")
let tagKey = '', tagX = -1, tagY = -1;
export function setPlantTag(t, x, y) {
    const el = $('#plantTag');
    if (!t) { if (!el.hidden) el.hidden = true; tagKey = ''; return; }
    el.hidden = false;
    const key = t.html + '|' + t.ready;
    if (key !== tagKey) { tagKey = key; el.innerHTML = t.html; el.classList.toggle('ready', !!t.ready); }
    if (Math.abs(x - tagX) > 0.5 || Math.abs(y - tagY) > 0.5) { tagX = x; tagY = y; el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`; }
}
export function setPlaceBar(on, why) {
    $('#placeBar').hidden = !on;
    if (on) { const w = $('#placeWhy'); setText(w, why || ''); w.style.color = why ? '#ff9a8a' : ''; }
    for (const id of ['#plantBtn', '#rotBtn', '#cancelBtn']) $(id).hidden = !on;
}

// =====================================================================================
// Purchases: a confirm card for the bigger ones (the server checks and takes the price)
// =====================================================================================
let pendingAct = null;
export function askConfirm(ic, title, text, costHtml, yesText, affordable, act, note) {
    pendingAct = act;
    setHtml($('#confirmIc'), ic);
    setText($('#confirmTitle'), title);
    setText($('#confirmText'), text);
    setHtml($('#confirmCost'), costHtml || '');
    const yes = $('#confirmYes');
    yes.disabled = !affordable;
    setText(yes, yesText);
    setText($('#confirmNote'), note || '');
    $('#confirm').hidden = false;
    setMusicDuck(true);
}
function closeConfirm() { $('#confirm').hidden = true; pendingAct = null; if (!modalOpen()) setMusicDuck(false); }
$('#confirmYes').addEventListener('click', () => { const a = pendingAct; closeConfirm(); if (a) a(); });
$('#confirmNo').addEventListener('click', closeConfirm);
$('#confirmClose').addEventListener('click', closeConfirm);
function buyWith(ic, name, desc, price, gems, act) {
    const short = price - (gems ? S.gems : S.cash);
    askConfirm(ic, name, desc, gems ? G(price) : money(price), short > 0 ? 'Need ' + (gems ? fmt(short) + ' 💎' : money(short)) + ' more' : 'Buy', short <= 0, act,
        short > 0 ? (gems ? 'Gems come from quests, the Index, gifts, the wheel and daily rewards!' : 'Harvest your plants and sell the crates for Cash!') : 'You have ' + (gems ? fmtComma(S.gems) + ' Gems' : money(S.cash)));
}
export function buyPass(key) {
    const p = PASSES[key];
    if (!p) return;
    if ((S.passes || {})[key]) { toast(p.name + ' already owned!', '#6fe0ff'); return; }
    buyWith(p.ic, p.name, p.desc, p.gems, true, () => net.send('pass', { id: key }));
}
export function buyBoost(key) { const b = BOOSTS[key]; buyWith(b.ic, b.name, b.desc, b.gems, true, () => net.send('boost', { id: key })); }
export function buyFloor() {
    const f = myFloors();
    if (f >= MAX_FLOORS) { toast('🏆 Your garden is as tall as it gets!', '#ffd23a'); return; }
    const F = FLOORS[f];
    buyWith('🏢', 'Build ' + F.name, 'A whole new floor on top of your greenhouse: room for ' + CFG.floorCap + ' more plants, with its own upgrades!', F.price, false, () => net.send('floor'));
}

// =====================================================================================
// Panels
// =====================================================================================
let modalKind = null, modalTab = null, modalArg = 0;
const PANEL_STYLE = { seeds: '', floors: 'purple', upgrades: 'blue', pets: 'orange', index: 'blue', shop: 'purple', quests: 'wood', wheel: 'orange', gifts: '', config: 'blue', invite: 'purple' };
export function openModal(kind, tab, arg) {
    modalKind = kind; modalTab = tab || null; modalArg = arg || 0;
    $('#panel').className = 'panel ' + (PANEL_STYLE[kind] || '');
    renderModal(true); $('#modal').hidden = false; setMusicDuck(true); if (actions.onPanel) actions.onPanel(true);
}
export function closeModal() { $('#modal').hidden = true; modalKind = null; setMusicDuck(false); if (actions.onPanel) actions.onPanel(false); }
export function refreshModal() { if (!$('#modal').hidden && modalKind !== 'invite' && modalKind !== 'config') renderModal(); }
export const modalOpen = () => !$('#modal').hidden;
export const modalIs = (k) => modalOpen() && modalKind === k;
$('#modalClose').addEventListener('click', closeModal);
$('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal') closeModal(); });
function el(tag, cls, html) { const d = document.createElement(tag); if (cls) d.className = cls; if (html !== undefined) d.innerHTML = html; return d; }
function sec(body, text) { body.appendChild(el('div', 'sec o1', esc(text))); }
function note(body, text) { body.appendChild(el('p', 'note o1', text)); }
function card(o) {
    const d = el('div', 'card' + (o.cls ? ' ' + o.cls : ''));
    d.innerHTML = `<div class="ic">${o.ic}</div><div class="nm">${esc(o.name)}</div>${o.desc ? `<div class="ds">${o.desc}</div>` : ''}`;
    if (o.btn) {
        const b = el('button', 'btn ' + (o.btnCls || 'g-green') + ' o1', o.btn);
        b.disabled = !!o.disabled;
        b.addEventListener('click', o.onClick);
        d.appendChild(b);
    }
    return d;
}
let tabsEl = null, hxEl = null;
function tabs(list) {
    const t = tabsEl;
    t.innerHTML = '';
    if (!list) return;
    for (const [id, label] of list) {
        const b = el('button', 'btn g-blue o1' + (modalTab === id ? ' on' : ''), label);
        b.addEventListener('click', () => { modalTab = id; renderModal(true); });
        t.appendChild(b);
    }
}
// Builds the panel off-screen and swaps it in only when something on it changed (replacing the
// buttons under the pointer would swallow clicks)
function renderModal(force) {
    const body = $('#modalBody'), tabBox = $('#modalTabs'), hx = $('#modalHx');
    const nb = document.createElement('div'), nt = document.createElement('div'), nh = document.createElement('div');
    tabsEl = nt; hxEl = nh;
    const titles = { seeds: 'SEEDS', floors: 'FLOORS', upgrades: 'UPGRADES', pets: 'PETS', index: 'INDEX', shop: 'GEM SHOP', quests: 'QUESTS', wheel: 'BEANSTALK WHEEL', gifts: 'GIFTS', config: 'SETTINGS', invite: 'INVITE' };
    let title = titles[modalKind] || '';
    tabs(null);
    const r = ({ seeds: renderSeeds, floors: renderFloors, upgrades: renderUpgrades, pets: renderPets, index: renderIndex, shop: renderShop, quests: renderQuests, wheel: renderWheel, gifts: renderGifts, config: renderConfig, invite: renderInvite }[modalKind] || (() => {}))(nb);
    if (typeof r === 'string') title = r;
    setText($('#modalTitle'), title);
    if (!force && nb.innerHTML === body.innerHTML && nt.innerHTML === tabBox.innerHTML && nh.innerHTML === hx.innerHTML) return;
    const scroll = body.scrollTop;
    body.replaceChildren(...nb.childNodes);
    tabBox.replaceChildren(...nt.childNodes);
    hx.replaceChildren(...nh.childNodes);
    body.scrollTop = scroll;
}
// ----- the Seed Shop -----
function renderSeeds(body) {
    const now = net.now();
    const rs = el('button', 'btn g-purple o1', '🔄 RESTOCK 💎' + CFG.restockGems);
    rs.style.fontSize = '0.95rem'; rs.style.padding = '0.15rem 0.6rem';
    rs.addEventListener('click', () => buyWith('🔄', 'Restock the Seed Shop', 'A fresh stock of seeds, just for you, right now!', CFG.restockGems, true, () => net.send('restock')));
    hxEl.appendChild(rs);
    for (const sp of SHOP_SEEDS) {
        const left = stockLeft(sp.id, now), have = (S.seeds || {})[sp.id] || 0;
        const row = el('div', 'seed' + (left ? '' : ' out'));
        row.innerHTML = `<span class="pk">${sp.ic}</span><span class="tx o1"><b>${esc(sp.name)} ${rarTag(sp.rarity)}</b>
            <small class="st ${left ? '' : 'out'}">${left ? 'STOCK: ' + left : 'OUT OF STOCK'}</small>
            <small>${money(sp.value)} / harvest · every ${sp.cycle}s${have ? ' · 🎒 ' + have : ''}</small></span>`;
        const bx = el('span', 'bx');
        const b1 = el('button', 'btn ' + (left && S.cash >= sp.price ? 'g-green' : 'g-grey') + ' o1', left ? money(sp.price) : 'SOLD OUT');
        b1.disabled = !left;
        b1.dataset.buy = sp.id;
        b1.addEventListener('click', () => { if (S.cash < sp.price) { notEnough({ need: sp.price - S.cash, name: sp.name, cur: 'cash' }); sfx('denied'); return; } net.send('buy', { id: sp.id }); });
        const b2 = el('button', 'btn ' + (left && S.gems >= sp.gems ? 'g-gold' : 'g-grey') + ' o1', '💎 ' + sp.gems);
        b2.disabled = !left;
        b2.addEventListener('click', () => { if (S.gems < sp.gems) { notEnough({ need: sp.gems - S.gems, name: sp.name, cur: 'gems' }); sfx('denied'); return; } net.send('buy', { id: sp.id, gems: true }); });
        bx.appendChild(b1); bx.appendChild(b2);
        row.appendChild(bx);
        body.appendChild(row);
    }
    note(body, '🌱 Every seed you buy grows into a plant that keeps fruiting. The shop restocks for everyone every 5 minutes.');
    return 'SEEDS (' + clock(restockLeft(now)) + ')';
}
// ----- floors -----
function renderFloors(body) {
    const f = myFloors(), plants = actions.plantCounts ? actions.plantCounts() : [];
    note(body, '🏢 Build your garden taller! Every floor holds ' + CFG.floorCap + ' plants and has its own upgrades. Teleport between your floors here (or use the lift pads).');
    FLOORS.forEach((F, i) => {
        const owned = i < f, next = i === f;
        const r = el('div', 'row' + (owned ? ' done' : ''));
        r.innerHTML = `<span class="ic">${owned ? '🏢' : next ? '🏗️' : '🔒'}</span><span class="tx o1"><b>${esc(F.name)}</b><small>${owned ? '🌱 ' + (plants[i] || 0) + '/' + CFG.floorCap + ' plants' : next ? 'Build it for ' + money(F.price) : 'Build Floor ' + i + ' first'}</small></span>`;
        const b = el('button', 'btn ' + (owned ? 'g-blue' : next ? (S.cash >= F.price ? 'g-green' : 'g-grey') : 'g-grey') + ' o1', owned ? (S.floor === i ? 'HERE' : 'TELEPORT') : next ? money(F.price) : 'LOCKED');
        b.disabled = (!owned && !next) || (owned && S.floor === i && actions.onMyPlot && actions.onMyPlot());
        b.addEventListener('click', () => { if (owned) { closeModal(); actions.goFloor && actions.goFloor(i); } else if (next) buyFloor(); });
        r.appendChild(b);
        body.appendChild(r);
    });
}
// ----- one floor's upgrades -----
function renderUpgrades(body) {
    const f = clamp(modalArg | 0, 0, myFloors() - 1), ups = myUps()[f] || [0, 0, 0];
    note(body, 'These upgrades help the plants on <b>Floor ' + (f + 1) + '</b>. You have ' + money(S.cash) + '.');
    const g = el('div', 'grid2');
    FLOOR_UPS.forEach((u, k) => {
        const lv = ups[k] || 0, cost = floorUpCost(f, u.id, lv);
        const now = [upValueMult(lv), upSpeedMult(lv), upDoubleChance(lv)][k], nxt = lv < FLOOR_UP_MAX ? [upValueMult(lv + 1), upSpeedMult(lv + 1), upDoubleChance(lv + 1)][k] : null;
        const show = (v) => (k === 2 ? Math.round(v * 100) + '%' : 'x' + v.toFixed(2));
        const d = el('div', 'up');
        const pips = Array.from({ length: FLOOR_UP_MAX }, (_, i) => `<i class="${i < lv ? 'f' : ''}"></i>`).join('');
        d.innerHTML = `<span class="ic">${u.ic}</span><span><span class="nm">${esc(u.name)}</span><br><span class="lv">Level ${lv}/${FLOOR_UP_MAX} · ${show(now)}${nxt !== null ? ' → ' + show(nxt) : ''}</span><span class="pips">${pips}</span></span>`;
        const b = el('button', 'btn ' + (cost !== null && cost <= S.cash ? 'g-green' : 'g-grey') + ' o1', cost === null ? 'MAX' : money(cost));
        b.disabled = cost === null;
        b.addEventListener('click', () => { if (cost > S.cash) { notEnough({ need: cost - S.cash, name: u.name, cur: 'cash' }); sfx('denied'); return; } net.send('fup', { f, id: u.id }); });
        d.appendChild(b);
        g.appendChild(d);
    });
    body.appendChild(g);
    if (myFloors() > 1) {
        const r = el('div', 'tabs'); r.style.padding = '0';
        for (let i = 0; i < myFloors(); i++) { const b = el('button', 'btn g-blue o1' + (i === f ? ' on' : ''), 'Floor ' + (i + 1)); b.addEventListener('click', () => { modalArg = i; renderModal(true); }); r.appendChild(b); }
        body.appendChild(r);
    }
    return 'FLOOR ' + (f + 1) + ' UPGRADES';
}
// ----- pets and eggs -----
const bonusText = (b) => [b.value ? '+' + Math.round(b.value * 100) + '% value' : '', b.speed ? '+' + Math.round(b.speed * 100) + '% speed' : '', b.luck ? 'x' + (1 + b.luck).toFixed(1) + ' luck' : ''].filter(Boolean).join(' · ');
function renderPets(body) {
    tabs([['mine', '🐾 My Pets'], ['eggs', '🥚 Eggs']]);
    const tab = modalTab || 'mine';
    if (tab === 'mine') {
        const pets = S.pets || [], eq = S.eq || [];
        const tot = petBonus(eq, pets);
        note(body, `Equipped ${eq.length}/${slots()} · ${bonusText(tot) || 'no bonus yet'}. Tap a pet to equip or unequip it.`);
        if (!pets.length) { note(body, '🥚 No pets yet! Hatch an egg at the Egg Shop in the market (or here, on the Eggs tab).'); return; }
        const g = el('div', 'grid');
        const sorted = [...pets].sort((a, b) => (eq.includes(b.u) - eq.includes(a.u)) || (PETS.indexOf(petById[b.id]) - PETS.indexOf(petById[a.id])));
        for (const it of sorted) {
            const d = petById[it.id], on = eq.includes(it.u);
            const c = el('div', 'pet' + (on ? ' on' : ''));
            c.innerHTML = `${on ? '<span class="eq">✅</span>' : ''}<span class="ic">${d.ic}</span><span class="nm">${esc(d.name)}</span>${rarTag(d.rarity)}<span class="bn">${bonusText(d.bonus)}</span>`;
            c.addEventListener('click', () => net.send('pet', { u: it.u, on: !on }));
            const rel = el('button', 'btn g-grey o1', '🗑');
            rel.style.cssText = 'position:absolute;left:0.2rem;top:0.2rem;font-size:0.7rem;padding:0 0.3rem;border-width:2px';
            rel.title = 'Release';
            rel.addEventListener('click', (e) => { e.stopPropagation(); askConfirm(d.ic, 'Release ' + d.name + '?', 'It will go back to the wild. You won\'t get it back!', '', 'Release', true, () => net.send('release', { u: it.u })); });
            c.appendChild(rel);
            g.appendChild(c);
        }
        body.appendChild(g);
    } else {
        const g = el('div', 'grid2');
        for (const e of EGGS) {
            const total = e.odds.reduce((a, x) => a + x[1], 0);
            const odds = e.odds.map(([id, w]) => `${petById[id].ic} ${Math.round(w / total * 1000) / 10}%`).join(' · ');
            const price = e.gems ? G(e.gems) : money(e.price), can = e.gems ? S.gems >= e.gems : S.cash >= e.price;
            const c = card({ ic: `<span style="display:inline-block;width:2.6rem;height:3.2rem;border-radius:50% 50% 45% 45% / 60% 60% 40% 40%;border:3px solid #10203a;background:radial-gradient(circle at 35% 30%,#fff,#${e.color.toString(16).padStart(6, '0')} 55%)"></span>`, name: e.name, desc: odds, cls: e.gems ? 'gem' : 'hot', btn: 'Hatch ' + price, btnCls: can ? 'g-green' : 'g-grey', onClick: () => { if (!can) { notEnough({ need: e.gems ? e.gems - S.gems : e.price - S.cash, name: e.name, cur: e.gems ? 'gems' : 'cash' }); sfx('denied'); return; } net.send('egg', { id: e.id }); } });
            g.appendChild(c);
        }
        body.appendChild(g);
        note(body, '🐾 Pets follow you round and boost your garden: more Cash per harvest, faster growth, luckier mutations. Equip up to ' + slots() + '.');
    }
}
// ----- the Index -----
function renderIndex(body) {
    const ix = S.index || {}, found = SPECIES.filter((s) => ix[s.id]).length;
    note(body, `📘 Grow a new plant: +${INDEX_GEMS} 💎 · find a new mutation of it: +${INDEX_MUT_GEMS} 💎. Mutations: ${MUTATIONS.slice(1).map((m) => m.ic + ' ' + m.name + ' x' + m.mult).join(' · ')}`);
    const g = el('div', 'grid');
    for (const sp of SPECIES) {
        const mask = ix[sp.id] || 0, known = !!mask;
        const c = el('div', 'ix' + (known ? '' : ' unk'));
        const dots = MUTATIONS.map((m, i) => `<i style="${mask & (1 << i) ? 'background:' + (i ? m.css : '#ffffff') : ''}" title="${m.name || 'Normal'}"></i>`).join('');
        c.innerHTML = `<span class="ic">${sp.ic}</span><span class="nm">${known ? esc(sp.name) : '???'}</span>${rarTag(sp.rarity)}<span class="muts">${dots}</span>${!sp.shop ? `<small style="font-size:0.66rem;font-weight:700">${esc(sp.how || '')}</small>` : ''}`;
        g.appendChild(c);
    }
    body.appendChild(g);
    return 'INDEX ' + found + '/' + SPECIES.length;
}
// ----- the Gem Shop -----
function renderShop(body) {
    tabs([['passes', '💎 Passes'], ['boosts', '⏱️ Boosts']]);
    const tab = modalTab || 'passes';
    const g = el('div', 'grid');
    if (tab === 'passes') {
        for (const [key, p] of Object.entries(PASSES)) {
            const own = !!(S.passes || {})[key];
            g.appendChild(card({ ic: p.ic, name: p.name, desc: esc(p.desc), cls: 'gem' + (own ? ' own' : ''), btn: own ? 'Owned' : G(p.gems), btnCls: own ? 'g-blue' : S.gems >= p.gems ? 'g-green' : 'g-grey', disabled: own, onClick: () => buyPass(key) }));
        }
    } else for (const [key, b] of Object.entries(BOOSTS)) g.appendChild(card({ ic: b.ic, name: b.name + ' ⏱️', desc: esc(b.desc), cls: 'hot', btn: G(b.gems), btnCls: S.gems >= b.gems ? 'g-green' : 'g-grey', onClick: () => buyBoost(key) }));
    body.appendChild(g);
    note(body, '💎 Gems come from daily quests, the Index, playtime gifts, the wheel, the Giant Beanstalk and daily rewards. You have ' + fmtComma(S.gems) + '. No real money, ever!');
}
// ----- quests -----
function renderQuests(body) {
    const q = S.q || {};
    if (q.tut < TUTORIAL.length) {
        sec(body, '🌱 Tutorial (' + q.tut + '/' + TUTORIAL.length + ') · +10 💎 when done');
        const r = el('div', 'row'); r.innerHTML = `<span class="ic">👉</span><span class="tx o1"><b>${esc(TUTORIAL[q.tut].text)}</b><small>${esc(TUTORIAL[q.tut].tip)}</small></span>`;
        body.appendChild(r);
    }
    const dq = S.dq || { p: {}, c: {} };
    const tomorrow = new Date(new Date(net.now()).toISOString().slice(0, 10) + 'T00:00:00Z').getTime() + 86400000;
    sec(body, '📋 Daily quests · new ones in ' + clock((tomorrow - net.now()) / 1000));
    for (const Q of DAILY_QUESTS) {
        const done = !!(dq.c || {})[Q.id], p = Math.min(Q.n, (dq.p || {})[Q.id] || 0);
        const r = el('div', 'row' + (done ? ' done' : ''));
        r.innerHTML = `<span class="ic">${done ? '✅' : '📌'}</span><span class="tx o1"><b>${esc(Q.text)}</b><small>${p}/${Q.n}</small></span><span class="bar"><i style="width:${Math.round(p / Q.n * 100)}%"></i></span><b class="o1">💎 ${Q.gems}</b>`;
        body.appendChild(r);
    }
}
// ----- the Beanstalk Wheel -----
let wheelAngle = 0, spinning = false;
function wheelHtml() {
    const n = WHEEL.length, segs = WHEEL.map((w, i) => `${w.color} ${i / n * 360}deg ${(i + 1) / n * 360}deg`).join(',');
    const icons = WHEEL.map((w, i) => {
        const a = (i + 0.5) / n * 360;
        const ic = w.cash ? '💵' : w.gems ? '💎' : w.seed ? speciesById[w.seed].ic : w.egg ? '🥚' : BOOSTS[w.boost].ic;
        return `<span style="transform:rotate(${a}deg) translate(-50%, -7.2rem) rotate(${-a}deg) translate(0, 0)">${ic}</span>`;
    }).join('');
    return `<div id="wheelBox"><div id="wheelPtr"></div><div id="wheelDisc" style="background:conic-gradient(${segs});transform:rotate(${wheelAngle}deg)">${icons}</div><div id="wheelHub">🌱</div></div>`;
}
function renderWheel(body) {
    const box = el('div', '', wheelHtml());
    body.appendChild(box);
    const nextSpin = WHEEL_SPIN_MINS * 60 - ((S.spinSecs || 0) + (Date.now() - S.profileAt) / 1000);
    const b = el('button', 'btn ' + (S.spins > 0 && !spinning ? 'g-green' : 'g-grey') + ' o', spinning ? 'SPINNING…' : S.spins > 0 ? '🎡 SPIN! (' + S.spins + ')' : 'Next spin in ' + clock(nextSpin));
    b.style.cssText = 'font-size:1.4rem;padding:0.4rem 2rem;justify-self:center';
    b.disabled = !(S.spins > 0) || spinning;
    b.addEventListener('click', () => { if (S.spins > 0 && !spinning) net.send('spin'); });
    body.appendChild(b);
    note(body, '🎡 You get a free spin for every ' + WHEEL_SPIN_MINS + ' minutes you play. Prizes: ' + WHEEL.map((w) => rewardText(w, S)).join(' · '));
}
export function spinWheelTo(k, text) {
    spinning = true;
    if (!modalIs('wheel')) openModal('wheel');
    const n = WHEEL.length, seg = 360 / n;
    const want = 360 - (k + 0.5) * seg + (Math.random() - 0.5) * seg * 0.6;
    wheelAngle = wheelAngle - (wheelAngle % 360) + 360 * 5 + want;
    requestAnimationFrame(() => { const d = $('#wheelDisc'); if (d) d.style.transform = `rotate(${wheelAngle}deg)`; });
    let last = 0;
    const t0 = performance.now();
    const tick = () => { const k2 = (performance.now() - t0) / 4000; if (k2 < 1) { const p = Math.floor((1 - Math.pow(1 - k2, 3)) * 40); if (p !== last) { last = p; sfx('tick'); } requestAnimationFrame(tick); } };
    tick();
    setTimeout(() => { spinning = false; sfx('win'); questPop(text, 'Beanstalk Wheel prize!', '🎡'); renderModal(true); }, 4100);
}
// ----- playtime gifts -----
function renderGifts(body) {
    note(body, 'Keep playing to unlock gifts! (' + Math.floor(sessionSecs() / 60) + ' min played this visit)');
    const g = el('div', 'grid');
    const secs = sessionSecs();
    GIFTS.forEach((gift, k) => {
        const claimed = !!S.giftClaimed[k], ready = secs >= gift.min * 60;
        g.appendChild(card({
            ic: gift.boost ? BOOSTS[gift.boost].ic : gift.gems ? '💎' : gift.egg ? '🥚' : '💵', name: rewardText(gift, S), desc: gift.min + ' min',
            cls: claimed ? 'own' : ready ? 'hot' : '', btn: claimed ? 'Claimed' : ready ? 'CLAIM' : clock(gift.min * 60 - secs), btnCls: ready && !claimed ? 'g-green' : 'g-grey',
            disabled: claimed || !ready, onClick: () => net.send('gift', { k }),
        }));
    });
    body.appendChild(g);
}
// ----- settings -----
function slider(body, ic, label, kind) {
    const r = el('div', 'row');
    r.innerHTML = `<span class="ic">${ic}</span><span class="tx" style="flex:0 0 8rem"><b class="o1">${label}</b></span>`;
    const s = el('input');
    s.type = 'range'; s.min = 0; s.max = 100; s.value = Math.round((getVolumes()[kind] ?? 1) * 100);
    s.setAttribute('aria-label', label);
    s.addEventListener('input', () => setVolume(kind, s.value / 100));
    r.appendChild(s);
    body.appendChild(r);
}
function renderConfig(body) {
    sec(body, 'Sound');
    slider(body, '🎵', 'Music', 'music');
    slider(body, '🌿', 'Steps & garden', 'asmr');
    slider(body, '🔔', 'Effects', 'sfx');
    sec(body, 'Graphics');
    const q = el('div', 'row');
    q.innerHTML = '<span class="ic">✨</span><span class="tx"><b class="o1">Quality</b><small class="o1">Low is smoothest on older PCs and phones</small></span>';
    for (const [k, n] of [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]) {
        const b = el('button', 'btn ' + (getQuality() === k ? 'g-green' : 'g-grey') + ' o1', n);
        b.addEventListener('click', () => { setQuality(k); renderModal(true); });
        q.appendChild(b);
    }
    body.appendChild(q);
    sec(body, 'Codes');
    const c = el('div', 'row');
    c.innerHTML = '<span class="ic">🎟️</span>';
    const inp = el('input', 'input'); inp.placeholder = 'Enter a code'; inp.maxLength = 24;
    const go = el('button', 'btn g-green o1', 'Redeem');
    go.addEventListener('click', () => { if (inp.value.trim()) net.send('code', { code: inp.value.trim() }); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); e.stopPropagation(); });
    c.appendChild(inp); c.appendChild(go);
    body.appendChild(c);
    const st = el('div', 'row');
    st.innerHTML = `<span class="ic">📊</span><span class="tx"><b class="o1">${fmt(S.harvests)} harvests · ${fmt(S.sells)} crates sold · ${myFloors()} floor${myFloors() > 1 ? 's' : ''}</b><small class="o1">Playtime ${playtimeText(S.playtime)} · Cash earned ${money(S.totalCash)} · Index ${Object.keys(S.index || {}).length}/${SPECIES.length}</small></span>`;
    body.appendChild(st);
}
export function codeResult(m) { toast(m.ok ? '🎟️ ' + m.text : m.text, m.ok ? '#7dff6b' : '#ff7a8a'); }
// ----- invite -----
function renderInvite(body) {
    note(body, 'Garden together! Friend Boost: +' + Math.round(CFG.friendBoost * 100) + '% growth speed for every Bloxity friend in your garden (up to +' + Math.round(CFG.friendBoost * CFG.friendMax * 100) + '%).');
    const r = el('div', 'row');
    r.innerHTML = '<span class="ic">🔗</span><span class="tx"><b class="o1">Invite link</b><small class="o1">Send it to a friend</small></span>';
    const b = el('button', 'btn g-green o1', 'Copy');
    b.addEventListener('click', async () => {
        const link = BX.getInviteLink() || location.href;
        try { await navigator.clipboard.writeText(link); toast('Invite link copied!', '#7dff6b'); } catch (e) { toast(link, '#ffffff'); }
    });
    r.appendChild(b);
    body.appendChild(r);
    const list = el('div', 'grid');
    body.appendChild(list);
    if (BX.bloxity.ready && BX.identity().loggedIn) {
        BX.getFriends().then((fr) => {
            if (!fr.length) { list.appendChild(el('p', 'note o1', 'No Bloxity friends yet.')); return; }
            for (const f of fr.slice(0, 24)) {
                const nm = f.displayName || f.username || 'Friend';
                list.appendChild(card({ ic: '🙂', name: nm, btn: 'Invite', onClick: async () => { const ok = await BX.inviteFriend(f._id || f.id); toast(ok ? 'Invited ' + nm + '!' : 'Could not invite ' + nm, ok ? '#7dff6b' : '#ff7a8a'); } }));
            }
        });
    } else note(body, 'Log in to Bloxity to invite your friends directly.');
}

// =====================================================================================
// Daily rewards (they pop up once the tutorial is done, never in the middle of it)
// =====================================================================================
export function openDailyOnJoin() {
    if (openDailyOnJoin.done || !dailyStatus(S.daily, net.now()).can) return;
    if ((S.q.tut || 0) < TUTORIAL.length) return;
    openDailyOnJoin.done = true;
    setTimeout(() => { if (!anyPopup()) openDaily(); else openDailyOnJoin.done = false; }, 2500);
}
export function openDaily() { renderDaily(); $('#daily').hidden = false; setMusicDuck(true); if (actions.onPanel) actions.onPanel(true); }
function renderDaily() {
    const st = dailyStatus(S.daily, net.now());
    const cards = $('#dailyCards');
    cards.innerHTML = '';
    DAILY.forEach((r, i) => {
        const done = i < st.day || (!st.can && i === st.day);
        const now = st.can && i === st.day;
        const d = el('div', 'dcard o1' + (done ? ' done' : '') + (now ? ' now' : ''));
        d.innerHTML = `<span class="d">Day ${i + 1}</span><span class="i">${r.seed ? speciesById[r.seed].ic : r.egg ? '🥚' : r.gems && !r.cash ? '💎' : '💵'}</span><span>${esc(rewardText(r, S))}</span>`;
        cards.appendChild(d);
    });
    $('#dailyClaim').disabled = !st.can;
    setText($('#dailyLeft'), st.can ? 'Your daily reward is ready!' : 'Come back tomorrow for Day ' + ((st.streak % 7) + 1) + '!');
}
$('#dailyClaim').addEventListener('click', () => { net.send('daily'); setTimeout(renderDaily, 300); });
$('#dailyClose').addEventListener('click', () => { $('#daily').hidden = true; setMusicDuck(false); if (actions.onPanel) actions.onPanel(false); });
export const refreshDaily = () => { if (!$('#daily').hidden) renderDaily(); };

// =====================================================================================
// Hatching an egg: it shakes, cracks, flashes, and out comes the pet
// =====================================================================================
let hatchT = [];
export function showHatch(m) {
    for (const t of hatchT) clearTimeout(t);
    hatchT = [];
    const d = petById[m.pet], egg = m.egg === 'free' ? null : eggById[m.egg];
    const box = $('#hatch'), eg = $('#hatchEgg');
    box.hidden = false; $('#hatchActs').hidden = true;
    setMusicDuck(true);
    if (actions.onPanel) actions.onPanel(true);
    eg.className = 'egg shake'; eg.textContent = egg ? '🥚' : '🎁';
    eg.style.filter = egg ? `drop-shadow(0 0 1.2rem #${egg.color.toString(16).padStart(6, '0')})` : '';
    setText($('#hatchT'), egg ? egg.name + '…' : 'FREE PET!');
    setText($('#hatchS'), '');
    for (let i = 0; i < 3; i++) hatchT.push(setTimeout(() => sfx('crack', i), 350 + i * 380));
    hatchT.push(setTimeout(() => {
        flash('#ffffff', 600, 0.9);
        sfx('hatch');
        eg.className = 'egg pet'; eg.textContent = d.ic; eg.style.filter = '';
        const R = RARITIES[d.rarity];
        $('#hatchT').innerHTML = esc(d.name) + '<br><span style="font-size:1.4rem;color:' + R.css + '">' + R.name.toUpperCase() + '</span>';
        setText($('#hatchS'), bonusText(d.bonus) + (m.eq ? ' · equipped!' : ' · open PETS to equip it'));
        $('#hatchActs').hidden = false;
    }, 1550));
}
$('#hatchOk').addEventListener('click', () => { $('#hatch').hidden = true; setMusicDuck(false); if (actions.onPanel) actions.onPanel(false); });

// =====================================================================================
// HUD buttons
// =====================================================================================
$('#btnShop').addEventListener('click', () => openModal('shop'));
$('#btnIndex').addEventListener('click', () => openModal('index'));
$('#btnFloors').addEventListener('click', () => openModal('floors'));
$('#btnPets').addEventListener('click', () => openModal('pets'));
$('#btnAuto').addEventListener('click', () => buyPass('AutoCollect'));
$('#btnWheel').addEventListener('click', () => openModal('wheel'));
$('#btnPet').addEventListener('click', () => { if (playSecs() >= FREE_PET_MINS * 60) net.send('freepet'); else toast('🫧 Your FREE PET is ready in ' + clock(FREE_PET_MINS * 60 - playSecs()) + '. Keep growing!', '#ffe24a'); });
$('#btnGift').addEventListener('click', () => {
    const secs = sessionSecs(), k = GIFTS.findIndex((g, i) => !S.giftClaimed[i] && secs >= g.min * 60);
    if (k >= 0) net.send('gift', { k }); else openModal('gifts');
});
$('#money').addEventListener('click', () => openModal('shop'));
$('#floorGoal').addEventListener('click', () => { const f = myFloors(); if (f < MAX_FLOORS && S.cash >= FLOORS[f].price) buyFloor(); else openModal('floors'); });
$('#btnHome').addEventListener('click', () => actions.travel && actions.travel('home'));
$('#btnMarket').addEventListener('click', () => actions.travel && actions.travel('market'));
$('#questTrack').addEventListener('click', () => openModal('quests'));
$('#btnQuests').addEventListener('click', () => openModal('quests'));
$('#btnConfig').addEventListener('click', () => openModal('config'));
$('#btnInvite').addEventListener('click', () => openModal('invite'));
$('#btnDaily').addEventListener('click', openDaily);
$('#skipBtn').addEventListener('click', () => net.send('skip'));
$('#eventPill').addEventListener('click', () => { const e = eventAt(net.now()); toast(e.active ? e.ev.ic + ' ' + e.ev.name + ': ' + e.ev.desc : '🕐 Next event: ' + e.nextEv.ic + ' ' + e.nextEv.name + ' in ' + clock(e.next) + '. ' + e.nextEv.desc, '#ffffff'); });
$('#carry').addEventListener('click', () => actions.guideSell && actions.guideSell());
actions.openSeeds = () => openModal('seeds');
actions.openFloors = () => openModal('floors');
actions.openUpgrades = (f) => openModal('upgrades', null, f);
actions.openPets = (tab) => openModal('pets', tab);
actions.openShop = (tab) => openModal('shop', tab);
actions.openWheel = () => openModal('wheel');
actions.openQuests = () => openModal('quests');
actions.openDaily = () => openDaily();

// Closes the topmost popup (Escape / controller B); false when nothing was open
export function closeTop() {
    if (!$('#hatch').hidden && !$('#hatchActs').hidden) { $('#hatchOk').click(); return true; }
    if (!$('#confirm').hidden) { closeConfirm(); return true; }
    if (!$('#daily').hidden) { $('#dailyClose').click(); return true; }
    if (modalOpen()) { closeModal(); return true; }
    return false;
}
export const anyPopup = () => ['#confirm', '#daily', '#modal', '#hatch'].some((id) => !$(id).hidden);
void EVENTS; void MUTATIONS;
