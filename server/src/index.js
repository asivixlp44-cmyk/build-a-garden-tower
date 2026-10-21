import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config, { listen } from '@colyseus/tools';
import { defineRoom } from 'colyseus';
import express from 'express';
// QA only (never on Legion): QA_SHIFT=<ms> moves this server's clock (to land in an event window)
if (process.env.QA_SHIFT && !process.env.BLOXITY_GAME_ID) { const shift = +process.env.QA_SHIFT, now0 = Date.now; Date.now = () => now0() + shift; console.log('[qa] clock shifted by', shift, 'ms'); }
const { GardenRoom } = await import('./GardenRoom.js');
import { installStatReporter } from './bloxity.js';
import { statsSummary } from './stats.js';
import { USE_DB } from './profiles.js';

// Serves the built client (client/dist) and the game room on the same port,
// so one Node host is enough to run the whole game.
const CLIENT_DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');

// Play stats are private: /api/stats needs ?key=<stats key>. Only the key's SHA-256 lives in the
// public repo (the key itself is in server/STATS_KEY.local.txt); locally (not on Legion) they're open.
const STATS_KEY_SHA256 = 'c0bee3f49f7fb3e7e8e9175cb91b3d8358738285785cdfb07b9414e38b49aef2';
const ON_LEGION = !!process.env.BLOXITY_GAME_ID;
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest();
const keyOk = (key) => !!key && crypto.timingSafeEqual(sha256(key), Buffer.from(STATS_KEY_SHA256, 'hex'));

const app = config({
    rooms: {
        // one garden of up to 8 players (a greenhouse each); the fullest garden fills first
        garden: defineRoom(GardenRoom).sortBy({ clients: -1 }),
    },
    initializeExpress: (expressApp) => {
        expressApp.get('/health', (req, res) => res.json({ ok: true, db: USE_DB }));
        // Play stats (aggregate, no names): /api/stats?key=<stats key>&days=7
        expressApp.get('/api/stats', async (req, res) => {
            const key = typeof req.query.key === 'string' ? req.query.key : '';
            if (ON_LEGION && !keyOk(key)) return res.status(401).json({ error: 'bad key' });
            const days = Math.min(60, Math.max(1, Number(req.query.days) || 7));
            try { res.json(await statsSummary(days)); } catch (e) { res.status(503).json({ error: e.message }); }
        });
        if (fs.existsSync(CLIENT_DIST)) expressApp.use(express.static(CLIENT_DIST));
    },
});

const reporter = installStatReporter();
process.once('beforeExit', () => { reporter.flush(); });

// 2681 locally so this game can run beside the other Legion games; Legion sets PORT
listen(app, Number(process.env.PORT) || 2681);
