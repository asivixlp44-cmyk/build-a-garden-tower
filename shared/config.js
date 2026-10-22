// Game data shared by the client and the Colyseus server.
// Build a Garden Tower: every player gets a glass greenhouse on the ring round the market. Buy seeds
// at the Seed Shop (its stock restocks every 5 minutes), plant them on your floors, wait for the fruit
// to ripen and step on the plants to harvest them. The harvest piles up in the FRUITS crates outside
// your greenhouse: grab the crates, carry them to the market and sell them for Cash. Buy better seeds,
// upgrade every floor and build new floors on top: build the tallest garden!
// There are no in-app purchases: every price is in Cash or Gems.

export const CFG = {
    // Roblox defaults: jump power 50, gravity 196.2
    grav: 196.2,
    jumpV: 50,
    walk: 22,
    sprint: 1.5,              // Shift: x walk speed
    maxPlayers: 8,            // one greenhouse each
    startCash: 100,
    restockSecs: 300,         // the Seed Shop restocks every 5 minutes (everyone at the same time)
    restockGems: 12,          // restock it just for you, right now
    floorCap: 20,             // plants per floor
    starterBoostMins: 10,     // x2 Cash for this long when the tutorial is done
    harvestReach: 1.4,        // studs added to a plant's radius: step this close to harvest it
    plantReach: 60,           // how far from you a seed can be planted
    sellReach: 32,            // how close to the market's middle counts as "at the counter"
    crateReach: 9,            // how close to your crates you must be to grab them
    friendBoost: 0.1,         // Friend Boost: +10% growth speed per Bloxity friend here
    friendMax: 5,
    digRefund: 0.5,           // the shovel gives back half a seed's price
    offlineCapSecs: 8 * 3600, // Auto Collect keeps harvesting this long while you're away
    autoEverySecs: 2,         // Auto Collect harvests ripe plants this often
    tutorialBonus: 200,       // Cash for the first harvest (the reference's tutorial gives it)
};

// ----- rarities -----
export const RARITIES = {
    common: { name: 'Common', color: 0xd8dde6, css: '#d8dde6' },
    uncommon: { name: 'Uncommon', color: 0x5adf5a, css: '#6aff6a' },
    rare: { name: 'Rare', color: 0x3aa8ff, css: '#5ac0ff' },
    epic: { name: 'Epic', color: 0xb05aff, css: '#c47aff' },
    legendary: { name: 'Legendary', color: 0xffc21e, css: '#ffd23a' },
    mythic: { name: 'Mythic', color: 0xff4a8a, css: '#ff6aa8' },
    secret: { name: 'Secret', color: 0xffffff, css: '#ffffff', rainbow: true },
};

