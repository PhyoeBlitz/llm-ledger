import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CostTracker,
  clearCustomPricing,
  estimateCost,
  getPricing,
  normalizeModelId,
  normalizeUsage,
  registerPricing,
} from "../src/index.js";

afterEach(() => clearCustomPricing());

describe("normalizeModelId", () => {
  it("strips the Bedrock provider prefix", () => {
    expect(normalizeModelId("anthropic.claude-opus-4-8")).toBe("claude-opus-4-8");
  });
  it("strips a trailing date suffix", () => {
    expect(normalizeModelId("claude-haiku-4-5-20251001")).toBe("claude-haiku-4-5");
  });
  it("strips a Vertex @date snapshot", () => {
    expect(normalizeModelId("claude-opus-4-5@20251101")).toBe("claude-opus-4-5");
  });
  it("leaves plain ids alone", () => {
    expect(normalizeModelId("claude-sonnet-5")).toBe("claude-sonnet-5");
  });
});

describe("getPricing", () => {
  it("returns built-in Claude pricing with default cache rates", () => {
    const p = getPricing("claude-opus-4-8")!;
    expect(p.input).toBe(5);
    expect(p.output).toBe(25);
    expect(p.cacheRead).toBeCloseTo(0.5);
    expect(p.cacheWrite5m).toBeCloseTo(6.25);
    expect(p.cacheWrite1h).toBeCloseTo(10);
  });
  it("resolves date-suffixed and prefixed variants", () => {
    expect(getPricing("claude-haiku-4-5-20251001")?.input).toBe(1);
    expect(getPricing("anthropic.claude-opus-4-8")?.input).toBe(5);
  });
  it("returns undefined for unknown models", () => {
    expect(getPricing("gpt-nonexistent")).toBeUndefined();
  });
  it("custom registration overrides built-in", () => {
    registerPricing("claude-haiku-4-5", { input: 0.5, output: 2.5 });
    expect(getPricing("claude-haiku-4-5")?.input).toBe(0.5);
  });
});

describe("normalizeUsage", () => {
  it("handles Anthropic usage with cache fields", () => {
    const t = normalizeUsage({
      input_tokens: 100,
      output_tokens: 200,
      cache_read_input_tokens: 5000,
      cache_creation_input_tokens: 1000,
    });
    expect(t).toEqual({
      inputTokens: 100,
      outputTokens: 200,
      cacheReadTokens: 5000,
      cacheWrite5mTokens: 1000,
      cacheWrite1hTokens: 0,
    });
  });

  it("uses the Anthropic per-TTL breakdown when present", () => {
    const t = normalizeUsage({
      input_tokens: 10,
      output_tokens: 20,
      cache_creation_input_tokens: 300,
      cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 200 },
    });
    expect(t.cacheWrite5mTokens).toBe(100);
    expect(t.cacheWrite1hTokens).toBe(200);
  });

  it("handles OpenAI usage and subtracts cached tokens from prompt_tokens", () => {
    const t = normalizeUsage({
      prompt_tokens: 1000,
      completion_tokens: 50,
      prompt_tokens_details: { cached_tokens: 800 },
    });
    expect(t.inputTokens).toBe(200);
    expect(t.cacheReadTokens).toBe(800);
    expect(t.outputTokens).toBe(50);
  });

  it("passes through the neutral shape", () => {
    const t = normalizeUsage({ inputTokens: 1, outputTokens: 2 });
    expect(t.inputTokens).toBe(1);
    expect(t.cacheReadTokens).toBe(0);
  });

  it("throws on unrecognized shapes", () => {
    expect(() => normalizeUsage({ foo: 1 })).toThrow(/unrecognized usage shape/);
    expect(() => normalizeUsage(null)).toThrow(TypeError);
  });
});

