import jwt from "jsonwebtoken";

if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in production");
}

export const jwtSecret = process.env.JWT_SECRET || "change-me-in-production";
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_AGE = 16;

export const createToken = (u) => jwt.sign({
  id: u.id,
  username: u.username,
  ...(u.isBanned ? { isBanned: true } : {}),
}, jwtSecret, { expiresIn: "2h" });

export function attachUser(req, res, next) {
  const token = req.cookies.token;
  res.locals.user = null;

  if (token) {
    try {
      req.user = jwt.verify(token, jwtSecret);
      res.locals.user = req.user;
    } catch (err) {
      res.clearCookie("token"); // expired or invalid
    }
  }
  next();
}

export function auth(req, res, next) {
  if (!req.user) {
    return req.path.startsWith("/api/")
      ? res.status(401).json({ error: "La sessió no és vàlida. Torna a iniciar sessió." })
      : res.redirect("/login");
  }
  next();
}

export const setAuthCookie = (res, t) => res.cookie("token", t, { httpOnly: true, secure: process.env.COOKIE_SECURE === "production", sameSite: "lax", maxAge: 60 * 60 * 1000 });

export function ageFromBirthdate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const birth = new Date(Date.UTC(year, month - 1, day));
  if (birth.getUTCFullYear() !== year || birth.getUTCMonth() !== month - 1 || birth.getUTCDate() !== day) return null;
  const now = new Date();
  const hadBirthday = now.getUTCMonth() > month - 1 || (now.getUTCMonth() === month - 1 && now.getUTCDate() >= day);
  return now.getUTCFullYear() - year - (hadBirthday ? 0 : 1);
}

export function readRegisterBody(body = {}) {
  const text = (value) => (typeof value === "string" ? value.trim() : "");
  return {
    username: text(body.username) || text(body.user_name),
    password: typeof body.password === "string" ? body.password : typeof body.user_password === "string" ? body.user_password : "",
    confirm: typeof body.confirm_password === "string" ? body.confirm_password : null,
    email: text(body.email) || text(body.user_email),
    birthdate: text(body.birthdate),
  };
}