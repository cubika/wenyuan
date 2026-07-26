import { describe, expect, it } from 'vitest'
import { parseEras, type Era } from './era.ts'

function baseEras(): Era[] {
  return [
    {
      id: 'xianqin',
      name: '先秦',
      range: '前 11 世纪—前 221',
      start: -1046,
      end: -221,
      shift:
        '文学还没有从典籍、史官与礼乐中独立出来。四言的歌谣被采集整理，成为最早的抒情传统；诸子为了说服人而写文章，逻辑、比喻与寓言在争辩里被磨快。',
      marks: ['四言', '诸子', '采诗'],
    },
    {
      id: 'tang',
      name: '唐',
      range: '618—907',
      start: 618,
      end: 907,
      shift:
        '诗从宫廷的应制场合走到江山、边塞与市井，格律在这一百年里定型，题材却反而放开了。写景不再只是铺陈，开始承担对时间与人生的追问。',
      marks: ['律诗定型', '边塞', '山水田园'],
    },
  ]
}

describe('parseEras', () => {
  it('接受结构完整的朝代段', () => {
    const result = parseEras(baseEras(), ['刘禹锡', '苏轼'])
    expect(result.failures).toEqual([])
    expect(result.eras?.length).toBe(2)
  })

  it('拒绝导语里点名具体作品', () => {
    const eras = baseEras()
    eras[1]!.shift = `${eras[1]!.shift}《春江花月夜》正是这一转变的代表。`
    const result = parseEras(eras)
    expect(result.eras).toBeNull()
    expect(result.failures[0]?.message).toContain('书名号')
  })

  it('拒绝导语里点名站内作者', () => {
    const eras = baseEras()
    eras[1]!.shift = `${eras[1]!.shift}刘禹锡的骨力就是一例。`
    const result = parseEras(eras, ['刘禹锡', '苏轼'])
    expect(result.eras).toBeNull()
    expect(result.failures[0]?.message).toContain('刘禹锡')
  })

  it('站外人物可以出现在导语里', () => {
    const eras = baseEras()
    eras[1]!.shift = `${eras[1]!.shift}李白与杜甫把这条路走到了两个方向。`
    expect(parseEras(eras, ['刘禹锡', '苏轼']).eras).not.toBeNull()
  })

  it('拒绝乱序的朝代段', () => {
    const eras = baseEras()
    const result = parseEras([eras[1]!, eras[0]!])
    expect(result.eras).toBeNull()
    expect(result.failures.some((f) => f.message.includes('起年更早'))).toBe(true)
  })

  it('拒绝止年早于起年', () => {
    const eras = baseEras()
    eras[0]!.end = -2000
    const result = parseEras(eras)
    expect(result.eras).toBeNull()
    expect(result.failures.some((f) => f.message.includes('止年早于起年'))).toBe(true)
  })
})
