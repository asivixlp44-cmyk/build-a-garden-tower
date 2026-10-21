// Procedural soundtrack and sound effects (Web Audio, no asset files).
//
// Music, "Sunny Sprouts": an original, sunny 116 BPM piece in G major (G - D - Em - C, then
// C - G - Am - D). A plucky ukulele strums the chords over a soft pad, a round bass and a light kit
// (kick, snaps, shaker) join in, a glockenspiel sings the tune, it breaks down to the pad with birds
// chirping, and comes back an octave up; 64 bars. How much of it plays follows the game
// (setMusicIntensity): menus are calm, events bring the full groove.
//
// The effects are made to feel nice: soft soil pats when you plant, juicy pops with a chime that
// climbs as you harvest in a row, wooden crate clunks, the cash register, the egg cracking open.

let ctx = null, master, comp, musicBus, musicOut, duckFilter, sfxBus, asmrBus, reverb, roomVerb, delay;
let noiseBuf = null, meter = null;
let musicOn = false, schedTimer = null, seqStep = 0, nextTime = 0, ducked = false;
const settings = { music: 0.5, sfx: 0.8, asmr: 0.9, master: 1, muted: false };
try { Object.assign(settings, JSON.parse(localStorage.getItem('bgt_audio') || '{}')); } catch (e) { /* defaults */ }

const BPM = 116, STEP = 60 / BPM / 4;
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const CHORDS = [
    { root: 43, notes: [67, 71, 74] }, // G
    { root: 50, notes: [66, 69, 74] }, // D
    { root: 52, notes: [67, 71, 76] }, // Em
    { root: 48, notes: [67, 72, 76] }, // C
    { root: 48, notes: [67, 72, 76] }, // C
    { root: 43, notes: [67, 71, 74] }, // G
    { root: 45, notes: [69, 72, 76] }, // Am
    { root: 50, notes: [66, 69, 74] }, // D
];
// [step, midi, length] per bar
const LEAD = [
    [[0, 79, 2], [2, 81, 2], [4, 83, 4], [8, 81, 2], [10, 79, 2], [12, 74, 4]],
    [[0, 78, 2], [2, 79, 2], [4, 81, 4], [8, 86, 4], [12, 81, 4]],
    [[0, 83, 3], [3, 81, 1], [4, 79, 2], [6, 76, 2], [8, 79, 4], [12, 83, 4]],
    [[0, 84, 2], [2, 83, 2], [4, 79, 4], [8, 76, 2], [10, 79, 2], [12, 81, 4]],
    [[0, 84, 2], [2, 86, 2], [4, 88, 4], [8, 86, 2], [10, 84, 2], [12, 79, 4]],
    [[0, 83, 4], [4, 79, 2], [6, 81, 2], [8, 83, 2], [10, 86, 2], [12, 83, 4]],
    [[0, 81, 2], [2, 84, 2], [4, 88, 4], [8, 86, 2], [10, 84, 2], [12, 81, 4]],
    [[0, 78, 4], [4, 81, 4], [8, 86, 6], [14, 81, 2]],
];
const SECTION = (bar) => {
    const b = bar % 64;
    if (b < 8) return 'intro';
    if (b < 24) return 'groove';
    if (b < 40) return 'lead';
    if (b < 48) return 'break';
    return 'lead2';
};
let intensity = 1;
// 0 calm (menus), 1 playing, 2 an event is on
export function setMusicIntensity(k) { intensity = Math.max(0, Math.min(2, k | 0)); }

