import { execFile } from 'node:child_process'
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { parseWork, type Work } from '@wenyuan/schema'

const run = promisify(execFile)

const SKILL = resolve(
  process.env.USERPROFILE ?? process.env.HOME ?? '',
  '.agents/skills/baoyu-image-gen/scripts/main.ts',
)

export interface MediaOptions {
  workPath: string
  /** 图片落地根目录，webp 最终进版本库。 */
  mediaDir: string
  /** 写进 JSON 的相对路径前缀，供前端拼 URL。 */
  publicPrefix: string
  force: boolean
}

/**
 * 出图必须串行。并发打图床/推理端点会触发限流，
 * 而且一次失败要能单独重试，不该拖垮整批。
 */
export async function generateMedia(options: MediaOptions): Promise<Work> {
  const parsed = parseWork(JSON.parse(await readFile(options.workPath, 'utf8')) as unknown)
  if (!parsed.work) {
    throw new Error(
      `作品文件未通过校验：\n${parsed.failures.map((f) => `  - ${f.path}: ${f.message}`).join('\n')}`,
    )
  }
  const work = parsed.work

  const rel = `${options.publicPrefix}/${work.id}/hero.webp`
  const webp = join(options.mediaDir, work.id, 'hero.webp')
  const png = join(options.mediaDir, work.id, 'hero.png')

  const onDisk = await stat(webp).then(
    () => true,
    () => false,
  )
  if (onDisk && !options.force) {
    // 图还在盘上，只是 JSON 里的路径丢了（例如 --force 重跑过导入），
    // 重新挂回去即可，没必要再花一次出图。
    if (work.media.hero !== rel) {
      const relinked: Work = { ...work, media: { ...work.media, hero: rel } }
      await writeFile(options.workPath, `${JSON.stringify(relinked, null, 2)}\n`, 'utf8')
      console.log(`《${work.title}》配图已在盘上，重新挂回 ${rel}`)
      return relinked
    }
    console.log(`《${work.title}》配图已存在，跳过（--force 可重出）`)
    return work
  }

  await mkdir(dirname(png), { recursive: true })
  console.log(`《${work.title}》出图中… (flux2 / FLUX.2-pro)`)
  await run(
    'bun',
    [
      SKILL,
      '--prompt',
      work.media.heroPrompt,
      '--image',
      png,
      '--provider',
      'flux2',
      '--model',
      'FLUX.2-pro',
      '--ar',
      '2.35:1',
      '--quality',
      '2k',
    ],
    { maxBuffer: 1024 * 1024 * 16 },
  )

  const sharp = (await import('sharp')).default
  await sharp(png).webp({ quality: 78, effort: 6 }).toFile(webp)
  // png 是中间产物，不进版本库，压完即删。
  await unlink(png).catch(() => undefined)

  const updated: Work = { ...work, media: { ...work.media, hero: rel } }
  await writeFile(options.workPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8')
  console.log(`  -> ${webp}`)
  return updated
}
