/** Provider-neutral token usage for a single request. */
export interface TokenUsage {
  /** Uncached input tokens billed at the full input rate */
  inputTokens: number;
  /** Output tokens */
  outputTokens: number;
  /** Tokens served from the prompt cache */
  cacheReadTokens: number;
  /** Tokens written to the cache with the default (5-minute) TTL */
  cacheWrite5mTokens: number;
  /** Tokens written to the cache with the 1-hour TTL */
  cacheWrite1hTokens: number;
}

/** Anthropic Messages API `usage` object (snake_case wire shape). */
interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number | null;
    ephemeral_1h_input_tokens?: number | null;
  } | null;
}

/** OpenAI Chat Completions / Responses API `usage` object. */
interface OpenAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number | null } | null;
  input_tokens_details?: { cached_tokens?: number | null } | null;
}

/** Anything with a `.usage` and optionally a `.model` — a raw API response. */
export interface UsageBearer {
  model?: string;
  usage?: unknown;
}

function isAnthropicUsage(u: Record<string, unknown>): u is AnthropicUsage & Record<string, unknown> {
  return typeof u["input_tokens"] === "number" && typeof u["output_tokens"] === "number"
    && !("prompt_tokens" in u) && !("input_tokens_details" in u);
}

function isOpenAIUsage(u: Record<string, unknown>): u is OpenAIUsage & Record<string, unknown> {
  return typeof u["prompt_tokens"] === "number" || "prompt_tokens_details" in u
    || "input_tokens_details" in u;
}

const EMPTY: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWrite5mTokens: 0,
  cacheWrite1hTokens: 0,
};

/**
 * Convert a raw provider `usage` object (or an already-neutral TokenUsage)
 * into the provider-neutral shape.
 *
 * - Anthropic: `input_tokens` already excludes cached tokens; cache fields
 *   map directly. `cache_creation_input_tokens` without a TTL breakdown is
 *   treated as a 5-minute-TTL write.
 * - OpenAI: `prompt_tokens` INCLUDES cached tokens, so cached tokens are
 *   subtracted out of the full-rate input count.
 *
 * Throws if the shape is not recognized.
 */
export function normalizeUsage(raw: unknown): TokenUsage {
  if (raw == null || typeof raw !== "object") {
    throw new TypeError("token-ledger: usage must be an object, got " + typeof raw);
  }
  const u = raw as Record<string, unknown>;

  // Already-neutral shape (camelCase) — pass through with defaults.
  if (typeof u["inputTokens"] === "number" && typeof u["outputTokens"] === "number") {
    const t = u as Partial<TokenUsage> & { inputTokens: number; outputTokens: number };
    return { ...EMPTY, ...pickDefined(t) };
  }

  if (isAnthropicUsage(u)) {
    const breakdown = u.cache_creation ?? undefined;
    const write5m = breakdown?.ephemeral_5m_input_tokens;
    const write1h = breakdown?.ephemeral_1h_input_tokens;
    const totalWrites = u.cache_creation_input_tokens ?? 0;
    const hasBreakdown = typeof write5m === "number" || typeof write1h === "number";
    return {
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheWrite5mTokens: hasBreakdown ? (write5m ?? 0) : totalWrites,
      cacheWrite1hTokens: hasBreakdown ? (write1h ?? 0) : 0,
    };
  }

  if (isOpenAIUsage(u)) {
    const o = u as OpenAIUsage;
    const promptTokens = o.prompt_tokens ?? o.input_tokens ?? 0;
    const completionTokens = o.completion_tokens ?? o.output_tokens ?? 0;
    const cached =
      o.prompt_tokens_details?.cached_tokens ??
      o.input_tokens_details?.cached_tokens ??
      0;
    return {
      inputTokens: Math.max(0, promptTokens - cached),
      outputTokens: completionTokens,
      cacheReadTokens: cached,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
    };
  }

  throw new TypeError(
    "token-ledger: unrecognized usage shape. Expected Anthropic ({input_tokens, output_tokens}), " +
    "OpenAI ({prompt_tokens, completion_tokens}), or neutral ({inputTokens, outputTokens}). " +
    "Got keys: " + Object.keys(u).join(", "),
  );
}

function pickDefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}