describe("estimateCost", () => {
  it("computes input + output cost", () => {
    // 1M input @ $5 + 1M output @ $25 = $30
    const cost = estimateCost("claude-opus-4-8", {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(30);
  });

  it("applies cache read and write rates", () => {
    // opus 4.8: read = $0.5/MTok, write5m = $6.25/MTok
    const cost = estimateCost("claude-opus-4-8", {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(0.5 + 6.25);
  });

  it("throws for unknown models with a helpful message", () => {
    expect(() =>
      estimateCost("mystery-model", { input_tokens: 1, output_tokens: 1 }),
    ).toThrow(/registerPricing/);
  });
});

describe("CostTracker", () => {
  it("tracks a raw Anthropic-shaped response", () => {
    const tracker = new CostTracker();
    const record = tracker.track({
      model: "claude-sonnet-5",
      usage: { input_tokens: 2000, output_tokens: 1000 },
    });
    // 2000 * $3/M + 1000 * $15/M = 0.006 + 0.015
    expect(record.cost).toBeCloseTo(0.021);
    expect(tracker.totalCost).toBeCloseTo(0.021);
    expect(tracker.requestCount).toBe(1);
  });

  it("accumulates per-model summaries", () => {
    const tracker = new CostTracker();
    tracker.record("claude-haiku-4-5", { input_tokens: 100, output_tokens: 100 });
    tracker.record("claude-haiku-4-5", { input_tokens: 100, output_tokens: 100 });
    tracker.record("claude-opus-4-8", { input_tokens: 100, output_tokens: 100 });
    const summary = tracker.byModel();
    expect(summary["claude-haiku-4-5"]?.requests).toBe(2);
    expect(summary["claude-opus-4-8"]?.requests).toBe(1);
    expect(summary["claude-haiku-4-5"]?.inputTokens).toBe(200);
  });

  it("groups by tag", () => {
    const tracker = new CostTracker();
    tracker.record("claude-haiku-4-5", { input_tokens: 10, output_tokens: 10 }, "chat");
    tracker.record("claude-haiku-4-5", { input_tokens: 10, output_tokens: 10 });
    const tags = tracker.byTag();
    expect(tags["chat"]?.requests).toBe(1);
    expect(tags["untagged"]?.requests).toBe(1);
  });

  it("reports cache savings", () => {
    const tracker = new CostTracker();
    tracker.record("claude-opus-4-8", {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 1_000_000,
    });
    // saved (5 - 0.5) = $4.50 per MTok read from cache
    expect(tracker.totalCacheSavings).toBeCloseTo(4.5);
  });

  it("fires the budget callback exactly once", () => {
    const onBudgetExceeded = vi.fn();
    const tracker = new CostTracker({ budgetUSD: 0.01, onBudgetExceeded });
    tracker.record("claude-opus-4-8", { input_tokens: 10_000, output_tokens: 10_000 });
    tracker.record("claude-opus-4-8", { input_tokens: 10_000, output_tokens: 10_000 });
    expect(tracker.overBudget).toBe(true);
    expect(onBudgetExceeded).toHaveBeenCalledTimes(1);
  });

  it("throws on unknown models by default, records zero when configured", () => {
    const strict = new CostTracker();
    expect(() =>
      strict.record("mystery-model", { input_tokens: 1, output_tokens: 1 }),
    ).toThrow(/no pricing/);

    const lax = new CostTracker({ onUnknownModel: "zero" });
    const record = lax.record("mystery-model", { input_tokens: 1, output_tokens: 1 });
    expect(record.cost).toBe(0);
    expect(lax.requestCount).toBe(1);
  });

  it("track() uses an explicit model over response.model and errors without either", () => {
    const tracker = new CostTracker();
    const record = tracker.track(
      { usage: { input_tokens: 100, output_tokens: 100 } },
      { model: "claude-haiku-4-5" },
    );
    expect(record.model).toBe("claude-haiku-4-5");
    expect(() =>
      tracker.track({ usage: { input_tokens: 1, output_tokens: 1 } }),
    ).toThrow(/no \.model/);
  });

  it("resets cleanly", () => {
    const tracker = new CostTracker();
    tracker.record("claude-haiku-4-5", { input_tokens: 1, output_tokens: 1 });
    tracker.reset();
    expect(tracker.requestCount).toBe(0);
    expect(tracker.totalCost).toBe(0);
  });
});
