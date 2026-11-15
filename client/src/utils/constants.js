// Set at container start (/config.js); falls back to the local dev server.
const runtimeServerUrl = typeof window !== "undefined" ? window.__SERVER_URL__ : "";
export const BASE = (runtimeServerUrl || `http://${location.hostname}:2567`).replace(/\/+$/, "");
export const API = `${BASE}/api`;
export const GRID = 60;
export const TW = 232;
export const TH = 110;
export const WORLD_SCALE = 0.6;
export const MAX_MOVE_TILES = 3;
// Keep in sync with MS_PER_TILE in server/GameRoom.js (used to start a move locally before the server echoes it).
export const MS_PER_TILE = 300;
export const COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22];
