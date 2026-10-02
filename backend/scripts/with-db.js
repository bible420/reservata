// Starts the API with the Postgres backing store enabled, cross-platform.
const { spawn } = require("child_process");
const path = require("path");

const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || "postgresql://reservata:reservata@127.0.0.1:5432/reservata"
  }
});

child.on("exit", (code) => process.exit(code ?? 0));
