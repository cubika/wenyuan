import { ErasSchema, checkEraOrder, checkNoSiteAuthors, checkNoWorkNames } from '@wenyuan/schema'
import type { Era, ValidationFailure } from '@wenyuan/schema'
import type { Copilot } from '../copilot/client.ts'
import { runWithEmit } from '../copilot/emit.ts'
import { VOICE } from './voice.ts'

/**
 * 十二段一次交付，不是逐段生成 —— 长河讲的是「变」，
 * 每段都得知道上一段是什么样才说得清变在哪里。逐段独立作业只会得到十二段各说各话。
 */
const ERAS = [
  ['xianqin', '先秦', '前 11 世纪—前 221'],
  ['qin', '秦', '前 221—前 206'],
  ['han', '汉', '前 206—220'],
  ['weijin', '魏晋', '220—420'],
  ['nanbeichao', '南北朝', '420—589'],
  ['sui', '隋', '581—618'],
  ['tang', '唐', '618—907'],
  ['wudai', '五代', '907—979'],
  ['song', '宋', '960—1279'],
  ['yuan', '元', '1271—1368'],
  ['ming', '明', '1368—1644'],
  ['qing', '清', '1644—1912'],
] as const

export interface ErasInput {
  copilot: Copilot
  model: string | undefined
  workingDirectory: string
  /** 站内作者名单，用来拦住导语点名站内人物。 */
  authors: string[]
}

function checks(authors: string[]): (value: Era[]) => ValidationFailure[] {
  return (eras) => [
    ...checkEraOrder(eras),
    ...checkNoWorkNames(eras),
    ...checkNoSiteAuthors(eras, authors),
    ...(eras.length === ERAS.length
      ? []
      : [{ path: '(root)', message: `必须恰好 ${ERAS.length} 段，与给定的朝代一一对应` }]),
    ...eras.flatMap((era, i) => {
      const want = ERAS[i]
      return want !== undefined && (era.id !== want[0] || era.name !== want[1])
        ? [
            {
              path: `${i}.id`,
              message: `第 ${i + 1} 段必须是 id=${want[0]}、name=${want[1]}，顺序不能改`,
            },
          ]
        : []
    }),
  ]
}

export async function eras(input: ErasInput): Promise<Era[]> {
  const list = ERAS.map(([id, name, range], i) => `${i + 1}. id=${id}　name=${name}　range=${range}`).join('\n')

  const { value } = await runWithEmit({
    copilot: input.copilot,
    model: input.model,
    workingDirectory: input.workingDirectory,
    timeoutMs: 420_000,
    maxAttempts: 4,
    systemMessage: `${VOICE}

当前任务：为一条「中国文学长河」写十二段朝代导语。只能通过 emit_eras 工具交付。`,
    toolName: 'emit_eras',
    toolDescription: '交付十二段朝代导语。校验不通过会返回逐条错误，据此修正后重新调用。',
    schema: ErasSchema,
    extraChecks: checks(input.authors),
    prompt: `请为下面十二个朝代各写一段导语，**按给定顺序、id 与 name 原样使用**：

${list}

每段交付：

- **id / name / range**：照抄上面给定的值。
- **start / end**：起讫年的公元整数，公元前用负数（如先秦 start=-1046、end=-221）。
- **shift**：这个时期**文学在变什么**。60-400 字，2-4 句。
  - 要写出**变化**，不是罗列成就。上一段结束时是什么样、这一段把它推到了哪里。
  - 写具体的东西：句式与体裁的变化、写作动机的变化、谁在写与写给谁看的变化。
  - 十二段读下来要能连成一条线，相邻两段的说法不要互相重复。
- **marks**：3-5 个抓手词，如「律诗定型」「边塞」「山水田园」。

**两条硬规矩**：

1. **不许出现书名号《》，不许点名任何具体作品。** 导语只讲趋势。站内收录了哪些作品由数据反查后自动列在导语下面，写进正文只会过期。
2. **不许提到这些人的名字**：${input.authors.join('、')}。他们在站内有自己的页面，导语里点名会被读成「站内推荐」。其他历史人物（李白、杜甫、陶渊明等）可以正常提及。

另外：秦、隋、五代这类短命朝代不要硬吹，文学上乏善可陈就照实说它是过渡与断层。`,
  })

  return value
}
