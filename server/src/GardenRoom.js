import { Room } from 'colyseus';
import { GameState, PlayerState, PlotState, PlantState } from './schema.js';
import {
    getProfile, hasProfile, markDirty, saveProfiles, adoptGuestProgress, loadProfile, releaseProfile,
    topProfiles, recordSession, saveSoon, USE_DB,
} from './profiles.js';
import { sealProfile, openSave } from './saves.js';
import { verifyBloxityToken } from './bloxity.js';
import {
    CFG, SPECIES, speciesById, speciesIndex, MUTATIONS, rollMutation, FLOORS, MAX_FLOORS, FLOOR_UPS, FLOOR_UP_MAX, floorUpCost,
    upDoubleChance, packUps, PETS, petById, EGGS, eggById, PET_SLOTS, PET_MAX, petBonus, PASSES, BOOSTS, eventAt, EVENT_LEN,
    restockWindow, stockFor, TUTORIAL, TUTORIAL_GEMS, DAILY_QUESTS, INDEX_GEMS, INDEX_MUT_GEMS, GIFTS, FREE_PET_MINS, DAILY,
    WHEEL, WHEEL_SPIN_MINS, dailyStatus, dayKey, CODES, cashScale, rewardText, growthMult, harvestValue, sellMult, luckMult,
    KITS, SKINS, clamp, fmt, money,
} from '../../shared/config.js';
import {
    PLOTS, CRATE, PLOT_SPAWN, PLOT_W, PLOT_D, toWorld, toLocal, floorY, canPlace, snap, nearMarket, BEAN_TOP, FRAMES,
} from '../../shared/garden.js';

const GREEN = '#7dff6b', GOLD = '#ffd028', BLUE = '#6fe0ff', PINK = '#ff7ad8';

function cleanName(name) {
    return String(name || '').replace(/[^\w .\-]/g, '').trim().slice(0, 20);
}
const randomName = () => 'Gardener' + Math.floor(1000 + Math.random() * 9000);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v, d) => (finite(v) ? v : d);
// Guest ids come from the browser; they can never claim a Bloxity identity
const guestUid = (uid, fallback) => String(uid || fallback).replace(/^legion_/, 'guest_').slice(0, 64);
const cleanAvatar = (av) => (typeof av === 'string' && av.length <= 2000 ? av : '');
// a seed in the bag: "apple" (its mutation is rolled when planted) or "apple*3" (it keeps mutation 3)
function parseSeed(key) {
    const [id, m] = String(key || '').split('*');
    if (!speciesById[id]) return null;
    if (m === undefined) return { id, m: -1 };
    const k = m | 0;
    return k >= 0 && k < MUTATIONS.length && String(k) === m ? { id, m: k } : null;
}
const weighted = (list, rnd) => {
    const total = list.reduce((a, x) => a + x[1], 0);
    let r = rnd() * total;
    for (const [v, w] of list) { if (r < w) return v; r -= w; }
    return list[list.length - 1][0];
};

export const liveRooms = new Set();

// One garden: up to 8 players, each with their own greenhouse on the ring. Movement is client-side;
// everything that earns or costs anything is checked here. Plants live in the players' profiles
// (they keep growing while you're away: their times are absolute) and are mirrored into the room
// state so everyone sees everyone's garden.
export class GardenRoom extends Room {
    maxClients = CFG.maxPlayers;

    onCreate() {
        liveRooms.add(this);
        this.setState(new GameState());
        for (let i = 0; i < PLOTS; i++) this.state.plots.push(new PlotState());
        this.setPatchRate(50);
        this.sessions = new Map();
        this.joinCount = 0;
        this.harvested = new Map();     // plot -> [id, value, double, ...] waiting to go out
        this.ev = { window: -1, active: false };
        this.rainT = 0; this.autoT = 0;

        const on = (type, fn) => this.onMessage(type, (client, m) => { try { fn.call(this, client, m || {}); } catch (e) { console.warn('[msg]', type, e.message); } });
        on('move', this.onMove);
        on('buy', this.onBuySeed);
        on('restock', this.onRestock);
        on('plant', this.onPlant);
        on('dig', this.onDig);
        on('harvest', this.onHarvest);
        on('collect', this.onCollect);
        on('sell', this.onSell);
        on('floor', this.onFloor);
        on('fup', this.onFloorUp);
        on('egg', this.onEgg);
        on('pet', this.onPet);
        on('release', this.onRelease);
        on('freepet', this.onFreePet);
        on('spin', this.onSpin);
        on('pass', this.onPass);
        on('boost', this.onBoost);
        on('daily', this.onDaily);
        on('gift', this.onGift);
        on('code', this.onCode);
        on('skip', this.onSkip);
        on('bean', this.onBean);
        on('meta', this.onMeta);
        on('auth', this.onBloxityLogin);
        on('avatar', this.onAvatar);
        on('emote', this.onEmote);
        on('chat', this.onChat);
        on('friends', this.onFriends);
        // QA only (QA=1, never on Legion): give yourself Cash, Gems, seeds, playtime
        if (process.env.QA === '1' && !process.env.BLOXITY_GAME_ID) on('qa', this.onQa);

        this.setSimulationInterval((ms) => this.update(ms), 100);
        this.clock.setInterval(() => this.broadcastBoards(), 10000);
        this.secAcc = 0;
    }

    async onAuth(client, options) {
        const legion = options && options.token ? await verifyBloxityToken(options.token) : null;
        return legion ? { legion } : { guest: true };
    }

