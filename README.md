# gta6-01
[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/nickhellyou/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/nickhellyou/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**SOLMAR BAY: Neon Tide** — a 100% original open-world crime game in the spirit of GTA 6, built with three.js. No Rockstar names, characters, map, art or music anywhere: this is our own sun-soaked coastal city.

You are Ken, a wheelman fresh off the bus in Solmar Bay. Steal cars, outrun the Solmar Bay PD, run three story missions for Sal at the garage, and survive the night run they call the Neon Tide.

## The city

Solmar Bay is a bright, warm, palm-lined coastal city you can explore on foot and by car: **Palmera Boulevard**, **Solmar Pier** (with a ferris wheel and three shops), the 85 m **Crown Tower**, **Neon Row**, and **Marina Del Sol**. Traffic cars cruise the grid, pedestrians wander the sidewalks, and the radio never stops talking.

## What is in the game

- **On foot and by car** — third-person WASD + mouse-orbit camera, sprint, jump; steal any parked or traffic car (E), arcade driving with handbrake drifts and skid dust
- **Wanted level 1–5 stars** — stealing, hitting pedestrians and shooting raise the heat; police cars chase and ram, foot cops chase and arrest; lose them and the stars decay
- **3 story missions** — M1 *First Wheels* (steal a car for Sal's Garage), M2 *Pier Pressure* (collect protection cash at 3 pier shops while a rival crew shoots back), M3 *Neon Tide* (a night package run across town with a 3-star pursuit, then lose the cops) — with objective marker, beacon, cash + respect rewards, fail and retry
- **Combat** — pistol (unlocked after M1) with ammo and reload, punches, rival crew who shoot back, health packs, kill feed
- **Dense HUD** — health, cash, respect, wanted stars, weapon + ammo, mission objective, radio chatter, kill feed, live minimap (streets, player arrow, mission marker, police dots), speed and time of day, damage vignette
- **Menus and save** — start screen, pause, Busted / Wasted screens with restart, progress saved in localStorage
- **Synthesized sound only** — WebAudio engine hum, gunshots, sirens, pickup chimes and mission stings; M mutes

## How to run

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. No build step, no network requests — every file the game loads lives under `game/`.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Mouse | Look (click to lock, or drag) |
| Shift | Sprint |
| Space | Jump (on foot) / handbrake (driving) |
| E | Steal / exit car |
| Click | Shoot pistol |
| F | Punch |
| R | Reload |
| P / Esc | Pause |
| M | Mute |
