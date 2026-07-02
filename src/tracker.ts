import { getPricing } from "./pricing.js";
import { normalizeUsage, type TokenUsage, type UsageBearer } from "./normalize.js";

/** One recorded request. */
export interface CostRecord {
  model: string;
  usage: TokenUsage;
  /** Estimated cost in USD */
  cost: number;
  /** Estimated USD saved by cache reads vs. paying the full input rate */
  cacheSavings: number;
  timestamp: Date;
  /** Optional caller-supplied tag, e.g. a feature or user id */
  tag?: string;
}

export interface ModelSummary {
  requests: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface CostTrackerOptions {
  /** When total spend crosses this USD amount, `onBudgetExceeded` fires (once). */
  budgetUSD?: number;
  onBudgetExceeded?: (totalCost: number, budgetUSD: number) => void;
  /**
   * What to do when a model has no registered pricing:
   * "throw" (default) or "zero" (record the usage with cost 0).
   */
  onUnknownModel?: "throw" | "zero";
}

/** Estimate the USD cost of one request. Throws if the model is unknown. */
export function estimateCost(model: string, usage: unknown): number {
  const pricing = getPricing(model);
  if (!pricing) {
    throw new Error(
      `token-ledger: no pricing for model "${model}". ` +
      `Register it first: registerPricing("${model}", { input: <$/MTok>, output: <$/MTok> })`,
    );
  }
  const t = normalizeUsage(usage);
  return (
    t.inputTokens * pricing.input +
    t.outputTokens * pricing.output +
    t.cacheReadTokens * pricing.cacheRead +
    t.cacheWrite5mTokens * pricing.cacheWrite5m +
    t.cacheWrite1hTokens * pricing.cacheWrite1h
  ) / 1_000_000;
}

/**
 * Accumulates token usage and estimated cost across requests.
 *
 * ```ts
 * const tracker = new CostTracker({ budgetUSD: 5 });
 * const response = await client.messages.create({ ... });
 * tracker.track(response);                    // reads response.model + response.usage
 * tracker.record("claude-opus-4-8", usage);   // or record explicitly
 * console.log(tracker.totalCost, tracker.byModel());
 * ```
 */
export class CostTracker {
  readonly records: CostRecord[] = [];
  private budgetFired = false;

  constructor(private readonly options: CostTrackerOptions = {}) {}

  /**
   * Record usage from a raw API response object (Anthropic Message or
   * OpenAI completion) — the model id and usage are read off the response.
   */
  track(response: UsageBearer, opts: { model?: string; tag?: string } = {}): CostRecord {
    const model = opts.model ?? response.model;
    if (!model) {
      throw new Error(
        "token-ledger: response has no .model field; pass one explicitly: track(response, { model })",
      );
    }
    if (response.usage == null) {
      throw new Error("token-ledger: response has no .usage field");
    }
    return this.record(model, response.usage, opts.tag);
  }

  /** Record usage explicitly for a model. Accepts any supported usage shape. */
  record(model: string, usage: unknown, tag?: string): CostRecord {
    const normalized = normalizeUsage(usage);
    const pricing = getPricing(model);

    let cost = 0;
    let cacheSavings = 0;
    if (pricing) {
      cost = estimateCost(model, normalized);
      cacheSavings =
        (normalized.cacheReadTokens * (pricing.input - pricing.cacheRead)) / 1_000_000;
    } else if ((this.options.onUnknownModel ?? "throw") === "throw") {
      throw new Error(
        `token-ledger: no pricing for model "${model}". ` +
        `Register it with registerPricing(), or construct the tracker with { onUnknownModel: "zero" }`,
      );
    }

    const record: CostRecord = {
      model,
      usage: normalized,
      cost,
      cacheSavings,
      timestamp: new Date(),
      ...(tag !== undefined ? { tag } : {}),
    };
    this.records.push(record);
    this.checkBudget();
    return record;
  }

  /** Total estimated spend in USD across all recorded requests. */
  get totalCost(): number {
    return this.records.reduce((sum, r) => sum + r.cost, 0);
  }

  /** Total estimated USD saved by cache reads. */
  get totalCacheSavings(): number {
    return this.records.reduce((sum, r) => sum + r.cacheSavings, 0);
  }

  /** Total tokens (input + output + cache reads + cache writes). */
  get totalTokens(): number {
    return this.records.reduce(
      (sum, r) =>
        sum +
        r.usage.inputTokens +
        r.usage.outputTokens +
        r.usage.cacheReadTokens +
        r.usage.cacheWrite5mTokens +
        r.usage.cacheWrite1hTokens,
      0,
    );
  }

  get requestCount(): number {
    return this.records.length;
  }

  /** Whether the configured budget has been exceeded. */
  get overBudget(): boolean {
    return this.options.budgetUSD !== undefined && this.totalCost > this.options.budgetUSD;
  }

  /** Per-model breakdown of requests, cost, and tokens. */
  byModel(): Record<string, ModelSummary> {
    const out: Record<string, ModelSummary> = {};
    for (const r of this.records) {
      const entry = (out[r.model] ??= {
        requests: 0,
        cost: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });
      entry.requests += 1;
      entry.cost += r.cost;
      entry.inputTokens += r.usage.inputTokens;
      entry.outputTokens += r.usage.outputTokens;
      entry.cacheReadTokens += r.usage.cacheReadTokens;
      entry.cacheWriteTokens += r.usage.cacheWrite5mTokens + r.usage.cacheWrite1hTokens;
    }
    return out;
  }

  /** Per-tag breakdown (records without a tag are grouped under "untagged"). */
  byTag(): Record<string, ModelSummary> {
    const out: Record<string, ModelSummary> = {};
    for (const r of this.records) {
      const key = r.tag ?? "untagged";
      const entry = (out[key] ??= {
        requests: 0,
        cost: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });
      entry.requests += 1;
      entry.cost += r.cost;
      entry.inputTokens += r.usage.inputTokens;
      entry.outputTokens += r.usage.outputTokens;
      entry.cacheReadTokens += r.usage.cacheReadTokens;
      entry.cacheWriteTokens += r.usage.cacheWrite5mTokens + r.usage.cacheWrite1hTokens;
    }
    return out;
  }

  /** Plain-object snapshot, suitable for JSON.stringify or logging. */
  toJSON() {
    return {
      totalCost: this.totalCost,
      totalCacheSavings: this.totalCacheSavings,
      totalTokens: this.totalTokens,
      requestCount: this.requestCount,
      byModel: this.byModel(),
    };
  }

  /** Clear all records and re-arm the budget callback. */
  reset(): void {
    this.records.length = 0;
    this.budgetFired = false;
  }

  private checkBudget(): void {
    const { budgetUSD, onBudgetExceeded } = this.options;
    if (budgetUSD === undefined || this.budgetFired) return;
    const total = this.totalCost;
    if (total > budgetUSD) {
      this.budgetFired = true;
      onBudgetExceeded?.(total, budgetUSD);
    }
  }
}
