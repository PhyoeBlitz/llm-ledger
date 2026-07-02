# llm-ledger

Zero-dependency token usage and cost tracker for LLM APIs. Feed it raw API responses from **Anthropic Claude** or **OpenAI** (or any provider via custom pricing) and get running totals, per-model breakdowns, cache savings, and budget alerts.

- **Zero runtime dependencies**, works in Node, Bun, Deno, and the browser
- **Understands raw `usage` objects** — Anthropic (`input_tokens`, cache fields) and OpenAI (`prompt_tokens`, `cached_tokens`) shapes are normalized automatically
- **Prompt-cache aware** — cache reads, 5-minute and 1-hour cache writes are priced correctly, and savings are reported
- **Budgets** — fire a callback when spend crosses a threshold
- **Tags** — attribute spend to features, users, or jobs
- **Any model** — built-in prices for current Claude models; register anything else in one line

## Install

```bash
npm install llm-ledger
```

## Quick start (Anthropic)

```ts
import Anthropic from "@anthropic-ai/sdk";
import { CostTracker } from "llm-ledger";

const client = new Anthropic();
const tracker = new CostTracker({
  budgetUSD: 5,
  onBudgetExceeded: (total, budget) =>
    console.warn(`Spend $${total.toFixed(4)} exceeded budget $${budget}`),
});

const response = await client.messages.create({
  model: "claude-opus-4-8",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello!" }],
});

tracker.track(response); // reads response.model + response.usage

console.log(tracker.totalCost);         // e.g. 0.00265 (USD)
console.log(tracker.totalCacheSavings); // USD saved by prompt caching
console.log(tracker.byModel());
```

## Quick start (OpenAI or any other provider)

Prices for non-Anthropic models are **not** hardcoded (so they can never be silently stale) — register them once with your current rates:

```ts
import { CostTracker, registerPricing } from "llm-ledger";

registerPricing("gpt-4o", { input: 2.5, output: 10 }); // your current $/MTok

const tracker = new CostTracker();
const completion = await openai.chat.completions.create({ ... });
tracker.track(completion); // prompt_tokens / cached_tokens handled automatically
```

## One-off estimates

```ts
import { estimateCost } from "llm-ledger";

estimateCost("claude-sonnet-5", { input_tokens: 2000, output_tokens: 1000 });
// => 0.021
```

## Tagging spend

```ts
tracker.track(response, { tag: "summarizer" });
tracker.record("claude-haiku-4-5", usage, "user:42");

tracker.byTag();
// { "summarizer": { requests: 1, cost: ... }, "user:42": { ... } }
```

## Built-in pricing

USD per million tokens, verified **2026-07-02** against Anthropic's published pricing. Cache rates default to Anthropic's standard multipliers (read = 0.1×, 5-min write = 1.25×, 1-hour write = 2× the input rate) and can be overridden per model.

| Model | Input | Output |
|---|---|---|
| `claude-fable-5` | $10 | $50 |
| `claude-opus-4-8` / `-4-7` / `-4-6` | $5 | $25 |
| `claude-sonnet-5` | $3 | $15 |
| `claude-sonnet-4-6` | $3 | $15 |
| `claude-haiku-4-5` | $1 | $5 |

Bedrock-prefixed (`anthropic.claude-opus-4-8`), date-suffixed (`claude-haiku-4-5-20251001`), and Vertex snapshot (`model@20251101`) ids resolve to the same entry automatically.

> **Note:** Sonnet 5 has an introductory price ($2/$10) through 2026-08-31 on the first-party API. If you're on the intro rate, override it: `registerPricing("claude-sonnet-5", { input: 2, output: 10 })`.

Override or extend anything:

```ts
registerPricing("claude-opus-4-8", { input: 4, output: 20 }); // negotiated rates
registerPricing("my-local-llama", { input: 0, output: 0 });
```

## API

| Export | Description |
|---|---|
| `CostTracker` | Accumulates records; `track()`, `record()`, `totalCost`, `totalTokens`, `totalCacheSavings`, `byModel()`, `byTag()`, `overBudget`, `toJSON()`, `reset()` |
| `estimateCost(model, usage)` | One-off USD estimate for a single request |
| `registerPricing(model, pricing)` | Add or override pricing for any model |
| `getPricing(model)` | Resolved pricing (with cache-rate defaults filled in), or `undefined` |
| `normalizeUsage(raw)` | Convert an Anthropic/OpenAI/neutral usage object to `TokenUsage` |
| `normalizeModelId(id)` | Strip provider prefixes and date suffixes |
| `knownModels()` | All model ids with pricing (built-in + custom) |

Unknown models throw by default; pass `new CostTracker({ onUnknownModel: "zero" })` to record their tokens with cost 0 instead.

## Disclaimer

Costs are **estimates** computed from published per-token prices. Your invoice is the source of truth — batch discounts, fast mode, regional pricing, and provider-side adjustments are not modeled. Always verify current prices for your account.

## Contributing

Contributions are welcome — bug fixes, new provider support, pricing updates, and docs improvements all help.

```bash
git clone https://github.com/<your-username>/llm-ledger.git
cd llm-ledger
npm install
npm test
```

Open a pull request against `main` once `npm run build` and `npm test` pass. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide, including coding conventions and how to report bugs.

## Author

Created by [phyoeblitz](https://github.com/PhyoeBlitz)

## License

[MIT](./LICENSE)
