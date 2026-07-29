import { PersonSchema, checkLifespan, checkMilestonePlaces, checkTimelineOrder, checkTimelineWithinLife } from '@wenyuan/schema'
import type { Person, ValidationFailure } from '@wenyuan/schema'
import type { Copilot } from '../copilot/client.ts'
import { runWithEmit } from '../copilot/emit.ts'
import { VOICE } from './voice.ts'

/** 站内已有的作品，喂给模型让它把代表作接回阅读页。 */
export interface KnownWork {
  id: string
  title: string
  type: string
  dynasty: string
}

export interface PersonInput {
  copilot: Copilot
  model: string | undefined
  workingDirectory: string
  name: string
  dynasty: string
  /** 已有档案的 id。人物 id 一旦定下就不能漂 —— 链接会失效、配图会丢。 */
  fixedId: string | undefined
  known: KnownWork[]
  /** 可选地名表，年表节点只能从中挑。 */
  places: { id: string; name: string; today: string }[]
}

/**
 * 生卒、年表这类硬事实最容易被模型顺手编造，所以校验全部前置到工具返回值里，
 * 让它在同一轮对话里自己改。
 */
function checks(
  known: KnownWork[],
  placeIds: string[],
): (value: Person) => ValidationFailure[] {
  const ids = new Set(known.map((w) => w.id))
  return (person) => [
    ...checkLifespan(person),
    ...checkTimelineOrder(person),
    ...checkTimelineWithinLife(person),
    ...checkMilestonePlaces(person, placeIds),
    ...person.masterpieces.flatMap((m, i) =>
      m.workId !== undefined && !ids.has(m.workId)
        ? [
            {
              path: `masterpieces.${i}.workId`,
              message: `站内没有 id 为「${m.workId}」的作品。只能填下面列出的 id，站外作品不要填 workId`,
            },
          ]
        : [],
    ),
  ]
}

export async function person(input: PersonInput): Promise<Person> {
  const catalog =
    input.known.length > 0
      ? input.known.map((w) => `- ${w.id}　《${w.title}》　${w.dynasty}·${w.type}`).join('\n')
      : '（站内暂无这个人的作品）'

  const { value } = await runWithEmit({
    copilot: input.copilot,
    model: input.model,
    workingDirectory: input.workingDirectory,
    // 年表、交游、代表作一次交付，冷门作者还常要反复修正才过校验。
    timeoutMs: 600_000,
    maxAttempts: 4,
    systemMessage: `${VOICE}

当前任务：为一位古代作者立一份人物档案。只能通过 emit_person 工具交付，不要用普通消息回答。`,
    toolName: 'emit_person',
    toolDescription: '交付人物档案。校验不通过会返回逐条错误，据此修正后重新调用。',
    schema: PersonSchema,
    extraChecks: checks(input.known, input.places.map((p) => p.id)),
    prompt: `人物：${input.name}　朝代：${input.dynasty}

站内已收录他的作品（代表作里若提到这些，请填上对应的 workId）：

${catalog}

年表节点可以标地点，**只能从下面这份地名表里挑 id**（定不到具体地点就留空，不要硬凑）：

${input.places.map((p) => `${p.id}=${p.name}（${p.today}）`).join('　')}

请交付一份人物档案：

- **id**：${
      input.fixedId !== undefined
        ? `必须原样填 \`${input.fixedId}\`，这是已有档案的 id，不能改。`
        : '姓名的小写拼音 kebab-case，如 `su-shi`、`liu-yuxi`。'
    }
- **name / dynasty**：与上面给定的一致。
- **aka**：字、号、别称。没有就给空数组，不要编。
- **era**：生卒的显示写法，如「1037—1101」；生卒不详就写「约活动于春秋末期」这类说法。
- **born / died**：公元年整数，公元前用负数。**拿不准就不要给**，宁可缺省也不要编一个年份。
- **hook**：一句人话说清这个人为什么值得认识。不要「著名诗人」「文学巨匠」这种废话，要给具体的东西。
- **bio**：人物本位的小传 —— 他是谁、经历了什么、在文学史上占什么位置。**不要写成某一篇作品的赏析**。
- **traits**：2-5 个关键词，概括其人。
- **timeline**：生平年表，3-12 条，**按时间升序**。
  - year：公元年整数；label：显示写法，如「元丰二年（1079）」；生卒不详的人物，label 要用「约」把不确定说出来
  - title：不超过 12 字的事件名；detail：这件事为什么重要
  - **place**：这件事发生在哪里，填上面地名表里的 id。地图靠它把一个人的行迹连成线，**能定位的节点尽量都填**（出生、任职、贬谪、病逝都有确切地点）；「名篇成稿」这类定不到地方的留空。
  - **只写生和卒等于没有年表**。要给出仕、贬谪、任职、著述、交游这类有实质内容的节点。
  - **只记他在世期间的事**。身后的追赠、评价、影响写进 bio，不要放年表。
- **circle**：交游关系，最多 8 条。relation 从 师友 / 同僚 / 亲属 / 门生 / 政敌 / 知音 / 后世追随 中选。**确有其事才写**，拿不准就少写几条或给空数组。
- **masterpieces**：代表作 1-8 篇。站内已收录的填 workId（只能用上面列出的 id），站外的不填。
- **media.heroPrompt**：一段**英文** prompt，为这个人物生成意境横幅（2.35:1）。硬性要求：
  - 画**与这个人强绑定的意象、器物或场景**（他的贬所、他常写的景、他用的器物），不是泛泛的中国风山水
  - **绝不画人**：这是人物页的配图，但只出意境，不出人像
  - **主体必须压在画面右侧三分之一，左侧三分之二留白**，站点的姓名与介绍固定压在图片左侧
  - 结尾必须加上：\`No people, no faces, no figures, no text, no calligraphy, no seals, no borders.\`
  - 只描述画面，不要出现中文，不要解释思路。

事实底线再强调一次：**生卒年、事件年份、交游对象拿不准就不要写**。写一个模糊但正确的说法，好过一个具体但错误的年份。`,
  })

  return input.fixedId !== undefined && value.id !== input.fixedId
    ? { ...value, id: input.fixedId }
    : value
}