// ----- the seeds -----
// price: Cash; gems: the Gem price (both obey the stock); grow: seconds from planting to the first
// ripe fruit; cycle: seconds between harvests after that; value: Cash one harvest is worth (before
// multipliers); stock: [chance per restock, min, max]; r: footprint radius (studs).
// look: how the plant is built (client/src/plants.js): kind, colours, size.
// shop: false = not sold in the Seed Shop (rewards, events).
const S = (id, name, ic, rarity, price, gems, cycle, value, stock, r, look, extra) => ({
    id, name, ic, rarity, price, gems, cycle, value, stock, r, look, grow: Math.max(6, Math.round(cycle * 0.75)), shop: true, ...extra,
});
export const SPECIES = [
    // Common
    S('apple', 'Apple Tree', '🍎', 'common', 100, 3, 12, 16, [1, 3, 8], 3.4, { kind: 'tree', leaf: 0x4ad83a, leaf2: 0x7aef4a, trunk: 0x9a6230, fruit: 0xe8283a, size: 1 }),
    S('onion', 'Onion', '🧅', 'common', 150, 3, 15, 30, [1, 2, 6], 2.4, { kind: 'bulb', leaf: 0x5ad84a, fruit: 0xb83a8a, size: 1 }),
    S('carrot', 'Carrot', '🥕', 'common', 250, 6, 18, 56, [0.92, 3, 8], 2.4, { kind: 'root', leaf: 0x3ac83a, fruit: 0xff7a1a, size: 1 }),
    S('cabbage', 'Cabbage', '🥬', 'common', 450, 6, 22, 112, [0.86, 2, 6], 2.8, { kind: 'leafy', leaf: 0x46c83a, leaf2: 0x9aef6a, fruit: 0xc8f08a, size: 1 }),
    // Uncommon
    S('potato', 'Potato', '🥔', 'uncommon', 2500, 15, 28, 650, [0.8, 1, 4], 2.6, { kind: 'root', leaf: 0x58b83a, fruit: 0xc8964a, size: 1.1, round: true }),
    S('cucumber', 'Cucumber', '🥒', 'uncommon', 4500, 19, 32, 1200, [0.74, 1, 3], 3, { kind: 'bush', leaf: 0x3aa83a, leaf2: 0x5ac84a, fruit: 0x2a8a2a, size: 1, fruitShape: 'long' }),
    S('bellpepper', 'Bell Pepper', '🫑', 'uncommon', 8000, 20, 36, 2200, [0.68, 1, 3], 3, { kind: 'bush', leaf: 0x46b83a, leaf2: 0x6ad84a, fruit: 0xffc21e, fruit2: 0xe8283a, size: 1.05 }),
    S('tomato', 'Tomato', '🍅', 'uncommon', 14000, 25, 40, 4000, [0.62, 1, 2], 3, { kind: 'bush', leaf: 0x3ab83a, leaf2: 0x5ad84a, fruit: 0xff3a2a, size: 1.15, cage: true }),
    // Rare
    S('beet', 'Beetroot', '🟣', 'rare', 40000, 29, 45, 10300, [0.55, 1, 3], 2.6, { kind: 'root', leaf: 0x2a9a3a, stem: 0xb8285a, fruit: 0x9a1a4a, size: 1.15, round: true }),
    S('blueberry', 'Blueberry', '🫐', 'rare', 85000, 35, 48, 22700, [0.5, 1, 2], 3, { kind: 'bush', leaf: 0x2a8a4a, leaf2: 0x3aa85a, fruit: 0x3a5aff, size: 1.1, many: true }),
    S('corn', 'Corn', '🌽', 'rare', 180000, 45, 52, 49000, [0.46, 1, 2], 2.6, { kind: 'stalk', leaf: 0x5ac83a, fruit: 0xffd83a, husk: 0x8ae86a, size: 1.2 }),
    S('pumpkin', 'Pumpkin', '🎃', 'rare', 400000, 55, 58, 116000, [0.42, 1, 2], 3.4, { kind: 'vine', leaf: 0x3aa83a, fruit: 0xff8a1a, size: 1.2, big: true }),
    // Epic
    S('watermelon', 'Watermelon', '🍉', 'epic', 1.2e6, 70, 64, 357000, [0.38, 1, 2], 3.4, { kind: 'vine', leaf: 0x2a9a3a, fruit: 0x2aa83a, stripe: 0x1a6a2a, size: 1.25, big: true, long: true }),
    S('pineapple', 'Pineapple', '🍍', 'epic', 3e6, 85, 70, 933000, [0.34, 1, 2], 2.8, { kind: 'pine', leaf: 0x3a9a4a, fruit: 0xffb81c, size: 1.2 }),
    S('strawberry', 'Strawberry', '🍓', 'epic', 8e6, 100, 75, 2.55e6, [0.3, 1, 2], 3, { kind: 'bush', leaf: 0x3ab83a, leaf2: 0x6ad85a, fruit: 0xff2a4a, size: 1.1, many: true, flowers: 0xffffff }),
    S('grape', 'Grape Vine', '🍇', 'epic', 20e6, 120, 80, 6.5e6, [0.27, 1, 1], 3.4, { kind: 'trellis', leaf: 0x46a83a, trunk: 0x8a5a2a, fruit: 0x8a3ad8, size: 1.2 }),
    // Legendary
    S('banana', 'Banana Tree', '🍌', 'legendary', 60e6, 150, 90, 20.8e6, [0.24, 1, 1], 3.8, { kind: 'palm', leaf: 0x5ad83a, trunk: 0xa88a4a, fruit: 0xffe03a, size: 1.25, bunch: true }),
    S('coconut', 'Coconut Palm', '🥥', 'legendary', 160e6, 180, 100, 58e6, [0.21, 1, 1], 3.8, { kind: 'palm', leaf: 0x3ac84a, trunk: 0xb8945a, fruit: 0x6a4a2a, size: 1.35 }),
    S('dragonfruit', 'Dragon Fruit', '🌵', 'legendary', 450e6, 220, 110, 171e6, [0.18, 1, 1], 3.2, { kind: 'cactus', leaf: 0x3ab85a, fruit: 0xff3aa8, size: 1.3 }),
    S('mango', 'Mango Tree', '🥭', 'legendary', 1.3e9, 260, 120, 511e6, [0.16, 1, 1], 3.8, { kind: 'tree', leaf: 0x2aa83a, leaf2: 0x4ac84a, trunk: 0x7a4a24, fruit: 0xffa82a, fruit2: 0xff5a2a, size: 1.35 }),
    // Mythic
    S('cherry', 'Cherry Blossom', '🌸', 'mythic', 4e9, 320, 130, 1.62e9, [0.14, 1, 1], 4, { kind: 'tree', leaf: 0xffa8d8, leaf2: 0xffd0ea, trunk: 0x5a3a3a, fruit: 0xd8103a, size: 1.4, blossom: true }),
    S('moonmelon', 'Moon Melon', '🌙', 'mythic', 12e9, 400, 140, 5e9, [0.12, 1, 1], 3.6, { kind: 'vine', leaf: 0x3a5ac8, fruit: 0xd8e8ff, stripe: 0x8aa8ff, size: 1.3, big: true, glow: 0x9ac8ff }),
    S('starfruit', 'Starfruit Tree', '⭐', 'mythic', 40e9, 500, 150, 17e9, [0.1, 1, 1], 4, { kind: 'tree', leaf: 0x2ab89a, leaf2: 0x5ae8c8, trunk: 0x5a4a8a, fruit: 0xffe84a, size: 1.45, glow: 0xfff08a, star: true }),
    // Rewards and events (not in the Seed Shop)
    S('rose', 'Rose', '🌹', 'rare', 0, 0, 40, 7000, [0, 0, 0], 2.4, { kind: 'flower', leaf: 0x2a9a3a, fruit: 0xff1a4a, size: 1.1 }, { shop: false, how: 'Daily reward (day 2)' }),
    S('sunflower', 'Sunflower', '🌻', 'rare', 0, 0, 45, 30000, [0, 0, 0], 2.4, { kind: 'flower', leaf: 0x3ab83a, fruit: 0xffd21e, center: 0x6a3a1a, size: 1.5, tall: true }, { shop: false, how: 'Spin the wheel' }),
    S('spooky', 'Spooky Pumpkin', '👻', 'epic', 0, 0, 60, 900000, [0, 0, 0], 3.4, { kind: 'vine', leaf: 0x2a6a3a, fruit: 0xff7a0a, size: 1.3, big: true, carved: true, glow: 0xffb83a }, { shop: false, how: 'Halloween: spin the wheel' }),
    S('magicbean', 'Magic Beanstalk', '🫛', 'legendary', 0, 0, 50, 8e6, [0, 0, 0], 3, { kind: 'beanstalk', leaf: 0x46e83a, fruit: 0x9aff5a, size: 1.2, glow: 0xb8ff7a }, { shop: false, how: 'Climb the Giant Beanstalk' }),
    S('bonsai', 'Yellow Bonsai', '🌳', 'mythic', 0, 0, 60, 2e9, [0, 0, 0], 3.6, { kind: 'bonsai', leaf: 0xffd83a, leaf2: 0xffe87a, trunk: 0x6a4a2a, fruit: 0xff8a1a, size: 1.3, glow: 0xfff0a0 }, { shop: false, how: 'Daily reward (day 7)' }),
];
export const speciesById = Object.fromEntries(SPECIES.map((s) => [s.id, s]));
export const SHOP_SEEDS = SPECIES.filter((s) => s.shop);
export const speciesIndex = Object.fromEntries(SPECIES.map((s, i) => [s.id, i]));

