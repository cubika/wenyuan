import { z } from 'zod'
import type { ValidationFailure } from './index.ts'
import { formatIssues } from './index.ts'

/**
 * 长河按朝代分段，不按公元年线性排 —— 站内跨度两千多年，
 * 真按年份画，先秦一个点之后就是一千多年空白。
 *
 * 导语只讲**这个时期文学在变什么**，绝不点名具体作品。
 * 「站内收录了什么」是事实，由 works / people 反查得出，
 * 一旦写进 AI 文本，加一篇作品就得重写一遍。
 */

const zh = (min: number, max: number, what: string) =>
  z.string().trim().min(min, `${what}至少 ${min} 字`).max(max, `${what}最多 ${max} 字`)

export const EraSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id 必须是小写 kebab-case'),
  name: zh(1, 8, '朝代名'),
  /** 起讫年的显示写法：「618—907」「前 221—前 206」。 */
  range: zh(2, 24, '起讫写法'),
  start: z.number().int().min(-2000).max(2000),
  end: z.number().int().min(-2000).max(2000),
  /** 这个时期文学在变什么。长河的主体文字。 */
  shift: zh(60, 400, '流变导语'),
  /** 3-5 个抓手词：律诗定型 / 边塞 / 山水田园。 */
  marks: z.array(zh(2, 10, '抓手词')).min(3).max(5),
})

export const ErasSchema = z.array(EraSchema).min(1)

export type Era = z.infer<typeof EraSchema>

/**
 * 导语里不许出现书名号 —— 点了具体作品，加一篇就过期一次。
 * 这条不靠嘱咐，靠校验：模型想挂钩也挂不上。
 */
export function checkNoWorkNames(eras: Era[]): ValidationFailure[] {
  return eras.flatMap((era, i) => {
    const hit = /[《》]/.exec(era.shift)
    return hit === null
      ? []
      : [
          {
            path: `${i}.shift`,
            message: `「${era.name}」的导语里出现了书名号。导语只讲这个时期文学在变什么，不点名具体作品 —— 站内收录了什么由数据反查，写进正文就会过期`,
          },
        ]
  })
}

/**
 * 导语里不许出现站内作者的名字。读者在朝代段里看到「刘禹锡」，
 * 紧接着下面就是刘禹锡的人物卡，会读成「站内推荐」；
 * 而站外人物（李白、杜甫）只是历史背景，不构成这种误读。
 */
export function checkNoSiteAuthors(eras: Era[], authors: string[]): ValidationFailure[] {
  return eras.flatMap((era, i) => {
    const hit = authors.find((name) => name.length >= 2 && era.shift.includes(name))
    return hit === undefined
      ? []
      : [
          {
            path: `${i}.shift`,
            message: `「${era.name}」的导语里点名了站内作者「${hit}」。导语只讲趋势，站内有谁由数据反查`,
          },
        ]
  })
}

/** 起讫年要成立，且各段按时间排。 */
export function checkEraOrder(eras: Era[]): ValidationFailure[] {
  const failures: ValidationFailure[] = []
  eras.forEach((era, i) => {
    if (era.start > era.end) {
      failures.push({ path: `${i}.end`, message: `${era.name} 的止年早于起年` })
    }
    const prev = eras[i - 1]
    if (prev !== undefined && era.start < prev.start) {
      failures.push({ path: `${i}.start`, message: `${era.name} 排在 ${prev.name} 之后，但起年更早` })
    }
  })
  return failures
}

export interface ErasParseResult {
  eras: Era[] | null
  failures: ValidationFailure[]
}

export function parseEras(input: unknown, authors: string[] = []): ErasParseResult {
  const parsed = ErasSchema.safeParse(input)
  if (!parsed.success) {
    return { eras: null, failures: formatIssues(parsed.error) }
  }
  const failures = [
    ...checkEraOrder(parsed.data),
    ...checkNoWorkNames(parsed.data),
    ...checkNoSiteAuthors(parsed.data, authors),
  ]
  return failures.length > 0 ? { eras: null, failures } : { eras: parsed.data, failures: [] }
}