    async onJoin(client, options, auth) {
        options = options || {};
        const guest = guestUid(options.uid, client.sessionId);
        let uid = guest, name = cleanName(options.name);
        if (auth && auth.legion) {
            uid = 'legion_' + auth.legion.id;
            name = cleanName(auth.legion.name) || name;
            await adoptGuestProgress(uid, guest, name);
        }
        await loadProfile(uid);
        // A fresh server on a temporary disk restores the browser's signed backup.
        // With a database the profile is never lost, so backups are not accepted at all.
        const restore = !USE_DB && !hasProfile(uid) && openSave(options.save, [uid, guest]);
        const profile = getProfile(uid, name, randomName());
        if (restore) { Object.assign(profile, restore); markDirty(); }
        this.fixProfile(profile);
        // the same player twice in one garden (two tabs): the newest takes over
        for (const o of this.sessions.values()) if (o.profile.uid === uid) { try { o.client.leave(4000); } catch (e) { /* gone */ } }
        const plot = this.freePlot();
        if (plot < 0) throw new Error('This garden is full');
        const player = new PlayerState();
        player.name = profile.name;
        player.pid = this.freePid();
        player.av = cleanAvatar(options.av);
        player.plot = plot;
        const sp = toWorld(plot, PLOT_SPAWN.x, PLOT_SPAWN.z);
        player.x = sp.x; player.y = 0; player.z = sp.z; player.ry = FRAMES[plot].yaw;
        player.kit = this.joinCount % KITS.length;
        player.skin = (this.joinCount * 3) % SKINS.length;
        this.joinCount++;
        this.state.players.set(client.sessionId, player);
        const now = Date.now();
        const s = {
            id: client.sessionId, client, profile, player, pid: player.pid, plot,
            pos: { x: player.x, y: 0, z: player.z }, joinedAt: now, giftClaimed: {}, friends: 0, guest, lastChat: 0,
            playSecs: 0, minAcc: 0, dirtyAt: 0, sealAt: 0, hvPending: 0,
            stats: { fresh: now - (profile.firstPlay || 0) < 60000, harvests: 0, sells: 0, planted: 0, buys: 0, eggs: 0, cash0: profile.totalCash, floors0: profile.garden.floors, touch: false, fps: 0 },
        };
        this.sessions.set(client.sessionId, s);
        this.away(s, now);
        this.attachPlot(s);
        this.syncPublic(s);
        client.send('hello', { now, bloxity: uid.startsWith('legion_'), plot });
        this.sendProfile(s, true);
        this.broadcastBoards(client);
    }
    freePid() {
        const used = new Set([...this.state.players.values()].map((p) => p.pid));
        for (let i = 1; i < 255; i++) if (!used.has(i)) return i;
        return 255;
    }
    freePlot() {
        // spread players round the ring: the free plot farthest from the others
        const taken = [];
        this.state.plots.forEach((p, i) => { if (p.owner) taken.push(i); });
        let best = -1, bd = -1;
        for (let i = 0; i < PLOTS; i++) {
            if (this.state.plots[i].owner) continue;
            const d = taken.length ? Math.min(...taken.map((j) => Math.min((i - j + PLOTS) % PLOTS, (j - i + PLOTS) % PLOTS))) : (i === 0 ? 9 : 0);
            if (d > bd) { bd = d; best = i; }
        }
        return best;
    }

    // Older saves / hand-edited data: keep every field the right shape
    fixProfile(p) {
        for (const k of ['cash', 'totalCash', 'gems', 'playtime', 'carry', 'spins', 'spinSecs', 'petN', 'harvests', 'sells', 'lastSeen']) if (!finite(p[k]) || p[k] < 0) p[k] = 0;
        p.cash = Math.floor(p.cash); p.gems = Math.floor(p.gems); p.spins = Math.min(99, Math.floor(p.spins));
        for (const k of ['seeds', 'index', 'daily', 'codes', 'passes', 'boosts', 'q', 'dq', 'shop', 'garden']) p[k] = obj(p[k]);
        for (const k of Object.keys(p.seeds)) { const n = Math.floor(num(p.seeds[k], 0)); if (!parseSeed(k) || n <= 0) delete p.seeds[k]; else p.seeds[k] = Math.min(9999, n); }
        for (const k of Object.keys(p.index)) { if (!speciesById[k]) delete p.index[k]; else p.index[k] = num(p.index[k], 1) | 0; }
        const g = p.garden;
        g.floors = clamp(Math.floor(num(g.floors, 1)), 1, MAX_FLOORS);
        g.crate = Math.max(0, num(g.crate, 0));
        g.ups = arr(g.ups).slice(0, g.floors).map((u) => FLOOR_UPS.map((_, k) => clamp(Math.floor(num(arr(u)[k], 0)), 0, FLOOR_UP_MAX)));
        while (g.ups.length < g.floors) g.ups.push([0, 0, 0]);
        g.next = Math.max(1, Math.floor(num(g.next, 1)));
        const seen = new Set();
        g.plants = arr(g.plants).filter((pl) => {
            if (!pl || !speciesById[pl.sp] || !(pl.f >= 0 && pl.f < g.floors) || !finite(pl.x) || !finite(pl.z)) return false;
            pl.id = String(pl.id || g.next++);
            if (seen.has(pl.id)) pl.id = String(g.next++);
            seen.add(pl.id);
            pl.r = clamp(Math.floor(num(pl.r, 0)), 0, 7); pl.m = clamp(Math.floor(num(pl.m, 0)), 0, MUTATIONS.length - 1);
            for (const k of ['t0', 'fs', 'fa']) pl[k] = num(pl[k], Date.now());
            return true;
        });
        p.floors = g.floors;
        p.pets = arr(p.pets).filter((x) => x && petById[x.id] && finite(x.u)).slice(0, PET_MAX);
        p.petN = Math.max(p.petN, ...p.pets.map((x) => x.u), 0);
        p.eq = arr(p.eq).filter((u) => p.pets.some((x) => x.u === u)).slice(0, this.slots(p));
        p.freePet = !!p.freePet;
        p.q.tut = clamp(Math.floor(num(p.q.tut, 0)), 0, TUTORIAL.length); p.q.pt = Math.max(0, Math.floor(num(p.q.pt, 0)));
        p.dq.p = obj(p.dq.p); p.dq.c = obj(p.dq.c); p.dq.day = String(p.dq.day || '');
        p.shop.bought = obj(p.shop.bought); p.shop.w = num(p.shop.w, -1); p.shop.roll = num(p.shop.roll, 0);
        p.bean = num(p.bean, -1);
        if (!finite(p.firstPlay)) p.firstPlay = Date.now();
    }
    slots(p) { return PET_SLOTS + (p.passes && p.passes.PetSlot ? 1 : 0); }

