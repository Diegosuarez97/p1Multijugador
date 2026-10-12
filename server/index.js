import http from "http";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Database from "better-sqlite3";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./GameRoom.js";
import { JWT_SECRET, PORT } from "./config.js";

const db = new Database("users.db");
db.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, hash TEXT)");

const app = express();
app.use(cors());
app.use(express.json());

const valid = (u, p) =>
  typeof u === "string" && typeof p === "string" &&
  /^[a-zA-Z0-9_]{3,16}$/.test(u) && p.length >= 6;

const token = (u) => jwt.sign({ id: u.id, username: u.username }, JWT_SECRET, { expiresIn: "2h" });

app.post("/api/register", (req, res) => {
  const { username, password } = req.body;
  if (!valid(username, password))
    return res.status(400).json({ error: "Username: 3-16 letters/numbers/_. Password: 6+ chars." });
  try {
    const info = db.prepare("INSERT INTO users (username, hash) VALUES (?, ?)")
      .run(username, bcrypt.hashSync(password, 10));
    res.json({ token: token({ id: info.lastInsertRowid, username }), username });
  } catch {
    res.status(409).json({ error: "Username already taken" });
  }
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username ?? "");
  if (!user || !bcrypt.compareSync(password ?? "", user.hash))
    return res.status(401).json({ error: "Wrong username or password" });
  res.json({ token: token(user), username: user.username });
});

const server = http.createServer(app);
const gameServer = new Server({ transport: new WebSocketTransport({ server }) });
gameServer.define("game", GameRoom);
gameServer.listen(PORT).then(() => console.log(`Server on :${PORT}`));
