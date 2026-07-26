import { execFile } from 'node:child_process'
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { parsePerson, parseWork } from '@wenyuan/schema'

const run = promisify(execFile)

const SKILL = resolve(
  process.env.USERPROFILE ?? process.env.HOME ?? '',
  '.agents/skills/baoyu-image-gen/scripts/main.ts',
)

/** 出图只关心这三样，作品与人物共用一条出图路径。 */
interface Illustratable {
  id: string
  media: { heroPrompt: string; hero?: string | undefined }
}

export interface MediaOptions {
  workPath: string
  /** 图片落地根目录，webp 最终进版本库。 */
  mediaDir: string
  /** 写进 JSON 的相对路径前缀，供前端拼 URL。 */
  publicPrefix: string
  force: boolean
  /** 人物档案与作品是两套 schema，校验器不同。 */
  kind?: 'work' | 'person'
}

/** 人物没有 title，作品没有 name —— 只取来打日志，不写回文件。 */
function load(kind: 'work' | 'person', json: unknown): { doc: Illustratable; label: string } {
  if (kind === 'person') {
    const parsed = parsePerson(json)
    if (!parsed.person) {
      throw new Error(
        `人物档案未通过校验：\n${parsed.failures.map((f) => `  - ${f.path}: ${f.message}`).join('\n')}`,
      )
    }
    return { doc: parsed.person, label: parsed.person.name }
  }
  const parsed = parseWork(json)
  if (!parsed.work) {
    throw new Error(
      `作品文件未通过校验：\n${parsed.failures.map((f) => `  - ${f.path}: ${f.message}`).join('\n')}`,
    )
  }
  return { doc: parsed.work, label: parsed.work.title }
}

/**
 * 出图必须串行。并发打图床/推理端点会触发限流，
 * 而且一次失败要能单独重试，不该拖垮整批。
 */
export async function generateMedia(options: MediaOptions): Promise<void> {
  const raw = JSON.parse(await readFile(options.workPath, 'utf8')) as unknown
  const { doc, label } = load(options.kind ?? 'work', raw)

  const rel = `${options.publicPrefix}/${doc.id}/hero.webp`
  const webp = join(options.mediaDir, doc.id, 'hero.webp')
  const png = join(options.mediaDir, doc.id, 'hero.png')
  const relink = async () => {
    await writeFile(
      options.workPath,
      `${JSON.stringify({ ...doc, media: { ...doc.media, hero: rel } }, null, 2)}\n`,
      'utf8',
    )
  }

  const onDisk = await stat(webp).then(
    () => true,
    () => false,
  )
  if (onDisk && !options.force) {
    // 图还在盘上，只是 JSON 里的路径丢了（例如 --force 重跑过导入），
    // 重新挂回去即可，没必要再花一次出图。
    if (doc.media.hero !== rel) {
      await relink()
      console.log(`《${label}》配图已在盘上，重新挂回 ${rel}`)
      return
    }
    console.log(`《${label}》配图已存在，跳过（--force 可重出）`)
    return
  }

  await mkdir(dirname(png), { recursive: true })
  console.log(`《${label}》出图中… (flux2 / FLUX.2-pro)`)
  await run(
    'bun',
    [
      SKILL,
      '--prompt',
      doc.media.heroPrompt,
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

  await relink()
  console.log(`  -> ${webp}`)
}
