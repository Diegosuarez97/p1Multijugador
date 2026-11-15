import { Client } from "colyseus.js";
import { setupAuth } from "./auth.js";
import { setupMenu } from "./menu.js";
import { setupProfile } from "./profile.js";
import { setupSettings } from "./settings.js";
import { audio } from "./audio.js";
import { buildLobby, renderLobby } from "./lobby.js";
import { createPlayerPings } from "./playerPings.js";
import { GameView } from "./game/GameView.js";
import { fetchMe, getToken, logout, setToken } from "./session.js";
import { HOST, MAX_MOVE_TILES } from "./utils/constants.js";
import { $, screenListeners, show } from "./utils/functions.js";

let room;
let me;
let pingInterval;
let rtt = 0;
let offset = 0;
let samples = [];
let lastPhase = "";

const serverNow = () => Date.now() + offset;
const moveRange = () => room?.state.players.get(room.sessionId)?.moveRange ?? MAX_MOVE_TILES;
const playerPings = createPlayerPings(() => room);
const game = new GameView({ getRoom: () => room, serverNow, moveRange });

const settings = setupSettings({ onLeave: () => exitMatch(false) });

const auth = setupAuth(async (token) => {
  setToken(token);
  await enterMenu();
});

const menu = setupMenu({
  onQuickPlay: () => joinRoom("quick"),
  onCreateRoom: () => joinRoom("create"),
  onJoinRoom: (code) => joinRoom("join", code),
  onProfile: async () => {
    me = await fetchMe();
    profile.open(me);
    show("profile");
  },
  onLogout: async () => {
    await logout();
    goToLogin();
  },
});

const profile = setupProfile({
  onBack: () => {
    menu.render(me);
    show("home");
  },
  onUpdated: (user) => (me = user),
  onDeleted: () => {
    setToken(null);
    goToLogin("Tu cuenta se ha eliminado.");
  },
});

function goToLogin(message = "") {
  me = undefined;
  setToken(null);
  auth.showLogin();
  auth.message(message, Boolean(message));
  show("auth");
}

async function enterMenu(message = "") {
  me = await fetchMe();
  menu.render(me);
  menu.message(message);
  show("home");
}

// Restore the session after a reload; reset links take priority over everything else.
async function boot() {
  if (auth.consumeResetLink()) return show("auth");
  if (!getToken()) return goToLogin();
  try {
    await enterMenu();
  } catch {
    goToLogin("Tu sesión ha caducado. Vuelve a iniciar sesión.");
  }
}
// The magic "whoosh" only plays when a button takes you somewhere (menu, profile, room, back...).
// Not on the first screen, nor on match start/results, which have their own sounds.
const NAVIGATION_SCREENS = new Set(["auth", "home", "profile", "lobby"]);
screenListeners.add((id, previous) => {
  if (previous && NAVIGATION_SCREENS.has(id)) audio.play("click");
});

audio.start();
boot();

$("copyRoomId").onclick = async () => {
  try {
    await navigator.clipboard.writeText(room.roomId);
    $("copyRoomId").textContent = "¡Copiado!";
  } catch {
    $("copyRoomId").textContent = "No se pudo copiar";
  }
};

$("play-again").onclick = () => exitMatch(true);
$("back-menu").onclick = () => exitMatch(false);
$("leave-lobby").onclick = () => exitMatch(false);

function friendlyJoinError(error, mode) {
  const text = String(error?.message ?? error);
  if (/not found|no rooms found/i.test(text)) {
    return mode === "join" ? "No existe ninguna sala con ese código." : "No se ha encontrado ninguna sala disponible.";
  }
  if (/already started|locked/i.test(text)) return "Esa partida ya ha empezado o está llena.";
  if (/already connected/i.test(text)) return "Ya estás conectado a esa sala desde otra pestaña.";
  if (/invalid token/i.test(text)) return "Tu sesión ha caducado. Vuelve a iniciar sesión.";
  return `No se ha podido entrar en la sala: ${text}`;
}

