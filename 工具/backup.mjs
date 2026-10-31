// 一键备份：把工作区 + 关键代码 + 星图数据 打成一个快照
// 用法：node "F:\AI工作区\工具\backup.mjs"
// 定时：由 E:\11\ai-workarea-backup.bat 经计划任务「AI工作区每日备份」调用（00:00）
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import os from 'node:os'

const ROOT = 'F:\\AI工作区'
const SNAP_ROOT = join(ROOT, '备份', 'snapshots')
const KEEP = 14

// 工作区里不备份的东西：快照自身、git 目录、内嵌裸仓库、MinGit 本体、下载缓存
const SKIP_PREFIX = ['备份', '.git', '仓库/ai-workarea.git', '工具/git', '工具/_dl']
const skipRel = (rel) => {
  const p = rel.split('\\').join('/')
  if (p.split('/').includes('node_modules')) return true
  return SKIP_PREFIX.some((pre) => p === pre || p.startsWith(pre + '/'))
}

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const out = join(SNAP_ROOT, stamp)
mkdirSync(out, { recursive: true })

const jobs = [
  { name: '工作区', from: ROOT, skip: (src) => skipRel(relative(ROOT, src)) },
  { name: 'dsh-chain', from: 'E:\\11\\dsh-chain', skip: (src) => src.includes('node_modules') },
  { name: 'qq-bind', from: 'E:\\11\\qq-bind', skip: (src) => src.includes('node_modules') },
  { name: 'workdesk', from: 'E:\\11\\workdesk', skip: (src) => src.includes('node_modules') },
  { name: 'chain-data', from: join(os.homedir(), '.dsh', 'chain') },
]

for (const job of jobs) {
  if (!existsSync(job.from)) {
    console.log('skip(缺失)', job.name, job.from)
    continue
  }
  const target = join(out, job.name)
  if (job.name === '工作区') {
    // 根目录是目标目录的祖先，必须逐个子项复制（否则 cpSync 报“不能复制到自己的子目录”）
    mkdirSync(target, { recursive: true })
    for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
      if (skipRel(entry.name)) continue
      cpSync(join(ROOT, entry.name), join(target, entry.name), {
        recursive: true,
        filter: (src) => !job.skip(src),
      })
    }
  } else {
    cpSync(job.from, target, {
      recursive: true,
      filter: (src) => (job.skip ? !job.skip(src) : true),
    })
  }
  console.log('copied', job.name, '→', target)
}

const sizeOf = (dir) => {
  let total = 0
  const walk = (d) => {
    let entries = []
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = join(d, e.name)
      if (e.isDirectory()) walk(full)
      else {
        try {
          total += statSync(full).size
        } catch {}
      }
    }
  }
  walk(dir)
  return total
}
const bytes = sizeOf(out)
console.log(`快照 ${stamp} · ${(bytes / 1024 / 1024).toFixed(2)} MB`)

// 只保留最近 KEEP 份
const snaps = readdirSync(SNAP_ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort()
while (snaps.length > KEEP) {
  const old = snaps.shift()
  rmSync(join(SNAP_ROOT, old), { recursive: true, force: true })
  console.log('pruned', old)
}
console.log('DONE')
