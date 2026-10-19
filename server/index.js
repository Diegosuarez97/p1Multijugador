import http from "http";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./GameRoom.js";
import { JWT_SECRET, PORT } from "./config.js";
import argon2 from "argon2";
import { insertUser } from './db/index.js'

const app = express();
app.use(cors());
app.use(express.json());

const token = (u) => jwt.sign({ id: u.id, username: u.username }, JWT_SECRET, { expiresIn: "2h" });

app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;

  const hash = await argon2.hash(password);
  try {
    const userId = insertUser(username, hash);
    res.json({ token: token({ id: userId, username }), username });
  } catch {
    res.status(409).json({ error: "Username already taken" });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username ?? "");
  if (!user || !argon2.verify(user.hash, password ?? "")) {
    return res.status(401).json({ error: "Wrong username or password" });
  }
  res.json({ token: token(user), username: user.username });
});

const server = http.createServer(app);
const gameServer = new Server({ transport: new WebSocketTransport({ server }) });
gameServer.define("game", GameRoom);
gameServer.listen(PORT).then(() => console.log(`Server on :${PORT}`));
