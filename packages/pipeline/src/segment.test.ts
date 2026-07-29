import { describe, expect, it } from 'vitest'
import { applyParas, segment } from './segment.ts'

/** 爱莲说前半，两段之间空一行。 */
const ESSAY = `水陆草木之花，可爱者甚蕃。晋陶渊明独爱菊。

予谓菊，花之隐逸者也；莲，花之君子者也。`

const POEM = `春江潮水连海平，海上明月共潮生。
滟滟随波千万里，何处春江无月明。

江流宛转绕芳甸，月照花林皆似霰。`

describe('segment', () => {
  it('文章按句读切，并记下段落归属', () => {
    const [chapter] = segment(ESSAY, 'essay').chapters
    expect(chapter?.lines).toEqual([
      '水陆草木之花，可爱者甚蕃。',
      '晋陶渊明独爱菊。',
      '予谓菊，花之隐逸者也；',
      '莲，花之君子者也。',
    ])
    expect(chapter?.paras).toEqual([0, 0, 1, 1])
  })

  it('诗词一行一句，空行分节', () => {
    const [chapter] = segment(POEM, 'poem').chapters
    expect(chapter?.lines.length).toBe(3)
    expect(chapter?.paras).toEqual([0, 0, 1])
  })

  it('paras 与 lines 一一对应', () => {
    for (const type of ['essay', 'poem'] as const) {
      const [chapter] = segment(type === 'poem' ? POEM : ESSAY, type).chapters
      expect(chapter?.paras.length).toBe(chapter?.lines.length)
    }
  })

  it('段落序号不进指纹，改分段不会让译注缓存全部落空', () => {
    const merged = ESSAY.replace('\n\n', '\n')
    const a = segment(ESSAY, 'essay').chapters[0]
    const b = segment(merged, 'essay').chapters[0]
    expect(b?.lines).toEqual(a?.lines)
    expect(b?.hash).toBe(a?.hash)
    expect(b?.paras).not.toEqual(a?.paras)
  })

  it('章节标记拆章，诗词退化成单章', () => {
    const classic = '第一章 道可道\n道可道，非常道。名可名，非常名。\n\n第二章 天下皆知\n天下皆知美之为美，斯恶已。'
    expect(segment(classic, 'classic').chapters.length).toBe(2)
    expect(segment(POEM, 'poem').chapters.length).toBe(1)
  })

  it('认得「篇名第 N」这种篇题，且不吃掉 markdown 记号', () => {
    const book = '## 始计第一\n\n兵者，国之大事，不可不察也。\n\n九变第八\n\n凡用兵之法，圮地无舍，衢地合交。'
    const chapters = segment(book, 'classic').chapters
    expect(chapters.map((c) => c.title)).toEqual(['始计第一', '九变第八'])
  })

  it('不把正文误判成篇题', () => {
    const body = '孙子曰：兵者，国之大事，死生之地，存亡之道，不可不察也。'
    expect(segment(body, 'classic').chapters[0]?.title).toBeUndefined()
  })

  it('引号里不切句，不留下不闭合的半句', () => {
    const talk = '子曰：“学而时习之，不亦说乎？有朋自远方来，不亦乐乎？”曾子曰：“吾日三省吾身。”'
    expect(segment(talk, 'classic').chapters[0]?.lines).toEqual([
      '子曰：“学而时习之，不亦说乎？有朋自远方来，不亦乐乎？”',
      '曾子曰：“吾日三省吾身。”',
    ])
  })

  it('引号外照常按句读切', () => {
    const mixed = '客有吹洞箫者，倚歌而和之。其声呜呜然，不绝如缕。'
    expect(segment(mixed, 'essay').chapters[0]?.lines).toEqual([
      '客有吹洞箫者，倚歌而和之。',
      '其声呜呜然，不绝如缕。',
    ])
  })
})

describe('applyParas', () => {
  type TestLine = { text: string; para?: number }

  it('用切分结果覆盖模型给的段落序号', () => {
    const lines: TestLine[] = [{ text: 'a', para: 7 }, { text: 'b' }]
    expect(applyParas(lines, [0, 1])).toEqual([
      { text: 'a', para: 0 },
      { text: 'b', para: 1 },
    ])
  })

  it('缺少对应项时保持原样', () => {
    const lines: TestLine[] = [{ text: 'a' }]
    expect(applyParas(lines, [])).toEqual([{ text: 'a' }])
  })
})
