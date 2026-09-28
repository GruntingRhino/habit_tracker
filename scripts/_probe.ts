import { routeMessage } from "@/lib/ai/router";
import { parseWhenFrom } from "@/lib/ai/when";
const T = [
  "remind me in 6 minutes to stretch",
  "remind me at 5pm to call dad",
  "in 20 minutes remind me to check the oven",
  "remind me tomorrow morning to pay rent",
  "remind me every day at 8am to take vitamins",
  "note: garage code is 4412",
  "jot this down: book recs from Sam - Atomic Habits, Deep Work",
  "write down that my passport expires in march",
  "remember that mom's birthday is June 3",
  "save this: wifi password at the lake house is bluebird22",
];
(async () => {
  for (const t of T) {
    const s = Date.now();
    const r = await routeMessage(t);
    console.log(`${Date.now() - s}ms ${r.intent} | ${t}\n   ${r.items.map((i) => `${i.kind}/${i.area} "${i.title}" when=${i.when ?? "-"} repeat=${i.repeat ?? "-"} → ${parseWhenFrom(i.when, t)?.date.toLocaleString() ?? "-"}`).join(" ; ")}`);
  }
  process.exit(0);
})();
