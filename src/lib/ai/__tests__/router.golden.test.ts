import { describe, it, expect } from "vitest";
import { routeMessage } from "@/lib/ai/router";
import { GOLDEN } from "../../../../scripts/router-golden";

// Runs against the live model. Enable with LIVE_LLM=1 OLLAMA_BASE_URL=http://127.0.0.1:11434
describe.skipIf(!process.env.LIVE_LLM)("router golden set (live model)", () => {
  it("routes at least 90% of intents correctly", { timeout: 20 * 60_000 }, async () => {
    let ok = 0;
    for (const c of GOLDEN) {
      const r = await routeMessage(c.text);
      if (r.intent === c.intent) ok++;
    }
    expect(ok / GOLDEN.length).toBeGreaterThanOrEqual(0.9);
  });
});
