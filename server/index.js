import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Eta } from "eta";
import path from "node:path";
import argon2 from "argon2";
import cookieParser from "cookie-parser";
import { GameRoom } from "./GameRoom.js";
import { insertUser, getUser } from './db/index.js';
import { createToken, attachUser, auth } from "./utils.js";

const PORT = process.env.PORT || 2567;

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(import.meta.dirname, "public")));

const eta = new Eta({ views: path.join(import.meta.dirname, "templates") })

/* PAGES */
const render = (res, view, data = {}) => res.send(eta.render(view, { ...res.locals, ...data }));

app.use(attachUser);
app.get("/", (req, res) => {
  render(res, "home");
});

app.get("/login", (req, res) => {
  res.send(eta.render("login"));
});

app.get("/register", (req, res) => {
  res.send(eta.render("register"));
});

app.get("/profile", auth, (req, res) => {
  res.send(eta.render("profile"));
});

/* API */

const setAuthCookie = (res, t) => res.cookie("token", t, { httpOnly: true, secure: process.env.COOKIE_SECURE === "production", sameSite: "lax", maxAge: 60 * 60 * 1000 });

app.post("/api/register", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }
  try {
    const hash = await argon2.hash(password);
    const id = insertUser(username, hash);
    res.redirect('/login');
  } catch {
    res.status(409).json({ error: "Username already taken" });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  const user = getUser(username);
  if (!user || !(await argon2.verify(user.hash, String(password ?? "")))) {
    return res.status(401).json({ error: "Wrong username or password" });
  }
  const token = createToken({ id: user.id, username: user.username });
  setAuthCookie(res, token);
  res.json({ token });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

const server = http.createServer(app);
const gameServer = new Server({ transport: new WebSocketTransport({ server }) });
gameServer.define("game", GameRoom);
gameServer.listen(PORT).then(() => console.log(`Server on :${PORT}`));
