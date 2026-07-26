import { z } from 'zod'

export * from './person.ts'

/**
 * 一份 schema 同时喂三层阅读：
 * L1 一眼 → hook / famousLines / media
 * L2 通读 → Line.text + Line.translation
 * L3 深读 → Line.notes / Chapter.commentary / overview / author
 */

export const WORK_TYPES = ['poem', 'ci', 'essay', 'classic'] as const
export const NOTE_TYPES = ['word', 'allusion', 'person', 'place', 'institution'] as const
export const MOODS = ['孤独', '壮志', '闲适', '离别', '思乡', '释然'] as const

const zh = (min: number, max: number, what: string) =>
  z.string().trim().min(min, `${what}至少 ${min} 字`).max(max, `${what}最多 ${max} 字`)

/** 词句级注释。`term` 必须是原句里的连续子串 —— 前端靠它做定位高亮。 */
export const NoteSchema = z.object({
  term: zh(1, 12, '注释词条'),
  pinyin: zh(1, 40, '注音').optional(),
  explain: zh(4, 120, '注释正文'),
  type: z.enum(NOTE_TYPES),
})

export const LineSchema = z.object({
  text: zh(1, 200, '原文句'),
  translation: zh(2, 300, '白话译文'),
  notes: z.array(NoteSchema).max(6, '单句注释最多 6 条').default([]),
  /**
   * 所属段落序号，切分阶段机械写入（不由模型给）。
   * 文章与典籍靠它还原分段连排；诗词一行一句，用不上，故可选。
   */
  para: z.number().int().min(0).optional(),
})

export const ChapterSchema = z.object({
  index: z.number().int().min(1),
  title: zh(1, 60, '章节标题').optional(),
  lines: z.array(LineSchema).min(1, '章节至少要有一句'),
  /** 整章大意。逐句译文之上再给一层，读者可以只看这一段。 */
  summary: zh(10, 400, '章节大意'),
  /** L3 赏析。诗词可省略（放在 overview 里），典籍逐章需要。 */
  commentary: zh(20, 1200, '章节赏析').optional(),
  difficulty: z.number().int().min(1).max(5),
  /** 内容指纹，用于增量重跑时跳过未改动的章节。 */
  hash: z.string().length(16),
})

export const AuthorSchema = z.object({
  name: zh(1, 20, '作者名'),
  era: zh(1, 40, '生卒/时代').optional(),
  bio: zh(20, 600, '作者小传'),
})

export const OverviewSchema = z.object({
  background: zh(30, 900, '时代背景'),
  coreIdea: zh(20, 700, '核心思想'),
  structure: zh(20, 700, '结构脉络'),
  /** 怎么写的：手法、语言、节奏。读者常问「好在哪」，答案多半在这一段。 */
  artistry: zh(30, 900, '艺术手法'),
  /** 后世如何评价、化用、误读。让作品接上今天。 */
  legacy: zh(30, 900, '影响与流传'),
  /** 「先读第 1、8、33 章」—— 典籍必须给，否则读者不知从何下口。 */
  readingPath: z.array(zh(2, 120, '阅读路线条目')).max(8).default([]),
  difficulty: z.number().int().min(1).max(5),
})

export const FamousLineSchema = z.object({
  text: zh(2, 60, '名句'),
  translation: zh(2, 120, '名句白话'),
  /** 名句精讲：这一句为什么能流传，不是复述译文。 */
  note: zh(20, 400, '名句精讲'),
})

export const MediaSchema = z.object({
  /** 出图 prompt 由读过原文的模型产出，不套模板 —— 这是配图质量的关键。 */
  heroPrompt: zh(60, 1600, '配图 prompt'),
  hero: z.string().optional(),
  cover: z.string().optional(),
})

export const WorkSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id 必须是小写 kebab-case'),
  title: zh(1, 60, '标题'),
  type: z.enum(WORK_TYPES),
  dynasty: zh(1, 20, '朝代'),
  author: AuthorSchema,
  /** L1：一句人话，首页用。不要文绉绉，要让路人看懂为什么值得读。 */
  hook: zh(10, 120, '一句话钩子'),
  moods: z.array(z.enum(MOODS)).min(1, '至少归入一种心境').max(3),
  themes: z.array(zh(2, 12, '主题词')).min(1).max(5),
  famousLines: z.array(FamousLineSchema).min(1, '至少提炼一句名句').max(5),
  overview: OverviewSchema,
  media: MediaSchema,
  chapters: z.array(ChapterSchema).min(1),
})

export type Note = z.infer<typeof NoteSchema>
export type Line = z.infer<typeof LineSchema>
export type Chapter = z.infer<typeof ChapterSchema>
export type Author = z.infer<typeof AuthorSchema>
export type Overview = z.infer<typeof OverviewSchema>
export type FamousLine = z.infer<typeof FamousLineSchema>
export type Media = z.infer<typeof MediaSchema>
export type Work = z.infer<typeof WorkSchema>
export type WorkType = (typeof WORK_TYPES)[number]
export type Mood = (typeof MOODS)[number]

export interface ValidationFailure {
  path: string
  message: string
}

/**
 * 把 Zod 报错压成可回灌给模型的行。模型看不懂 ZodError 的嵌套结构，
 * 但看得懂 `chapters[2].lines[0].notes[1].term: 注释词条至少 1 字`。
 */
export function formatIssues(error: z.ZodError): ValidationFailure[] {
  return error.issues.map((issue) => ({
    path: issue.path.length === 0 ? '(root)' : issue.path.join('.'),
    message: issue.message,
  }))
}

/**
 * 注释的 `term` 必须能在所属原句里找到，否则前端无法定位高亮。
 * Zod 管不了这种跨字段约束，单独校验。
 */
export function checkNoteAnchors(work: Work): ValidationFailure[] {
  const failures: ValidationFailure[] = []
  work.chapters.forEach((chapter, ci) => {
    chapter.lines.forEach((line, li) => {
      line.notes.forEach((note, ni) => {
        if (!line.text.includes(note.term)) {
          failures.push({
            path: `chapters.${ci}.lines.${li}.notes.${ni}.term`,
            message: `「${note.term}」不是原句「${line.text}」中的连续子串，前端无法定位高亮`,
          })
        }
      })
    })
  })
  return failures
}

/** 名句必须真的出自本篇，防止模型凭印象编造。 */
export function checkFamousLines(work: Work): ValidationFailure[] {
  const body = work.chapters
    .flatMap((chapter) => chapter.lines.map((line) => line.text))
    .join('')
    .replace(/[，。！？、；：「」『』（）\s]/g, '')
  return work.famousLines.flatMap((famous, i) => {
    const stripped = famous.text.replace(/[，。！？、；：「」『』（）\s]/g, '')
    return body.includes(stripped)
      ? []
      : [
          {
            path: `famousLines.${i}.text`,
            message: `「${famous.text}」在原文中找不到，名句必须逐字出自本篇`,
          },
        ]
  })
}

export interface ParseResult {
  work: Work | null
  failures: ValidationFailure[]
}

/** 结构校验 + 跨字段校验，一次把所有问题攒齐再回灌，省一轮往返。 */
export function parseWork(input: unknown): ParseResult {
  const parsed = WorkSchema.safeParse(input)
  if (!parsed.success) {
    return { work: null, failures: formatIssues(parsed.error) }
  }
  const failures = [...checkNoteAnchors(parsed.data), ...checkFamousLines(parsed.data)]
  return failures.length > 0 ? { work: null, failures } : { work: parsed.data, failures: [] }
}