// mode: "quick" joins any open public room (or opens one), "create" opens a private room, "join" uses a code.
async function joinRoom(mode, code) {
  const token = getToken();
  const client = new Client(HOST);
  try {
    if (mode === "join") room = await client.joinById(code, { token });
    else if (mode === "create") room = await client.create("game", { token, private: true });
    else room = await client.joinOrCreate("game", { token });
  } catch (error) {
    const message = friendlyJoinError(error, mode);
    if (/invalid token/i.test(String(error?.message))) goToLogin(message);
    throw new Error(message);
  }

  $("roomId").textContent = `Código de sala: ${room.roomId}`;
  $("copyRoomId").textContent = "Copiar código";
  const connection = room;
  samples = [];
  rtt = 0;
  offset = 0;
  lastPhase = "";
  settings.setInRoom(true);
  audio.setScene("game");

  room.onMessage("error", (message) => ($("lobbyInfo").textContent = message));
  room.onMessage("pong", ({ clientTime, serverTime }) => {
    if (room !== connection) return;
    const now = Date.now();
    samples.push({ rtt: now - clientTime, offset: serverTime + (now - clientTime) / 2 - now });
    samples = samples.slice(-8);
    rtt = Math.round(samples.reduce((sum, sample) => sum + sample.rtt, 0) / samples.length);
    offset = samples.reduce((sum, sample) => sum + sample.offset, 0) / samples.length;
    updateHud();
    room.send("latency", rtt);
  });
  const ping = () => connection.send("ping", Date.now());
  ping();
  pingInterval = setInterval(ping, 2000);
  $("hud").style.display = "flex";

  buildLobby(room);
  room.onStateChange((state) => {
    if (room === connection) onState(state);
  });
  room.onMessage("move", (movement) => {
    if (room === connection) game.handleMove(movement, connection.state.phase);
  });
  room.onMessage("duel", (event) => {
    if (room !== connection) return;
    game.showDuelSpell(event);
    // Play the spell when the shared animation starts (startTime is server time); no extra network traffic.
    const delay = Number.isFinite(event?.startTime) ? event.startTime - serverNow() : 0;
    setTimeout(() => room === connection && audio.play("spell"), Math.max(0, Math.min(delay, 2000)));
  });
  room.onLeave(() => {
    if (room !== connection) return;
    leaveCleanup();
    enterMenu("Se ha perdido la conexión con la sala.").catch(() => goToLogin());
  });
  show("lobby");
}

function onState(state) {
  if (state.phase === "finished" && lastPhase !== "finished") {
    audio.duckFor(4500);
    audio.play("win");
  }
  lastPhase = state.phase;
  updateHud();
  playerPings.sync(state);
  game.updateMovementRangePreview(state);
  if (state.phase === "lobby") {
    renderLobby(state, room.sessionId);
    return;
  }
  game.onState(state);
}

function updateHud() {
  const range = moveRange();
  const max = room?.state.maxMoveRange || 7;
  $("move-count").textContent = `${range} / ${max}`;
  const description = range >= max
    ? `Alcance máximo: ${max} casillas. Las bolitas quedan disponibles para los demás.`
    : `Puedes avanzar ${range} casillas por movimiento, hasta un máximo de ${max}.`;
  $("move-info").setAttribute("aria-label", description);
  $("move-info").title = description;
}

function leaveCleanup() {
  room = undefined;
  settings.setInRoom(false);
  audio.setScene("menu");
  clearInterval(pingInterval);
  game.reset();
  playerPings.reset();
  $("hud").style.display = "none";
}

async function exitMatch(replay) {
  const controls = ["play-again", "back-menu", "leave-lobby"];
  controls.forEach((id) => ($(id).disabled = true));
  const previousRoom = room;
  leaveCleanup();
  try {
    await previousRoom?.leave();
    if (replay) await joinRoom("quick");
    else await enterMenu();
  } catch (error) {
    await enterMenu(error.message).catch(() => goToLogin());
  } finally {
    controls.forEach((id) => ($(id).disabled = false));
  }
}