export function initAudio() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 1.0;
    comp.connect(master).connect(ctx.destination);
    meter = ctx.createAnalyser(); meter.fftSize = 2048; master.connect(meter);
    musicBus = ctx.createGain();
    duckFilter = ctx.createBiquadFilter(); duckFilter.type = 'lowpass'; duckFilter.frequency.value = 20000; duckFilter.Q.value = 0.5;
    const warm = ctx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 9500; warm.Q.value = 0.3;
    musicOut = ctx.createGain();
    musicBus.connect(warm).connect(duckFilter).connect(musicOut).connect(comp);
    sfxBus = ctx.createGain(); sfxBus.connect(comp);
    asmrBus = ctx.createGain(); asmrBus.connect(comp);
    applyVolumes();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const ir = (secs, decay) => {
        const len = ctx.sampleRate * secs, b = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let c = 0; c < 2; c++) { const ch = b.getChannelData(c); for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
        return b;
    };
    reverb = ctx.createConvolver(); reverb.buffer = ir(2.2, 3);
    const revGain = ctx.createGain(); revGain.gain.value = 0.3;
    reverb.connect(revGain).connect(musicBus);
    roomVerb = ctx.createConvolver(); roomVerb.buffer = ir(0.6, 3.5);
    const roomGain = ctx.createGain(); roomGain.gain.value = 0.22;
    roomVerb.connect(roomGain).connect(sfxBus);
    delay = ctx.createDelay(1);
    delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    const dlf = ctx.createBiquadFilter(); dlf.type = 'lowpass'; dlf.frequency.value = 2800;
    const dlGain = ctx.createGain(); dlGain.gain.value = 0.2;
    delay.connect(dlf).connect(fb).connect(delay);
    dlf.connect(dlGain).connect(musicBus);
    document.addEventListener('visibilitychange', () => {
        if (!ctx) return;
        if (document.hidden) ctx.suspend(); else ctx.resume();
    });
}
function applyVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const m = settings.master ?? 1;
    musicOut.gain.setTargetAtTime(settings.muted ? 0 : settings.music * 1.6 * m * (ducked ? 0.6 : 1), t, 0.08);
    sfxBus.gain.setTargetAtTime(settings.sfx * m, t, 0.05);
    asmrBus.gain.setTargetAtTime((settings.asmr ?? 1) * 1.1 * m, t, 0.05);
}
function save() { try { localStorage.setItem('bgt_audio', JSON.stringify(settings)); } catch (e) { /* ignore */ } }
export function getVolumes() { return { ...settings }; }
export function setVolume(kind, v) { settings[kind] = Math.max(0, Math.min(1, v)); save(); applyVolumes(); }
export function toggleMusic() { settings.muted = !settings.muted; save(); applyVolumes(); return !settings.muted; }
export const musicMuted = () => !!settings.muted;
// Browsers keep audio off until a click or key press: every gesture retries until it's running
export function resumeAudio() { initAudio(); if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); if (ctx && !musicOn && wantMusic) startMusic(); }
const level = () => { if (!meter) return 0; const a = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(a); let p = 0; for (const v of a) p = Math.max(p, Math.abs(v)); return +p.toFixed(3); };
export const audioDebug = () => ({ peak: level(), state: ctx && ctx.state, musicOn, settings: { ...settings }, intensity });
export const audioSuspended = () => !ctx || ctx.state !== 'running';
// Menus open: the music goes muffled and a little quieter
export function setMusicDuck(on) {
    if (!ctx || on === ducked) return;
    ducked = on;
    duckFilter.frequency.setTargetAtTime(on ? 900 : 20000, ctx.currentTime, 0.12);
    applyVolumes();
}

