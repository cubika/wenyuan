import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Chapter, Work } from '@wenyuan/schema'
import { parseWork } from '@wenyuan/schema'
import { Copilot } from './copilot/client.ts'
import { segment } from './segment.ts'
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
    const outPath = join(options.outDir, `${identity.id}.json`)
    const existing = options.force ? null : await loadExisting(outPath)
    const cached = new Map<string, Chapter>()
    for (const chapter of existing?.chapters ?? []) {
      cached.set(chapter.hash, chapter)
    }

    console.log(`[3/4] 逐章译注（${parsed.chapters.length} 章）…`)
    // 典籍逐章都要赏析；单篇诗文的赏析集中放在导读里，章内不重复。
    const wantCommentary = identity.type === 'classic' && parsed.chapters.length > 1
    const chapters: Chapter[] = []
    for (const rawChapter of parsed.chapters) {
      const hit = cached.get(rawChapter.hash)
      if (hit) {
        console.log(`      ${rawChapter.index}/${parsed.chapters.length} 命中缓存，跳过`)
        chapters.push({ ...hit, index: rawChapter.index })
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
      id: identity.id,
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
    console.log(`\n已写入 ${outPath}`)
    return check.work
  } finally {
    await copilot.stop().catch(() => undefined)
  }
}
