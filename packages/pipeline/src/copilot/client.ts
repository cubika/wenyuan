import {
  CopilotClient,
  defineTool,
  ToolSet,
  type ModelInfo,
  type SessionConfig,
  type Tool,
} from '@github/copilot-sdk'
import type { z } from 'zod'

/**
 * 所有 `@github/copilot-sdk` 调用只能出现在本文件。
 * 该 SDK 的文档与实际类型不一致（文档写 `defineTool({ name })`，实际是
 * `defineTool(name, {})`），把调用面收敛在这里，版本升级只改这一处。
 */

export type WenyuanTool = Tool<unknown>

export interface ToolSpec<TArgs> {
  name: string
  description: string
  parameters: z.ZodType<TArgs>
  handler: (args: TArgs) => Promise<unknown> | unknown
}

export function wenyuanTool<TArgs>(spec: ToolSpec<TArgs>): WenyuanTool {
  const tool = defineTool<TArgs>(spec.name, {
    description: spec.description,
    // Zod v4 的 schema 自带 toJSONSchema()，正是 SDK 的 ZodSchema 接口探测的鸭子类型。
    parameters: spec.parameters as unknown as Record<string, unknown>,
    handler: (args) => spec.handler(args),
    // 进程内自有工具，没有用户可询问。
    skipPermission: true,
    defer: 'never',
  })
  return tool as unknown as WenyuanTool
}

export interface RunOptions {
  model: string | undefined
  systemMessage: string
  tools: WenyuanTool[]
  workingDirectory: string
  timeoutMs: number
}

export class Copilot {
  readonly #client: CopilotClient
  #started = false
  #startPromise: Promise<void> | null = null
  #models: ModelInfo[] | null = null

  constructor(workingDirectory: string, baseDirectory: string) {
    this.#client = new CopilotClient({
      mode: 'empty',
      workingDirectory,
      baseDirectory,
      useLoggedInUser: true,
      logLevel: 'warning',
    })
  }

  async start(): Promise<void> {
    if (this.#started) {
      return
    }
    this.#startPromise ??= this.#client.start().then(() => {
      this.#started = true
    })
    try {
      await this.#startPromise
    } finally {
      if (!this.#started) {
        this.#startPromise = null
      }
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    await this.start()
    this.#models ??= await this.#client.listModels()
    return this.#models
  }

  async resolveModel(preferred: string | undefined): Promise<ModelInfo> {
    const models = await this.listModels()
    const exact = preferred ? models.find((model) => model.id === preferred) : undefined
    if (exact) {
      return exact
    }
    const fallback = models[0]
    if (!fallback) {
      throw new Error('没有可用的 Copilot 模型。先跑一次 `copilot` 登录。')
    }
    return fallback
  }

  /**
   * 跑一轮对话，等 session 空闲才返回 —— 模型需要多轮工具调用才交付结果，
   * 不能收到第一条消息就结束。
   */
  async run(options: RunOptions, prompt: string): Promise<string> {
    await this.start()
    const model = await this.resolveModel(options.model)

    const config: SessionConfig = {
      clientName: 'wenyuan',
      model: model.id,
      streaming: false,
      workingDirectory: options.workingDirectory,
      tools: options.tools,
      // mode: 'empty' 要求显式开启工具。我们的工具是这个会话唯一的能力：
      // 没有 shell、没有文件系统、没有内置工具。
      availableTools: new ToolSet().addCustom('*').toArray(),
      systemMessage: { mode: 'append', content: options.systemMessage },
      infiniteSessions: { enabled: false },
    }

    const session = await this.#client.createSession(config)
    const unsubscribers: Array<() => void> = []
    let finalText = ''
    let settled = false

    try {
      return await new Promise<string>((resolve, reject) => {
        const finish = (fn: () => void): void => {
          if (settled) {
            return
          }
          settled = true
          for (const unsubscribe of unsubscribers) {
            unsubscribe()
          }
          clearTimeout(timer)
          fn()
        }

        const timer = setTimeout(() => {
          void session.abort().catch(() => undefined)
          finish(() =>
            reject(new Error(`Copilot 运行超过 ${Math.round(options.timeoutMs / 1000)}s`)),
          )
        }, options.timeoutMs)

        unsubscribers.push(
          session.on('assistant.message', (event) => {
            finalText = event.data.content
          }),
          session.on('session.idle', () => {
            finish(() => resolve(finalText))
          }),
          session.on('session.error', (event) => {
            finish(() => reject(new Error(event.data.message)))
          }),
        )

        void session.send({ prompt }).catch((error: unknown) => {
          finish(() => reject(error instanceof Error ? error : new Error(String(error))))
        })
      })
    } finally {
      await session.disconnect().catch(() => undefined)
    }
  }

  async stop(): Promise<void> {
    if (!this.#started) {
      return
    }
    await this.#client.stop()
    this.#started = false
    this.#startPromise = null
  }
}