// ----- mutations: a plant can come up special (rolled when it's planted, shown once it's grown) -----
// mult: x its harvest value. chance: per planting (pets' Luck and events raise it).
export const MUTATIONS = [
    { id: 'none', name: '', mult: 1, chance: 0 },
    { id: 'gold', name: 'Golden', ic: '✨', mult: 4, chance: 0.03, color: 0xffd21e, css: '#ffd23a' },
    { id: 'toxic', name: 'Toxic', ic: '☢️', mult: 2, chance: 0.04, color: 0x7dff3a, css: '#8aff4a' },
    { id: 'frozen', name: 'Frozen', ic: '❄️', mult: 3, chance: 0.02, color: 0x9ae8ff, css: '#9ae8ff' },
    { id: 'rainbow', name: 'Rainbow', ic: '🌈', mult: 10, chance: 0.006, color: 0xff6ad8, css: '#ff8ae8' },
    { id: 'celestial', name: 'Celestial', ic: '🌌', mult: 25, chance: 0.0015, color: 0xb87aff, css: '#c890ff' },
];
export const MUT = Object.fromEntries(MUTATIONS.map((m, i) => [m.id, i]));
// Rolls a planting's mutation. luck: x the chances (pets, events); bias: an event's extra chance for one mutation
export function rollMutation(rnd, luck, bias) {
    let x = rnd();
    for (let i = MUTATIONS.length - 1; i >= 1; i--) {
        const m = MUTATIONS[i];
        let c = m.chance * (luck || 1);
        if (bias && bias[m.id]) c += bias[m.id];
        if (x < c) return i;
        x -= c;
    }
    return 0;
}

