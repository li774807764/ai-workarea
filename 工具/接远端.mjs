// 把本仓库接到 GitHub（一次配好，以后 push 直接用）
// 用法：node "F:\AI工作区\工具\接远端.mjs"
// 读 仓库/远端地址.json 里的 remoteUrl；没填就打印需要做的两步。
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const ROOT = 'F:\\AI工作区'
const GIT = `${ROOT}\\工具\\git\\cmd\\git.exe`
const SSH = `${ROOT}\\工具\\git\\usr\\bin\\ssh.exe`
const ADDR = `${ROOT}\\仓库\\远端地址.json`
const REPOS = `${ROOT}\\仓库\\repos.json`
const KEY = `${ROOT}\\仓库\\.ssh\\id_ed25519`

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n', 'utf8')
const git = (args) => execFileSync(GIT, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

const addr = readJson(ADDR)
const url = (addr.remoteUrl ?? '').trim()

if (!url) {
  console.log('还没有 GitHub 地址，先做两步（都很短）：')
  console.log('  1) 打开 https://github.com/settings/keys → New SSH key → 粘贴这一行：')
  let pub = '(读不到公钥文件)'
  try {
    pub = readFileSync(`${ROOT}\\仓库\\公钥.txt`, 'utf8').trim()
  } catch {}
  console.log('     ' + pub)
  console.log('  2) 打开 https://github.com/new 建一个空仓库（不要勾 README/gitignore/License），')
  console.log('     把地址填进 仓库/远端地址.json 的 remoteUrl，例如 git@github.com:用户名/ai-workarea.git')
  console.log('     填完再跑一次本脚本即可。')
  process.exit(0)
}

const isSsh = url.startsWith('git@') || url.startsWith('ssh://')
if (!isSsh) {
  console.log('这个地址不是 SSH 形式（形如 git@github.com:用户名/仓库.git）。')
  console.log('HTTPS 推送需要账号密码/令牌，本机没有；请改用 SSH 地址，或先用 SSH 形式跑通再换。')
  process.exit(1)
}

if (!existsSync(KEY)) {
  console.log('缺私钥：' + KEY + '（先跑 E:\\11\\gen-ssh-key.mjs 生成）')
  process.exit(1)
}

// 用仓库自带的 ssh 与私钥，避免依赖系统 ssh
git(['config', 'core.sshCommand', `"${SSH}" -i "${KEY}" -o StrictHostKeyChecking=accept-new -o BatchMode=yes`])

let remotes = ''
try {
  remotes = git(['remote'])
} catch {}
if (remotes.split('\n').includes('origin')) {
  git(['remote', 'set-url', 'origin', url])
} else {
  git(['remote', 'add', 'origin', url])
}
console.log('origin →', url)

// 推到 GitHub（顺便保留本机裸仓库这份备份，另起一个名字）
try {
  console.log(git(['push', '-u', 'origin', addr.branch || 'main']))
} catch (e) {
  console.log('推送失败：')
  console.log((e.stderr || e.message || '').toString().trim())
  console.log('常见原因：公钥还没加到 GitHub、仓库不是空的、或者名字不对。')
  process.exit(1)
}

// 台账 + 地址文件同步
addr.status = '已接通 GitHub'
addr.updatedAt = new Date().toISOString()
writeJson(ADDR, addr)

const repos = readJson(REPOS)
const r = repos.repos.find((x) => x.id === 'ai-workarea')
if (r) {
  r.remote = url
  r.remoteKind = 'GitHub（origin）；本机裸仓库仍在 仓库/ai-workarea.git 作离线备份'
  r.mirror = 'F:\\AI工作区\\仓库\\ai-workarea.git'
  r.note = 'git 用 工具/git 的 MinGit；ssh 用 仓库/.ssh/id_ed25519 + core.sshCommand'
}
repos.updatedAt = new Date().toISOString()
writeJson(REPOS, repos)

console.log('完成：origin 已指向 GitHub，本机裸仓库作为镜像保留。')
