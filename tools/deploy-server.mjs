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
const remoteDir = (process.env.DEPLOY_DIR ?? '/opt/dsh-games').replace(/\/+$/, '') || '/'

if (typeof host !== 'string' ||
    host === '' ||
    host.startsWith('-') ||
    /[\0-\x20\x7f]/.test(host)) {
  throw new Error('DEPLOY_HOST must be a non-empty SSH host without whitespace, control characters, or a leading dash')
}
if (!/^\/[A-Za-z0-9._/-]*$/.test(remoteDir) ||
    remoteDir.split('/').includes('..')) {
  throw new Error(
    'DEPLOY_DIR must be an absolute POSIX path without parent traversal, using only letters, numbers, dot, underscore, dash, and slash',
  )
}

function shellQuotePosix(value) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

function remotePath(name) {
  return remoteDir === '/' ? `/${name}` : `${remoteDir}/${name}`
}

function remoteTarget(path) {
  // spawnSync passes one argv value directly to OpenSSH. On Windows, adding
  // POSIX shell quotes makes them literal filename characters for scp.
  return process.platform === 'win32'
    ? `${host}:${path}`
    : `${host}:${shellQuotePosix(path)}`
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  if (result.status !== 0) {
    throw new Error(`[deploy] failed (${result.status ?? 1}): ${cmd} ${args.join(' ')}`)
  }
}

// 1. Build the server bundle.
console.log('[deploy] building lib/server.js …')
if (process.platform === 'win32') {
  run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'pnpm build'], { cwd: ROOT })
} else {
  run('pnpm', ['build'], { cwd: ROOT })
}

const stage = mkdtempSync(join(tmpdir(), 'dsh-games-deploy-'))
try {
  // 2. Stage the deploy tree.
  mkdirSync(join(stage, 'lib'), { recursive: true })
  copyFileSync(join(ROOT, 'lib', 'server.js'), join(stage, 'lib', 'server.js'))
  copyFileSync(join(ROOT, 'Dockerfile'), join(stage, 'Dockerfile'))
  copyFileSync(join(ROOT, 'docker-compose.yml'), join(stage, 'docker-compose.yml'))
  copyFileSync(join(ROOT, 'package.json'), join(stage, 'package.json'))
  copyFileSync(join(ROOT, '.dockerignore'), join(stage, '.dockerignore'))

  // 3. Ship code only. Remote data is intentionally outside the deploy payload.
  console.log(`[deploy] syncing to ${host}:${remoteDir} …`)
  if (process.platform === 'win32') {
    const sshArgs = ['-o', 'StrictHostKeyChecking=no']
    const scpArgs = ['-o', 'StrictHostKeyChecking=no']
    if (key !== undefined) {
      sshArgs.push('-i', key)
      scpArgs.push('-i', key)
    }
    run('ssh', [...sshArgs, host, `mkdir -p -- ${shellQuotePosix(remotePath('lib'))}`])
    run('scp', [
      ...scpArgs,
      join(stage, 'lib', 'server.js'),
      remoteTarget(remotePath('lib/server.js')),
    ])
    for (const file of ['Dockerfile', 'docker-compose.yml', 'package.json', '.dockerignore']) {
      run('scp', [
        ...scpArgs,
        join(stage, file),
        remoteTarget(remotePath(file)),
      ])
    }
  } else {
    const rsyncArgs = ['-az', `${stage}/`, remoteTarget(`${remoteDir}/`)]
    if (key !== undefined) rsyncArgs.unshift('-e', `ssh -i ${shellQuotePosix(key)}`)
    run('rsync', rsyncArgs)
  }

  // 4. Bring the container up.
  console.log('[deploy] docker compose up -d --build …')
  const remoteCommand =
    `cd -- ${shellQuotePosix(remoteDir)} && ` +
    "docker compose up -d --build && " +
    "docker ps --filter name=dsh-games-server --format '{{.Status}}' && " +
    'docker logs dsh-games-server --tail 4'
  const sshArgs = [remoteCommand]
  if (key !== undefined) sshArgs.unshift('-i', key)
  run('ssh', ['-o', 'StrictHostKeyChecking=no', host, ...sshArgs])

  console.log('[deploy] done.')
} finally {
  rmSync(stage, { recursive: true, force: true })
}
