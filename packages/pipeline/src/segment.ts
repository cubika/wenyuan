import { createHash } from 'node:crypto'
import type { WorkType } from '@wenyuan/schema'

export interface RawChapter {
  index: number
  title: string | undefined
  /** 已按句读切好的原文句，注释与译文都挂在这一层。 */
  lines: string[]
  /** 与 `lines` 一一对应的段落序号，文章靠它还原分段连排。 */
  paras: number[]
  hash: string
}

export interface SegmentResult {
  chapters: RawChapter[]
  /** 全文字数，用于估算分批与展示。 */
  charCount: number
}

/**
 * 章节标记：`第一章` / `一、` / `卷三` / `〔八〕` / `始计第一` / markdown 标题。
 * 典籍靠它拆章，诗词通常一条都匹配不上，自然退化成单章。
 */
const CHAPTER_PATTERNS: RegExp[] = [
  /^#{1,3}\s*(.+)$/,
  /^第\s*([一二三四五六七八九十百零〇\d]+)\s*[章回卷篇则]\s*(.*)$/,
  /^([一二三四五六七八九十百零〇]+)\s*[、．.]\s*(.*)$/,
  /^[〔【\[(（]\s*([一二三四五六七八九十百零〇\d]+)\s*[〕】\])）]\s*(.*)$/,
  /^卷\s*([一二三四五六七八九十百零〇\d]+)\s*(.*)$/,
  // 「始计第一」「九地第十一」—— 兵法、诸子常见的篇名在前、序号在后
  /^(.{1,8})第\s*([一二三四五六七八九十百零〇\d]+)\s*$/,
]

/** 句读切分点。保留标点在句末，古文没有空格可依。 */
const STOPS = '。！？；'
const SOFT_STOPS = '，、'
const OPEN_QUOTES = '“「『'
const CLOSE_QUOTES = '”」』'
const CLOSE_BRACKETS = '）】'

function hash16(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

function matchChapterHeading(line: string): { title: string } | null {
  for (const pattern of CHAPTER_PATTERNS) {
    const m = pattern.exec(line)
    if (!m) {
      continue
    }
    // 标题短才算章节标记，否则是一句以「一、」开头的正文。
    const rest = (m[2] ?? m[1] ?? '').trim()
    if (rest.length <= 24) {
      // markdown 的 # 是排版记号，不是标题的一部分，别让它漏进正文。
      return { title: line.replace(/^#{1,3}\s*/, '').trim() }
    }
  }
  return null
}

/** 一句原文，连同它所属的段落序号。 */
interface RawLine {
  text: string
  para: number
}

/**
 * 把一行原文按句读切开。逗号只在句子过长时才切。
 *
 * 引号里一律不切。「子曰：“学而时习之，不亦说乎？……”」被从问号处切开，
 * 站上会显示成引号不闭合的半句；模型逐句回抄时也会「顺手」把引号补全，
 * 触发原文校验反复打回 —— 一句话的代价是整章重写。
 */
function splitSentences(paragraph: string): string[] {
  const chars = [...paragraph]
  const out: string[] = []
  let buffer = ''
  let depth = 0
  const flush = (): void => {
    const text = buffer.trim()
    if (text.length > 0) {
      out.push(text)
    }
    buffer = ''
  }
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i] as string
    buffer += ch
    if (OPEN_QUOTES.includes(ch)) {
      depth += 1
      continue
    }
    if (CLOSE_QUOTES.includes(ch)) {
      depth = Math.max(0, depth - 1)
    }
    if (depth > 0) {
      continue
    }
    // 句末标点后面还跟着收尾引号或括号，等它一起收进来再断。
    const next = chars[i + 1]
    if (next !== undefined && (CLOSE_QUOTES.includes(next) || CLOSE_BRACKETS.includes(next))) {
      continue
    }
    const prev = chars[i - 1]
    const closesQuotedSentence =
      CLOSE_QUOTES.includes(ch) && prev !== undefined && STOPS.includes(prev)
    if (STOPS.includes(ch) || closesQuotedSentence) {
      // 太短的片段留给下一句，避免把「子曰：」单独切成一句。
      if (buffer.trim().length >= 8) {
        flush()
      }
    } else if (SOFT_STOPS.includes(ch) && buffer.trim().length >= 48) {
      flush()
    }
  }
  flush()
  return out
}

/**
 * 按体裁切句，并记下段落归属。
 * - 诗词：一行就是一句，换行本身就是作者的断句意图，不要再拆。
 * - 文章/典籍：按句号叹号问号分号切，逗号只在句子过长时才切。
 *
 * 段落 = 连续非空行构成的一段（空行分隔）。文章按段连排、诗词分节，
 * 都要靠这个信息，一旦在切分阶段丢掉，后面谁也补不回来。
 */
function splitLines(bodyLines: string[], type: WorkType): RawLine[] {
  const out: RawLine[] = []
  let para = 0
  let filled = false
  for (const bodyLine of bodyLines) {
    const line = bodyLine.trim()
    if (line.length === 0) {
      if (filled) {
        para += 1
        filled = false
      }
      continue
    }
    filled = true
    if (type === 'poem' || type === 'ci') {
      out.push({ text: line, para })
      continue
    }
    for (const sentence of splitSentences(line)) {
      out.push({ text: sentence, para })
    }
  }
  return out
}

/**
 * 把切分阶段算出的段落序号盖回译注结果。
 * 段落归属是规则算出来的排版信息，不采信模型返回的值。
 */
export function applyParas<T extends { para?: number | undefined }>(
  lines: T[],
  paras: number[],
): T[] {
  return lines.map((line, i) => {
    const para = paras[i]
    return para === undefined ? line : { ...line, para }
  })
}

/**
 * 规则切分，不用 AI —— 模型做切分既慢又会漏字改字，
 * 而切分是纯机械工作，正则做得又快又不损原文。
 */
export function segment(text: string, type: WorkType): SegmentResult {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t\u3000]+/g, ' ')
    .trim()

  const rawLines = normalized.split('\n')
  const blocks: Array<{ title: string | undefined; body: string[] }> = []
  let current: { title: string | undefined; body: string[] } = { title: undefined, body: [] }

  for (const line of rawLines) {
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      current.body.push('')
      continue
    }
    const heading = matchChapterHeading(trimmed)
    if (heading) {
      if (current.body.some((b) => b.trim().length > 0)) {
        blocks.push(current)
      }
      current = { title: heading.title, body: [] }
      continue
    }
    current.body.push(trimmed)
  }
  if (current.body.some((b) => b.trim().length > 0)) {
    blocks.push(current)
  }

  const chapters: RawChapter[] = []
  for (const block of blocks) {
    const lines = splitLines(block.body, type)
    if (lines.length === 0) {
      continue
    }
    const texts = lines.map((line) => line.text)
    chapters.push({
      index: chapters.length + 1,
      title: block.title,
      lines: texts,
      paras: lines.map((line) => line.para),
      // 段落序号不进指纹：它是排版信息，变了也不必重新烧 token 译注。
      hash: hash16(`${block.title ?? ''}\u0000${texts.join('\u0000')}`),
    })
  }

  return {
    chapters,
    charCount: chapters.reduce(
      (sum, chapter) => sum + chapter.lines.reduce((n, line) => n + line.length, 0),
      0,
    ),
  }
}
