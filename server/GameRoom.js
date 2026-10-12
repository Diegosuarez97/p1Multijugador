import { Room } from "colyseus";
import { schema } from "@colyseus/schema";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "./config.js";
import fs from "fs";

const mapData = JSON.parse(
  fs.readFileSync(new URL("../client/public/assets/map.tmj", import.meta.url))
);
const GRID = mapData.width;
const MS_PER_TILE = 300;
const MIN_PLAYERS = 1;
const CLICK_ARBITRATION_MS = 250;
const LOSS_BACKTRACK_RATIO = 0.3;
const BLOCKED = [];
const SPAWNS = [[0, 0], [9, 0], [0, 9], [9, 9], [4, 0], [5, 9]];

mapData.layers.find((l) => l.name === "collision")?.data.forEach((gid, i) => {
  if (gid) BLOCKED.push([i % GRID, Math.floor(i / GRID)]);
});

const Player = schema({ name: "string", team: "number", x: "number", y: "number", moving: "boolean" });
const State = schema({ phase: "string", blocked: "string", players: { map: Player } });

const isBlocked = (x, y) => BLOCKED.some(([bx, by]) => bx === x && by === y);

// Breadth-first search on a 4-direction grid. Returns [{x,y}, ...] including the start tile.
function findPath(sx, sy, tx, ty) {
  const key = (x, y) => y * GRID + x;
  const prev = new Map([[key(sx, sy), null]]);
  const queue = [[sx, sy]];
  while (queue.length) {
    const [x, y] = queue.shift();
    if (x === tx && y === ty) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
      if (isBlocked(nx, ny) || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), [x, y]);
      queue.push([nx, ny]);
    }
  }
  if (!prev.has(key(tx, ty))) return null;
  const path = [];
  for (let c = [tx, ty]; c; c = prev.get(key(c[0], c[1]))) path.unshift({ x: c[0], y: c[1] });
  return path;
}

export class GameRoom extends Room {
  maxClients = 6;

  onCreate() {
    this.setState(new State());
    this.state.phase = "lobby";
    this.state.blocked = JSON.stringify(BLOCKED);
    this.destinationClaims = new Map();
    this.clientRtts = new Map();
    this.moveSequence = 0;

    this.onMessage("ping", (client, t) => client.send("pong", { clientTime: t, serverTime: Date.now() }));
    this.onMessage("latency", (client, rtt) => {
      if (Number.isFinite(rtt) && rtt >= 0 && rtt <= 5000) {
        this.clientRtts.set(client.sessionId, rtt);
      }
    });

    this.onMessage("selectTeam", (client, team) => {
      if (this.state.phase !== "lobby") return;
      if (!Number.isInteger(team) || team < 1 || team > 6) return;
      const taken = [...this.state.players.entries()].some(([id, p]) => p.team === team && id !== client.sessionId);
      if (taken) return client.send("error", "Team already taken");
      this.state.players.get(client.sessionId).team = team;
      this.checkStart();
    });

    this.onMessage("moveTo", (client, msg) => {
      if (this.state.phase !== "playing") return;
      const p = this.state.players.get(client.sessionId);
      if (!p || p.moving) return; // committed walk: can't be interrupted
      const { x, y } = msg ?? {};
      if (!Number.isInteger(x) || !Number.isInteger(y)) return;
      if (x < 0 || y < 0 || x >= GRID || y >= GRID || isBlocked(x, y)) return;
      if ([...this.state.players.values()].some((o) => o !== p && o.x === x && o.y === y)) return;
      const path = findPath(p.x, p.y, x, y);
      if (!path || path.length < 2) return;

      const destination = `${x},${y}`;
      const now = Date.now();
      const reportedClickTime = msg?.clickedAt;
      // Use the client's ping-synchronized estimate, but reject implausibly old/future values.
      const clickedAt = Number.isFinite(reportedClickTime) &&
        reportedClickTime >= now - 5000 && reportedClickTime <= now + 100
        ? reportedClickTime
        : now;
      const candidate = {
        client,
        sessionId: client.sessionId,
        player: p,
        x,
        y,
        path,
        clickedAt,
        sequence: ++this.moveSequence,
      };

      let contest = this.destinationClaims.get(destination);
      if (contest?.status === "active") {
        // A later click can still approach the contested cell while its winner is walking.
        // The short arbitration window has already passed, so it joins as a losing contender.
        if (clickedAt < contest.winner.clickedAt) {
          return client.send("error", "La disputa por esta casilla ya está resuelta");
        }
        candidate.path = path.slice(0, -1);
        if (candidate.path.length === 0) candidate.path = [path[0]];
        contest.candidates.push(candidate);
        p.moving = true;
        this.startCandidateMove(candidate, candidate.path);
        return;
      }

      if (!contest) {
        contest = { status: "pending", candidates: [], winner: null, timer: null };
        this.destinationClaims.set(destination, contest);
        const maxRtt = Math.max(0, ...this.clients.map((c) => this.clientRtts.get(c.sessionId) ?? 0));
        const arbitrationWindow = Math.min(1500, Math.max(CLICK_ARBITRATION_MS, Math.ceil(maxRtt / 2) + 50));
        contest.timer = this.clock.setTimeout(
          () => this.resolveDestinationClaim(destination, contest),
          arbitrationWindow
        );
      }
      contest.candidates.push(candidate);
      p.moving = true;
    });
  }