// ----- the greenhouse floors -----
// price: Cash to build it (floor 1 comes with the greenhouse)
export const FLOORS = [
    { price: 0, name: 'Ground Floor' },
    { price: 30000, name: 'Floor 2' },
    { price: 2e6, name: 'Floor 3' },
    { price: 90e6, name: 'Floor 4' },
    { price: 4e9, name: 'Floor 5' },
    { price: 150e9, name: 'Floor 6' },
    { price: 6e12, name: 'Floor 7' },
    { price: 250e12, name: 'Floor 8: Sky Garden' },
];
export const MAX_FLOORS = FLOORS.length;
// Every floor has its own upgrade board (the reference's Floor Upgrades): 10 levels each
export const FLOOR_UPS = [
    { id: 'v', name: 'Harvest Multiplier', ic: '🍎', desc: '+20% harvest value', k: 1 },
    { id: 's', name: 'Growth Speed', ic: '⏩', desc: '+8% growth speed', k: 1.25 },
    { id: 'd', name: 'Double Harvest', ic: '✌️', desc: '+3% chance of a double harvest', k: 1.6 },
];
export const FLOOR_UP_MAX = 10;
const FUP_BASE = [150, 6000, 300000, 1.2e7, 5e8, 2e10, 8e11, 3e13];
export function floorUpCost(f, id, lv) {
    if (lv >= FLOOR_UP_MAX) return null;
    const u = FLOOR_UPS.find((x) => x.id === id);
    return Math.round(FUP_BASE[f] * u.k * Math.pow(1.72, lv));
}
export const upValueMult = (lv) => 1 + 0.2 * lv;
export const upSpeedMult = (lv) => 1 + 0.08 * lv;
export const upDoubleChance = (lv) => 0.03 * lv;
// "3,0,1|0,0,0" <-> [[3,0,1],[0,0,0]]
export const packUps = (ups) => (ups || []).map((u) => (u || [0, 0, 0]).join(',')).join('|');
export const unpackUps = (s) => String(s || '').split('|').filter(Boolean).map((x) => x.split(',').map((n) => n | 0));

