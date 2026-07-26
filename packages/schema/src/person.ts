import { z } from 'zod'
import type { ValidationFailure } from './index.ts'
import { formatIssues } from './index.ts'

/**
 * 人物是独立实体，不是作品的附属字段。
 * 作品里的 `author.bio` 是围着那篇作品写的（「此诗把江潮…」），
 * 换到人物页就成了偏题的小传 —— 所以人物单独立档。
 */

export const RELATIONS = ['师友', '同僚', '亲属', '门生', '政敌', '知音', '后世追随'] as const

const zh = (min: number, max: number, what: string) =>
  z.string().trim().min(min, `${what}至少 ${min} 字`).max(max, `${what}最多 ${max} 字`)

/** 公元年。负数表示公元前，年表排序与生卒校验都以它为准。 */
const year = z
  .number()
  .int()
  .min(-2000, '年份不早于公元前 2000 年')
  .max(2000, '年份不晚于公元 2000 年')

export const MilestoneSchema = z.object({
  year,
  /** 显示用的年份写法：「元丰二年（1079）」「约公元前 512 年」。 */
  label: zh(2, 30, '年份写法'),
  title: zh(2, 24, '大事标题'),
  detail: zh(10, 240, '大事说明'),
  /**
   * 这件事发生在哪里，取自 `data/places.json` 的 id。
   * 坐标是硬事实，只让模型从给定清单里挑，绝不让它自己写经纬度。
   * 定不到具体地点（如「名篇成稿」）就留空。
   */
  place: z.string().min(1).optional(),
})

export const CompanionSchema = z.object({
  name: zh(1, 20, '交游人物'),
  relation: z.enum(RELATIONS),
  note: zh(10, 200, '交游说明'),
})

export const MasterpieceSchema = z.object({
  title: zh(1, 40, '代表作标题'),
  note: zh(10, 200, '代表作说明'),
  /** 站内已有这篇作品时填它的 id，前端据此把人物页与阅读页接起来。 */
  workId: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'workId 必须是小写 kebab-case')
    .optional(),
})

export const PersonSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id 必须是小写 kebab-case'),
  name: zh(1, 20, '姓名'),
  /** 字、号、别称。「字子瞻」「号东坡居士」。 */
  aka: z.array(zh(1, 20, '别称')).max(6).default([]),
  dynasty: zh(1, 20, '朝代'),
  /** 生卒的显示写法，生卒不详也要给一个说法（「约活动于春秋末期」）。 */
  era: zh(2, 40, '生卒写法'),
  born: year.optional(),
  died: year.optional(),
  /** L1：一句人话说清这个人为什么值得认识。不要「著名诗人」这种废话。 */
  hook: zh(10, 120, '一句话定位'),
  /** 人物本位的小传：他是谁、经历了什么、在文学史上占什么位置。 */
  bio: zh(80, 900, '小传'),
  traits: z.array(zh(2, 12, '关键词')).min(1).max(5),
  timeline: z.array(MilestoneSchema).min(3, '生平至少要有 3 个节点，只写生与卒等于没有年表').max(12),
  circle: z.array(CompanionSchema).max(8).default([]),
  masterpieces: z.array(MasterpieceSchema).min(1).max(8),
  media: z.object({
    /** 人物配图只出意境与器物，不画人脸 —— 避开恐怖谷与历史人物形象争议。 */
    heroPrompt: zh(60, 1600, '配图 prompt'),
    hero: z.string().optional(),
  }),
})

export type Milestone = z.infer<typeof MilestoneSchema>
export type Companion = z.infer<typeof CompanionSchema>
export type Masterpiece = z.infer<typeof MasterpieceSchema>
export type Person = z.infer<typeof PersonSchema>
export type Relation = (typeof RELATIONS)[number]

/** 年表必须按年份升序 —— 模型很容易把「早年」「晚年」的条目排乱。 */
export function checkTimelineOrder(person: Person): ValidationFailure[] {
  const failures: ValidationFailure[] = []
  person.timeline.forEach((item, i) => {
    const prev = person.timeline[i - 1]
    if (prev !== undefined && item.year < prev.year) {
      failures.push({
        path: `timeline.${i}.year`,
        message: `年表必须按时间升序：${item.year} 排在 ${prev.year} 之后了`,
      })
    }
  })
  return failures
}

/**
 * 年表节点必须落在生卒区间内。模型常把「身后事」「后世评价」塞进年表，
 * 或凭印象写一个人死后二十年才发生的事。
 */
export function checkTimelineWithinLife(person: Person): ValidationFailure[] {
  const slack = 2
  return person.timeline.flatMap((item, i) => {
    if (person.born !== undefined && item.year < person.born - slack) {
      return [
        {
          path: `timeline.${i}.year`,
          message: `${item.year} 早于生年 ${person.born}，年表只记本人在世期间的事`,
        },
      ]
    }
    if (person.died !== undefined && item.year > person.died + slack) {
      return [
        {
          path: `timeline.${i}.year`,
          message: `${item.year} 晚于卒年 ${person.died}，身后事写进 bio，不要放年表`,
        },
      ]
    }
    return []
  })
}

/** 生年不能晚于卒年。 */
export function checkLifespan(person: Person): ValidationFailure[] {
  return person.born !== undefined && person.died !== undefined && person.born > person.died
    ? [{ path: 'died', message: `卒年 ${person.died} 早于生年 ${person.born}` }]
    : []
}

/**
 * 年表的 place 只能取自给定地名表。地图上的坐标必须可靠 ——
 * 让模型自由写地名，就会冒出定不到位的泛称，或干脆编一个经纬度。
 */
export function checkMilestonePlaces(person: Person, placeIds: string[]): ValidationFailure[] {
  const known = new Set(placeIds)
  return person.timeline.flatMap((item, i) =>
    item.place !== undefined && !known.has(item.place)
      ? [
          {
            path: `timeline.${i}.place`,
            message: `地名表里没有「${item.place}」。只能填给定清单里的 id，定不到具体地点就留空`,
          },
        ]
      : [],
  )
}

export interface PersonParseResult {
  person: Person | null
  failures: ValidationFailure[]
}

/** 结构校验 + 跨字段校验，一次把所有问题攒齐再回灌，省一轮往返。 */
export function parsePerson(input: unknown, placeIds: string[] = []): PersonParseResult {
  const parsed = PersonSchema.safeParse(input)
  if (!parsed.success) {
    return { person: null, failures: formatIssues(parsed.error) }
  }
  const failures = [
    ...checkLifespan(parsed.data),
    ...checkTimelineOrder(parsed.data),
    ...checkTimelineWithinLife(parsed.data),
    ...(placeIds.length > 0 ? checkMilestonePlaces(parsed.data, placeIds) : []),
  ]
  return failures.length > 0 ? { person: null, failures } : { person: parsed.data, failures: [] }
}
