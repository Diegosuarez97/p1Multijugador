import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Eta } from "eta";
import path from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import cookieParser from "cookie-parser";
import multer from "multer";
import { GameRoom } from "./GameRoom.js";
import { insertUser, getUser, updateUserProfile, updateUserPassword, deleteUser, passwordResetStore } from './db/utils.js';
import { createPasswordRecoveryRouter, recoveryFrontendUrl } from "./passwordRecovery.js";
import { validateNewPassword } from "./passwordPolicy.js";
import { EMAIL_RE, MIN_AGE, createToken, attachUser, auth, setAuthCookie, ageFromBirthdate, readRegisterBody } from "./utils.js";

const PORT = process.env.PORT || 2567;

const uploadsDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(import.meta.dirname, "public", "uploads");

await mkdir(uploadsDir, { recursive: true });

const app = express();
// Set only for a known reverse-proxy topology, never trust forwarded headers blindly.
const proxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 5) {
  throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 5");
}
app.set("trust proxy", proxyHops);
const allowedOrigins = process.env.CLIENT_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean);
app.use(cors(allowedOrigins ? { origin: allowedOrigins, credentials: true } : {}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use("/uploads", express.static(uploadsDir));
app.use(express.static(path.join(import.meta.dirname, "public")));
app.get("/healthz", (req, res) => res.json({ ok: true }));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    // Random name: avoids collisions and ignores the user-supplied filename
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, randomUUID() + ext);
  },
});

const eta = new Eta({ views: path.join(import.meta.dirname, "templates") })

/* PAGES */
const render = (res, view, data = {}) => res.send(eta.render(view, { ...res.locals, ...data }));

app.use(attachUser);
app.use((req, res, next) => {
  const user = req.user && getUser(req.user.username);
  if (!user?.isBanned || req.path === "/banned" || req.path === "/api/logout") return next();
  if (req.path.startsWith("/api/")) {
    if (allowedOrigins?.includes(req.get("origin"))) res.clearCookie("token");
    return res.status(403).json({
      error: "Aquest compte està bloquejat.", banned: true, reason: user.reason, redirect: "/banned",
    });
  }
  return res.redirect("/banned");
});

app.get("/", (req, res) => {
  render(res, "home");
});

app.get("/login", (req, res) => {
  render(res, "login");
});

app.get("/register", (req, res) => {
  render(res, "register");
});

app.get("/delete", auth, (req, res) => {
  if (!getUser(req.user.username)) {
    return res.redirect("/");
  }
  render(res, "delete");
});

app.get("/banned", auth, (req, res) => {
  const user = getUser(req.user.username);
  if (!user) {
    res.clearCookie("token");
    return res.redirect("/login");
  }
  if (!user.isBanned) return res.redirect("/");
  render(res, "banned", { DATA_REASON: user.reason });
});