// ----- pets: hatched from eggs, follow you round; up to 3 equipped, their bonuses add up -----
// bonus: { value: +harvest value, speed: +growth speed, luck: x mutation chance }
export const PETS = [
    { id: 'bunny', name: 'Bunny', ic: '🐰', rarity: 'common', bonus: { value: 0.06 }, look: { body: 0xf4f0f4, accent: 0xffa8c8, kind: 'bunny' } },
    { id: 'chick', name: 'Chick', ic: '🐥', rarity: 'common', bonus: { speed: 0.06 }, look: { body: 0xffe03a, accent: 0xff8a1a, kind: 'bird' } },
    { id: 'ladybug', name: 'Ladybug', ic: '🐞', rarity: 'uncommon', bonus: { value: 0.1 }, look: { body: 0xe8283a, accent: 0x1a1a22, kind: 'bug' } },
    { id: 'frog', name: 'Frog', ic: '🐸', rarity: 'rare', bonus: { speed: 0.15 }, look: { body: 0x5ad83a, accent: 0xffffff, kind: 'frog' } },
    { id: 'bee', name: 'Bee', ic: '🐝', rarity: 'common', bonus: { speed: 0.12 }, look: { body: 0xffd21e, accent: 0x2a2a2a, kind: 'bee' } },
    { id: 'fox', name: 'Fox', ic: '🦊', rarity: 'uncommon', bonus: { value: 0.18 }, look: { body: 0xff8a2a, accent: 0xffffff, kind: 'fox' } },
    { id: 'hedgehog', name: 'Hedgehog', ic: '🦔', rarity: 'rare', bonus: { luck: 0.5 }, look: { body: 0x8a6a4a, accent: 0xf0d8b8, kind: 'hedgehog' } },
    { id: 'owl', name: 'Owl', ic: '🦉', rarity: 'epic', bonus: { value: 0.35, speed: 0.1 }, look: { body: 0x9a7a5a, accent: 0xffe8c8, kind: 'bird' } },
    { id: 'butterfly', name: 'Butterfly', ic: '🦋', rarity: 'uncommon', bonus: { speed: 0.25 }, look: { body: 0x5ac8ff, accent: 0xff7ad8, kind: 'butterfly' } },
    { id: 'panda', name: 'Panda', ic: '🐼', rarity: 'rare', bonus: { value: 0.4 }, look: { body: 0xffffff, accent: 0x1a1a22, kind: 'bear' } },
    { id: 'unicorn', name: 'Unicorn', ic: '🦄', rarity: 'epic', bonus: { value: 0.6, luck: 0.5 }, look: { body: 0xffffff, accent: 0xff8ae8, kind: 'unicorn' } },
    { id: 'dragon', name: 'Dragon', ic: '🐉', rarity: 'legendary', bonus: { value: 1.2, speed: 0.3 }, look: { body: 0x3ac86a, accent: 0xffd21e, kind: 'dragon' } },
    { id: 'phoenix', name: 'Phoenix', ic: '🔥', rarity: 'legendary', bonus: { speed: 0.8, luck: 1 }, look: { body: 0xff5a1a, accent: 0xffd21e, kind: 'bird' } },
    { id: 'galaxycat', name: 'Galaxy Cat', ic: '🐱', rarity: 'mythic', bonus: { value: 2.5, speed: 0.5, luck: 1.5 }, look: { body: 0x5a3ac8, accent: 0xff7af0, kind: 'cat' } },
    // the reference's FREE PET: a little blob for playing 10 minutes
    { id: 'blob', name: 'Bloom Blob', ic: '🫧', rarity: 'rare', bonus: { value: 0.15, speed: 0.1 }, look: { body: 0x8ab8ff, accent: 0xb87aff, kind: 'blob' } },
];
export const petById = Object.fromEntries(PETS.map((p) => [p.id, p]));
// odds: [pet id, weight]
export const EGGS = [
    { id: 'garden', name: 'Garden Egg', ic: '🥚', price: 1500, color: 0xa8e87a, odds: [['bunny', 45], ['chick', 35], ['ladybug', 16], ['frog', 4]] },
    { id: 'meadow', name: 'Meadow Egg', ic: '🥚', price: 90000, color: 0xffd86a, odds: [['bee', 40], ['fox', 32], ['butterfly', 20], ['hedgehog', 7], ['owl', 1]] },
    { id: 'sky', name: 'Sky Egg', ic: '🥚', gems: 60, color: 0x9ad8ff, odds: [['butterfly', 40], ['panda', 30], ['hedgehog', 18], ['unicorn', 11], ['dragon', 1]] },
    { id: 'jungle', name: 'Jungle Egg', ic: '🥚', price: 25e6, color: 0x5ac85a, odds: [['frog', 35], ['panda', 30], ['owl', 22], ['unicorn', 12], ['dragon', 1]] },
    { id: 'cosmic', name: 'Cosmic Egg', ic: '🥚', price: 20e9, color: 0x8a5aff, odds: [['unicorn', 50], ['dragon', 30], ['phoenix', 17], ['galaxycat', 3]] },
];
export const eggById = Object.fromEntries(EGGS.map((e) => [e.id, e]));
export const PET_SLOTS = 3;
export const PET_MAX = 60; // pets you can own
export function petBonus(eq, owned) {
    const b = { value: 0, speed: 0, luck: 0 };
    for (const uid of eq || []) {
        const it = (owned || []).find((x) => x.u === uid);
        const d = it && petById[it.id];
        if (!d) continue;
        for (const k in d.bonus) b[k] += d.bonus[k];
    }
    return b;
}

// ----- Gem passes (permanent) and boosts (timed) -----
export const PASSES = {
    AutoCollect: { name: 'Auto Collect', ic: '🧲', gems: 99, desc: 'Your ripe plants harvest themselves, even while you\'re away (up to 8 hours)' },
    DoubleCash: { name: 'x2 Cash', ic: '💵', gems: 150, desc: 'Every sale pays double, forever' },
    PetSlot: { name: '+1 Pet Slot', ic: '🐾', gems: 45, desc: 'Equip 4 pets at once' },
    Lucky: { name: 'Lucky Gardener', ic: '🍀', gems: 75, desc: 'x2 mutation chance on everything you plant' },
};
export const BOOSTS = {
    cash2: { name: 'x2 Cash', ic: '💵', gems: 8, mins: 15, desc: 'Sales pay double for 15 minutes' },
    grow2: { name: 'x2 Growth', ic: '⏩', gems: 8, mins: 10, desc: 'Plants grow twice as fast for 10 minutes' },
    luck3: { name: 'x3 Luck', ic: '🍀', gems: 10, mins: 10, desc: 'x3 mutation chance for 10 minutes' },
};

