import { Application, Container, Graphics, Text, Assets, extensions } from "pixi.js";
import { tiledMapLoader } from 'pixi-tiledmap';
import { Client } from "colyseus.js";
import { API, WS, GRID, TW, TH, COLORS, WORLD_SCALE } from "./utils/constants.js";
import * as utils from "./utils/functions.js";

extensions.add(tiledMapLoader);

const $ = utils.$;

// ---------- screens ----------
function show(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
}

// ---------- auth ----------
async function auth(kind) {
  $("msg").textContent = "";
  try {
    const res = await fetch(`${API}/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: $("user").value.trim(), password: $("pass").value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    await joinRoom(data.token);
  } catch (e) {
    $("msg").textContent = e.message;
  }
}
$("login").onclick = () => auth("login");
$("register").onclick = () => auth("register");

// ---------- room + latency ----------
let room, rtt = 0, offset = 0, samples = [];
const serverNow = () => Date.now() + offset;

async function joinRoom(token) {
  room = await new Client(WS).joinOrCreate("game", { token });

  room.onMessage("error", (m) => ($("lobbyInfo").textContent = m));
  room.onMessage("pong", ({ clientTime, serverTime }) => {
    const now = Date.now();
    samples.push({ rtt: now - clientTime, offset: serverTime + (now - clientTime) / 2 - now });
    samples = samples.slice(-8);
    rtt = Math.round(samples.reduce((a, s) => a + s.rtt, 0) / samples.length);
    offset = samples.reduce((a, s) => a + s.offset, 0) / samples.length;
    $("hud").textContent = `Ping: ${rtt} ms`;
    room.send("latency", rtt);
  });
  const ping = () => room.send("ping", Date.now());
  ping(); setInterval(ping, 2000);
  $("hud").style.display = "block";

  buildLobby();
  room.onStateChange(onState);
  room.onLeave(() => { show("menu"); location.reload(); });
  show("lobby");
}

// ---------- lobby ----------
function buildLobby() {
  $("teams").innerHTML = "";
  for (let t = 1; t <= 6; t++) {
    const b = document.createElement("button");
    b.className = "team"; b.id = `team${t}`;
    b.style.borderColor = "#" + COLORS[t - 1].toString(16).padStart(6, "0");
    b.onclick = () => room.send("selectTeam", t);
    $("teams").appendChild(b);
  }
}

function renderLobby(state) {
  const owners = {};
  state.players.forEach((p, id) => { if (p.team) owners[p.team] = { name: p.name, mine: id === room.sessionId }; });
  for (let t = 1; t <= 6; t++) {
    const b = $(`team${t}`), o = owners[t];
    b.textContent = o ? o.name : `Team ${t}`;
    b.disabled = !!o && !o.mine;
    b.classList.toggle("mine", !!o?.mine);
  }
  const waiting = [...state.players.values()].filter((p) => !p.team).length;
  $("lobbyInfo").textContent = `${state.players.size} player(s) in lobby, ${waiting} still choosing. Needs 2+ players.`;
}

// ---------- game ----------
let app, world, players, pathPreview, blockedTiles = new Set(), sprites = {}, anims = {}, started = false;

function findPreviewPath(sx, sy, tx, ty) {
  const key = (x, y) => y * GRID + x;
  const start = key(sx, sy), target = key(tx, ty);
  const previous = new Map([[start, null]]);
  const queue = [[sx, sy]];

  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    if (key(x, y) === target) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, next = key(nx, ny);
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
      if (blockedTiles.has(next) || previous.has(next)) continue;
      previous.set(next, [x, y]);
      queue.push([nx, ny]);
    }
  }

  if (!previous.has(target)) return null;
  const path = [];
  for (let tile = [tx, ty]; tile; tile = previous.get(key(tile[0], tile[1]))) {
    path.unshift({ x: tile[0], y: tile[1] });
  }
  return path;
}

function clearPathPreview() {
  pathPreview?.clear();
}

function onState(state) {
  if (state.phase === "lobby") return renderLobby(state);
  if (!started) { started = true; startGame(state); }
  syncSprites(state);
}

async function startGame(state) {
  $("lobby").classList.remove("active");
  app = new Application();
  await app.init({ resizeTo: window, background: 0x141821, antialias: true });
  $("game").appendChild(app.canvas);

  world = new Container();
  world.scale.set(WORLD_SCALE);
  app.stage.addChild(world);

  const { container: map } = await Assets.load("/assets/map.tmj");
  world.addChild(map);

  blockedTiles = new Set(JSON.parse(room.state.blocked).map(([x, y]) => y * GRID + x));
  pathPreview = new Graphics();
  world.addChild(pathPreview);

  players = new Container();
  players.sortableChildren = true;
  world.addChild(players);

  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  const tileAtPointer = (e) => {
    const l = world.toLocal(e.global);
    const g = utils.toGrid(l.x - TW / 2, l.y + TH / 2);
    return { x: Math.round(g.x), y: Math.round(g.y) };
  };

  app.stage.on("pointermove", (e) => {
    clearPathPreview();
    const player = room.state.players.get(room.sessionId);
    if (!player || player.moving) return;

    const { x, y } = tileAtPointer(e);
    if (x < 0 || y < 0 || x >= GRID || y >= GRID || blockedTiles.has(y * GRID + x)) return;
    let occupied = false;
    room.state.players.forEach((other, id) => {
      if (id !== room.sessionId && other.x === x && other.y === y) occupied = true;
    });
    if (occupied) return;

    const path = findPreviewPath(player.x, player.y, x, y);
    if (!path || path.length < 2) return;
    for (const tile of path.slice(1)) {
      const center = utils.toScreen(tile.x, tile.y);
      const cx = center.x + TW / 2, cy = center.y - TH / 2;
      pathPreview
        .moveTo(cx, cy - TH * 0.38)
        .lineTo(cx + TW * 0.38, cy)
        .lineTo(cx, cy + TH * 0.38)
        .lineTo(cx - TW * 0.38, cy)
        .closePath()
        .fill({ color: 0x55d6ff, alpha: 0.28 })
        .stroke({ width: 2, color: 0x8be5ff, alpha: 0.9 });
    }
  });
  app.stage.on("pointerout", clearPathPreview);
  app.stage.on("pointertap", (e) => {
    const { x, y } = tileAtPointer(e);
    if (x >= 0 && y >= 0 && x < GRID && y < GRID) {
      room.send("moveTo", { x, y, clickedAt: serverNow() });
    }
    clearPathPreview();
  });

  room.onMessage("move", ({ id, path, startTime, msPerTile }) => {
    if (id === room.sessionId) clearPathPreview();
    anims[id] = { path, startTime, msPerTile };
  });

  app.ticker.add(() => {
    followPlayer();
    for (const [id, a] of Object.entries(anims)) {
      const s = sprites[id];
      if (!s) { delete anims[id]; continue; }
      const elapsed = Math.max(0, serverNow() - a.startTime);
      const i = Math.floor(elapsed / a.msPerTile);
      if (i >= a.path.length - 1) {
        place(s, a.path.at(-1).x, a.path.at(-1).y);
        delete anims[id];
        continue;
      }
      const f = (elapsed % a.msPerTile) / a.msPerTile;
      const p0 = a.path[i], p1 = a.path[i + 1];
      place(s, p0.x + (p1.x - p0.x) * f, p0.y + (p1.y - p0.y) * f);
    }
  });
  syncSprites(room.state);
}

function followPlayer() {
  const player = sprites[room.sessionId];
  if (!player) return;

  world.position.set(
    app.screen.width / 2 - player.position.x * WORLD_SCALE,
    app.screen.height / 2 - player.position.y * WORLD_SCALE
  );
}

function place(sprite, gx, gy) {
  const p = utils.toScreen(gx, gy);
  sprite.position.set(p.x + TW / 2, p.y - TH / 2);
  sprite.zIndex = gx + gy;
}

function syncSprites(state) {
  if (!players) return;
  state.players.forEach((p, id) => {
    if (!sprites[id]) {
      const c = new Container();
      c.addChild(new Graphics().ellipse(0, 0, 14, 7).fill({ color: 0x000000, alpha: 0.35 }));
      c.addChild(new Graphics().circle(0, -18, 14).fill(COLORS[p.team - 1]).stroke({ width: 2, color: id === room.sessionId ? 0xffffff : 0x000000 }));
      const label = new Text({ text: p.name, style: { fontSize: 12, fill: 0xffffff } });
      label.anchor.set(0.5, 1); label.y = -36;
      c.addChild(label);
      players.addChild(c);
      sprites[id] = c;
      place(c, p.x, p.y);
    }
    if (!anims[id]) place(sprites[id], p.x, p.y);
  });
  for (const id of Object.keys(sprites)) {
    if (!state.players.has(id)) { sprites[id].destroy(); delete sprites[id]; }
  }
}