    // ----- the greenhouse in the room state -----
    attachPlot(s) {
        const p = s.profile, g = p.garden, plot = this.state.plots[s.plot];
        plot.plants.clear();
        plot.owner = s.id; plot.name = p.name; plot.floors = g.floors; plot.crate = g.crate; plot.ups = packUps(g.ups);
        for (const pl of g.plants) plot.plants.set(pl.id, this.plantState(pl));
    }
    plantState(pl) {
        const ps = new PlantState();
        this.copyPlant(ps, pl);
        return ps;
    }
    copyPlant(ps, pl) {
        ps.sp = speciesIndex[pl.sp]; ps.f = pl.f; ps.x = pl.x; ps.z = pl.z; ps.r = pl.r; ps.m = pl.m; ps.t0 = pl.t0; ps.fs = pl.fs; ps.fa = pl.fa;
    }
    syncPlant(s, pl) {
        const ps = this.state.plots[s.plot].plants.get(pl.id);
        if (ps) this.copyPlant(ps, pl);
    }
    detachPlot(i) {
        const plot = this.state.plots[i];
        plot.plants.clear();
        plot.owner = ''; plot.name = ''; plot.floors = 1; plot.crate = 0; plot.ups = '';
    }
    // what a plant on floor f grows and earns with right now
    ctx(s, f) {
        const p = s.profile;
        return { ups: p.garden.ups[f] || [0, 0, 0], pets: petBonus(p.eq, p.pets), boosts: p.boosts, passes: p.passes, friends: s.friends };
    }
    // Auto Collect while you were away: every ripe plant kept being harvested (up to 8 hours)
    away(s, now) {
        const p = s.profile;
        if (!p.passes.AutoCollect || !p.lastSeen) return;
        const until = Math.min(now, p.lastSeen + CFG.offlineCapSecs * 1000);
        let total = 0;
        for (const pl of p.garden.plants) {
            if (pl.fa > until) continue;
            const sp = speciesById[pl.sp], ctx = this.ctx(s, pl.f), cyc = sp.cycle * 1000 / growthMult({ ...ctx, boosts: {} }, 0);
            const n = 1 + Math.floor((until - pl.fa) / cyc);
            total += n * harvestValue(sp, pl.m, ctx);
            pl.fs = now; pl.fa = now + cyc;
            p.harvests += n;
        }
        if (total > 0) {
            p.garden.crate += Math.round(total);
            s.client.send('away', { cash: Math.round(total), mins: Math.round((until - p.lastSeen) / 60000) });
        }
    }

    onDrop(client) {
        this.allowReconnection(client, 30);
    }
    onReconnect(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        s.client = client;
        client.send('hello', { now: Date.now(), bloxity: s.profile.uid.startsWith('legion_'), plot: s.plot });
        this.sendProfile(s, true);
        this.broadcastBoards(client);
    }

    onLeave(client) {
        const s = this.sessions.get(client.sessionId);
        this.state.players.delete(client.sessionId);
        this.sessions.delete(client.sessionId);
        markDirty();
        if (!s) return;
        const p = s.profile;
        p.lastSeen = Date.now();
        if (this.state.plots[s.plot] && this.state.plots[s.plot].owner === s.id) this.detachPlot(s.plot);
        const st = s.stats;
        recordSession({
            at: new Date(), secs: Math.round((Date.now() - s.joinedAt) / 1000), fresh: st.fresh, touch: st.touch, fps: st.fps,
            tut: p.q.tut, harvests: st.harvests, sells: st.sells, planted: st.planted, buys: st.buys, eggs: st.eggs,
            cash: (p.totalCash || 0) - (st.cash0 || 0), floors0: st.floors0, floors: p.garden.floors, gifts: Object.keys(s.giftClaimed).length,
        }).catch((e) => console.warn('[stats]', e.message));
        if (!isOnline(p.uid)) releaseProfile(p.uid, isOnline);
    }

    onDispose() {
        liveRooms.delete(this);
        for (const s of this.sessions.values()) s.profile.lastSeen = Date.now();
        markDirty();
        return saveProfiles();
    }

