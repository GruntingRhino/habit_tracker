/**
 * Benchmarks the local model: latency, tokens/s and routing accuracy on the golden set.
 * Usage: OLLAMA_BASE_URL=http://127.0.0.1:11434 npm run bench:llm
 */
import { chat } from "@/lib/ai/llm";
import { routeMessage } from "@/lib/ai/router";
import { GOLDEN } from "./router-golden";

async function main() {
  const t = Date.now();
  const r = await chat({ messages: [{ role: "user", content: "Say hi in 5 words." }], maxTokens: 20 });
  console.log(`raw: ${r.evalCount} tok in ${Date.now() - t}ms`);

  let intentOk = 0, kindOk = 0, areaOk = 0, itemTotal = 0;
  const times: number[] = [];
  for (const c of GOLDEN) {
    const started = Date.now();
    const res = await routeMessage(c.text);
    const ms = Date.now() - started;
    times.push(ms);
    const iOk = res.intent === c.intent;
    if (iOk) intentOk++;
    const marks: string[] = [];
    for (const [i, exp] of (c.items ?? []).entries()) {
      itemTotal++;
      const got = res.items[i];
      if (got?.kind === exp.kind) kindOk++;
      if (got?.area === exp.area) areaOk++;
      marks.push(`${got?.kind ?? "-"}/${got?.area ?? "-"}${got?.kind === exp.kind && got?.area === exp.area ? "" : ` (want ${exp.kind}/${exp.area})`}`);
    }
    console.log(`${iOk ? "✓" : "✗"} ${ms}ms ${res.intent}${iOk ? "" : ` (want ${c.intent})`} | ${c.text}\n    ${marks.join(", ")} ${JSON.stringify(res.items.map((i) => ({ t: i.title, w: i.when, p: i.priority })))}`);
  }
  times.sort((a, b) => a - b);
  console.log(`\nintent ${intentOk}/${GOLDEN.length}  kind ${kindOk}/${itemTotal}  area ${areaOk}/${itemTotal}`);
  console.log(`latency p50 ${times[Math.floor(times.length / 2)]}ms  p90 ${times[Math.floor(times.length * 0.9)]}ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
