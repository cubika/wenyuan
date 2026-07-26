import { z } from 'zod'
import type { Chapter, ValidationFailure, WorkType } from '@wenyuan/schema'
import { LineSchema } from '@wenyuan/schema'
import type { Copilot } from '../copilot/client.ts'
import { runWithEmit } from '../copilot/emit.ts'
import type { RawChapter } from '../segment.ts'
import { applyParas } from '../segment.ts'
import { VOICE } from './voice.ts'

const AnnotationSchema = z.object({
  title: z.string().trim().min(1).max(60).optional(),
  lines: z.array(LineSchema).min(1),
  summary: z.string().trim().min(10).max(400),
  commentary: z.string().trim().min(20).max(1200).optional(),
  difficulty: z.number().int().min(1).max(5),
})

type Annotation = z.infer<typeof AnnotationSchema>

export interface AnnotateInput {
  copilot: Copilot
  model: string | undefined
  workingDirectory: string
  chapter: RawChapter
  type: WorkType
  title: string
  author: string
  dynasty: string
  /** 典籍逐章都要赏析；单篇诗词的赏析统一放在 overview，章内省略。 */
  wantCommentary: boolean
}

/**
 * 原文必须逐字回来。模型很容易「顺手」改标点、换异体字、
 * 或把两句合并 —— 这些都会让注释定位和对照阅读崩掉，所以硬校验。
 */
function checkFidelity(chapter: RawChapter): (value: Annotation) => ValidationFailure[] {
  return (value) => {
    const failures: ValidationFailure[] = []
    if (value.lines.length !== chapter.lines.length) {
      failures.push({
        path: 'lines',
        message: `必须恰好 ${chapter.lines.length} 句，与给定原文一一对应，收到 ${value.lines.length} 句`,
      })
      return failures
    }
    value.lines.forEach((line, i) => {
      const expected = chapter.lines[i]
      if (expected === undefined) {
        return
      }
      if (line.text !== expected) {
        failures.push({
          path: `lines.${i}.text`,
          message: `原文被改动了。必须原样返回「${expected}」，收到「${line.text}」`,
        })
      }
      line.notes.forEach((note, ni) => {
        if (!line.text.includes(note.term)) {
          failures.push({
            path: `lines.${i}.notes.${ni}.term`,
            message: `「${note.term}」不是本句的连续子串，无法定位高亮`,
          })
        }
      })
    })
    return failures
  }
}

export async function annotate(input: AnnotateInput): Promise<Chapter> {
  const numbered = input.chapter.lines.map((line, i) => `${i + 1}. ${line}`).join('\n')

  const { value } = await runWithEmit({
    copilot: input.copilot,
    model: input.model,
    workingDirectory: input.workingDirectory,
    timeoutMs: 300_000,
    maxAttempts: 4,
    systemMessage: `${VOICE}

当前任务：为一段古文做逐句译注。只能通过 emit_annotation 工具交付，不要用普通消息回答。`,
    toolName: 'emit_annotation',
    toolDescription:
      '交付本章的逐句译注。校验不通过会返回逐条错误，据此修正后重新调用。',
    schema: AnnotationSchema,
    extraChecks: checkFidelity(input.chapter),
    prompt: `作品：《${input.title}》　作者：${input.author}　朝代：${input.dynasty}
${input.chapter.title ? `本章标题：${input.chapter.title}\n` : ''}
下面是本章原文，共 ${input.chapter.lines.length} 句，已编号：

${numbered}

请交付：

1. **lines**：${input.chapter.lines.length} 个对象，与上面 1-${input.chapter.lines.length} 句**严格一一对应、顺序不变**。
   - text：**原样照抄**该句，一个字、一个标点都不许改
   - translation：这一句的白话译文，通顺、像人说话
   - notes：本句中读者可能卡住的词。**没有难点就给空数组**，不要为凑数而注。
     - term：必须是本句中连续出现的子串
     - pinyin：生僻字才给，常用字不给
     - explain：解释这个词在**本句语境**下的意思
     - type：word（词语）/ allusion（典故）/ person（人物）/ place（地名）/ institution（制度职官）
2. **summary**：整章大意，一段话。读者只看这一段也能知道这章在讲什么。
3. **difficulty**：1-5，对没有古文基础的普通读者而言的阅读难度。${
      input.wantCommentary
        ? '\n4. **commentary**：本章赏析。指出具体的字句和写法，说清楚好在哪里、要害是什么。'
        : ''
    }${
      input.wantCommentary
        ? '\n\n注意：commentary 要**具体**。指出是哪一句、哪个字，用了什么手法，达到了什么效果。逐段推进，不要写成一段笼统的读后感。'
        : ''
    }${input.chapter.title === undefined ? '\n\n另外给出 title：给本章拟一个不超过 12 字的标题。' : ''}`,
  })

  const chapter: Chapter = {
    index: input.chapter.index,
    lines: applyParas(value.lines, input.chapter.paras),
    summary: value.summary,
    difficulty: value.difficulty,
    hash: input.chapter.hash,
  }
  // 原文自带篇名时以原文为准。模型逐章独立作业，「顺手整理」出来的标题
  // 各章格式互不相同（「始计第一：…」「作战第二（作战篇）」「《孙子兵法·军形第四》」），
  // 拼成目录就是一团乱。
  const title = input.chapter.title ?? value.title
  if (title !== undefined) {
    chapter.title = title
  }
  if (value.commentary !== undefined) {
    chapter.commentary = value.commentary
  }
  return chapter
}