// ----- events: every 10 minutes, one of these runs for 3 minutes (the same for everyone) -----
export const EVENT_PERIOD = 600, EVENT_LEN = 180;
export const EVENTS = [
    { id: 'beanstalk', name: 'Giant Beanstalk', ic: '🌱', desc: 'A Giant Beanstalk sprouted in the market! Climb it for a Magic Bean!', mood: 'beanstalk' },
    { id: 'frenzy', name: 'Growth Frenzy', ic: '⚡', desc: 'Every plant grows twice as fast!', mood: 'frenzy', speed: 2 },
    { id: 'goldrain', name: 'Golden Rain', ic: '✨', desc: 'Golden rain! Plants can turn GOLDEN!', mood: 'gold', bias: { gold: 0.08 }, rain: 'gold' },
    { id: 'rainbow', name: 'Rainbow Bloom', ic: '🌈', desc: 'Rainbows everywhere! Rainbow mutations are x6 more likely!', mood: 'rainbow', bias: { rainbow: 0.03 }, rain: 'rainbow' },
];
export function eventAt(nowMs) {
    const s = Math.floor(nowMs / 1000), k = Math.floor(s / EVENT_PERIOD), into = s - k * EVENT_PERIOD;
    const ev = EVENTS[k % EVENTS.length];
    return { ev, active: into < EVENT_LEN, left: into < EVENT_LEN ? EVENT_LEN - into : 0, next: EVENT_PERIOD - into, window: k, nextEv: EVENTS[(k + 1) % EVENTS.length] };
}

