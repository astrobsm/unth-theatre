// =============================================================================
// PM2 process definition for the local hospital server.
// -----------------------------------------------------------------------------
// The local server was previously started ad-hoc (`pm2 start npm -- run start`),
// which left two problems that both bit us:
//
//   TZ was never set, so the process ran in WAT while the cloud runs UTC. Day
//   windows ("today's list") then disagree between the two at the edges of the
//   day. Clinical times are safe either way — lib/theatreOps/clock.ts states the
//   offset explicitly — but day boundaries are not.
//
//   A crashing app restarted forever. It reached 452 restarts of a process that
//   could never succeed, and the only visible symptom was a dead website. The
//   backoff below makes PM2 give up and mark the app "errored" instead, which is
//   something an operator can actually notice.
//
// Deliberately absent: DATABASE_URL, DIRECT_URL, NEXTAUTH_URL. Those belong in
// .env.local, written by scripts/local-server/setup-local-db.sh. Setting them
// here as well would be worse than redundant — Next does NOT overwrite variables
// already present in process.env, so a stale value here would silently win over
// the correct one in .env.local and be very hard to spot.
//
//   pm2 start ecosystem.config.cjs
//   pm2 save                          # survive a reboot
// =============================================================================

module.exports = {
  apps: [
    {
      name: 'orm',
      cwd: __dirname,
      script: 'npm',
      args: 'run start',

      env: {
        NODE_ENV: 'production',
        // Must match the port in NEXTAUTH_URL. Sign-in returns 401 whenever the
        // bound port and NEXTAUTH_URL disagree.
        PORT: 3000,
        // Match the cloud so day boundaries agree. This has to be in the
        // process environment: Node fixes its timezone before Next reads any
        // .env file, so TZ written there may be ignored entirely.
        TZ: 'UTC',
      },

      // Stop infinite crash loops. If the app cannot stay up for 10 seconds,
      // ten times over, something is wrong that restarting will not fix.
      autorestart: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 5000,

      // The build is memory-hungry; restart if the server leaks past this.
      max_memory_restart: '1G',

      merge_logs: true,
      time: true,
    },
  ],
};
