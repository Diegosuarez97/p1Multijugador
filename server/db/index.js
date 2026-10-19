import Database from "better-sqlite3";

const db = new Database("db/data.db");

export function insertUser(username, hash) {
    db.prepare("INSERT INTO users (username, hash) VALUES (?, ?)").run(username, hash);
}