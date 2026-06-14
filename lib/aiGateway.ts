/**
 * Metalyzi AI Gateway (frontend / TypeScript)
 * ===========================================
 *
 * Single seam for AI model calls made from the Next.js app, and the home of
 * Metalyzi's proprietary-context injection. The point is sovereignty: the
 * provider and model are chosen in ONE place (env vars), and the accumulated
 * Metalyzi intelligence is injected here — so we can swap the underlying AI
 * model without touching any calling code, and the proprietary intelligence
 * stays owned by Metusa Property Ltd regardless of which model we use.
 *
 * Mirrors the Python gateway in metusa-deal-analyzer/ai_gateway.py — both
 * runtimes resolve provider/model from the same env vars:
 *
 *     AI_PROVIDER   anthropic | openai     (default: anthropic)
 *     AI_MODEL      e.g. claude-opus-4-8   (overrides the default model)
 *     ANTHROPIC_MODEL                       (legacy alias, still honoured)
 *
 * NOTE ON MODEL: the platform's live Claude calls currently run in the Flask
 * backend (see ai_gateway.py). This gateway is the TypeScript seam the
 * intelligence layer (context builder + dashboard) is built around. Default
 * model is claude-sonnet-4-6 to match the backend's cost profile; set
 * AI_MODEL=claude-opus-4-8 for the highest-quality analysis.
 */

// ── Public interfaces ──────────────────────────────────────────────────────
export interface AIMessage {
  role: "user" | "assistant" | "system"
  content: string
}

export interface AIRequestOptions {
  model?: string
  maxTokens?: number
  temperature?: number
  systemPrompt?: string
  /** Metalyzi-specific context injected before every call. */
  context?: MetalyziContext
}

export interface AIResponse {
  content: string
  model: string
  tokensUsed: number
  cached: boolean
}

// ── Metalyzi proprietary context shapes ────────────────────────────────────
export interface AreaIntelligence {
  dealCount: number
  medianBtlYield: number | null
  medianHmoYield: number | null
  observedVoidRate: number | null
  observedSaOccupancy: number | null
  dominantStrategy: string | null
}

export interface UserInvestorProfile {
  preferredStrategies: string[]
  preferredAreas: string[]
  typicalBudgetMin: number | null
  typicalBudgetMax: number | null
  riskAppetite: string
  totalAnalyses: number
}

export interface PlatformBenchmarks {
  nationalBtlYield: number | null
  nationalHmoYield: number | null
  totalDeals: number
  positiveCashflowPct: number | null
}

export interface DealPattern {
  description: string
  frequency: number
  insight?: string
  recommendation?: string
}

export interface MetalyziContext {
  areaDeals?: AreaIntelligence
  userProfile?: UserInvestorProfile
  platformBenchmarks?: PlatformBenchmarks
  relevantPatterns?: DealPattern[]
}

const DEFAULT_MODEL = "claude-sonnet-4-6"

function resolveModel(explicit?: string): string {
  return explicit ?? process.env.AI_MODEL ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL
}

// ── Gateway ────────────────────────────────────────────────────────────────
class MetalyziAIGateway {
  private provider: string

  constructor() {
    this.provider = (process.env.AI_PROVIDER ?? "anthropic").toLowerCase()
  }

  async complete(
    messages: AIMessage[],
    options: AIRequestOptions = {},
  ): Promise<AIResponse> {
    // Inject Metalyzi proprietary context before sending to the model.
    const enrichedMessages = await this.injectContext(messages, options.context)

    // Log the call for the learning pipeline.
    const callId = await this.logCall(enrichedMessages, options)

    let response: AIResponse
    switch (this.provider) {
      case "openai":
        response = await this.callOpenAI(enrichedMessages, options)
        break
      case "anthropic":
      default:
        response = await this.callAnthropic(enrichedMessages, options)
    }

    await this.logResponse(callId, response)
    return response
  }