// ----- building blocks -----
function noise(t, dur, type, freq, q, gain, out, freqEnd, attack) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q || 1;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    if (attack) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); } else g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out || musicBus);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
    return { f, g };
}
function tone(t, type, f0, f1, dur, gain, out, attack) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    if (attack) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); } else g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out || sfxBus); o.start(t); o.stop(t + dur + 0.05);
    return o;
}
function kick(t, gain) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(105, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(musicBus); o.start(t); o.stop(t + 0.3);
    noise(t, 0.012, 'lowpass', 1200, 0.7, gain * 0.2, musicBus);
}
function snap(t, gain) {
    noise(t, 0.05, 'bandpass', 2400, 2.5, gain, musicBus);
    noise(t + 0.004, 0.18, 'highpass', 3500, 0.6, gain * 0.35, reverb);
}
function clap(t, gain) {
    for (let k = 0; k < 3; k++) noise(t + k * 0.01, 0.02, 'bandpass', 1500, 1.4, gain * (k === 2 ? 1 : 0.7), musicBus);
    noise(t + 0.03, 0.25, 'highpass', 3000, 0.5, gain * 0.25, reverb);
}
function shaker(t, gain, accent) { noise(t, accent ? 0.07 : 0.045, 'bandpass', 6500, 1.2, gain * (accent ? 1.3 : 1), musicBus, 0, 0.012); }
function bass(t, n, dur, gain) {
    const g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(260, t + dur); f.Q.value = 1.5;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g).connect(musicBus);
    for (const [type, k, a] of [['sine', 1, 1], ['triangle', 2, 0.25]]) {
        const o = ctx.createOscillator(), og = ctx.createGain(); o.type = type; o.frequency.value = midi(n) * k; og.gain.value = a;
        o.connect(og).connect(f); o.start(t); o.stop(t + dur + 0.05);
    }
}
// a ukulele strum: the chord's strings (bright triangles) rolled through one damped filter, and a pick
// noise on the down-strums (one filter and one gain per strum: cheap on phones)
function uke(t, notes, gain, down) {
    const g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(4200, t); f.frequency.exponentialRampToValueAtTime(900, t + 0.35); f.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    f.connect(g); g.connect(musicBus); g.connect(reverb);
    notes.forEach((n, j) => {
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = midi(n); o.detune.value = (Math.random() - 0.5) * 8;
        const at = t + (down ? j : notes.length - 1 - j) * 0.012;
        o.connect(f); o.start(at); o.stop(t + 0.55);
    });
    if (down) noise(t, 0.012, 'highpass', 3000, 0.7, gain * 0.25, musicBus);
}
// a glockenspiel: a pure tone with a bright, quickly fading overtone
function glock(t, n, dur, gain) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.5, dur * 1.6));
    g.connect(musicBus); g.connect(reverb); g.connect(delay);
    for (const [k, a, d] of [[1, 1, 1], [2.76, 0.3, 0.25], [5.4, 0.12, 0.1]]) {
        const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.value = midi(n) * k;
        og.gain.setValueAtTime(a, t); og.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.12, dur * 1.6 * d));
        o.connect(og).connect(g); o.start(t); o.stop(t + Math.max(0.5, dur * 1.6) + 0.05);
    }
}
function pad(t, notes, dur, gain) {
    const g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1400; f.Q.value = 0.5;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.25); g.gain.setValueAtTime(gain, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
    f.connect(g); g.connect(musicBus); g.connect(reverb);
    for (const n of notes) for (const det of [-7, 7]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n - 12); o.detune.value = det;
        const og = ctx.createGain(); og.gain.value = 0.2;
        o.connect(og).connect(f); o.start(t); o.stop(t + dur + 0.3);
    }
}
// a little bird: two or three quick chirps
function bird(t, gain) {
    const f = 2400 + Math.random() * 1400;
    for (let k = 0; k < 2 + (Math.random() * 2 | 0); k++) tone(t + k * 0.09, 'sine', f, f * 1.35, 0.06, gain, musicBus, 0.005);
}
function riser(t, dur, gain) { noise(t, dur, 'bandpass', 500, 2, gain, musicBus, 6000, dur * 0.9); }

const STRUM = [0, 2, 3, 6, 8, 10, 11, 14];
function playStep(s, t) {
    const bar = Math.floor(s / 16), i = s % 16, sec = SECTION(bar), b8 = bar % 8, ch = CHORDS[b8], k = intensity;
    const up = sec === 'lead2' ? 12 : 0;
    if (i === 0) pad(t, ch.notes, STEP * 16, sec === 'break' ? 0.05 : 0.032);
    // the ukulele strums the chord (a quick roll of three strings)
    if (STRUM.includes(i) && (sec !== 'break' || i % 8 === 0)) {
        const down = i % 4 === 0, g = sec === 'break' ? 0.05 : 0.07, oct = i === 6 || i === 14 ? 0 : -12;
        uke(t, ch.notes.map((n) => n + oct), g, down);
    }
    if (sec === 'break') {
        if (i % 4 === 1 && Math.random() < 0.45) bird(t, 0.03);
        if (i === 0 && b8 === 7) riser(t, STEP * 16, 0.045);
        return;
    }
    if (sec === 'intro' && k < 2) { if (i % 2 === 1) shaker(t, 0.012, false); if (i % 8 === 5 && Math.random() < 0.3) bird(t, 0.02); return; }
    if (k === 0) { if (i % 4 === 2) shaker(t, 0.012, false); return; }
    if (i === 0 || i === 8 || i === 10) kick(t, i === 10 ? 0.2 : 0.32);
    if (i === 4 || i === 12) { snap(t, 0.085); if (k >= 2) clap(t, 0.05); }
    if (i % 2 === 1) shaker(t, 0.017, i % 4 === 3);
    if (i === 0 || i === 6 || i === 10) bass(t, ch.root - 12 + (i === 10 ? 7 : 0), STEP * (i === 6 ? 3 : 4), 0.2);
    if (sec === 'lead' || sec === 'lead2') for (const [at, n, len] of LEAD[b8]) if (at === i) glock(t, n + up - 12, STEP * len * 0.9, 0.055);
    if (bar % 16 === 15 && i === 0) riser(t, STEP * 16, 0.035);
}
function scheduler() {
    while (nextTime < ctx.currentTime + 0.2) {
        playStep(seqStep, nextTime);
        nextTime += STEP;
        seqStep++;
    }
}
let wantMusic = false;
export function startMusic() {
    wantMusic = true;
    if (!ctx || musicOn) return;
    musicOn = true;
    seqStep = 0; nextTime = ctx.currentTime + 0.1;
    schedTimer = setInterval(scheduler, 30);
}
export function stopMusic() { musicOn = false; clearInterval(schedTimer); }

