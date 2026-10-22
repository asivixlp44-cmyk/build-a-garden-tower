# Build a Garden Tower

A multiplayer garden tycoon for the browser, built with **Three.js** and **Colyseus** for Bloxity. Every player gets a glass greenhouse on the square round the market. Buy seeds at the Seed Shop, plant them, wait for the fruit to ripen and **step on the plants to harvest them**. The harvest piles up in the **FRUITS crates** outside your door: grab the crates, carry them over your head to the market and **sell them for Cash**. Buy better seeds, upgrade every floor and build new floors on top: **build the tallest garden!** It clones the Roblox game *[Build a Garden Tower](https://www.roblox.com/games/115035699922620/Build-a-Garden-Tower)* (see the video in `reference/`).

**There are no in-app purchases.** Everything costs Cash or Gems (Gems come from quests, the Index, gifts, the wheel, the Giant Beanstalk and daily rewards).

It shares its engine with the other Legion games (server, Bloxity login and avatars, the top games' character animation and lighting, profiles, saves; forked from Destroy the Cube). The garden, the greenhouses, the plants, the pets, the HUD and the soundtrack are new.

## Project layout

| Folder | What it is |
|---|---|
| `client/` | Vite + Three.js client: `main.js` (the player, the camera, input for mouse / touch / controller, planting and the shovel, harvesting by stepping on plants, the crates and selling, the lift pads, the guide, events, other players, the network), `plants.js` (every species built from blocks, one instanced mesh per species; growing, ripening, the sway, the ripe glow and the mutations are all in the shader), `plots.js` (the greenhouses: floors, glass, truss, roof, name boards, lift pads, upgrade boards, the FRUITS crates), `world.js` (the market and the stalls, the Giant Beanstalk, scenery, the guide arrow), `pets.js` (pets that follow you), `geo.js` (block-building helpers), `engine.js` (renderer, sky, lights, moods), `fx.js` (quality, particles), `audio.js` (music and sounds), `ui.js` + `index.html` (HUD and panels) |
| `server/` | Colyseus 0.18 server: the `garden` room (`GardenRoom.js`: plots, the Seed Shop's stock, planting, growth, harvests, Auto Collect, crates, selling, floors, upgrades, pets, eggs, events, quests, gifts, daily rewards, the wheel, codes), profiles (MongoDB on Legion), leaderboards, play stats |
| `shared/` | `config.js` (seeds, mutations, floors, upgrades, pets, eggs, passes, events, quests, rewards, the economy's formulas), `garden.js` (where everything stands: plots, floors, lift pads, stalls, the beanstalk), used by both sides |

## Run it locally

Needs Node 20 or newer. Double-click `start-local.bat`, or:

```sh
npm install          # installs client and server too
npm run build        # builds the client into client/dist
npm start            # server + game on http://localhost:2681
```

For development run `npm run dev:server` and `npm run dev:client`, then open http://localhost:5243 (the client talks to the server on port 2681; `VITE_SERVER_URL` overrides that). Dev builds (or a build with `VITE_QA=1`) expose `window.__qa`. Restart the server after changing `shared/`. For testing only, `QA=1` lets the client give itself Cash / seeds (`__qa.give`) and `QA_SHIFT=<ms>` moves the server clock (to land in an event); both are refused on Legion.

## Gameplay

- **The garden** is wide and open, nothing crowded. The round **MARKET** stands in the middle on a stone plaza: the Seed Shop and the SELL counter all the way round, its keepers turning on a lazy-susan floor under a grand blue-and-white tent with bunting, lanterns and seed packets floating over it. A brick promenade circles it with four fountains and flower beds; lamp-lit brick paths lead from every greenhouse door to the plaza. Eight greenhouses stand round it, two on each side of the square, doors facing the market across the lavender ring road (painted arrows, white kerbs, lamps). Spread over the lawn between the paths: the **Egg Shop**, the **Beanstalk Wheel**, **Best Players** (a golden trophy on a red carpet and the leaderboards: tallest gardens, most Cash earned, time played), the **Daily Quests** board, the **Gem Shop**, a giant **cherry blossom** tree ringed with benches, the **Halloween pumpkin patch** and the flower bed where the Giant Beanstalk sprouts. Between each pair of greenhouses a little garden walk (flower borders, a rose arch, a bench); ponds with lily pads in the corners; trees, windmills and hot-air balloons all round.
- **Your greenhouse** (72 x 58 studs, 20 tall per floor): glass walls in a lavender truss frame, a checkered floor with a wooden-edged planting bed, a gable roof with your name on it and a flag in your colour, planters full of flowers along the front, potted topiaries and lanterns by the door, string lights, the "Upgrade Floor" sign and the FRUITS crates outside. Every floor holds 20 plants and has a **FLOOR UPGRADES** board on its back wall (Harvest Multiplier, Growth Speed, Double Harvest, 10 levels each). Lift pads by the door take you up and down (the yellow one on your top floor builds the next one). Up to 8 floors (Floor 8 is the Sky Garden). Inside, the camera stays in the greenhouse with you. Under the Cash a bar fills up toward the next floor (it turns into a BUILD button once you can afford it).
- **Quick travel**: the **Garden** and **Market** buttons (keys G and M) take you home or to the market's plaza in a blink; the one the guide leads to glows. When three or more of your plants are ripe while you're away from home, a toast tells you.
- **The loop** (the reference's tutorial): *Buy an Apple → Plant your Apple → Wait... then step on it! → Grab the crates! → Sell the crates! → Buy an Onion → Plant your Onion → Buy another plant* (+10 Gems, a wheel spin and a 10-minute **x2 Cash Starter Boost**) and a SKIP button. Planting never just fails: when the spot you point at is taken, the ghost moves to the nearest free one (and E plants it too). Every step shows the way: shining golden arrows flow along the ground from you to the goal (out of or into your greenhouse by its door, round its sides and round the market, to the lift pad from another floor), a big glowing arrow bobs over the goal in a beam of light with a ring pulsing under it, a pointer at the screen's edge turns toward it when it's off screen, and a bouncing arrow points at the button to press (the seed to buy in the Seed Shop, the seed on the hotbar, PLANT on phones).
- **Seeds**: 23 in the Seed Shop (Common Apple $100 → Mythic Starfruit Tree $40B), each with its stock for the current 5 minutes (everyone's shop restocks together; a personal restock costs Gems), plus Rose, Sunflower, Spooky Pumpkin, Magic Beanstalk and Yellow Bonsai from rewards. A plant grows up, fruits, ripens (it glows, bounces and sparkles: "READY! Step on it"), and fruits again after every harvest. Pick a seed on the hotbar: a ghost of the plant shows where it goes (green: OK); click (or PLANT on a phone) to plant, R to turn it. The shovel digs a plant up (half its price back; reward plants come back as a seed).
- **Mutations**: Golden x4, Toxic x2, Frozen x3, Rainbow x10, Celestial x25, rolled when you plant (pets' Luck, passes and events raise the odds); every new plant and mutation fills your **Index** and pays Gems.
- **Pets**: hatch eggs (Garden, Meadow, Sky, Jungle, Cosmic) for 15 pets that follow you round and boost harvest value, growth speed and luck; equip 3 (4 with the pass). A FREE PET after 10 minutes of play.
- **Events** (the same for everyone, every 10 minutes, 3 minutes long): the **Giant Beanstalk** (climb its leaves to the cloud for a Magic Beanstalk seed + 10 Gems), **Growth Frenzy** (x2 growth), **Golden Rain** (plants can turn golden), **Rainbow Bloom** (rainbow mutations x6). The sky changes with each.
- **Rewards**: playtime gifts (1 to 60 minutes), the daily quests (play 20 minutes, harvest 200 plants, place 12 plants, buy 12 seeds, sell crates 5 times), 7-day daily rewards (the reference's: $5,000, Rose, ... Yellow Bonsai), a free wheel spin every 15 minutes, codes (`GARDEN`, `TOWER`, `SEEDS`, `HALLOWEEN`, `LEGION`, `BLOXITY`, `RELEASE`), Friend Boost (+10% growth speed per Bloxity friend here). Gem passes: Auto Collect (your ripe plants harvest themselves, even for up to 8 hours while you're away), x2 Cash, +1 Pet Slot, Lucky Gardener; boosts x2 Cash, x2 Growth, x3 Luck.

- **Goals** after the tutorial, one at a time in the tutorial's banner, with their progress and reward, and the shining arrows leading the way: grow 4 plants, sell 3 times, buy 6 seeds, upgrade your floor, grow 8 plants, spin the wheel, hatch an egg, harvest 100 times, grow 14 plants, build Floor 2, plant on Floor 2, 5 floor upgrades, a mutated plant, 3 eggs, Floor 3, 1,000 harvests, Floors 4 and 5 (mostly Gems: about 110 in all, enough for Auto Collect, plus Cash and wheel spins).

Pacing (an economy sim of an efficient player, with the Starter Boost): the tutorial takes 1-2 minutes, Floor 2 about 7 minutes, Floor 3 about 15, Floor 4 about 30, Floor 5 over an hour, Floor 7 about 4 hours.

## Controls

| Action | Keyboard / mouse | Controller | Touch |
|---|---|---|---|
| Move | WASD / arrows | Left stick | Joystick |
| Camera | Drag (either button), wheel to zoom | Right stick | Drag, pinch to zoom |
| Sprint | Shift | L3 | Push the joystick all the way |
| Jump | Space | A | JUMP |
| Pick a seed / the shovel | 1-9, or click the hotbar | LB / RB | Hotbar |
| Plant / dig | Click | RT | PLANT (tap the floor to move the ghost) |
| Turn the plant | R | LT | ↻ |
| Stop planting | Q / Esc | B | ✖ |
| Use (shops, crates, boards, signs) | E | X | The prompt |
| Floors / Pets / Index | F / P / I | Start / Back | Buttons on the left |

Harvesting is just walking onto a ripe plant; grabbing the crates is walking into them; selling is walking up to the market's counter with them.

## Sound

- **Music**, "Sunny Sprouts": an original, sunny 116 BPM piece in G major. A ukulele strums the chords over a soft pad, a round bass and a light kit join in, a glockenspiel sings the tune, it breaks down to the pad with birdsong, and comes back an octave up; 64 bars. Menus are calm, events bring the full groove.
- All effects synthesized: soil pats when you plant, juicy pops with a chime that climbs as you harvest in a row, wooden crate clunks, the cash register, the egg cracking open, the wheel ticking, a fanfare for a new floor, the lift's whoosh, footsteps on grass, paving, the greenhouse floor and the beanstalk's leaves.

## Graphics and performance

- **Plants** are blocky (like the reference's) and drawn as one instanced mesh per species for the whole garden. Growing up, the fruit swelling, the sway, a ripe plant's bounce, hop and glow, and the look of each mutation (a gold shine, toxic pulse, frost, flowing rainbow, twinkling stars) are computed in the shader from the plant's times: nothing is re-uploaded while plants grow; their shadows grow with them. Fruit flying into the crates is a GPU pool too.
- The **lighting is the top games'** (hemisphere 1.1, ambient 0.45, sun 1.5, PCF shadows, no tone mapping); events only tint the sky. The **character animation is the top games'** (`animator.js`), with a two-arm pose for carrying the crates over your head.
- **Built for weak PCs and phones**: only matte (Lambert) and unlit materials, no reflections, no environment map, no post-processing. The market and the scenery are merged into a few vertex-coloured meshes (lit and glowing parts share one material), each greenhouse into a handful (its name boards and sign share one texture); the shop keepers are baked into one mesh each; everything that never moves is frozen. Every shader is compiled and every texture uploaded behind the loading screen (37 shaders; the count stays flat while playing). All the water (fountains and ponds) is one shader mesh, all the fountains' jets another. Phones, weak PCs and older graphics chips (by name: older Intel HD / UHD 6xx / Iris, small AMD Vega, software renderers) start on Low (no shadow code). If the frame rate drops, the game first draws fewer pixels (dynamic resolution down to half, kept only if it actually helps: a slow processor isn't helped by it) and draws them all again once it runs smoothly; if that isn't enough the quality steps down (in the first moments of play that also takes the shadow code out), and the next session starts there.
- Measured (headless Chrome, real GPU, a full garden: 6 players with ~45 plants each on 3 floors, ~310K triangles drawn): desktop 1080p High 107-118 FPS; phone size on Low with the CPU slowed 4x 58-72 FPS; laptop 1366x768 Medium with the CPU slowed 4x 72-80 FPS. A production build loads in about 3 s on a desktop, about 10 s on a slow phone over 4G.

## Multiplayer and saves

- Up to 8 players share a garden (a greenhouse each; the fullest garden fills first). Movement is client-side; every purchase, planting, harvest, crate and sale is checked on the server (where you stand, your floor, the stock, the times). Gardens live in the players' profiles with absolute times, so plants keep growing while you're away and come back exactly as you left them.
- Progress is saved per browser or per Bloxity account: MongoDB on Legion (`MONGODB_URI`), `server/data/profiles.json` locally; saved within 1.5 s of anything you buy or plant and every 10 s.
- Play stats: `GET /api/stats?key=<stats key>&days=7` (locally the stats are open): session lengths (phones and desktop apart), where players stop in the tutorial and how many seconds each step takes, floors reached, plants placed, harvests, sales, eggs, the FPS in buckets (with the mean playtime per bucket), the quality used, the graphics chips of slow sessions, load times and the errors players' browsers hit. `&raw=50` adds the newest session records.

## Deploy (Bloxity hosting)

Pushing `main` (prod) or `dev` runs `.github/workflows/deploy.yml`: server image `ghcr.io/asivixlp44-cmyk/build-a-garden-tower-server`, Legion rollout, client upload. Play at https://build-a-garden-tower.play.bloxity.io once the app `build-a-garden-tower` exists on hosting.bloxity.io and the repo has the `LEGION_DEPLOY_TOKEN` secret.
