/**
 * Resilient Next.js Dev Server
 * Auto-restarts on crash, keeps HMR alive, no terminal escaping.
 * Usage: node dev-server.js
 */
const { spawn } = require('child_process');
const path = require('path');

const PORT = process.env.PORT || 3000;
const MAX_RESTARTS = 20;
const RESTART_DELAY_MS = 2000;
const COOLDOWN_RESET_MS = 60_000; // reset crash counter after 1 min of stability

let restartCount = 0;
let lastStartTime = 0;
let child = null;
let shuttingDown = false;

function log(msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`\x1b[36m[dev-server ${ts}]\x1b[0m ${msg}`);
}

function startServer() {
  if (shuttingDown) return;

  lastStartTime = Date.now();
  restartCount++;

  if (restartCount > MAX_RESTARTS) {
    log(`\x1b[31mMax restarts (${MAX_RESTARTS}) reached. Exiting.\x1b[0m`);
    process.exit(1);
  }

  log(restartCount === 1
    ? `Starting Next.js dev server on port ${PORT}...`
    : `Restarting (attempt ${restartCount})...`
  );

  child = spawn('node', [
    path.join('node_modules', 'next', 'dist', 'bin', 'next'),
    'dev',
    '-p', String(PORT),
  ], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env, PORT: String(PORT), FORCE_COLOR: '1' },
    shell: false,
  });

  child.on('error', (err) => {
    log(`\x1b[31mFailed to start: ${err.message}\x1b[0m`);
    scheduleRestart();
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;

    if (code === 0) {
      log('Server exited cleanly.');
      return;
    }

    log(`\x1b[33mServer exited (code=${code}, signal=${signal}). Will restart...\x1b[0m`);

    // If it ran for over a minute without crashing, reset the counter
    if (Date.now() - lastStartTime > COOLDOWN_RESET_MS) {
      restartCount = 0;
    }

    scheduleRestart();
  });
}

function scheduleRestart() {
  if (shuttingDown) return;
  const delay = RESTART_DELAY_MS * Math.min(restartCount, 5);
  log(`Restarting in ${delay / 1000}s...`);
  setTimeout(startServer, delay);
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log('Shutting down...');
  if (child && !child.killed) {
    child.kill('SIGTERM');
    // Force kill after 5s if still alive
    setTimeout(() => {
      if (child && !child.killed) {
        child.kill('SIGKILL');
      }
      process.exit(0);
    }, 5000);
  } else {
    process.exit(0);
  }
}

// Graceful shutdown on Ctrl+C
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Don't crash when child pipe breaks
process.on('uncaughtException', (err) => {
  log(`\x1b[31mUncaught: ${err.message}\x1b[0m`);
});

// Start
log('='.repeat(50));
log('Resilient Dev Server — auto-restarts on crash');
log(`Port: ${PORT} | Max restarts: ${MAX_RESTARTS}`);
log('Press Ctrl+C to stop');
log('='.repeat(50));
startServer();
