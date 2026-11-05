import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
let commit =
  process.env.CF_PAGES_COMMIT_SHA || process.env.WORKERS_CI_COMMIT_SHA;
if (!commit) {
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    commit = "local";
  }
}
// Avoid a watch loop: Wrangler observes imported generated files too.
const output = "src/worker/build-info.ts";
if (
  !existsSync(output) ||
  !readFileSync(output, "utf8").includes(`"commit":"${commit}"`)
)
  writeFileSync(
    "src/worker/build-info.ts",
    `export const buildInfo = ${JSON.stringify({ commit, builtAt: new Date().toISOString() })};\n`,
  );