// =====================================================================================
// Footsteps
// =====================================================================================
const R = (a, b) => a + Math.random() * (b - a);
const STEPS = {
    tile(t, k) { noise(t, 0.022, 'bandpass', R(2300, 2900), 1.2, 0.12 * k, asmrBus); noise(t, 0.04, 'lowpass', 700, 1, 0.1 * k, asmrBus); },
    grass(t, k) { noise(t, 0.09, 'highpass', R(3000, 4200), 0.8, 0.07 * k, asmrBus, 0, 0.02); noise(t, 0.05, 'lowpass', 500, 1, 0.14 * k, asmrBus); },
    metal(t, k) { noise(t, 0.02, 'bandpass', R(2200, 2800), 6, 0.12 * k, asmrBus); tone(t, 'sine', R(520, 620), null, 0.16, 0.04 * k, asmrBus, 0.002); },
    // the greenhouse floor: a hollow tap
    floor(t, k) { const p = R(0.92, 1.08); tone(t, 'triangle', 420 * p, 260 * p, 0.06, 0.09 * k, asmrBus, 0.002); noise(t, 0.03, 'bandpass', 1800 * p, 2, 0.08 * k, asmrBus); },
    wood(t, k) { const p = R(0.9, 1.1); tone(t, 'triangle', 220 * p, 140 * p, 0.08, 0.15 * k, asmrBus, 0.002); noise(t, 0.03, 'bandpass', 900 * p, 3, 0.14 * k, asmrBus); },
    // the beanstalk's leaves: a soft rustle
    leaf(t, k) { noise(t, 0.12, 'bandpass', R(2500, 4000), 0.9, 0.09 * k, asmrBus, 0, 0.02); },
};
export function step(surface, landing) {
    if (!ctx || (settings.asmr ?? 1) <= 0) return;
    const f = STEPS[surface] || STEPS.tile;
    f(ctx.currentTime + 0.004, landing ? 1.45 : 0.8);
}

