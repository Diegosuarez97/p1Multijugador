# AGENTS.md

Isometric multiplayer game: PixiJS client + Express/Colyseus server. Two independent npm projects, no root `package.json`, no CI, no tests, lint, or typecheck.

## Layout

- `client/` — Vite + PixiJS game client (port 5173). Entry: `client/src/main.js`, markup in `client/index.html`.
- `server/` — Express + Colyseus + Eta server (port 2567). Entry: `server/index.js`, game logic in `server/GameRoom.js`.
- `server/` also serves a **separate** server-rendered site (home/login/register/profile) from `server/templates/*.eta` and `server/public/`. That is not the Vite game client; don't confuse the two.
- `tiled/` — Tiled project copy of the map; the game only loads the exported `client/public/assets/map.tmj`.
- `.idea/` is tracked (WebStorm). Avoid committing incidental IDE changes.

## Commands

Requires Node ≥ 20.11 (`import.meta.dirname`, `--env-file` used by the scripts).

```bash
cd server && npm install && cp -n .env.example .env   # .env is gitignored and required
cd server && npm run dev      # nodemon, loads .env
cd server && npm run db       # create SQLite schema if missing (idempotent)
cd client && npm install && npm run dev
```

- `npm start` in `server/` is broken: it runs `node --exec ...`, and `--exec` is not a Node flag. Use `npm run dev` or `node --env-file=.env index.js`.
- README says `npm run create-db`; the real script is `npm run db`.
- Start the server before the client; login goes through it. The game client hardcodes `http://${location.hostname}:2567` in `client/src/utils/constants.js`, so changing `PORT` requires editing both that file and the env.
- DB code uses relative paths (`db/data.db`): run `server/db` scripts from `server/`, never from the repo root. `server/db/data.db` is committed.
- Only verification available is `cd client && npm run build` (plain JS, no tests). `npm run dev` is the way to exercise the server.

## Architecture notes

- Movement is server-authoritative: the client only sends `moveTo`; `GameRoom` validates bounds/collisions/occupied tiles, runs BFS, and broadcasts the path with `startTime`/`msPerTile` (300 ms). The client interpolates using a ping-derived clock offset. Don't add client-side movement prediction without changing both sides.
- Phases are `lobby` → `playing`; the room locks after start and holds max 6 players. Each player must pick a team (1–6) before the game starts. `MIN_PLAYERS` is 1 in `GameRoom.js` even though the lobby text in `main.js` says "Needs 2+"; team IDs/colors are hardcoded in both files.
- Auth is JWT in an httpOnly `token` cookie; `server/utils.js` (`attachUser`, `auth`) guards HTML and API routes. Colyseus `onAuth` also reads the cookie, not the `token` join option the client passes.
- Eta templates receive data as `DATA_*` keys through `render()` in `server/index.js`.

## Map / assets

- Live map is `client/public/assets/map.tmj`. `GameRoom.js` reads it once at module load, so **restart the server after every map change**.
- Layers must be named `ground` and `collision` (collision drives server blocking). The tmj tileset entry must be `{"firstgid":1,"source":"map_tiles.tsx"}`; tile art is external PNGs in `_tiles/`.
- Map is 60×60: the server derives `GRID` from the tmj width, while `client/src/utils/constants.js` hardcodes `GRID = 60`. Keep them in sync when resizing.
- Keep `tiled/map.tmx` and `client/public/assets/map.tmx` (plus `map_tiles.tsx`) in sync; they are duplicate copies today.
