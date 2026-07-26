import { describe, expect, it } from 'vitest'
import { parsePerson, type Person } from './person.ts'

function basePerson(): Person {
  return {
    id: 'su-shi',
    name: '苏轼',
    aka: ['字子瞻', '号东坡居士'],
    dynasty: '宋',
    era: '1037—1101',
    born: 1037,
    died: 1101,
    hook: '一个被贬了半辈子的人，把每一处贬所都活成了值得记住的地方。',
    bio: '苏轼是北宋文坛的中心人物，诗、词、文、书、画皆入一流。他一生几度起落，从凤翔到黄州、惠州、儋州，越贬越远，却在贬所写出了最好的作品。他把日常生活写进文学，也把哲思写得像家常话，宋代以后的中国文人几乎都在他的影响之下。',
    traits: ['旷达', '多才', '贬谪'],
    timeline: [
      { year: 1057, label: '嘉祐二年（1057）', title: '进士及第', detail: '与弟苏辙同榜登第，主考欧阳修惊为奇才，一时名动京师。' },
      { year: 1079, label: '元丰二年（1079）', title: '乌台诗案', detail: '因诗获罪下狱，几乎丧命，出狱后贬为黄州团练副使。' },
      { year: 1082, label: '元丰五年（1082）', title: '两赋一词', detail: '在黄州写下前后《赤壁赋》与《念奴娇·赤壁怀古》，创作攀上顶峰。' },
    ],
    circle: [
      { name: '欧阳修', relation: '师友', note: '嘉祐二年的主考官，读到苏轼的文章后断言此人他日文章必独步天下。' },
    ],
    masterpieces: [
      { title: '江城子·乙卯正月二十日夜记梦', note: '悼亡词的顶点，把生死相隔写得克制而深。', workId: 'jiangchengzi-jimeng' },
    ],
    media: {
      heroPrompt:
        'Song dynasty literati ink-wash painting on aged silk, a solitary bamboo grove and an empty stone bench beside a moonlit river, main subject on the right third, left two-thirds empty mist for text. No people, no faces, no figures, no text, no calligraphy, no seals, no borders.',
    },
  }
}

describe('parsePerson', () => {
  it('接受结构完整的人物', () => {
    const result = parsePerson(basePerson())
    expect(result.failures).toEqual([])
    expect(result.person?.id).toBe('su-shi')
  })

  it('给 aka 与 circle 补上默认空数组', () => {
    const { aka, circle, ...rest } = basePerson()
    const result = parsePerson(rest)
    expect(result.person?.aka).toEqual([])
    expect(result.person?.circle).toEqual([])
  })

  it('拒绝乱序的年表', () => {
    const person = basePerson()
    person.timeline = [person.timeline[2]!, person.timeline[0]!, person.timeline[1]!]
    const result = parsePerson(person)
    expect(result.person).toBeNull()
    expect(result.failures[0]?.message).toContain('升序')
  })

  it('拒绝落在生卒之外的年表节点', () => {
    const person = basePerson()
    person.timeline.push({
      year: 1130,
      label: '南宋初',
      title: '追赠太师',
      detail: '这是身后事，不该出现在生平年表里，用来验证生卒区间校验。',
    })
    const result = parsePerson(person)
    expect(result.person).toBeNull()
    expect(result.failures[0]?.message).toContain('晚于卒年')
  })

  it('拒绝生年晚于卒年', () => {
    const person = { ...basePerson(), born: 1101, died: 1037 }
    const result = parsePerson(person)
    expect(result.person).toBeNull()
    expect(result.failures.some((f) => f.path === 'died')).toBe(true)
  })

  it('拒绝非 kebab-case 的 id 与 workId', () => {
    const person = basePerson()
    person.id = 'SuShi'
    person.masterpieces[0]!.workId = 'JiangChengZi'
    const result = parsePerson(person)
    expect(result.person).toBeNull()
    expect(result.failures.some((f) => f.path === 'id')).toBe(true)
    expect(result.failures.some((f) => f.path.endsWith('workId'))).toBe(true)
  })

  it('把 Zod 错误压成可回灌的路径与说明', () => {
    const result = parsePerson({ id: 'x', name: '' })
    expect(result.person).toBeNull()
    expect(result.failures.every((f) => f.path.length > 0 && f.message.length > 0)).toBe(true)
  })
})
