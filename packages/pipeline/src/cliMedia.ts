import { resolve } from 'node:path'
import { generateMedia } from './stages/media.ts'

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const target = process.argv[2]
if (target === undefined || target.startsWith('--')) {
  console.error(`用法: npm run media -- <作品或人物 JSON> [--person] [--force]

例:
  npm run media -- data/works/chunjiang-huayueye.json
  npm run media -- data/people/su-shi.json --person`)
  process.exit(1)
}

const root = resolve(import.meta.dirname, '../../..')
const person = process.argv.includes('--person')

try {
  await generateMedia({
    workPath: resolve(root, target),
    mediaDir: resolve(
      root,
      flag('mediaDir') ?? (person ? 'prototypes/media/people' : 'prototypes/media/works'),
    ),
    publicPrefix: person ? 'media/people' : 'media/works',
    force: process.argv.includes('--force'),
    kind: person ? 'person' : 'work',
  })
} catch (error) {
  console.error(`\n出图失败：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