// =====================================================================================
// Sound effects (sfx(name, arg): arg is a pitch / combo number for some)
// =====================================================================================
const SFX = {
    click(t) { tone(t, 'sine', 720, 1250, 0.05, 0.13); noise(t, 0.01, 'bandpass', 2400, 1, 0.08, sfxBus); },
    clickBuy(t) { tone(t, 'sine', 620, 1100, 0.05, 0.13); tone(t + 0.05, 'sine', 1100, 1650, 0.06, 0.1); },
    jump(t) { tone(t, 'sine', 330, 620, 0.09, 0.07); },
    denied(t) { tone(t, 'square', 220, 160, 0.14, 0.08); tone(t + 0.14, 'square', 180, 120, 0.18, 0.08); },
    // a seed bought: a paper rustle and a bright ding
    buy(t) { noise(t, 0.12, 'bandpass', 3200, 1.5, 0.1, sfxBus, 1800, 0.01); [84, 91].forEach((n, i) => tone(t + 0.04 + i * 0.07, 'sine', midi(n), null, 0.3, 0.1)); },
    // planting: a soft soil pat, then a little sparkle
    plant(t) {
        noise(t, 0.12, 'lowpass', 600, 1, 0.3, asmrBus, 200, 0.005);
        tone(t, 'sine', 160, 70, 0.14, 0.18, asmrBus, 0.004);
        [88, 93, 96].forEach((n, i) => tone(t + 0.1 + i * 0.05, 'sine', midi(n), null, 0.22, 0.045));
    },
    // a harvest: a juicy pop, a crunch of leaves and a chime that climbs as you pick in a row
    harvest(t, n) {
        const k = Math.min(16, n || 0), p = R(0.92, 1.08);
        tone(t, 'sine', 240 * p, 1100 * p, 0.07, 0.17, asmrBus, 0.003);
        noise(t, 0.08, 'bandpass', 2600 * p, 1.2, 0.1, asmrBus, 5200 * p);
        noise(t + 0.01, 0.1, 'highpass', 4500, 0.7, 0.04, roomVerb);
        tone(t + 0.04, 'sine', midi(79 + [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36, 38][k]), null, 0.28, 0.07);
    },
    double(t) { [91, 95, 98, 103].forEach((n, i) => tone(t + i * 0.05, 'triangle', midi(n), null, 0.25, 0.07)); },
    ripe(t) { tone(t, 'sine', midi(96), null, 0.18, 0.03); tone(t + 0.06, 'sine', midi(100), null, 0.2, 0.025); },
    // grabbing the crates: a stack of wooden clunks
    collect(t, n) {
        const c = Math.min(6, Math.max(2, n || 3));
        for (let i = 0; i < c; i++) { const p = R(0.9, 1.1) * (1 + i * 0.06); tone(t + i * 0.07, 'triangle', 180 * p, 110 * p, 0.12, 0.16, sfxBus, 0.002); noise(t + i * 0.07, 0.05, 'bandpass', 800 * p, 2.5, 0.12, sfxBus); }
        tone(t + c * 0.07, 'sine', midi(84), midi(91), 0.15, 0.06);
    },
    // the till: ka-ching and a shower of coins
    sell(t) {
        noise(t, 0.05, 'bandpass', 2400, 1.2, 0.18, sfxBus);
        tone(t + 0.03, 'square', midi(88), null, 0.08, 0.05); tone(t + 0.1, 'square', midi(93), null, 0.3, 0.05);
        tone(t + 0.03, 'sine', midi(100), null, 0.35, 0.05);
        for (let i = 0; i < 9; i++) tone(t + 0.15 + i * 0.045, 'sine', midi(91 + (i % 3) * 4), null, 0.12, 0.035);
    },
    coin(t) { tone(t, 'square', midi(88), null, 0.07, 0.04); tone(t + 0.07, 'square', midi(93), null, 0.2, 0.04); },
    gem(t) { [84, 88, 91, 96, 100].forEach((n, i) => tone(t + i * 0.045, 'sine', midi(n), null, 0.4, 0.07)); tone(t, 'triangle', 800, 3200, 0.3, 0.04); },
    upgrade(t) { [72, 76, 79, 84, 88].forEach((n, i) => { tone(t + i * 0.055, 'triangle', midi(n), null, 0.3, 0.09); tone(t + i * 0.055, 'sine', midi(n + 12), null, 0.2, 0.03); }); noise(t, 0.4, 'bandpass', 800, 1, 0.06, sfxBus, 7000, 0.05); },
    quest(t) { [84, 88, 91].forEach((n, i) => tone(t + i * 0.07, 'triangle', midi(n), null, 0.35, 0.1)); SFX.gem(t + 0.2); },
    questBig(t) { [72, 76, 79, 84, 79, 84, 88].forEach((n, i) => tone(t + i * 0.09, 'square', midi(n), null, 0.25, 0.05)); [60, 64, 67, 72].forEach((n) => tone(t + 0.63, 'triangle', midi(n), null, 1.2, 0.07)); },
    // a new floor: hammering, then a fanfare
    floor(t) {
        for (let i = 0; i < 4; i++) { tone(t + i * 0.13, 'triangle', 300, 120, 0.1, 0.14, sfxBus, 0.002); noise(t + i * 0.13, 0.04, 'bandpass', 2600, 3, 0.1, sfxBus); }
        [67, 71, 74, 79, 74, 79, 83, 86].forEach((n, i) => tone(t + 0.6 + i * 0.1, 'square', midi(n), null, 0.28, 0.05));
        [55, 59, 62, 67, 71].forEach((n) => tone(t + 1.4, 'triangle', midi(n), null, 1.6, 0.07));
        noise(t + 1.4, 1.2, 'highpass', 3000, 0.6, 0.06, sfxBus);
    },
    // an egg: three cracks, then the reveal
    crack(t, n) { const p = 1 + (n || 0) * 0.15; noise(t, 0.05, 'bandpass', 1800 * p, 3, 0.2, sfxBus); tone(t, 'triangle', 500 * p, 200 * p, 0.06, 0.08, sfxBus, 0.002); },
    hatch(t) {
        noise(t, 0.2, 'bandpass', 1500, 1.5, 0.2, sfxBus, 6000);
        [79, 83, 86, 91, 95].forEach((n, i) => tone(t + 0.1 + i * 0.06, 'sine', midi(n), null, 0.5, 0.1));
        tone(t + 0.1, 'triangle', midi(67), null, 1, 0.08);
    },
    tick(t) { tone(t, 'square', 1800, 1400, 0.02, 0.04); noise(t, 0.01, 'highpass', 5000, 0.7, 0.05, sfxBus); },
    win(t) { [72, 76, 79, 84].forEach((n, i) => tone(t + i * 0.08, 'triangle', midi(n), null, 0.4, 0.1)); [84, 88, 91].forEach((n) => tone(t + 0.4, 'sine', midi(n), null, 1, 0.06)); },
    restock(t) { for (let i = 0; i < 6; i++) tone(t + i * 0.06, 'sine', midi([84, 88, 91, 96, 91, 96][i]), null, 0.25, 0.07); noise(t, 0.4, 'highpass', 6000, 0.8, 0.04, sfxBus, 0, 0.05); },
    // an event starts: a little horn and a shimmer
    event(t) { [67, 72, 76, 79].forEach((n, i) => { tone(t + i * 0.12, 'sawtooth', midi(n), null, 0.3, 0.035); tone(t + i * 0.12, 'triangle', midi(n + 12), null, 0.3, 0.05); }); noise(t + 0.4, 1, 'highpass', 5000, 0.6, 0.05, sfxBus, 0, 0.3); },
    mutate(t) { for (let i = 0; i < 8; i++) tone(t + i * 0.04, 'sine', midi(88 + (i % 4) * 3 + (i > 3 ? 12 : 0)), null, 0.3, 0.05); noise(t, 0.6, 'highpass', 6000, 0.6, 0.05, sfxBus, 0, 0.1); },
    lift(t, up) { noise(t, 0.45, 'bandpass', up ? 400 : 1600, 1.6, 0.14, sfxBus, up ? 2400 : 300, 0.08); tone(t, 'sine', up ? 300 : 700, up ? 900 : 250, 0.4, 0.06, sfxBus, 0.05); },
    dig(t) { noise(t, 0.18, 'bandpass', 900, 1.2, 0.2, sfxBus, 400, 0.01); noise(t + 0.15, 0.1, 'lowpass', 500, 1, 0.2, sfxBus); },
    teleport(t) { for (let i = 0; i < 9; i++) tone(t + i * 0.028, 'sine', midi(74 + i * 3), null, 0.16, 0.06); noise(t, 0.35, 'bandpass', 600, 1.5, 0.08, sfxBus, 5000, 0.05); },
    firework(t) { tone(t, 'sine', 900, 200, 0.35, 0.05); noise(t + 0.35, 0.4, 'lowpass', 2500, 0.8, 0.26, sfxBus); },
    equip(t) { tone(t, 'triangle', midi(79), midi(84), 0.12, 0.1); noise(t, 0.04, 'bandpass', 3000, 2, 0.08, sfxBus); },
    whoosh(t) { noise(t, 0.3, 'bandpass', 400, 1.6, 0.12, sfxBus, 1800, 0.08); },
    unlock(t) { SFX.buy(t); noise(t, 0.5, 'bandpass', 700, 1.2, 0.08, sfxBus, 6000, 0.05); },
};
export function sfx(name, arg) {
    if (!ctx || !SFX[name] || settings.sfx <= 0) return;
    SFX[name](ctx.currentTime + 0.005, arg);
}
// Many effects in one frame: only a few actually sound
let burstT = 0, burstN = 0;
export function sfxSome(name, arg, cap) {
    if (!ctx) return;
    if (ctx.currentTime - burstT > 0.05) { burstT = ctx.currentTime; burstN = 0; }
    if (burstN++ >= (cap || 4)) return;
    sfx(name, arg);
}
