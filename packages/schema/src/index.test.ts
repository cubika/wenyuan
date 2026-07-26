import { describe, expect, it } from 'vitest'
import { parseWork, type Work } from './index.ts'

function baseWork(): Work {
  return {
    id: 'chun-jiang-hua-yue-ye',
    title: '春江花月夜',
    type: 'poem',
    dynasty: '唐',
    author: { name: '张若虚', era: '约660—约720', bio: '扬州人，与贺知章、张旭、包融并称吴中四士，全唐诗仅存其诗两首。' },
    hook: '一个人在江边看月亮，忽然想到了整个人类的时间。',
    moods: ['孤独'],
    themes: ['宇宙', '时间'],
    famousLines: [{ text: '春江潮水连海平', translation: '春潮涨得与海一样平。', note: '开篇不写月而先写水，把画面推到最开阔处，明月才有地方升起来。' }],
    overview: {
      background: '张若虚身处初唐向盛唐过渡之际，诗坛正从六朝的浮艳中挣脱出来，题材与气象都在变。',
      coreIdea: '把一个人的赏月推到整个人类的时间尺度上，追问个体、人类与永恒之间的关系。',
      structure: '前八句写景，第九句一转发问，此后由宇宙落回人间相思，以月起以月落收束。',
      artistry: '全篇以「月」贯穿，月生、月悬、月问、月斜、月落，景随月移而情随景转，三十六句不离一轮月。',
      legacy: '闻一多称其为「诗中的诗，顶峰上的顶峰」，此说流传极广，也使这首诗在近代被重新发现。',
      readingPath: [],
      difficulty: 2,
    },
    media: {
      heroPrompt:
        'Tang dynasty blue-green landscape painting of a vast spring river meeting the sea at night, an enormous luminous moon rising on the far right, the left two-thirds left as empty mist and bare rice paper for text. No people, no faces, no figures, no text, no calligraphy, no seals, no borders.',
    },
    chapters: [
      {
        index: 1,
        lines: [
          {
            text: '春江潮水连海平，海上明月共潮生。',
            translation: '春天的江潮涨得与海相平，一轮明月伴着潮头从海上升起。',
            notes: [{ term: '潮生', explain: '随着潮水一同升起。', type: 'word' }],
          },
        ],
        summary: '开篇以春江与海潮起势，托出一轮共潮而生的明月，为全诗定下辽阔的基调。',
        difficulty: 2,
        hash: '0123456789abcdef',
      },
    ],
  }
}

describe('parseWork', () => {
  it('接受结构完整的作品', () => {
    const result = parseWork(baseWork())
    expect(result.failures).toEqual([])
    expect(result.work?.id).toBe('chun-jiang-hua-yue-ye')
  })

  it('给 notes 补上默认空数组', () => {
    const work = baseWork()
    const [chapter] = work.chapters
    const [line] = chapter?.lines ?? []
    if (!line) {
      throw new Error('fixture 损坏')
    }
    const stripped = { ...work, chapters: [{ ...chapter, lines: [{ text: line.text, translation: line.translation }] }] }
    expect(parseWork(stripped).work?.chapters[0]?.lines[0]?.notes).toEqual([])
  })

  it('拒绝不在原句中的注释词条', () => {
    const work = baseWork()
    const chapter = work.chapters[0]
    const line = chapter?.lines[0]
    if (!chapter || !line) {
      throw new Error('fixture 损坏')
    }
    line.notes = [{ term: '滟滟', explain: '波光荡漾的样子。', type: 'word' }]
    const result = parseWork(work)
    expect(result.work).toBeNull()
    expect(result.failures[0]?.message).toContain('连续子串')
  })

  it('拒绝原文里找不到的名句', () => {
    const work = baseWork()
    work.famousLines = [{ text: '举头望明月', translation: '抬头看着天上的月亮。', note: '这是另一首诗里的句子，用来验证出处校验能拦住它。' }]
    const result = parseWork(work)
    expect(result.work).toBeNull()
    expect(result.failures[0]?.path).toBe('famousLines.0.text')
  })

  it('忽略标点差异来匹配名句', () => {
    const work = baseWork()
    work.famousLines = [{ text: '春江潮水连海平，海上明月共潮生', translation: '春潮与海相平，明月伴潮升起。', note: '两句连读才见气象，前句铺开水面，后句让月亮从水面长出来。' }]
    expect(parseWork(work).work).not.toBeNull()
  })

  it('拒绝非 kebab-case 的 id', () => {
    const work = { ...baseWork(), id: 'ChunJiang_HuaYueYe' }
    const result = parseWork(work)
    expect(result.work).toBeNull()
    expect(result.failures.some((f) => f.path === 'id')).toBe(true)
  })

  it('把 Zod 错误压成可回灌的路径与说明', () => {
    const result = parseWork({ id: 'x', title: '' })
    expect(result.work).toBeNull()
    expect(result.failures.length).toBeGreaterThan(3)
    expect(result.failures.every((f) => f.path.length > 0 && f.message.length > 0)).toBe(true)
  })
})