  // ── Context injection ──────────────────────────────────────────────────
  private async injectContext(
    messages: AIMessage[],
    context?: MetalyziContext,
  ): Promise<AIMessage[]> {
    if (!context) return messages

    const contextBlocks: string[] = []

    if (context.areaDeals) {
      const a = context.areaDeals
      contextBlocks.push(
        `METALYZI AREA INTELLIGENCE (from ${a.dealCount} platform analyses):\n` +
          `Median BTL yield in area: ${a.medianBtlYield}%\n` +
          `Median HMO yield in area: ${a.medianHmoYield}%\n` +
          `Typical void rate observed: ${a.observedVoidRate}\n` +
          `SA occupancy observed: ${a.observedSaOccupancy}%\n` +
          `Most common strategy used by investors in area: ${a.dominantStrategy}`,
      )
    }

    if (context.userProfile) {
      const u = context.userProfile
      contextBlocks.push(
        `INVESTOR PROFILE (learned from their history):\n` +
          `Preferred strategies: ${u.preferredStrategies.join(", ")}\n` +
          `Typical budget range: £${u.typicalBudgetMin}–£${u.typicalBudgetMax}\n` +
          `Preferred areas: ${u.preferredAreas.join(", ")}\n` +
          `Risk appetite: ${u.riskAppetite}\n` +
          `Previous analyses: ${u.totalAnalyses} deals`,
      )
    }

    if (context.platformBenchmarks) {
      const b = context.platformBenchmarks
      contextBlocks.push(
        `METALYZI PLATFORM BENCHMARKS (from ${b.totalDeals} UK deals analysed):\n` +
          `National median BTL yield: ${b.nationalBtlYield}%\n` +
          `National median HMO yield: ${b.nationalHmoYield}%\n` +
          `Deals with positive cashflow: ${b.positiveCashflowPct}%`,
      )
    }

    if (context.relevantPatterns && context.relevantPatterns.length > 0) {
      const patterns = context.relevantPatterns
        .slice(0, 3)
        .map((p) => `- ${p.description} (observed in ${p.frequency} deals)`)
        .join("\n")
      contextBlocks.push(`METALYZI PATTERN INTELLIGENCE:\nSimilar deals on this platform:\n${patterns}`)
    }

    if (contextBlocks.length === 0) return messages

    const contextPrefix =
      `[METALYZI PROPRIETARY CONTEXT]\n${contextBlocks.join("\n\n")}\n[END METALYZI CONTEXT]\n\n`

    let injected = false
    return messages.map((m) => {
      if (!injected && m.role === "user") {
        injected = true
        return { ...m, content: contextPrefix + m.content }
      }
      return m
    })
  }

  // ── Providers ──────────────────────────────────────────────────────────
  private async callAnthropic(
    messages: AIMessage[],
    options: AIRequestOptions,
  ): Promise<AIResponse> {
    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const client = new Anthropic()

    // Anthropic's messages array only accepts user/assistant; fold any
    // system-role messages into the top-level system prompt.
    const systemFromMessages = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n")
    const system = [options.systemPrompt, systemFromMessages]
      .filter(Boolean)
      .join("\n\n")

    const response = await client.messages.create({
      model: resolveModel(options.model),
      max_tokens: options.maxTokens ?? 1500,
      ...(system ? { system } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      messages: messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    })

    const textBlock = response.content.find((b) => b.type === "text")
    return {
      content: textBlock && textBlock.type === "text" ? textBlock.text : "",
      model: response.model,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      cached: false,
    }
  }

  private async callOpenAI(
    _messages: AIMessage[],
    _options: AIRequestOptions,
  ): Promise<AIResponse> {
    // Future: OpenAI implementation — same interface, swappable via AI_PROVIDER.
    throw new Error("OpenAI provider not yet configured")
  }

  // ── Learning hooks (filled in by the intelligence pipeline) ────────────
  private async logCall(_messages: AIMessage[], _options: AIRequestOptions): Promise<string> {
    // Store call for the learning pipeline (Section 3+).
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }

  private async logResponse(_callId: string, _response: AIResponse): Promise<void> {
    // Store response for quality tracking.
  }
}

export const aiGateway = new MetalyziAIGateway()