    // ----- helpers -----
    syncPublic(s) {
        const p = s.profile, pl = s.player;
        pl.name = p.name;
        pl.carry = p.carry;
        pl.floors = p.garden.floors;
        pl.pets = p.eq.map((u) => { const it = p.pets.find((x) => x.u === u); return it ? it.id : ''; }).filter(Boolean).join(',');
        const plot = this.state.plots[s.plot];
        if (plot && plot.owner === s.id) { plot.name = p.name; plot.floors = p.garden.floors; plot.crate = p.garden.crate; plot.ups = packUps(p.garden.ups); }
    }
    // The player's private progress: straight away for anything they clicked on, at most four times a
    // second otherwise (dirty())
    sendProfile(s, seal) {
        const p = s.profile;
        s.dirtyAt = 0;
        const now = Date.now();
        this.shopOf(p, now);
        this.dqOf(p, now);
        const m = {
            cash: p.cash, totalCash: p.totalCash, gems: p.gems, playtime: p.playtime, seeds: p.seeds, carry: p.carry,
            pets: p.pets, eq: p.eq, freePet: p.freePet, index: p.index, q: p.q, dq: p.dq, daily: p.daily, codes: p.codes,
            passes: p.passes, boosts: p.boosts, spins: p.spins, spinSecs: p.spinSecs, shop: p.shop, bean: p.bean,
            harvests: p.harvests, sells: p.sells, firstPlay: p.firstPlay, giftClaimed: s.giftClaimed, sessionSecs: s.playSecs, now, plot: s.plot,
        };
        if (seal || now - s.sealAt > 10000) { s.sealAt = now; m.save = sealProfile(p); }
        s.client.send('profile', m);
    }
    dirty(s) { if (!s.dirtyAt) s.dirtyAt = Date.now(); markDirty(); }
    changed(s) { this.syncPublic(s); this.sendProfile(s); saveSoon(); }
    toast(s, text, color) { s.client.send('toast', { text, color: color || '#ffffff' }); }
    broke(s, need, name, gems) { s.client.send('broke', { need, name, cur: gems ? 'gems' : 'cash' }); }
    addCash(s, n) {
        n = Math.round(n);
        s.profile.cash += n;
        s.profile.totalCash += n;
    }
    // the Seed Shop's stock for this player: the 5-minute window's roll, minus what they bought in it
    shopOf(p, now) {
        const w = restockWindow(now);
        if (p.shop.w !== w) p.shop = { w, roll: w, bought: {} };
        return p.shop;
    }
    stockLeft(p, id, now) {
        const sh = this.shopOf(p, now);
        return (stockFor(sh.roll)[id] || 0) - (sh.bought[id] || 0);
    }
    dqOf(p, now) {
        const d = dayKey(now);
        if (p.dq.day !== d) p.dq = { day: d, p: {}, c: {} };
        return p.dq;
    }

