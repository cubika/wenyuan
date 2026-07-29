import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createWriteStream, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rawDir = join(root, 'data/raw')
const outDir = join(root, 'data/works')
const logDir = join(root, '.import-logs')
const statePath = join(logDir, 'state.json')

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}
const lanes = Number(flag('lanes', '3'))
const force = argv.includes('--force')
const only = flag('only', undefined)

mkdirSync(logDir, { recursive: true })

/** 完成记录带原文指纹：原文改了就该重跑，没改就跳过。 */
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {}
const saveState = () => writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')

const stamp = (file) => `${statSync(file).size}:${statSync(file).mtimeMs}`

let queue = readdirSync(rawDir)
  .filter((f) => f.endsWith('.txt'))
  .map((f) => ({ id: f.replace(/\.txt$/, ''), path: join(rawDir, f) }))
  .filter((w) => (only === undefined ? true : only.split(',').includes(w.id)))
  // 大部头排前面，几条泳道才不会一条拖到最后。
  .sort((a, b) => statSync(b.path).size - statSync(a.path).size)

if (!force) {
  queue = queue.filter((w) => {
    const done = state[w.id]
    return !(done?.stamp === stamp(w.path) && existsSync(join(outDir, `${w.id}.json`)))
  })
}

if (queue.length === 0) {
  console.log('没有待导入的作品。')
  process.exit(0)
}

console.log(`待导入 ${queue.length} 篇，${lanes} 路并行\n`)
const total = queue.length
const started = Date.now()
const failures = []
let done = 0

function runOne(work) {
  return new Promise((resolveRun) => {
    // 指纹在开跑前取：跑的过程中原文若被改动，这一轮的产物就该判定为过期。
    const before = stamp(work.path)
    const log = createWriteStream(join(logDir, `${work.id}.log`), { flags: 'w' })
    const child = spawn(
      process.execPath,
      ['--experimental-strip-types', 'packages/pipeline/src/cli.ts', work.path],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    child.stdout.pipe(log)
    child.stderr.pipe(log)
    child.on('close', (code) => {
      log.end()
      done++
      const mins = ((Date.now() - started) / 60000).toFixed(1)
      if (code === 0) {
        state[work.id] = { stamp: before, at: new Date().toISOString() }
        saveState()
        console.log(`  ✓ ${work.id.padEnd(24)} (${done}/${total}, ${mins}min)`)
      } else {
        failures.push(work.id)
        console.log(`  ✗ ${work.id.padEnd(24)} 退出码 ${code} —— 见 .import-logs/${work.id}.log`)
      }
      resolveRun()
    })
  })
}

// 泳道各自从队列取下一篇，单篇失败不拖垮整批。
await Promise.all(
  Array.from({ length: Math.min(lanes, queue.length) }, async () => {
    for (let work = queue.shift(); work !== undefined; work = queue.shift()) {
      await runOne(work)
    }
  }),
)

const mins = ((Date.now() - started) / 60000).toFixed(1)
console.log(`\n完成 ${done - failures.length} 篇，失败 ${failures.length} 篇，耗时 ${mins} 分钟`)
if (failures.length > 0) {
  console.log(`失败：${failures.join('、')}`)
  process.exit(1)
}