// ----- the Seed Shop's stock: one roll per 5-minute window, the same for everyone -----
export function rngFrom(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
export const restockWindow = (nowMs) => Math.floor(nowMs / 1000 / CFG.restockSecs);
export const restockLeft = (nowMs) => CFG.restockSecs - (Math.floor(nowMs / 1000) % CFG.restockSecs);
// roll: the window number (or a player's own restock roll). Commons are always there.
export function stockFor(roll) {
    const r = rngFrom(roll * 2654435761 + 12345);
    r(); r();
    const out = {};
    for (const s of SHOP_SEEDS) {
        const [p, a, b] = s.stock;
        out[s.id] = r() < p ? a + Math.floor(r() * (b - a + 1)) : 0;
    }
    return out;
}

// ----- quests -----
// The tutorial (the reference's, step by step)
export const TUTORIAL = [
    { kind: 'buy', n: 1, text: 'Buy an Apple! 🍎', tip: 'Open the Seed Shop at the market' },
    { kind: 'plant', n: 1, text: 'Plant your Apple! 🍎', tip: 'Pick it on the hotbar and plant it in your greenhouse' },
    { kind: 'harvest', n: 1, text: 'Wait... then step on it! ✨', tip: 'When it\'s ripe, walk onto the plant' },
    { kind: 'collect', n: 1, text: 'Grab the crates! 📦', tip: 'Your harvest is in the FRUITS crates outside' },
    { kind: 'sell', n: 1, text: 'Sell the crates! 💰', tip: 'Carry them to the SELL counter at the market' },
    { kind: 'buy', n: 1, text: 'Buy an Onion! 🧅', tip: 'Back to the Seed Shop' },
    { kind: 'plant', n: 1, text: 'Plant your Onion! 🧅', tip: 'More plants = more Cash' },
    { kind: 'buy', n: 1, text: 'Buy another plant! 🌱', tip: 'Keep growing your garden' },
];
export const TUTORIAL_GEMS = 10;
// After the tutorial: goals, one at a time, each with a small reward. Progress is what the profile
// already shows (so a goal you've already reached is done at once): plants in the garden (on floor 2
// and up for 'plantsUp'), sells, harvests, seeds bought, floor upgrade levels, eggs hatched, wheel
// spins, floors, mutations found
export const GOALS = [
    { kind: 'plants', n: 4, text: 'Grow 4 plants 🌱', gems: 3 },
    { kind: 'sell', n: 3, text: 'Sell your crates 3 times 💰', gems: 3 },
    { kind: 'buy', n: 6, text: 'Buy 6 seeds 🛒', gems: 3 },
    { kind: 'fup', n: 1, text: 'Upgrade your floor ⬆️', tip: 'At the FLOOR UPGRADES board in your greenhouse', gems: 5 },
    { kind: 'plants', n: 8, text: 'Grow 8 plants 🌱', cash: 1000 },
    { kind: 'spin', n: 1, text: 'Spin the Beanstalk Wheel 🎡', tip: 'The wheel button on the right', gems: 3 },
    { kind: 'egg', n: 1, text: 'Hatch an egg 🥚', tip: 'At the Egg Shop', gems: 5 },
    { kind: 'harvest', n: 100, text: 'Harvest 100 times 🍎', gems: 5 },
    { kind: 'plants', n: 14, text: 'Grow 14 plants 🌱', cash: 3000 },
    { kind: 'floor', n: 2, text: 'Build Floor 2 🏢', gems: 10, spin: 1 },
    { kind: 'plantsUp', n: 1, text: 'Plant on Floor 2 🌱', tip: 'The green lift pad by your door takes you up', gems: 5 },
    { kind: 'fup', n: 5, text: 'Buy 5 floor upgrades ⬆️', gems: 5 },
    { kind: 'mut', n: 1, text: 'Grow a mutated plant ✨', tip: 'Golden, Frozen, Rainbow... pets, luck and events help', gems: 5 },
    { kind: 'egg', n: 3, text: 'Hatch 3 eggs 🥚', gems: 8 },
    { kind: 'floor', n: 3, text: 'Build Floor 3 🏢', gems: 15, spin: 1 },
    { kind: 'harvest', n: 1000, text: 'Harvest 1,000 times 🍎', gems: 10 },
    { kind: 'floor', n: 4, text: 'Build Floor 4 🏢', gems: 20, spin: 1 },
    { kind: 'floor', n: 5, text: 'Build Floor 5 🏢', gems: 25, spin: 2 },
];
// how far a profile is toward a goal of this kind (counters kept in p.cnt)
export function goalValue(p, kind) {
    const g = p.garden || {}, plants = g.plants || [], cnt = p.cnt || {};
    switch (kind) {
        case 'plants': return plants.length;
        case 'plantsUp': return plants.filter((x) => x.f >= 1).length;
        case 'sell': return p.sells || 0;
        case 'harvest': return p.harvests || 0;
        case 'floor': return g.floors || 1;
        case 'fup': return (g.ups || []).reduce((a, u) => a + (u || []).reduce((b, v) => b + (v || 0), 0), 0);
        case 'mut': return Object.values(p.index || {}).filter((bits) => bits > 1).length;
        default: return cnt[kind] || 0;
    }
}
// Daily quests (the reference's): five a day, each pays Gems
export const DAILY_QUESTS = [
    { id: 'play', text: 'Play for 20 minutes', n: 20, gems: 10 },
    { id: 'harvest', text: 'Harvest 200 plants', n: 200, gems: 8 },
    { id: 'plant', text: 'Place 12 plants', n: 12, gems: 6 },
    { id: 'buy', text: 'Buy 12 seeds', n: 12, gems: 6 },
    { id: 'sell', text: 'Sell crates 5 times', n: 5, gems: 5 },
];
// ----- the Index: every plant you grow for the first time (and every mutation of it) pays Gems -----
export const INDEX_GEMS = 3, INDEX_MUT_GEMS = 2;

// ----- playtime gifts (minutes played this session); cash: x your income scale -----
export const GIFTS = [
    { min: 1, gems: 2 }, { min: 3, cash: 150 }, { min: 5, boost: 'grow2' }, { min: 8, gems: 3 }, { min: 12, cash: 600 },
    { min: 15, boost: 'cash2' }, { min: 20, gems: 5 }, { min: 25, egg: 'garden' }, { min: 30, boost: 'luck3' }, { min: 45, gems: 8 }, { min: 60, cash: 4000 },
];
export const FREE_PET_MINS = 10;
// ----- daily rewards (the reference's 7 days) -----
export const DAILY = [
    { cash: 5000 }, { seed: 'rose' }, { cash: 250000 }, { cash: 1e6, gems: 5 }, { egg: 'sky' }, { cash: 25e6 }, { seed: 'bonsai', gems: 10 },
];
// ----- the Beanstalk Wheel: a free spin every 15 minutes played -----
export const WHEEL_SPIN_MINS = 15;
export const WHEEL = [
    { w: 22, cash: 300, color: '#46ec50' },
    { w: 16, gems: 5, color: '#5ad0ff' },
    { w: 14, seed: 'sunflower', color: '#ffd21e' },
    { w: 12, boost: 'cash2', color: '#ff7ad8' },
    { w: 12, cash: 1200, color: '#7dff6b' },
    { w: 10, egg: 'garden', color: '#ffb84a' },
    { w: 8, seed: 'spooky', color: '#ff7a1a' },
    { w: 6, gems: 15, color: '#c47aff' },
];
export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
export function dailyStatus(d, now) {
    const today = dayKey(now), yest = dayKey(now - 86400000);
    if (!d || !d.last) return { can: true, day: 0, streak: 0 };
    if (d.last === today) return { can: false, day: d.streak % 7, streak: d.streak };
    const streak = d.last === yest ? d.streak : 0;
    return { can: true, day: streak % 7, streak };
}
export const CODES = {
    GARDEN: { gems: 5 },
    TOWER: { cash: 500 },
    SEEDS: { seed: 'sunflower' },
    HALLOWEEN: { seed: 'spooky' },
    LEGION: { gems: 4 },
    BLOXITY: { boost: 'grow2' },
    RELEASE: { gems: 3, boost: 'cash2' },
};
// Reward Cash scales with how far you've got (the best seed you've grown): a gift is worth the same
// effort at any stage
export function cashScale(p) {
    let best = 0;
    for (const id in (p && p.index) || {}) { const s = speciesById[id]; if (s && s.shop) best = Math.max(best, s.price); }
    return Math.max(1, best / 250);
}
export function rewardText(r, p) {
    return [
        r.cash ? '+$' + fmt(r.cash * (p ? cashScale(p) : 1)) : '',
        r.gems ? '+' + r.gems + ' Gem' + (r.gems > 1 ? 's' : '') : '',
        r.seed ? speciesById[r.seed].ic + ' ' + speciesById[r.seed].name + ' seed' : '',
        r.egg ? eggById[r.egg].ic + ' ' + eggById[r.egg].name : '',
        r.boost ? BOOSTS[r.boost].ic + ' ' + BOOSTS[r.boost].name + ' (' + BOOSTS[r.boost].mins + ' min)' : '',
        r.spin ? '🎡 +' + r.spin + ' wheel spin' + (r.spin > 1 ? 's' : '') : '',
    ].filter(Boolean).join(' + ');
}

// ----- the numbers behind a harvest -----
// ctx: { ups: [v, s, d] of the plant's floor, pets: petBonus, boosts, passes, friends, event }
export function growthMult(ctx, now) {
    let m = upSpeedMult(ctx.ups ? ctx.ups[1] : 0) * (1 + ((ctx.pets && ctx.pets.speed) || 0));
    if (((ctx.boosts || {}).grow2 || 0) > now) m *= 2;
    m *= 1 + CFG.friendBoost * Math.min(CFG.friendMax, ctx.friends || 0);
    const ev = eventAt(now);
    if (ev.active && ev.ev.speed) m *= ev.ev.speed;
    return m;
}
export function harvestValue(sp, mut, ctx) {
    return sp.value * MUTATIONS[mut || 0].mult * upValueMult(ctx.ups ? ctx.ups[0] : 0) * (1 + ((ctx.pets && ctx.pets.value) || 0));
}
export function sellMult(p, now) {
    let m = 1;
    if (p.passes && p.passes.DoubleCash) m *= 2;
    if (((p.boosts || {}).cash2 || 0) > now) m *= 2;
    return m;
}
export function luckMult(p, pets, now) {
    let m = 1 + ((pets && pets.luck) || 0);
    if (p.passes && p.passes.Lucky) m *= 2;
    if (((p.boosts || {}).luck3 || 0) > now) m *= 3;
    return m;
}

// Player outfits for the blocky fallback body (cycle by join order)
export const KITS = [
    { shirt: 0x1c1c22, shorts: 0x24242c, socks: 0xffffff, hair: 0x8a4a1a },
    { shirt: 0x3ac8ff, shorts: 0x2a2a4a, socks: 0xffffff, hair: 0xffd028 },
    { shirt: 0xff7ab0, shorts: 0x3a3a5a, socks: 0xffffff, hair: 0x3a2618 },
    { shirt: 0x6aff5a, shorts: 0x2a3a2a, socks: 0xffffff, hair: 0x3a2618 },
    { shirt: 0xffd028, shorts: 0x3a2a1a, socks: 0xffffff, hair: 0xb8541c },
    { shirt: 0xc45aff, shorts: 0x2a1a3a, socks: 0xffffff, hair: 0xff8ad8 },
];
export const SKINS = [0xf2c9a0, 0xe1af87, 0xc88c5f, 0x8c5a3c, 0xf0c8a0];

// ----- formatting -----
export function fmt(v) {
    v = Math.floor(v || 0);
    if (v < 1000) return String(v);
    const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx'];
    let i = 0, x = v;
    while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
    return (x >= 100 ? Math.floor(x) : Math.floor(x * 10) / 10) + u[i];
}
export const fmtComma = (v) => Math.floor(v || 0).toLocaleString('en-US');
export const money = (v) => '$' + (v < 1e6 ? fmtComma(v) : fmt(v));
export function clock(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
}
export function playtimeText(s) {
    s = Math.floor(s || 0);
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
    return Math.floor(s / 86400) + 'd ' + Math.floor((s % 86400) / 3600) + 'h';
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
