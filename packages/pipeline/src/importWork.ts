import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Chapter, Work } from '@wenyuan/schema'
import { parseWork } from '@wenyuan/schema'
import { Copilot } from './copilot/client.ts'
import { segment, applyParas } from './segment.ts'
import { identify } from './stages/identify.ts'
import { annotate } from './stages/annotate.ts'
import { overview } from './stages/overview.ts'

export interface ImportOptions {
  rawPath: string
  outDir: string
  workingDirectory: string
  model: string | undefined
  /** 忽略已有产物，全量重跑。 */
  force: boolean
}

async function loadExisting(path: string): Promise<Work | null> {
  try {
    const text = await readFile(path, 'utf8')
    const parsed = parseWork(JSON.parse(text) as unknown)
    return parsed.work
  } catch {
    return null
  }
}

/**
 * 逐章断点。八十一章的典籍跑到一半断掉，不该把前面几十章的 token 全烧掉 ——
 * 产物 JSON 要等导读写完才算合法，中途只能落在这个一次性缓存里。
 */
async function loadPartial(path: string): Promise<Chapter[]> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Chapter[]
  } catch {
    return []
  }
}

/**
 * id 必须在多次重跑之间保持稳定，否则增量缓存会全部落空、
 * 配图路径漂移、已分享的链接失效。模型每次挑的 id 都不一样，
 * 所以优先用源文件名（由人控制、天然稳定），实在不可用才退回模型的。
 */
function resolveId(rawPath: string, modelId: string): string {
  const base = rawPath
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return base !== undefined && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(base) ? base : modelId
}

export async function importWork(options: ImportOptions): Promise<Work> {
  const raw = await readFile(options.rawPath, 'utf8')
  const hintTitle = options.rawPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '')

  const copilot = new Copilot(options.workingDirectory, options.workingDirectory)
  try {
    console.log('[1/4] 切分…')
    // 体裁未知时先按 essay 切一遍拿到样貌，识别出真实体裁后再按体裁重切。
    const probe = segment(raw, 'essay')
    console.log(`      ${probe.chapters.length} 章 / ${probe.charCount} 字`)

    console.log('[2/4] 识别…')
    const excerpt = raw.slice(0, 1200)
    const identity = await identify({
      copilot,
      model: options.model,
      workingDirectory: options.workingDirectory,
      excerpt,
      chapterCount: probe.chapters.length,
      hintTitle,
    })
    console.log(`      《${identity.title}》 ${identity.author.name} · ${identity.dynasty} · ${identity.type}`)

    const parsed = segment(raw, identity.type)
    const id = resolveId(options.rawPath, identity.id)
    const outPath = join(options.outDir, `${id}.json`)
    // 已有产物一律读取：--force 只该跳过章节缓存去重新译注，
    // 不该把已经花钱生成的配图路径一并丢掉。
    const existing = await loadExisting(outPath)
    const partialPath = join(options.workingDirectory, '.import-cache', `${id}.json`)
    const cached = new Map<string, Chapter>()
    if (!options.force) {
      for (const chapter of existing?.chapters ?? []) {
        cached.set(chapter.hash, chapter)
      }
      for (const chapter of await loadPartial(partialPath)) {
        cached.set(chapter.hash, chapter)
      }
    }

    console.log(`[3/4] 逐章译注（${parsed.chapters.length} 章）…`)
    // 赏析一律要。之前只给多章典籍写，导致单篇诗词的「细读」内容太薄。
    const wantCommentary = true
    const chapters: Chapter[] = []
    for (const rawChapter of parsed.chapters) {
      const hit = cached.get(rawChapter.hash)
      if (hit) {
        console.log(`      ${rawChapter.index}/${parsed.chapters.length} 命中缓存，跳过`)
        // 段落序号与篇名都不进指纹，命中缓存时按本次切分结果刷新，免得排版信息陈旧。
        chapters.push({
          ...hit,
          index: rawChapter.index,
          lines: applyParas(hit.lines, rawChapter.paras),
          ...(rawChapter.title !== undefined ? { title: rawChapter.title } : {}),
        })
        continue
      }
      process.stdout.write(`      ${rawChapter.index}/${parsed.chapters.length} 译注中…`)
      const chapter = await annotate({
        copilot,
        model: options.model,
        workingDirectory: options.workingDirectory,
        chapter: rawChapter,
        type: identity.type,
        title: identity.title,
        author: identity.author.name,
        dynasty: identity.dynasty,
        wantCommentary,
      })
      const noteCount = chapter.lines.reduce((n, line) => n + line.notes.length, 0)
      console.log(` 完成（${chapter.lines.length} 句 / ${noteCount} 注）`)
      chapters.push(chapter)
      await mkdir(dirname(partialPath), { recursive: true })
      await writeFile(partialPath, JSON.stringify(chapters), 'utf8')
    }

    console.log('[4/4] 导读与配图 prompt…')
    const tail = await overview({
      copilot,
      model: options.model,
      workingDirectory: options.workingDirectory,
      identity,
      chapters,
    })

    const work: Work = {
      id,
      title: identity.title,
      type: identity.type,
      dynasty: identity.dynasty,
      author: identity.author,
      hook: identity.hook,
      moods: identity.moods,
      themes: identity.themes,
      famousLines: tail.famousLines,
      overview: tail.overview,
      // 已有产物里的图路径要保住，重跑导读不该把图弄丢。
      media: {
        heroPrompt: tail.media.heroPrompt,
        ...(existing?.media.hero !== undefined ? { hero: existing.media.hero } : {}),
        ...(existing?.media.cover !== undefined ? { cover: existing.media.cover } : {}),
      },
      chapters,
    }

    const check = parseWork(work)
    if (!check.work) {
      throw new Error(
        `组装后的作品未通过校验：\n${check.failures.map((f) => `  - ${f.path}: ${f.message}`).join('\n')}`,
      )
    }

    await mkdir(dirname(outPath), { recursive: true })
    await writeFile(outPath, `${JSON.stringify(check.work, null, 2)}\n`, 'utf8')
    await rm(partialPath, { force: true })
    console.log(`\n已写入 ${outPath}`)
    return check.work
  } finally {
    await copilot.stop().catch(() => undefined)
  }
}
