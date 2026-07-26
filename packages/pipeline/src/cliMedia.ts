import { resolve } from 'node:path'
import { generateMedia } from './stages/media.ts'

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const target = process.argv[2]
if (target === undefined || target.startsWith('--')) {
  console.error(`用法: npm run media -- <作品 JSON> [--force]

例:
  npm run media -- data/works/chun-jiang-hua-yue-ye.json`)
  process.exit(1)
}

const root = resolve(import.meta.dirname, '../../..')

try {
  await generateMedia({
    workPath: resolve(root, target),
    mediaDir: resolve(root, flag('mediaDir') ?? 'prototypes/media/works'),
    publicPrefix: 'media/works',
    force: process.argv.includes('--force'),
  })
} catch (error) {
  console.error(`\n出图失败：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
