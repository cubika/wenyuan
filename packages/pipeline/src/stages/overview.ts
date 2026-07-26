import { z } from 'zod'
import type { Chapter, ValidationFailure } from '@wenyuan/schema'
import { FamousLineSchema, MediaSchema, OverviewSchema } from '@wenyuan/schema'
import type { Copilot } from '../copilot/client.ts'
import { runWithEmit } from '../copilot/emit.ts'
import type { Identity } from './identify.ts'
import { VOICE } from './voice.ts'

const OverviewPayloadSchema = z.object({
  overview: OverviewSchema,
  famousLines: z.array(FamousLineSchema).min(1).max(5),
  media: MediaSchema.pick({ heroPrompt: true }),
})

type OverviewPayload = z.infer<typeof OverviewPayloadSchema>

/** 按朝代/体裁给画风定锚，保证全站配图是一套语言而不是各画各的。 */
const STYLE_ANCHOR: Record<Identity['type'], string> = {
  poem: 'Tang dynasty blue-green (qinglu) landscape painting, mineral azurite and malachite pigments on aged xuan rice paper',
  ci: 'Song dynasty literati ink-wash painting, sparse brushwork, pale washes, restrained color on aged silk',
  essay: 'Chinese baimiao fine-line ink drawing, monochrome, calm and architectural, on aged xuan rice paper',
  classic:
    'ancient Chinese bamboo-slip and stone-rubbing aesthetic, archaic and austere, ink on weathered surfaces',
}

function checkFamousInBody(body: string): (value: OverviewPayload) => ValidationFailure[] {
  const stripped = body.replace(/[，。！？、；：「」『』（）\s]/g, '')
  return (value) =>
    value.famousLines.flatMap((famous, i) =>
      stripped.includes(famous.text.replace(/[，。！？、；：「」『』（）\s]/g, ''))
        ? []
        : [
            {
              path: `famousLines.${i}.text`,
              message: `「${famous.text}」在原文中找不到，名句必须逐字出自本篇，不要凭印象写`,
            },
          ],
    )
}

export interface OverviewInput {
  copilot: Copilot
  model: string | undefined
  workingDirectory: string
  identity: Identity
  chapters: Chapter[]
}

export async function overview(input: OverviewInput): Promise<OverviewPayload> {
  const body = input.chapters
    .flatMap((chapter) => chapter.lines.map((line) => line.text))
    .join('\n')
  // 长典籍不塞全文，用每章大意代替，省 token 又不丢结构。
  const digest =
    body.length <= 3000
      ? body
      : input.chapters
          .map((c) => `【${c.title ?? `第 ${c.index} 章`}】${c.summary}`)
          .join('\n')

  const { value } = await runWithEmit({
    copilot: input.copilot,
    model: input.model,
    workingDirectory: input.workingDirectory,
    timeoutMs: 300_000,
    maxAttempts: 3,
    systemMessage: `${VOICE}

当前任务：为一部作品写全书导读，并为它构思一张配图。只能通过 emit_overview 工具交付。`,
    toolName: 'emit_overview',
    toolDescription: '交付导读、名句与配图 prompt。校验不通过会返回逐条错误，据此修正后重新调用。',
    schema: OverviewPayloadSchema,
    extraChecks: checkFamousInBody(body),
    prompt: `作品：《${input.identity.title}》　作者：${input.identity.author.name}　朝代：${input.identity.dynasty}　体裁：${input.identity.type}　共 ${input.chapters.length} 章

${body.length <= 3000 ? '全文：' : '各章大意：'}

${digest}

请交付三部分：

**一、overview 导读**
- background：时代背景。这篇是在什么处境下写出来的，当时的文坛/思想界在发生什么。
- coreIdea：核心思想。这部作品到底在说什么，它的要害是什么。
- structure：结构脉络。全篇怎么展开的，转折在哪里。
- artistry：艺术手法。**怎么写的** —— 具体到字、句、节奏、对比、视角的调度。读者最常问「好在哪」，答案要落在这一段，必须举出原文中的具体例子，不许空谈「意境优美」。
- legacy：影响与流传。后世怎么评价它、化用它，有没有著名的误读或争议。让作品接得上今天。
- readingPath：给时间有限的读者的阅读路线。典籍必须给（如「先读第 8、33、81 章，感受「柔弱胜刚强」的主线」）；单篇诗文可以给空数组。
- difficulty：1-5，对没有古文基础的普通读者而言。

**二、famousLines 名句**
1-5 句。必须**逐字出自上面的原文**，不要凭印象写。每句给：
- translation：白话
- note：**名句精讲**。这一句为什么能流传千年 —— 是哪个字用得妙，还是哪种情感被它一次说尽了。不要复述译文。

**三、media.heroPrompt 配图 prompt**
一段**英文** prompt，用于生成本篇的意境横幅图（2.35:1 超宽）。硬性要求：

- 以这个画风开头：\`${STYLE_ANCHOR[input.identity.type]}\`
- 画**这篇作品最核心的那个意象**，不要泛泛的「中国风山水」
- **主体必须压在画面右侧三分之一，左侧三分之二留白**（雾气、空白宣纸、淡墨）。留白的一侧不能由模型自选 —— 站点的标题与名句固定压在图片左侧，主体一旦落在左边就会被文字盖住。prompt 里要明确写出 \`main subject on the right third, left two-thirds empty\`。
- 结尾必须加上：\`No people, no faces, no figures, no text, no calligraphy, no seals, no borders.\`
- 只描述画面，不要出现中文，不要解释你的思路。`,
  })
  return value
}
