import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPasswordResetStore } from "./passwordResets.js";
// Initialize the schema also when running `node index.js` directly.
import "./create_db.js";

const dbPath = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : fileURLToPath(new URL("./data.db", import.meta.url));

const db = new Database(dbPath);
export const passwordResetStore = createPasswordResetStore(db);


export function insertUser(username, hash, email, birthdate) {
    const info = db.prepare("INSERT INTO users (username, hash, email, birthdate) VALUES (?, ?, ?, ?)").run(username, hash, email, birthdate);
    return Number(info.lastInsertRowid);
}

export function getUser(username) {
    return db.prepare("SELECT * FROM users WHERE username = ?").get(username ?? "");
}

export function updateUserProfile(username, nickname, avatar) {
    db.prepare(`
        UPDATE users
        SET nickname = ?, avatar = ?
        WHERE username = ?
    `).run(nickname, avatar, username);
}

export function deleteUser(id) {
    return db.transaction((userId) => {
        db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(userId);
        return db.prepare("DELETE FROM users WHERE id = ?").run(userId).changes;
    }).immediate(id);
}
