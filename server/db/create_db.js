import Database from "better-sqlite3";

const db = new Database("db/data.db");

db.exec("CREATE TABLE IF NOT EXISTS `users` (`user_id` INTEGER PRIMARY KEY, `user_name` varchar(63), `user_password` varchar(255), `user_email` varchar(255), `birth_date` TEXT, `nickname` varchar(150), `avatar` varchar(255), `banned` BOOLEAN DEFAULT 0, `reason` TEXT);");
db.exec("CREATE UNIQUE INDEX `user_name_UNIQUE` ON `users` (`user_name` ASC);");
db.exec("CREATE UNIQUE INDEX `user_email_UNIQUE` ON `users` (`user_email` ASC);");