app.get("/forgot", (_req, res) => {
  try {
    const url = recoveryFrontendUrl();
    url.hash = "forgot-password";
    res.redirect(url.toString());
  } catch {
    res.status(503).send("La recuperación de contraseña no está configurada. Contacta con el administrador.");
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

app.get("/profile", auth, (req, res) => {
  const user = getUser(req.user.username);
  
  render(res, "profile", {
    DATA_USERNAME: req.user.username,
    DATA_EMAIL: user.email,
    DATA_BIRTHDATE: user.birthdate,
    DATA_NICKNAME: user.nickname,
    DATA_AVATAR: user.avatar
  });
});

/* API */

app.use("/api", createPasswordRecoveryRouter({ store: passwordResetStore }));

app.post("/api/register", async (req, res) => {
  const { username, password, confirm, email, birthdate } = readRegisterBody(req.body);

  const fail = (message, status = 400) => res.status(status).json({ error: message });

  if (!username || !email || !birthdate || !password) {
    return fail("Usuario, correo, fecha de nacimiento y contraseña son obligatorios.");
  }
  if ([...username].length < 3) return fail("El nombre de usuario debe tener al menos 3 caracteres.");
  if (!EMAIL_RE.test(email)) return fail("El correo electrónico no es válido.");
  const age = ageFromBirthdate(birthdate);
  if (age === null || age < 0) return fail("La fecha de nacimiento no es válida.");
  if (age < MIN_AGE) return fail(`Debes tener al menos ${MIN_AGE} años.`);
  if (confirm !== null && confirm !== password) return fail("Las contraseñas no coinciden.");

  try {
    const passwordError = await validateNewPassword(password);
    if (passwordError) return fail(passwordError);
    const hash = await argon2.hash(password);
    const id = insertUser(username, hash, email, birthdate);
    const token = createToken({ id, username });
    setAuthCookie(res, token);
    res.status(201).json({ token });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return fail(error.message.includes("email") ? "Este correo ya está registrado." : "Ese nombre de usuario ya está en uso.", 409);
    }
    console.error("Registration failed:", error);
    if (error.code === "SQLITE_BUSY" || error.code === "SQLITE_LOCKED") {
      return fail("Base de datos bloqueada. Guarda o revierte los cambios en DB Browser y cierra la base de datos antes de reintentar.", 503);
    }
    return fail("No se ha podido crear el usuario. Consulta la terminal del servidor.", 500);
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  const user = getUser(username);
  if (!user || !(await argon2.verify(user.hash, String(password ?? "")))) {
    return res.status(401).json({ error: "Wrong username or password" });
  }
  if (user.isBanned) {
    if (allowedOrigins?.includes(req.get("origin"))) res.clearCookie("token");
    else setAuthCookie(res, createToken({ id: user.id, username: user.username, isBanned: true }));
    return res.status(403).json({
      error: "Aquest compte està bloquejat.", banned: true, reason: user.reason, redirect: "/banned",
    });
  }
  const token = createToken({ id: user.id, username: user.username });
  setAuthCookie(res, token);
  res.json({ token });
});

app.put("/api/profile", auth, upload.single("avatar"), async (req, res) => {
  const nickname = (req.body.nickname || "").trim();
  const user = getUser(req.user.username);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const avatar = req.file ? `/uploads/${req.file.filename}` : user.avatar;
  updateUserProfile(user.username, nickname, avatar);

  if (req.file && user.avatar?.startsWith("/uploads/")) {
    await rm(path.join(uploadsDir, path.basename(user.avatar)), { force: true });
  }

  res.json({ ok: true, nickname, avatar });
});

app.post("/api/password", auth, async (req, res) => {
  const { current_password, new_password, confirm_new_password } = req.body ?? {};
  const user = getUser(req.user.username);

  if (!user) {
    res.clearCookie("token");
    return res.status(401).json({ error: "La sessió no és vàlida. Torna a iniciar sessió." });
  }
  if (!current_password || !new_password || !confirm_new_password) {
    return res.status(400).json({ error: "Omple tots els camps de contrasenya." });
  }
  if (new_password !== confirm_new_password) {
    return res.status(400).json({ error: "Les contrasenyes noves no coincideixen." });
  }
  const passwordError = await validateNewPassword(String(new_password));
  if (passwordError) return res.status(400).json({ error: passwordError });

  if (!(await argon2.verify(user.hash, String(current_password)))) {
    return res.status(401).json({ error: "La contrasenya actual no és correcta." });
  }

  updateUserPassword(user.username, await argon2.hash(new_password));
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

app.post("/api/delete", (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "La sessió no és vàlida. Torna a iniciar sessió." });
  next();
}, async (req, res) => {
  const user = getUser(req.user.username);
  if (!user) {
    res.clearCookie("token");
    return res.status(401).json({ error: "La sessió no és vàlida. Torna a iniciar sessió." });
  }

  const showError = (status, message) => {
    return res.status(status).json({ error: message });
  };
  const password = req.body?.current_password;
  if (typeof password !== "string" || !password) {
    return showError(400, "Introdueix la contrasenya actual.");
  }

  let matches;
  try { matches = await argon2.verify(user.hash, password); }
  catch (error) {
    console.error("Account deletion password check failed:", error);
    return showError(500, "No s'ha pogut verificar la contrasenya. Torna-ho a provar.");
  }
  if (!matches) return showError(401, "La contrasenya no és correcta.");

  try {
    if (!deleteUser(user.id)) {
      res.clearCookie("token");
      return res.status(401).json({ error: "La sessió no és vàlida. Torna a iniciar sessió." });
    }
  } catch (error) {
    console.error("Account deletion failed:", error);
    return showError(500, "No s'ha pogut eliminar el compte. Torna-ho a provar.");
  }

  res.clearCookie("token");
  if (user.avatar?.startsWith("/uploads/")) {
    try { await rm(path.join(uploadsDir, path.basename(user.avatar)), { force: true }); }
    catch (error) { console.error("Could not remove deleted account avatar:", error); }
  }
  return res.sendStatus(204);
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "API route not found" });
  }

  res.status(404).send(eta.render("404"));
});

const server = http.createServer(app);
const gameServer = new Server({ transport: new WebSocketTransport({ server }) });
gameServer.define("game", GameRoom);
gameServer.listen(PORT).then(() => console.log(`Server on :${PORT}`));
