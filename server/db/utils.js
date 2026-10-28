import Database from "better-sqlite3";

const db = new Database("db/data.db");

export function insertUser(username, hash) {
    db.prepare("INSERT INTO users (username, hash) VALUES (?, ?)").run(username, hash);
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