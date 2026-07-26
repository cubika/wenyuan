import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { parseEras, parseWork } from '@wenyuan/schema'
import { Copilot } from './copilot/client.ts'
import { eras } from './stages/eras.ts'

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const root = resolve(import.meta.dirname, '../../..')
const outPath = resolve(root, flag('out') ?? 'data/eras.json')
const worksDir = resolve(root, 'data/works')

// 站内作者名单只用来当闸门：导语点名了他们就打回。
const files = (await readdir(worksDir).catch(() => [])).filter((f) => f.endsWith('.json'))
const authors = new Set<string>()
for (const file of files) {
  const parsed = parseWork(JSON.parse(await readFile(join(worksDir, file), 'utf8')) as unknown)
  if (parsed.work && parsed.work.author.name !== '佚名') {
    authors.add(parsed.work.author.name)
  }
}

const copilot = new Copilot(root, root)
try {
  console.log(`十二段朝代导语生成中…（站内作者 ${authors.size} 位不得点名）`)
  const value = await eras({
    copilot,
    model: flag('model'),
    workingDirectory: root,
    authors: [...authors],
  })
  const check = parseEras(value, [...authors])
  if (!check.eras) {
    throw new Error(
      `导语未通过校验：\n${check.failures.map((f) => `  - ${f.path}: ${f.message}`).join('\n')}`,
    )
  }
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(check.eras, null, 2)}\n`, 'utf8')
  console.log(`\n已写入 ${outPath}`)
  for (const era of check.eras) {
    console.log(`  ${era.name.padEnd(4)} ${era.range.padEnd(16)} ${era.marks.join(' / ')}`)
  }
} catch (error) {
  console.error(`\n生成失败：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
} finally {
  await copilot.stop().catch(() => undefined)
}
