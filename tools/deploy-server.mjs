/**
 * Deploy the standalone game server to a remote host. One entry point that
 * updates server code without touching the remote data directory:
 *
 *   1. builds the server bundle (`lib/server.js`);
 *   2. stages only the server bundle and container metadata;
 *   3. rsyncs those exact files to `deployHost:/opt/dsh-games/` without
 *      `--delete`, leaving data/config.json, pets, and backups untouched;
 *   4. runs `docker compose up -d --build` there and prints the container
 *      status + auth state.
 *
 * Usage:
 *   node tools/deploy-server.mjs [--host user@vps.example.com] [--key path]
 *
 * Env: DEPLOY_HOST (default user@vps.example.com), DEPLOY_KEY (SSH key path),
 *      DEPLOY_DIR (remote path, default /opt/dsh-games).
 * @module dsh-games/tools/deploy-server
 */

import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

const host = process.argv.includes('--host')
  ? process.argv[process.argv.indexOf('--host') + 1]
  : process.env.DEPLOY_HOST ?? 'root@vps.3efs.com'
const key = process.argv.includes('--key')
  ? process.argv[process.argv.indexOf('--key') + 1]
  : process.env.DEPLOY_KEY
const remoteDir = process.env.DEPLOY_DIR ?? '/opt/dsh-games'

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  if (result.status !== 0) {
    console.error(`[deploy] failed: ${cmd} ${args.join(' ')}`)
    process.exit(result.status ?? 1)
  }
}

// 1. Build the server bundle.
console.log('[deploy] building lib/server.js …')
run('pnpm', ['build'], { cwd: ROOT })

// 2. Stage the deploy tree.
const stage = mkdtempSync(join(tmpdir(), 'dsh-games-deploy-'))
process.on('exit', () => {
  rmSync(stage, { recursive: true, force: true })
})
mkdirSync(join(stage, 'lib'), { recursive: true })
copyFileSync(join(ROOT, 'lib', 'server.js'), join(stage, 'lib', 'server.js'))
copyFileSync(join(ROOT, 'Dockerfile'), join(stage, 'Dockerfile'))
copyFileSync(join(ROOT, 'docker-compose.yml'), join(stage, 'docker-compose.yml'))
copyFileSync(join(ROOT, 'package.json'), join(stage, 'package.json'))
copyFileSync(join(ROOT, '.dockerignore'), join(stage, '.dockerignore'))

// 3. Ship code only. Remote data is intentionally outside the deploy payload.
const rsyncArgs = ['-az', `${stage}/`, `${host}:${remoteDir}/`]
if (key !== undefined) rsyncArgs.unshift('-e', `ssh -i ${key}`)
console.log(`[deploy] syncing to ${host}:${remoteDir} …`)
run('rsync', rsyncArgs)

// 4. Bring the container up.
console.log('[deploy] docker compose up -d --build …')
const sshArgs = [`cd ${remoteDir} && docker compose up -d --build && docker ps --filter name=dsh-games-server --format '{{.Status}}' && docker logs dsh-games-server --tail 4`]
if (key !== undefined) sshArgs.unshift('-i', key)
run('ssh', ['-o', 'StrictHostKeyChecking=no', host, ...sshArgs])

console.log('[deploy] done.')
