/**
 * Nightly reset of a public demo: TRUNCATE every app table, re-seed with
 * prisma/seed-demo.ts. Run it by hand, and schedule it yourself (cron, a systemd
 * timer, a CI job) to reset your demo every night:
 *
 *   DEMO_MODE=1 DATABASE_URL=<the demo database> npm run demo:reset
 *
 * Exit 0 done · 1 refused (the database or the env is not demo-only) · 2 could not run.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { runDemoReset } from "../src/lib/demo/reset";

// No top-level await: tsx runs this package's .ts files as CommonJS.
runDemoReset({
  env: process.env,
  connect: (connectionString) => new PrismaClient({ adapter: new PrismaPg({ connectionString }) }),
  today: new Date(),
  log: console.log,
  error: console.error,
}).then(
  (code) => process.exit(code),
  (cause: unknown) => {
    console.error("demo-reset: could not run:", cause);
    process.exit(2);
  },
);
