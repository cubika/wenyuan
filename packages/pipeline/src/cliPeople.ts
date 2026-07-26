import { resolve } from 'node:path'
import { importPeople, resolveDirs } from './importPeople.ts'

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const root = resolve(import.meta.dirname, '../../..')
const dirs = resolveDirs(root)
// 不带姓名就扫全部作者；--force 是 npm 自己的旗标，会被吃掉，
// 重写档案要直接调 node。
const only = process.argv.slice(2).filter((a) => !a.startsWith('--') && a !== flag('model'))

try {
  const people = await importPeople({
    worksDir: dirs.worksDir,
    outDir: resolve(root, flag('out') ?? 'data/people'),
    placesPath: resolve(root, 'data/places.json'),
    workingDirectory: root,
    model: flag('model'),
    only,
    force: process.argv.includes('--force'),
  })
  console.log(`\n共 ${people.length} 位：${people.map((p) => p.name).join('、')}`)
} catch (error) {
  console.error(`\n立档失败：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
