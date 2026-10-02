const { spawn } = require("child_process");
const path = require("path");

const vitePath = path.join(__dirname, "frontend", "node_modules", "vite", "bin", "vite.js");
const children = [
  spawn(process.execPath, [path.join(__dirname, "backend", "server.js")], {
    env: { ...process.env, PORT: "5179" },
    stdio: "inherit"
  }),
  spawn(process.execPath, [vitePath, "--host", "127.0.0.1", "--port", "5178"], {
    cwd: path.join(__dirname, "frontend"),
    stdio: "inherit"
  })
];

let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill());
  setTimeout(() => process.exit(exitCode), 100);
}

children.forEach((child) => {
  child.on("exit", (code) => {
    if (!stopping && code) stop(code);
  });
});

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
