/**
 * Model pricing in USD per million tokens (MTok).
 *
 * Cache rates are optional; when omitted they default to the standard
 * multipliers used by Anthropic's prompt caching:
 *   cacheRead     = input * 0.1
 *   cacheWrite5m  = input * 1.25   (5-minute TTL)
 *   cacheWrite1h  = input * 2      (1-hour TTL)
 */
export interface ModelPricing {
  /** USD per 1M input tokens */
  input: number;
  /** USD per 1M output tokens */
  output: number;
  /** USD per 1M cache-read tokens (default: input * 0.1) */
  cacheRead?: number;
  /** USD per 1M cache-write tokens, 5-minute TTL (default: input * 1.25) */
  cacheWrite5m?: number;
  /** USD per 1M cache-write tokens, 1-hour TTL (default: input * 2) */
  cacheWrite1h?: number;
}

export interface ResolvedPricing extends Required<ModelPricing> {}

/**
 * Built-in pricing for current Anthropic Claude models.
 * Source: Anthropic official pricing, verified 2026-07-02.
 * Prices are USD per 1M tokens.
 *
 * Other providers' models are intentionally not hardcoded — register them
 * with `registerPricing()` so your numbers are never silently out of date.
 */
const BUILT_IN_PRICING: Record<string, ModelPricing> = {
  "claude-fable-5": { input: 10, output: 50 },
  "claude-mythos-5": { input: 10, output: 50 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

const customPricing = new Map<string, ModelPricing>();

/**
 * Register (or override) pricing for a model. Use this for OpenAI, Google,
 * or any model not in the built-in table, or to pin your negotiated rates.
 */
export function registerPricing(model: string, pricing: ModelPricing): void {
  customPricing.set(model, pricing);
}

/** Remove all custom pricing registrations. */
export function clearCustomPricing(): void {
  customPricing.clear();
}

/**
 * Normalize a model identifier so provider-prefixed and date-suffixed
 * variants resolve to the same pricing entry:
 *   "anthropic.claude-opus-4-8"      -> "claude-opus-4-8"   (Bedrock prefix)
 *   "claude-haiku-4-5-20251001"      -> "claude-haiku-4-5"  (date suffix)
 *   "claude-opus-4-5@20251101"       -> "claude-opus-4-5"   (Vertex snapshot)
 */
export function normalizeModelId(model: string): string {
  let id = model.trim();
  if (id.startsWith("anthropic.")) id = id.slice("anthropic.".length);
  id = id.replace(/@\d{8}$/, "");
  id = id.replace(/-\d{8}$/, "");
  return id;
}

/**
 * Look up pricing for a model. Checks custom registrations first (exact id,
 * then normalized id), then the built-in table. Returns undefined if unknown.
 */
export function getPricing(model: string): ResolvedPricing | undefined {
  const normalized = normalizeModelId(model);
  const pricing =
    customPricing.get(model) ??
    customPricing.get(normalized) ??
    BUILT_IN_PRICING[normalized];
  if (!pricing) return undefined;
  return {
    input: pricing.input,
    output: pricing.output,
    cacheRead: pricing.cacheRead ?? pricing.input * 0.1,
    cacheWrite5m: pricing.cacheWrite5m ?? pricing.input * 1.25,
    cacheWrite1h: pricing.cacheWrite1h ?? pricing.input * 2,
  };
}

/** List every model id that currently has pricing (built-in + custom). */
export function knownModels(): string[] {
  return [...new Set([...Object.keys(BUILT_IN_PRICING), ...customPricing.keys()])];
}
