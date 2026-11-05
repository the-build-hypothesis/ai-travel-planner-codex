import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
let commit = process.env.CF_PAGES_COMMIT_SHA || process.env.WORKERS_CI_COMMIT_SHA;
if(!commit) {try {commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()}catch{commit='local'}}
writeFileSync('src/worker/build-info.ts',`export const buildInfo = ${JSON.stringify({commit,builtAt:new Date().toISOString()})};\n`);
