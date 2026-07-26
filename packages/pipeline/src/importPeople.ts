import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parsePerson, parseWork } from '@wenyuan/schema'
import type { Person, Work } from '@wenyuan/schema'
import { Copilot } from './copilot/client.ts'
import { person as buildPerson, type KnownWork } from './stages/person.ts'

export interface ImportPeopleOptions {
  worksDir: string
  outDir: string
  workingDirectory: string
  model: string | undefined
  /** 只做这几位；留空表示扫出全部作者。 */
  only: string[]
  /** 已有档案也重跑。 */
  force: boolean
}

/** 无名氏不是人物。给《蒹葭》立一个「佚名」档案没有任何意义。 */
const ANONYMOUS = new Set(['佚名', '无名氏', '不详', '未知'])

async function loadWorks(dir: string): Promise<Work[]> {
  const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.json'))
  const works: Work[] = []
  for (const file of files) {
    const parsed = parseWork(JSON.parse(await readFile(join(dir, file), 'utf8')) as unknown)
    if (parsed.work) {
      works.push(parsed.work)
    }
  }
  return works
}

async function loadPeople(dir: string): Promise<Person[]> {
  const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.json'))
  const people: Person[] = []
  for (const file of files) {
    const parsed = parsePerson(JSON.parse(await readFile(join(dir, file), 'utf8')) as unknown)
    if (parsed.person) {
      people.push(parsed.person)
    }
  }
  return people
}

export async function importPeople(options: ImportPeopleOptions): Promise<Person[]> {
  const works = await loadWorks(options.worksDir)
  const existing = await loadPeople(options.outDir)
  // 姓名是人物的自然主键；id 以已有档案为准，免得重跑时链接与配图全部漂掉。
  const idByName = new Map(existing.map((p) => [p.name, p.id]))

  const byName = new Map<string, { dynasty: string; works: KnownWork[] }>()
  for (const work of works) {
    const name = work.author.name.trim()
    if (ANONYMOUS.has(name)) {
      continue
    }
    const entry = byName.get(name) ?? { dynasty: work.dynasty, works: [] }
    entry.works.push({ id: work.id, title: work.title, type: work.type, dynasty: work.dynasty })
    byName.set(name, entry)
  }

  const wanted =
    options.only.length > 0
      ? [...byName.entries()].filter(([name]) => options.only.includes(name))
      : [...byName.entries()]

  if (wanted.length === 0) {
    throw new Error(
      options.only.length > 0
        ? `作品里没有这些作者：${options.only.join('、')}`
        : 'data/works 里没有可立档的作者，先跑 npm run import',
    )
  }

  const copilot = new Copilot(options.workingDirectory, options.workingDirectory)
  const done: Person[] = []
  try {
    for (const [name, entry] of wanted) {
      const fixedId = idByName.get(name)
      if (fixedId !== undefined && !options.force) {
        console.log(`  ${name} 已有档案，跳过（--force 可重写）`)
        const hit = existing.find((p) => p.id === fixedId)
        if (hit) {
          done.push(hit)
        }
        continue
      }
      process.stdout.write(`  ${name}（${entry.works.length} 篇）立档中…`)
      const built = await buildPerson({
        copilot,
        model: options.model,
        workingDirectory: options.workingDirectory,
        name,
        dynasty: entry.dynasty,
        fixedId,
        known: entry.works,
      })
      // 已有配图不能因为重写档案而丢掉，重跑不该再花一次出图。
      const previous = existing.find((p) => p.id === built.id)
      const merged: Person =
        previous?.media.hero !== undefined
          ? { ...built, media: { ...built.media, hero: previous.media.hero } }
          : built

      const check = parsePerson(merged)
      if (!check.person) {
        throw new Error(
          `${name} 的档案未通过校验：\n${check.failures.map((f) => `  - ${f.path}: ${f.message}`).join('\n')}`,
        )
      }
      await mkdir(options.outDir, { recursive: true })
      await writeFile(
        join(options.outDir, `${check.person.id}.json`),
        `${JSON.stringify(check.person, null, 2)}\n`,
        'utf8',
      )
      console.log(
        ` 完成（${check.person.timeline.length} 个节点 / ${check.person.circle.length} 位交游）`,
      )
      done.push(check.person)
    }
  } finally {
    await copilot.stop().catch(() => undefined)
  }
  return done
}

export function resolveDirs(root: string): { worksDir: string; outDir: string } {
  return { worksDir: resolve(root, 'data/works'), outDir: resolve(root, 'data/people') }
}
