import { z } from 'zod'
import { AuthorSchema, MOODS, WORK_TYPES } from '@wenyuan/schema'
import type { Copilot } from '../copilot/client.ts'
import { runWithEmit } from '../copilot/emit.ts'
import { VOICE } from './voice.ts'

export const IdentitySchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id 必须是小写 kebab-case 的拼音'),
  title: z.string().trim().min(1).max(60),
  type: z.enum(WORK_TYPES),
  dynasty: z.string().trim().min(1).max(20),
  author: AuthorSchema,
  hook: z.string().trim().min(10).max(120),
  moods: z.array(z.enum(MOODS)).min(1).max(3),
  themes: z.array(z.string().trim().min(2).max(12)).min(1).max(5),
})

export type Identity = z.infer<typeof IdentitySchema>

export interface IdentifyInput {
  copilot: Copilot
  model: string | undefined
  workingDirectory: string
  /** 只取开头一段做识别，全文没必要塞进去。 */
  excerpt: string
  chapterCount: number
  hintTitle: string | undefined
}

export async function identify(input: IdentifyInput): Promise<Identity> {
  const { value } = await runWithEmit({
    copilot: input.copilot,
    model: input.model,
    workingDirectory: input.workingDirectory,
    timeoutMs: 180_000,
    maxAttempts: 3,
    systemMessage: `${VOICE}

当前任务：识别一篇古典文学作品的基本信息。只能通过 emit_identity 工具交付，不要用普通消息回答。`,
    toolName: 'emit_identity',
    toolDescription: '交付作品的基本信息。校验不通过会返回逐条错误，据此修正后重新调用。',
    schema: IdentitySchema,
    prompt: `下面是一篇中国古典文学作品的开头${input.hintTitle ? `（文件名提示：${input.hintTitle}）` : ''}，全文共 ${input.chapterCount} 个章节/段落。

请识别它并交付基本信息：

- id：作品名的小写拼音 kebab-case，如 chun-jiang-hua-yue-ye、dao-de-jing
- title：作品标题
- type：poem（诗）/ ci（词）/ essay（辞赋散文）/ classic（成体系的典籍）
- dynasty：朝代。用最简称呼（唐 / 宋 / 先秦 / 春秋），不要写「唐代」「宋朝」，站内要能对齐。分期有意义时可写「北宋」「初唐」。
- author：姓名、生卒或活动年代、小传。小传写这个人**为什么值得认识**，而不是罗列官职履历。作者不详就写「佚名」，小传交代作品的来源与流传。
- hook：一句话钩子。这是首页给路人看的第一句，要说清**为什么这篇值得点开**，说人话，不要用「千古名篇」「脍炙人口」这种套话。
- moods：从 ${MOODS.join(' / ')} 中选 1-3 个最贴合的
- themes：2-5 个主题词，如「宇宙」「时间」「相思」

原文开头：

${input.excerpt}`,
  })
  return value
}
