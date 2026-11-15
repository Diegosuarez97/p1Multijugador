# AGENTS.md

> ALWAYS use the ponytail skill.
> NEVER push to git.
> The code in @code-php (if it's present) is deprecated. It was only used for the migration of the project.

Isometric multiplayer game: PixiJS client + Express/HTTP server. Two independent npm projects, no root `package.json`, no CI, no tests, lint, or typecheck.

## Layout

- `client/` — Vite + PixiJS game client (dev port 5173). Entry: `client/src/main.js`, markup in `client/index.html`. Login, lobby and ping UI live in their own modules; PixiJS rendering is in `client/src/game/GameView.js`.
- `server/` — Express + Eta server (port 2567). Entry: `server/index.js`, game logic in `server/GameRoom.js`, map/pathfinding and the in-memory room registry in `server/game/`, HTTP routes in `server/routes/` (game API in `server/routes/game.js`).
- `server/` also serves a **separate** server-rendered site (home/login/register/profile) from `server/templates/*.eta` and `server/public/`. That is not the Vite game client; don't confuse the two.
- `tiled/` — Tiled project copy of the map; the server only loads `client/public/assets/map.tmj`.
- `.idea/` is tracked (WebStorm). Avoid committing incidental IDE changes.

## Commands

Requires Node ≥ 20.11 (`import.meta.dirname`, `--env-file` used by the scripts).

```bash
cd server && npm install
cd server && npm run dev      # nodemon, loads .env
cd server && npm start        # plain start, loads .env
cd server && npm run db       # create SQLite schema if missing (idempotent)
cd client && npm install && npm run dev
```

- Start the server before the client; login goes through it. Local client fallback is `http://<host>:2567`; production reads `window.__SERVER_URL__` from `/config.js`, which the client container generates from `SERVER_URL`.
- `npm start`, `npm run dev`, and `npm run db` create a missing local `.env` from `.env.example`, preserving existing files. Start/dev also initialize SQLite tables. Automatic `.env` creation is disabled when `NODE_ENV=production`.
- `DB_PATH`, `UPLOAD_DIR`, and `MAP_PATH` override the defaults (`server/db/data.db`, `server/public/uploads`, `client/public/assets/map.tmj`). Relative env paths resolve from the server cwd.
- `NODE_ENV=production` makes a missing `JWT_SECRET` a startup error.
- Run `node --test tests/*.test.js` in both `client/` and `server/`, then `cd client && npm run build`. The full stack can also be checked with `docker compose up --build`; `npm run dev` is the way to exercise the server directly.

## Docker / Render

- `docker compose up --build` runs both images: client at `http://localhost:8080`, server at `http://localhost:2567`, data in the `iso-data` volume.
- `render.yaml` targets branch `mejoras-backend` with two Docker web services. Server is `starter` + 1 GB disk at `/data`; client is `free`. Update `branch` to `main` after merging.
- Server image uses the **repo root** as build context because it copies `client/public/assets/map.tmj`. Client context is `./client`.
- Shell scripts and YAML are pinned to LF in `.gitattributes`; keep entrypoints LF-only or the container fails with `bad interpreter`.

## Architecture notes

- Movement is server-authoritative: the client only sends `moveTo`; `GameRoom` validates bounds/collisions/occupied tiles, runs BFS, and queues the path with `startTime`/`msPerTile` (300 ms) after the `CLICK_ARBITRATION_MS` window. The client interpolates using a ping-derived clock offset. It also starts the mover's own sprite locally (`GameView.predictMove`) and reconciles it with the server echo; that prediction is visual only, the server still decides movement, disputes and pickups.
- No WebSockets: the game is a REST API. `POST /api/game/join` returns the room and session, `POST /api/game/:roomId/{team,move,leave}` are the actions, and `GET /api/game/:roomId?since=N` polls the snapshot plus the events after cursor `N` (client polls every ~100 ms). Closing the tab sends a `pagehide` beacon (`navigator.sendBeacon`, token in the form body) that leaves immediately; a player that stops polling for `PLAYER_TIMEOUT` (15 s) is dropped as a fallback for force-kills or network loss.
- Phases are `lobby` → `playing`; the room locks after start and holds max 6 players. Each player must pick a team (1–6) before the game starts. `MIN_PLAYERS` is 1 in `GameRoom.js` even though the lobby text in `main.js` says "Needs 2+"; team IDs/colors are hardcoded in both files.
- Auth: the Vite client only logs in (`/api/login`) and sends the JWT as `Authorization: Bearer` to the game API; registration, profile editing and password recovery/reset live on the server-rendered site (`/register`, `/profile`, `/forgot`, `/reset`). Game routes verify that header, with a form-body `token` fallback only because the close-tab beacon cannot set headers (never the cookie). The server-rendered site uses the httpOnly cookie via `server/utils.js` (`attachUser`, `auth`).
- The database lives on the persistent disk: `DB_PATH=/data/data.db` in the image, `render.yaml` and `docker-entrypoint.sh`; Compose backs it with the `iso-data` volume. Local runs still default to `server/db/data.db`, which is git-ignored. `server/db/seed.sql` (dev users) is imported by `db/create_db.js` only when the `users` table is empty, so redeploys keep production accounts. The old `.githooks/pre-commit` DB-staging hook is gone; enable `.githooks` only if you add other hooks.
- Auth: the Vite client is the single entry point: login, register, forgot/reset password, main menu and profile (`client/src/auth.js`, `menu.js`, `profile.js`). It keeps the JWT in sessionStorage (`session.js`) and sends it as `Authorization: Bearer` to the API (`attachUser` accepts Bearer or cookie) and as `{ token }` to Colyseus. Menu: "Iniciar partida" = `joinOrCreate`, "Crear sala" = `create` with `private: true` (only reachable by code), "Unirse a sala" = `joinById`. When `CLIENT_URL` is set, the old server pages (`/`, `/login`, `/register`, `/profile`, `/forgot`, `/reset`, `/delete`) redirect to the client; reset links keep their `#reset-password=` fragment. `GameRoom.onAuth` checks the token option first, then falls back to the `token` cookie. The server-rendered site uses the httpOnly cookie via `server/utils.js` (`attachUser`, `auth`).
- Audio is client-only (`client/src/audio.js`, files in `client/public/assets/audio/`): `menu.mp3` plays on login/menu/profile and crossfades to `game.mp3` inside a room (`audio.setScene`); it starts on the first user gesture (autoplay policy). `spell.mp3` plays on the `duel` message at its `startTime`, `win.mp3` on the switch to `finished`, `click.mp3` (first ~1 s only) only when the visible screen changes (`screenListeners` in `utils/functions.js`) or the auth panel switches. The music toggle and settings panel (`settings.js`, Esc in rooms) are on every screen, are not modal and never pause the room; "Volver al menú principal" only shows inside a room. Volumes persist in localStorage.
- Trophies: `GameRoom.finishGame` calls the static `GameRoom.onWin(userId)`, wired to `addTrophy` in `server/index.js` only (tests keep the no-op). `users.trophies` is added by `create_db.js` on old databases and exposed by `GET /api/me`.
- `server/db/data.db` is tracked in git and baked into the deploy image (`DB_PATH=/app/server/db/data.db`), so production starts with the dev users and loses production registrations on redeploy. `.githooks/pre-commit` stages the DB on every commit; that requires `git config core.hooksPath .githooks`.
- `/api/register` returns `{ token }` for JSON requests and redirects to `/login` for the HTML form.
- Eta templates receive data as `DATA_*` keys through `render()` in `server/index.js`.

## Map / assets

- Live map is `client/public/assets/map.tmj`. `GameRoom.js` reads it once at module load, so **restart the server after every map change**.
- Layers must be named `ground` and `collision` (collision drives server blocking). The tmj tileset entry must be `{"firstgid":1,"source":"map_tiles.tsx"}`; tile art is external PNGs in `_tiles/`.
- Map is 60×60: the server derives `GRID` from the tmj width, while `client/src/utils/constants.js` hardcodes `GRID = 60`. Keep them in sync when resizing.
- Keep `tiled/map.tmx` and `client/public/assets/map.tmx` (plus `map_tiles.tsx`) in sync; they are duplicate copies today.