// Local mirror of this player's progress. The server owns the real values: the greenhouses arrive
// through the room state, private progress in "profile" messages.
export const S = {
    cash: 0, totalCash: 0, gems: 0, playtime: 0, seeds: {}, carry: 0,
    pets: [], eq: [], freePet: false, index: {}, q: { tut: 0, pt: 0 }, dq: { day: '', p: {}, c: {} },
    daily: null, codes: {}, passes: {}, boosts: {}, spins: 0, spinSecs: 0, shop: { w: -1, roll: 0, bought: {} }, bean: -1,
    harvests: 0, sells: 0, firstPlay: Date.now(), giftClaimed: {}, sessionSecs: 0,
    joinedAt: Date.now(), profileAt: Date.now(), name: '', friends: 0, plot: -1,
    // this device only
    seedSel: '', floor: 0,
};

// Game actions that world objects (stalls, signs, boards) and panels trigger; filled in by main.js / ui.js
export const actions = {};

export const net = {
    room: null,
    offset: 0,
    send(type, msg) { if (this.room) this.room.send(type, msg || {}); },
    // Server clock in ms, so timers line up for everyone (QA runs can pin it)
    fixedNow: null,
    now() { return this.fixedNow ?? Date.now() + this.offset; },
};
