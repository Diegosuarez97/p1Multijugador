import jwt from "jsonwebtoken";

export const createToken = (u) => jwt.sign({ id: u.id, username: u.username }, process.env.JWT_SECRET || "change-me-in-production", { expiresIn: "1h" });

export function attachUser(req, res, next) {
  const token = req.cookies.token;
  res.locals.user = null;

  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET || "change-me-in-production");
      res.locals.user = req.user;
    } catch (err) {
      res.clearCookie("token"); // expired or invalid
    }
  }
  next();
}

export function auth(req, res, next) {
  if (!req.user) return res.redirect("/login");
  next();
}