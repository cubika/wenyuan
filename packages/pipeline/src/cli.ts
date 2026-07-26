import { resolve } from 'node:path'
import { importWork } from './importWork.ts'

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const target = process.argv[2]
if (target === undefined || target.startsWith('--')) {
  console.error(`用法: npm run import -- <原文文件> [--model <id>] [--out <目录>] [--force]

例:
  npm run import -- data/raw/chunjiang.txt
  npm run import -- data/raw/daodejing.txt --force`)
  process.exit(1)
}

const root = resolve(import.meta.dirname, '../../..')

try {
  const work = await importWork({
    rawPath: resolve(root, target),
    outDir: resolve(root, flag('out') ?? 'data/works'),
    workingDirectory: root,
    model: flag('model'),
    force: process.argv.includes('--force'),
  })
  const notes = work.chapters.reduce(
    (n, c) => n + c.lines.reduce((m, l) => m + l.notes.length, 0),
    0,
  )
  console.log(
    `\n《${work.title}》 ${work.chapters.length} 章 / ${notes} 条注释 / ${work.famousLines.length} 句名句`,
  )
  console.log(`钩子：${work.hook}`)
} catch (error) {
  console.error(`\n导入失败：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