  onAuth(client, options) {
    if (this.state.phase !== "lobby") throw new Error("Game already started");
    let user;
    try { user = jwt.verify(options?.token, JWT_SECRET); }
    catch { throw new Error("Invalid token"); }
    if (this.clients.some((c) => c.auth?.id === user.id)) throw new Error("Already connected");
    return user;
  }

  onJoin(client, options, auth) {
    const p = new Player();
    p.name = auth.username; p.team = 0; p.x = 0; p.y = 0; p.moving = false;
    this.state.players.set(client.sessionId, p);
  }

  onLeave(client) {
    for (const [destination, contest] of this.destinationClaims) {
      contest.candidates = contest.candidates.filter((candidate) => candidate.sessionId !== client.sessionId);
      if (contest.winner?.sessionId === client.sessionId) {
        this.cancelDestinationContest(destination, contest);
      } else if (contest.status === "pending" && contest.candidates.length === 0) {
        this.clock.clearTimeout(contest.timer);
        this.destinationClaims.delete(destination);
      }
    }
    this.clientRtts.delete(client.sessionId);
    this.state.players.delete(client.sessionId); // frees the team automatically
    this.checkStart();
  }

  resolveDestinationClaim(destination, contest) {
    if (this.destinationClaims.get(destination) !== contest) return;
    contest.candidates = contest.candidates.filter(
      (candidate) => this.state.players.get(candidate.sessionId) === candidate.player
    );
    if (contest.candidates.length === 0) {
      this.destinationClaims.delete(destination);
      return;
    }

    contest.candidates.sort((a, b) => a.clickedAt - b.clickedAt || a.sequence - b.sequence);
    contest.winner = contest.candidates[0];
    contest.status = "active";

    for (const candidate of contest.candidates) {
      if (candidate === contest.winner) {
        this.startCandidateMove(candidate, candidate.path);
      } else {
        // Losers walk as far as the tile before the contested destination.
        candidate.path = candidate.path.slice(0, -1);
        if (candidate.path.length === 0) candidate.path = [{ x: candidate.player.x, y: candidate.player.y }];
        this.startCandidateMove(candidate, candidate.path);
      }
    }

    const winner = contest.winner;
    const duration = (winner.path.length - 1) * MS_PER_TILE;
    contest.timer = this.clock.setTimeout(
      () => this.finishDestinationContest(destination, contest),
      duration
    );
  }

  startCandidateMove(candidate, path) {
    candidate.path = path;
    candidate.startTime = Date.now();
    this.broadcast("move", {
      id: candidate.sessionId,
      path,
      startTime: candidate.startTime,
      msPerTile: MS_PER_TILE,
    });
  }

  finishDestinationContest(destination, contest) {
    if (this.destinationClaims.get(destination) !== contest) return;
    const winner = contest.winner;
    if (!winner || this.state.players.get(winner.sessionId) !== winner.player) {
      this.cancelDestinationContest(destination, contest);
      return;
    }

    winner.player.x = winner.x;
    winner.player.y = winner.y;
    winner.player.moving = false;
    this.destinationClaims.delete(destination);

    const now = Date.now();
    for (const loser of contest.candidates) {
      if (loser === winner || this.state.players.get(loser.sessionId) !== loser.player) continue;

      const steps = Math.min(
        loser.path.length - 1,
        Math.max(0, Math.floor((now - loser.startTime) / MS_PER_TILE))
      );
      const current = loser.path[steps];
      loser.player.x = current.x;
      loser.player.y = current.y;

      const backtrack = steps === 0
        ? 0
        : Math.min(steps, Math.max(1, Math.round(steps * LOSS_BACKTRACK_RATIO)));
      const rollbackPath = loser.path.slice(steps - backtrack, steps + 1).reverse();
      const rollbackStart = Date.now();
      this.broadcast("move", {
        id: loser.sessionId,
        path: rollbackPath.length ? rollbackPath : [current],
        startTime: rollbackStart,
        msPerTile: MS_PER_TILE,
      });

      const finalTile = rollbackPath[rollbackPath.length - 1] ?? current;
      this.clock.setTimeout(() => {
        if (this.state.players.get(loser.sessionId) !== loser.player) return;
        loser.player.x = finalTile.x;
        loser.player.y = finalTile.y;
        loser.player.moving = false;
      }, Math.max(0, rollbackPath.length - 1) * MS_PER_TILE);
    }
  }

  cancelDestinationContest(destination, contest) {
    this.clock.clearTimeout(contest.timer);
    this.destinationClaims.delete(destination);
    for (const candidate of contest.candidates) {
      if (this.state.players.get(candidate.sessionId) !== candidate.player) continue;
      const elapsed = candidate.startTime ? Date.now() - candidate.startTime : 0;
      const step = Math.min(candidate.path.length - 1, Math.max(0, Math.floor(elapsed / MS_PER_TILE)));
      const tile = candidate.path[step] ?? { x: candidate.player.x, y: candidate.player.y };
      candidate.player.x = tile.x;
      candidate.player.y = tile.y;
      candidate.player.moving = false;
      this.broadcast("move", {
        id: candidate.sessionId,
        path: [tile],
        startTime: Date.now(),
        msPerTile: MS_PER_TILE,
      });
    }
  }

  checkStart() {
    if (this.state.phase !== "lobby") return;
    const players = [...this.state.players.values()];
    if (players.length >= MIN_PLAYERS && players.every((p) => p.team > 0)) {
      players.forEach((p) => { [p.x, p.y] = SPAWNS[p.team - 1]; });
      this.state.phase = "playing";
      this.lock();
    }
  }
}
