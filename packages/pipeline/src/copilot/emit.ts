import { z } from 'zod'
import type { ValidationFailure } from '@wenyuan/schema'
import { formatIssues } from '@wenyuan/schema'
import { Copilot, wenyuanTool } from './client.ts'

export interface EmitOutcome<T> {
  value: T
  attempts: number
}

export interface EmitRequest<T> {
  copilot: Copilot
  model: string | undefined
  systemMessage: string
  prompt: string
  toolName: string
  toolDescription: string
  schema: z.ZodType<T>
  /** Zod 之外的跨字段校验，返回空数组表示通过。 */
  extraChecks?: (value: T) => ValidationFailure[]
  workingDirectory: string
  timeoutMs: number
  maxAttempts: number
}

function renderFailures(failures: ValidationFailure[]): string {
  return failures.map((f) => `- ${f.path}: ${f.message}`).join('\n')
}

/**
 * 模型只能通过工具交付结果，绝不解析自由文本 JSON。
 *
 * 校验放在工具 handler 里：不合格就把逐条错误当作**工具返回值**还给模型，
 * 模型在同一个会话里立刻重调工具修正 —— 比丢弃整轮重来省得多，
 * 也不用把上下文重新喂一遍。
 */
export async function runWithEmit<T>(request: EmitRequest<T>): Promise<EmitOutcome<T>> {
  let accepted: T | null = null
  let attempts = 0

  const emit = wenyuanTool<{ payload: unknown }>({
    name: request.toolName,
    description: request.toolDescription,
    parameters: z.object({
      payload: request.schema as unknown as z.ZodType<unknown>,
    }) as unknown as z.ZodType<{ payload: unknown }>,
    handler: (args) => {
      attempts += 1
      const parsed = request.schema.safeParse(args.payload)
      if (!parsed.success) {
        return {
          ok: false,
          message: '交付未通过校验，请修正后重新调用本工具。逐条问题如下：',
          errors: renderFailures(formatIssues(parsed.error)),
        }
      }
      const extra = request.extraChecks?.(parsed.data) ?? []
      if (extra.length > 0) {
        return {
          ok: false,
          message: '结构合法但内容有问题，请修正后重新调用本工具。逐条问题如下：',
          errors: renderFailures(extra),
        }
      }
      accepted = parsed.data
      return { ok: true, message: '已接受，无需再次调用。' }
    },
  })

  await request.copilot.run(
    {
      model: request.model,
      systemMessage: request.systemMessage,
      tools: [emit],
      workingDirectory: request.workingDirectory,
      timeoutMs: request.timeoutMs,
    },
    request.prompt,
  )

  if (accepted === null) {
    throw new Error(
      `模型未通过 ${request.toolName} 交付合格结果（共尝试 ${attempts} 次）。`,
    )
  }
  if (attempts > request.maxAttempts) {
    console.warn(`  ! ${request.toolName} 修正了 ${attempts - 1} 次才通过`)
  }
  return { value: accepted, attempts }
}