    // ----- quests: the tutorial, then the daily quests -----
    bump(s, kind, n) {
        if (!n) return;
        const p = s.profile, q = p.q;
        if (q.tut < TUTORIAL.length) {
            const step = TUTORIAL[q.tut];
            if (step.kind === kind) {
                q.pt += n;
                if (q.pt >= step.n) this.tutNext(s, false);
            }
        }
        const dq = this.dqOf(p, Date.now());
        const Q = DAILY_QUESTS.find((x) => x.id === kind);
        if (Q && !dq.c[kind]) {
            dq.p[kind] = (dq.p[kind] || 0) + n;
            if (dq.p[kind] >= Q.n) {
                dq.c[kind] = true;
                p.gems += Q.gems;
                s.client.send('quest', { daily: kind, gems: Q.gems });
                this.dirty(s);
            }
        }
    }
    tutNext(s, skipped) {
        const p = s.profile, q = p.q;
        // the first harvest pays the tutorial's bonus (the reference gives you some Cash right there)
        if (TUTORIAL[q.tut].kind === 'harvest' && q.tut === 2) { this.addCash(s, CFG.tutorialBonus); this.toast(s, '🎉 Tutorial bonus: +' + money(CFG.tutorialBonus) + '!', GREEN); }
        q.tut++; q.pt = 0;
        const done = q.tut >= TUTORIAL.length;
        if (done) { p.gems += TUTORIAL_GEMS; p.spins += 1; }
        s.client.send('quest', { tut: q.tut - 1, done, gems: done ? TUTORIAL_GEMS : 0, skipped });
        this.changed(s);
    }
    onSkip(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s || s.profile.q.tut >= TUTORIAL.length) return;
        // skipping a step that can't be done yet: give what it needs (the Apple seed, the Onion...)
        this.tutNext(s, true);
    }
    // the Index: the first time you grow a plant (or a mutation of it)
    discover(s, spId, m) {
        const p = s.profile, bit = 1 << m, had = p.index[spId] || 0;
        if (had & bit) return;
        p.index[spId] = had | bit;
        const gems = had ? INDEX_MUT_GEMS : INDEX_GEMS + (m ? INDEX_MUT_GEMS : 0);
        p.gems += gems;
        s.client.send('discover', { sp: spId, m, gems, first: !had });
        this.dirty(s);
    }

    // ----- 10 times a second: harvests go out in batches; every second: time, events, Auto Collect -----
    update(ms) {
        const now = Date.now();
        this.secAcc += (ms || 100) / 1000;
        if (this.secAcc >= 1) { this.secAcc -= 1; this.tick(now); }
        if (this.harvested.size) {
            for (const [plot, h] of this.harvested) this.broadcast('hv', { p: plot, h });
            this.harvested.clear();
        }
        for (const s of this.sessions.values()) if (s.dirtyAt && now - s.dirtyAt > 250) { this.syncPublic(s); this.sendProfile(s); }
    }
    tick(now) {
        for (const s of this.sessions.values()) {
            const p = s.profile;
            p.playtime = (p.playtime || 0) + 1;
            s.playSecs++;
            s.minAcc++;
            if (s.minAcc >= 60) { s.minAcc = 0; this.bump(s, 'play', 1); }
            p.spinSecs = (p.spinSecs || 0) + 1;
            if (p.spinSecs >= WHEEL_SPIN_MINS * 60) { p.spinSecs = 0; p.spins = Math.min(99, p.spins + 1); this.toast(s, '🎡 You earned a free spin on the Beanstalk Wheel!', GOLD); this.dirty(s); }
            // mutations show once the plant has grown: announce them then (and fill the Index)
            for (const pl of p.garden.plants) if (pl.m && !pl.an && now >= pl.fs) { pl.an = true; this.mutated(s, pl, false); }
        }
        markDirty();
        this.events(now);
        this.autoT += 1;
        if (this.autoT >= CFG.autoEverySecs) {
            this.autoT = 0;
            for (const s of this.sessions.values()) if (s.profile.passes.AutoCollect) {
                let any = false;
                for (const pl of s.profile.garden.plants) if (now >= pl.fa) { this.harvest(s, pl, now, true); any = true; }
                if (any) this.dirty(s);
            }
        }
    }
    mutated(s, pl, byEvent) {
        const sp = speciesById[pl.sp], mu = MUTATIONS[pl.m];
        this.toast(s, mu.ic + ' Your ' + sp.name + ' is ' + mu.name.toUpperCase() + '! (x' + mu.mult + ' value)', mu.css);
        this.broadcast('mut', { p: s.plot, id: pl.id, m: pl.m, ev: byEvent });
        this.discover(s, pl.sp, pl.m);
    }
    // The events: a Growth Frenzy speeds up every plant already growing; golden / rainbow rain can
    // turn grown plants golden / rainbow
    events(now) {
        const e = eventAt(now);
        if (e.active && (!this.ev.active || this.ev.window !== e.window)) {
            this.ev = { window: e.window, active: true };
            if (e.ev.speed) {
                for (const s of this.sessions.values()) {
                    for (const pl of s.profile.garden.plants) if (pl.fa > now) { pl.fa = now + (pl.fa - now) / e.ev.speed; if (pl.fs > now) pl.fs = now + (pl.fs - now) / e.ev.speed; this.syncPlant(s, pl); }
                }
            }
        } else if (!e.active && this.ev.active) this.ev.active = false;
        if (e.active && e.ev.rain) {
            this.rainT++;
            if (this.rainT >= 5) {
                this.rainT = 0;
                const target = e.ev.rain === 'gold' ? 1 : 4, chance = e.ev.rain === 'gold' ? 0.003 : 0.0015;
                for (const s of this.sessions.values()) {
                    for (const pl of s.profile.garden.plants) {
                        if (pl.m || now < pl.fs || Math.random() >= chance * luckMult(s.profile, petBonus(s.profile.eq, s.profile.pets), now)) continue;
                        pl.m = target; pl.an = true;
                        this.syncPlant(s, pl);
                        this.mutated(s, pl, true);
                    }
                }
            }
        }
    }

    // ----- movement -----
    onMove(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !finite(m.x) || !finite(m.y) || !finite(m.z)) return;
        const pl = s.player;
        pl.x = clamp(m.x, -2000, 2000); pl.y = clamp(m.y, -100, 600); pl.z = clamp(m.z, -2000, 2000);
        pl.ry = finite(m.ry) ? m.ry : 0;
        pl.anim = clamp(m.a | 0, 0, 2);
        s.pos = { x: pl.x, y: pl.y, z: pl.z };
    }
    // where a local spot of this player's greenhouse is in the world
    near(s, lx, lz, f, reach) {
        const w = toWorld(s.plot, lx, lz);
        if ((s.pos.x - w.x) ** 2 + (s.pos.z - w.z) ** 2 > reach * reach) return false;
        return f === undefined || Math.abs(s.pos.y - floorY(f)) < 5;
    }

    // standing inside your own greenhouse (on floor f)
    inside(s, f) {
        const l = toLocal(s.plot, s.pos.x, s.pos.z);
        return Math.abs(l.x) < PLOT_W / 2 + 1 && Math.abs(l.z) < PLOT_D / 2 + 1 && Math.abs(s.pos.y - floorY(f)) < 5;
    }

    // ----- the Seed Shop -----
    onBuySeed(client, m) {
        const s = this.sessions.get(client.sessionId);
        const sp = speciesById[m.id];
        if (!s || !sp || !sp.shop) return;
        const p = s.profile, now = Date.now(), gems = !!m.gems;
        if (!nearMarket(s.pos.x, s.pos.z, 12)) return this.toast(s, 'Go to the Seed Shop at the market!', BLUE);
        if (this.stockLeft(p, sp.id, now) <= 0) return this.toast(s, sp.ic + ' ' + sp.name + ' is sold out! Restocks soon', '#ff9a8a');
        if (gems) {
            if (p.gems < sp.gems) return this.broke(s, sp.gems - p.gems, sp.name, true);
            p.gems -= sp.gems;
        } else {
            if (p.cash < sp.price) return this.broke(s, sp.price - p.cash, sp.name, false);
            p.cash -= sp.price;
        }
        p.shop.bought[sp.id] = (p.shop.bought[sp.id] || 0) + 1;
        p.seeds[sp.id] = (p.seeds[sp.id] || 0) + 1;
        s.stats.buys++;
        client.send('bought', { id: sp.id });
        this.bump(s, 'buy', 1);
        this.changed(s);
    }
    onRestock(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile;
        if (p.gems < CFG.restockGems) return this.broke(s, CFG.restockGems - p.gems, 'a restock', true);
        p.gems -= CFG.restockGems;
        p.shop = { w: restockWindow(Date.now()), roll: (Math.random() * 4e9) >>> 0, bought: {} };
        client.send('restocked', { own: true });
        this.changed(s);
    }

    // ----- planting -----
    // m: { k: seed key, f: floor, x, z: local spot, r: turn }
    onPlant(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !finite(m.x) || !finite(m.z)) return;
        const p = s.profile, g = p.garden, seed = parseSeed(m.k), f = m.f | 0;
        if (!seed || !(p.seeds[m.k] > 0)) return this.toast(s, 'You have no seeds of that kind', '#ff9a8a');
        if (f < 0 || f >= g.floors) return;
        const sp = speciesById[seed.id], x = snap(m.x), z = snap(m.z);
        const why = canPlace(g.plants, f, x, z, sp.r);
        if (why) return this.toast(s, '🚫 ' + why, '#ff9a8a');
        if (!this.inside(s, f) || !this.near(s, x, z, f, CFG.plantReach)) return this.toast(s, 'Plant it in your own greenhouse!', '#ff9a8a');
        const now = Date.now(), ctx = this.ctx(s, f);
        const grow = sp.grow * 1000 / growthMult(ctx, now);
        const e = eventAt(now);
        const mut = seed.m >= 0 ? seed.m : rollMutation(Math.random, luckMult(p, ctx.pets, now), e.active ? e.ev.bias : null);
        const pl = { id: String(g.next++), sp: sp.id, f, x, z, r: (m.r | 0) & 7, m: mut, t0: now, fs: now + grow * 0.55, fa: now + grow, an: !mut };
        g.plants.push(pl);
        this.state.plots[s.plot].plants.set(pl.id, this.plantState(pl));
        p.seeds[m.k]--;
        if (p.seeds[m.k] <= 0) delete p.seeds[m.k];
        s.stats.planted++;
        client.send('planted', { id: pl.id, sp: sp.id });
        this.discover(s, sp.id, 0);
        this.bump(s, 'plant', 1);
        this.changed(s);
    }
    // the shovel: up comes the plant. Shop seeds give back half their price; special ones come back as
    // a seed (keeping their mutation)
    onDig(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, g = p.garden, i = g.plants.findIndex((x) => x.id === String(m.id));
        if (i < 0) return;
        const pl = g.plants[i], sp = speciesById[pl.sp];
        if (!this.near(s, pl.x, pl.z, pl.f, 30)) return;
        g.plants.splice(i, 1);
        this.state.plots[s.plot].plants.delete(pl.id);
        let text;
        if (sp.shop) { const back = Math.round(sp.price * CFG.digRefund); this.addCash(s, back); text = '🪏 Dug up the ' + sp.name + ': +' + money(back); }
        else { const key = sp.id + '*' + pl.m; p.seeds[key] = (p.seeds[key] || 0) + 1; text = '🪏 Dug up the ' + sp.name + ': its seed is back in your bag'; }
        client.send('dug', { id: pl.id, text });
        this.changed(s);
    }

    // ----- harvesting: step on a ripe plant -----
    onHarvest(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !Array.isArray(m.ids)) return;
        const g = s.profile.garden, now = Date.now();
        let n = 0;
        for (const id of m.ids.slice(0, 40)) {
            const pl = g.plants.find((x) => x.id === String(id));
            if (!pl || now < pl.fa - 400) continue;
            const sp = speciesById[pl.sp];
            if (!this.near(s, pl.x, pl.z, pl.f, sp.r + CFG.harvestReach + 6)) continue;
            this.harvest(s, pl, now, false);
            n++;
        }
        if (n) this.dirty(s);
    }
    harvest(s, pl, now, auto) {
        const p = s.profile, sp = speciesById[pl.sp], ctx = this.ctx(s, pl.f);
        const double = Math.random() < upDoubleChance(ctx.ups[2]);
        const v = Math.max(1, Math.round(harvestValue(sp, pl.m, ctx) * (double ? 2 : 1)));
        p.garden.crate += v;
        pl.fs = now; pl.fa = now + sp.cycle * 1000 / growthMult(ctx, now);
        this.syncPlant(s, pl);
        this.state.plots[s.plot].crate = p.garden.crate;
        p.harvests++;
        s.stats.harvests++;
        let h = this.harvested.get(s.plot);
        if (!h) this.harvested.set(s.plot, h = []);
        h.push(pl.id, v, double ? 1 : 0);
        if (!auto || p.q.tut >= TUTORIAL.length) this.bump(s, 'harvest', 1);
    }

    // ----- the crates: grab them, carry them to the market, sell them -----
    onCollect(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, g = p.garden;
        if (g.crate <= 0) return;
        if (!this.near(s, CRATE.x, CRATE.z, undefined, CFG.crateReach + 7)) return;
        p.carry += g.crate;
        g.crate = 0;
        this.state.plots[s.plot].crate = 0;
        client.send('collected', { carry: p.carry });
        this.bump(s, 'collect', 1);
        this.changed(s);
    }
    onSell(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile;
        if (p.carry <= 0 || !nearMarket(s.pos.x, s.pos.z, 10)) return;
        const cash = Math.max(1, Math.round(p.carry * sellMult(p, Date.now())));
        p.carry = 0;
        this.addCash(s, cash);
        p.sells++;
        s.stats.sells++;
        this.broadcast('sold', { s: s.id, cash });
        this.bump(s, 'sell', 1);
        this.changed(s);
    }

    // ----- floors and their upgrades -----
    onFloor(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, g = p.garden;
        if (g.floors >= MAX_FLOORS) return this.toast(s, '🏆 Your garden is as tall as it gets!', GOLD);
        const price = FLOORS[g.floors].price;
        if (p.cash < price) return this.broke(s, price - p.cash, FLOORS[g.floors].name, false);
        p.cash -= price;
        g.floors++;
        g.ups.push([0, 0, 0]);
        p.floors = g.floors;
        s.stats.buys++;
        this.broadcast('floor', { p: s.plot, floors: g.floors, name: p.name });
        this.changed(s);
        this.broadcastBoards();
    }
    onFloorUp(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, g = p.garden, f = m.f | 0, k = FLOOR_UPS.findIndex((u) => u.id === m.id);
        if (f < 0 || f >= g.floors || k < 0) return;
        const lv = g.ups[f][k], cost = floorUpCost(f, m.id, lv);
        if (cost === null) return this.toast(s, FLOOR_UPS[k].ic + ' ' + FLOOR_UPS[k].name + ' is maxed out!', BLUE);
        if (p.cash < cost) return this.broke(s, cost - p.cash, FLOOR_UPS[k].name, false);
        p.cash -= cost;
        g.ups[f][k] = lv + 1;
        s.stats.buys++;
        client.send('upgraded', { f, id: m.id, lv: lv + 1 });
        this.changed(s);
    }

    // ----- pets -----
    hatch(s, egg) {
        const p = s.profile;
        const id = weighted(egg.odds, Math.random);
        const u = ++p.petN;
        p.pets.push({ u, id });
        if (p.eq.length < this.slots(p)) p.eq.push(u);
        s.stats.eggs++;
        s.client.send('hatch', { egg: egg.id, pet: id, u, eq: p.eq.includes(u) });
        this.changed(s);
    }
    onEgg(client, m) {
        const s = this.sessions.get(client.sessionId);
        const egg = eggById[m.id];
        if (!s || !egg) return;
        const p = s.profile;
        if (p.pets.length >= PET_MAX) return this.toast(s, '🐾 Your pet bag is full! Release some pets first', '#ff9a8a');
        if (egg.gems) {
            if (p.gems < egg.gems) return this.broke(s, egg.gems - p.gems, egg.name, true);
            p.gems -= egg.gems;
        } else {
            if (p.cash < egg.price) return this.broke(s, egg.price - p.cash, egg.name, false);
            p.cash -= egg.price;
        }
        s.stats.buys++;
        this.hatch(s, egg);
    }
    onPet(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, u = m.u | 0;
        if (!p.pets.some((x) => x.u === u)) return;
        const i = p.eq.indexOf(u);
        if (m.on && i < 0) {
            if (p.eq.length >= this.slots(p)) return this.toast(s, '🐾 You can equip ' + this.slots(p) + ' pets. Unequip one first!', BLUE);
            p.eq.push(u);
        } else if (!m.on && i >= 0) p.eq.splice(i, 1);
        this.changed(s);
    }
    onRelease(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, u = m.u | 0, i = p.pets.findIndex((x) => x.u === u);
        if (i < 0) return;
        p.pets.splice(i, 1);
        p.eq = p.eq.filter((x) => x !== u);
        this.changed(s);
    }
    onFreePet(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile;
        if (p.freePet) return;
        if (p.playtime < FREE_PET_MINS * 60 - 3) return this.toast(s, 'Play a little longer for your FREE PET!', BLUE);
        p.freePet = true;
        const u = ++p.petN;
        p.pets.push({ u, id: 'blob' });
        if (p.eq.length < this.slots(p)) p.eq.push(u);
        client.send('hatch', { egg: 'free', pet: 'blob', u, eq: p.eq.includes(u) });
        this.changed(s);
    }

    // ----- rewards -----
    giveReward(s, r) {
        const p = s.profile;
        if (r.cash) this.addCash(s, r.cash * cashScale(p));
        if (r.gems) p.gems += r.gems;
        if (r.seed) p.seeds[r.seed] = (p.seeds[r.seed] || 0) + 1;
        if (r.boost) { const now = Date.now(); p.boosts[r.boost] = Math.max(now, p.boosts[r.boost] || 0) + BOOSTS[r.boost].mins * 60000; }
        if (r.egg) this.hatch(s, eggById[r.egg]);
    }
    onSpin(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile;
        if (p.spins <= 0) return this.toast(s, '🎡 No spins left: you get one every ' + WHEEL_SPIN_MINS + ' minutes you play', BLUE);
        p.spins--;
        const k = weighted(WHEEL.map((w, i) => [i, w.w]), Math.random);
        const r = WHEEL[k];
        client.send('spun', { k, text: rewardText(r, p) });
        // the reward lands when the wheel stops
        this.clock.setTimeout(() => { if (!this.sessions.has(s.id)) { this.giveReward(s, r); markDirty(); return; } this.giveReward(s, r); this.changed(s); }, 4200);
        this.dirty(s);
    }
    onPass(client, m) {
        const s = this.sessions.get(client.sessionId);
        const key = String(m.id || ''), pass = PASSES[key];
        if (!s || !pass) return;
        const p = s.profile;
        if (p.passes[key]) return this.toast(s, pass.name + ' already owned!', BLUE);
        if (p.gems < pass.gems) return this.broke(s, pass.gems - p.gems, pass.name, true);
        p.gems -= pass.gems;
        p.passes[key] = true;
        s.stats.buys++;
        client.send('fx', { kind: 'pass', id: key });
        this.toast(s, pass.ic + ' ' + pass.name + ' unlocked!', GREEN);
        this.changed(s);
    }
    onBoost(client, m) {
        const s = this.sessions.get(client.sessionId);
        const key = String(m.id || ''), b = BOOSTS[key];
        if (!s || !b) return;
        const p = s.profile;
        if (p.gems < b.gems) return this.broke(s, b.gems - p.gems, b.name, true);
        p.gems -= b.gems;
        this.giveReward(s, { boost: key });
        s.stats.buys++;
        client.send('fx', { kind: 'boost', id: key });
        this.toast(s, b.ic + ' ' + b.name + ' for ' + b.mins + ' minutes!', GOLD);
        this.changed(s);
    }
    onDaily(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, now = Date.now();
        const st = dailyStatus(p.daily, now);
        if (!st.can) return this.toast(s, 'Come back tomorrow for more!', BLUE);
        const r = DAILY[st.day];
        p.daily = { last: dayKey(now), streak: st.streak + 1 };
        this.toast(s, 'Day ' + p.daily.streak + ' reward: ' + rewardText(r, p) + '!', GREEN);
        this.giveReward(s, r);
        client.send('fx', { kind: 'daily' });
        this.changed(s);
    }
    onGift(client, m) {
        const s = this.sessions.get(client.sessionId);
        const k = m.k | 0, g = GIFTS[k];
        if (!s || !g || s.giftClaimed[k]) return;
        if (s.playSecs < g.min * 60 - 2) return this.toast(s, 'Keep playing to unlock this gift!', BLUE);
        s.giftClaimed[k] = true;
        this.toast(s, '🎁 ' + rewardText(g, s.profile) + '!', GREEN);
        this.giveReward(s, g);
        client.send('fx', { kind: 'gift' });
        this.changed(s);
    }
    onCode(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const code = String(m.code || '').trim().toUpperCase().slice(0, 24);
        const r = CODES[code];
        const p = s.profile;
        if (!r) return client.send('codeResult', { ok: false, text: 'Invalid code' });
        if (p.codes[code]) return client.send('codeResult', { ok: false, text: 'Code already used' });
        p.codes[code] = true;
        client.send('codeResult', { ok: true, text: rewardText(r, p) + '!' });
        this.giveReward(s, r);
        this.changed(s);
    }
    // The Giant Beanstalk: reach the cloud at the top during the event for a Magic Bean
    onBean(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, e = eventAt(Date.now());
        if (!e.active || e.ev.id !== 'beanstalk' || p.bean === e.window) return;
        if ((s.pos.x - BEAN_TOP.x) ** 2 + (s.pos.z - BEAN_TOP.z) ** 2 > 18 * 18 || s.pos.y < BEAN_TOP.y - 8) return;
        p.bean = e.window;
        p.seeds.magicbean = (p.seeds.magicbean || 0) + 1;
        p.gems += 10;
        client.send('bean', { gems: 10 });
        this.broadcast('toast', { text: '🌱 ' + p.name + ' climbed the Giant Beanstalk!', color: GREEN }, { except: client });
        this.changed(s);
    }
    // What the client tells us about itself, for the play stats
    onMeta(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        if (typeof m.touch === 'boolean') s.stats.touch = m.touch;
        if (finite(m.fps)) s.stats.fps = clamp(Math.round(m.fps), 0, 240);
    }

    broadcastBoards(client) {
        const row = (key, v) => topProfiles(key).filter((p) => v(p) > 0).map((p) => ({ n: p.name, v: v(p) }));
        const m = { floors: row('floors', (p) => p.floors || 1), cash: row('totalCash', (p) => Math.floor(p.totalCash || 0)), time: row('playtime', (p) => Math.floor(p.playtime || 0)) };
        if (client) client.send('boards', m); else this.broadcast('boards', m);
    }

    onQa(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile;
        if (finite(m.cash)) p.cash += m.cash;
        if (finite(m.gems)) p.gems += m.gems;
        if (finite(m.playtime)) p.playtime += m.playtime;
        if (finite(m.spins)) p.spins += m.spins;
        if (m.seed && parseSeed(m.seed)) p.seeds[m.seed] = (p.seeds[m.seed] || 0) + (m.n | 0 || 1);
        if (finite(m.tut)) p.q.tut = clamp(m.tut | 0, 0, TUTORIAL.length);
        if (m.ripe) for (const pl of p.garden.plants) { pl.fs = Date.now() - 1000; pl.fa = Date.now() - 10; this.syncPlant(s, pl); }
        this.changed(s);
    }

    // ----- Bloxity -----
    async onBloxityLogin(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || s.authing) return;
        s.authing = true;
        const legion = await verifyBloxityToken(m.token);
        s.authing = false;
        if (!legion || !this.sessions.has(client.sessionId)) return;
        const uid = 'legion_' + legion.id;
        if (s.profile.uid === uid) return;
        const name = cleanName(legion.name) || s.profile.name;
        const guestProfile = s.profile;
        guestProfile.lastSeen = Date.now();
        await adoptGuestProgress(uid, guestProfile.uid, name);
        await loadProfile(uid);
        if (!this.sessions.has(client.sessionId)) return;
        s.profile = getProfile(uid, name, randomName());
        this.fixProfile(s.profile);
        if (!isOnline(guestProfile.uid)) releaseProfile(guestProfile.uid, isOnline);
        s.player.name = s.profile.name;
        this.away(s, Date.now());
        this.attachPlot(s);
        this.changed(s);
        client.send('authed', { name: s.profile.name });
        this.toast(s, 'Logged in as ' + s.profile.name, GREEN);
        this.broadcastBoards();
    }
    onAvatar(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (s && m) s.player.av = cleanAvatar(m.av);
    }
    onEmote(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || typeof m.id !== 'string' || m.id.length > 40) return;
        this.broadcast('emote', { s: client.sessionId, id: m.id }, { except: client });
    }
    onChat(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || typeof m.text !== 'string') return;
        const now = Date.now();
        if (now - s.lastChat < 800) return;
        s.lastChat = now;
        const text = m.text.replace(/\s+/g, ' ').trim().slice(0, 120);
        if (text) this.broadcast('chat', { s: client.sessionId, name: s.profile.name, text });
    }
    onFriends(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || !Array.isArray(m.names)) return;
        const here = new Set([...this.sessions.values()].filter((o) => o !== s).map((o) => o.profile.name));
        const n = new Set(m.names.slice(0, 50).map(String).filter((x) => here.has(x))).size;
        const friends = Math.min(CFG.friendMax, n);
        if (friends === s.friends) return;
        s.friends = friends;
        s.player.friends = friends;
    }
}

function isOnline(uid) {
    for (const room of liveRooms) for (const s of room.sessions.values()) if (s.profile.uid === uid) return true;
    return false;
}
void SPECIES; void PETS; void EGGS; void EVENT_LEN; void fmt; void PINK; void FLOOR_UP_MAX;
