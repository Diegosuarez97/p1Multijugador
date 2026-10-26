import Database from "better-sqlite3";
import fs from "node:fs";

const db = new Database("db/data.db");
const sql = fs.readFileSync("db/create_db.sql", "utf8");

db.exec(sql);

db.close();