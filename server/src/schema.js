import { schema, t } from '@colyseus/schema';

// Public, synced to every client: the players and the eight greenhouses (floors, crates, every plant
// and how far it has grown). Private progress (Cash, Gems, seeds, pets, quests...) goes only to its
// owner in the "profile" message.
export const PlayerState = schema({
    name: t.string().default(''),
    pid: t.uint8().default(0),
    x: t.float32().default(0),
    y: t.float32().default(0),
    z: t.float32().default(0),
    ry: t.angle(),
    anim: t.uint8().default(0),      // 0 idle, 1 run, 2 air
    plot: t.int8().default(-1),      // which greenhouse is theirs
    carry: t.float64().default(0),   // Cash worth of crates they're carrying (the stack over their head)
    pets: t.string().default(''),    // equipped pet ids, "bunny,bee"
    friends: t.uint8().default(0),   // Friend Boost: Bloxity friends in this server
    kit: t.uint8().default(0),
    skin: t.uint8().default(0),
    floors: t.uint8().default(1),
    av: t.string().default(''),      // packed Bloxity avatar (equipped ids + proportions)
}, 'PlayerState');

// One plant. Times are server ms: planted (t0), its fruit started growing (fs), ripe (fa).
export const PlantState = schema({
    sp: t.uint8().default(0),        // species (index in SPECIES)
    f: t.uint8().default(0),         // floor
    x: t.float32().default(0),       // local position in the greenhouse
    z: t.float32().default(0),
    r: t.uint8().default(0),         // turned r x 45 degrees
    m: t.uint8().default(0),         // mutation (index in MUTATIONS)
    t0: t.float64().default(0),
    fs: t.float64().default(0),
    fa: t.float64().default(0),
}, 'PlantState');

export const PlotState = schema({
    owner: t.string().default(''),   // session id of the player it belongs to ('' = free)
    name: t.string().default(''),
    floors: t.uint8().default(1),
    crate: t.float64().default(0),   // Cash worth of harvest waiting in the FRUITS crates
    ups: t.string().default(''),     // floor upgrade levels "v,s,d|v,s,d"
    plants: t.map(PlantState),
}, 'PlotState');

export const GameState = schema({
    players: t.map(PlayerState),
    plots: t.array(PlotState),
}, 'GameState');
