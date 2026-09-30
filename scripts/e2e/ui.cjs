/* eslint-disable */
// Browser tests for LiveImproved against a local server on a seeded test DB.
// Usage: APP_URL=http://127.0.0.1:3101 CHROME=<chromium> PLAYWRIGHT_CORE=<path to playwright-core> node scripts/e2e/ui.cjs
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const fs = require("fs");

const BASE = process.env.APP_URL || "http://127.0.0.1:3101";
const SHOTS = process.env.SHOTS || __dirname + "/shots";
fs.mkdirSync(SHOTS, { recursive: true });
const PAGES = ["/home", "/schedule", "/chat", "/chat?tab=journal", "/chat?tab=notes", "/chat?tab=profile", "/meals", "/work", "/work?tab=habits", "/settings"];
const REDIRECTS = [["/", /\/home$/], ["/projects", /\/work/], ["/notes", /\/chat\?tab=notes/], ["/weights", /\/work\?tab=habits/], ["/todos", /\/work/], ["/habits", /\/work\?tab=habits/], ["/entry", /\/chat\?tab=journal/], ["/entry?tab=notes", /\/chat\?tab=notes/]];
const results = [];
const ok = (name) => (results.push([true, name]), console.log(`✓ ${name}`));
const bad = (name, why) => (results.push([false, name, why]), console.log(`✗ ${name}: ${why}`));

async function context(browser, mobile) {
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    isMobile: mobile,
    hasTouch: mobile,
    extraHTTPHeaders: { "Tailscale-User-Login": "e2e@test.local" },
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && page.errors.push(`console: ${m.text()}`));
  page.on("response", (r) => r.status() >= 500 && page.errors.push(`HTTP ${r.status()} ${r.url()}`));
  page.on("dialog", (d) => d.accept());
  return { ctx, page };
}

async function test(name, fn) {
  try {
    await fn();
    ok(name);
  } catch (e) {
    bad(name, e.message.split("\n")[0]);
  }
}

const lastAssistantText = (page) =>
  page.evaluate(() => {
    const blocks = [...document.querySelectorAll(".max-w-\\[92\\%\\]")];
    return blocks.length ? blocks[blocks.length - 1].innerText : "";
  });

async function send(page, text, { timeout = 240000 } = {}) {
  const box = page.getByPlaceholder(/Message|Tap an answer/);
  await box.fill(text);
  const before = await page.locator(".max-w-\\[92\\%\\]").count();
  await box.press("Enter");
  await page.waitForFunction(
    (n) => document.querySelectorAll(".max-w-\\[92\\%\\]").length > n && !document.body.innerText.includes("Thinking…") && !document.querySelector(".animate-pulse.align-text-bottom"),
    before,
    { timeout }
  );
  await page.waitForTimeout(300);
  return lastAssistantText(page);
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME });

  // 1. Every page renders cleanly and compactly on desktop and phone; old URLs redirect.
  for (const mobile of [false, true]) {
    const { ctx, page } = await context(browser, mobile);
    for (const path of PAGES) {
      await test(`${mobile ? "phone" : "desktop"} ${path}`, async () => {
        page.errors = [];
        const res = await page.goto(BASE + path, { waitUntil: "networkidle" });
        if (!res || res.status() >= 400) throw new Error(`status ${res && res.status()}`);
        await page.waitForTimeout(400);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 1) throw new Error(`horizontal overflow ${overflow}px`);
        await page.getByRole("button", { name: "Go to page" }).click();
        const navItems = await page.getByRole("menuitem").count();
        if (navItems !== 6) throw new Error(`expected 6 menu items, saw ${navItems}`);
        await page.getByRole("button", { name: "Go to page" }).click();
        await page.screenshot({ path: `${SHOTS}/${mobile ? "m" : "d"}${path.replace(/[/?=]/g, "_")}.png`, fullPage: true });
        if (page.errors.length) throw new Error(page.errors.join(" | "));
      });
    }
    await ctx.close();
  }
  {
    const { ctx, page } = await context(browser, false);
    for (const [from, to] of REDIRECTS) {
      await test(`redirect ${from}`, async () => {
        await page.goto(BASE + from, { waitUntil: "networkidle" });
        if (!to.test(page.url())) throw new Error(`landed on ${page.url()}`);
      });
    }
    await ctx.close();
  }

  const { ctx, page } = await context(browser, false);

  // 2. Tasks: projects expand in place.
  await test("tasks: expand a project and check off a step", async () => {
    await page.goto(BASE + "/work", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Finish thesis/ }).click();
    await page.getByText("Write chapter 2").waitFor();
    await page.getByRole("button", { name: "Complete task" }).first().click();
    await page.waitForTimeout(800);
    const count = await page.getByText("1/3").count();
    if (!count) throw new Error("project progress didn't update to 1/3");
  });
  await test("tasks: add a to-do inline", async () => {
    const box = page.getByPlaceholder(/Add a to-do/);
    await box.fill("Return library books");
    await box.press("Enter");
    await page.getByText("Return library books").waitFor();
  });

  // 2a. One list: open a to-do, give it details, use Ask AI; make a project yourself.
  await test("tasks: a to-do has description + due date, and Ask AI edits it", async () => {
    await page.goto(BASE + "/work", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Open Return library books" }).click();
    await page.getByLabel("Description").fill("Two books, at the front desk");
    await page.getByLabel("Description").blur();
    await page.getByLabel("Ask AI about this item").fill("move it to friday at 6pm and make it urgent");
    await page.getByLabel("Ask AI about this item").press("Enter");
    await page.getByText(/Due → Fri/).waitFor({ timeout: 30000 });
    await page.getByText(/Fri, \w+ \d+ 6:00 PM/).first().waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Undo" }).click();
    await page.waitForTimeout(800);
  });
  await test("tasks: New project opens it with a checklist", async () => {
    await page.getByRole("button", { name: /New project/ }).click();
    // The new-project box can be closed (it used to have no ✕).
    await page.getByRole("button", { name: "Cancel new project" }).click();
    await page.getByPlaceholder("Add a to-do").waitFor();
    await page.getByRole("button", { name: /New project/ }).click();
    const box = page.getByPlaceholder("Project name");
    await box.fill("Dinner party");
    await box.press("Enter");
    await page.getByText("Checklist").waitFor({ timeout: 10000 });
    const step = page.getByPlaceholder("Add a step").last();
    await step.fill("Buy party snacks");
    await step.press("Enter");
    await page.getByLabel("Date for Buy party snacks").waitFor({ timeout: 10000 });
  });

  // 2b. Tasks → Today: timeline, and adding to the fixed week.
  await test("schedule: timeline renders; the week form closes with ✕; a weekly block can be added", async () => {
    await page.goto(BASE + "/schedule", { waitUntil: "networkidle" });
    await page.getByText(/Wind down — no screens/).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "+ Add to your week" }).click();
    await page.getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "+ Add to your week" }).click();
    await page.getByLabel("Block name").fill("Practice");
    for (const d of ["Mon", "Wed", "Fri"]) await page.getByRole("button", { name: d, exact: true }).click(); // deselect weekdays preset
    await page.getByLabel("Start time").fill("17:00");
    await page.getByLabel("End time").fill("19:00");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByText(/Tue, Thu · 5pm–7pm/).waitFor({ timeout: 10000 });
  });
  await test("schedule: add an event with a share email, open it, delete it", async () => {
    await page.getByRole("button", { name: "Event" }).click();
    await page.getByLabel("Event title").fill("Soccer game");
    await page.getByLabel("Event start").fill("16:00");
    await page.getByLabel("Event end").fill("17:30");
    await page.getByLabel("Share with").fill("mike@example.com");
    await page.getByRole("button", { name: "Add event" }).click();
    const timeline = page.getByLabel("Day timeline");
    await timeline.getByText("Soccer game", { exact: true }).click({ timeout: 10000 });
    await page.getByText("mike@example.com").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Delete event" }).click();
    await timeline.getByText("Soccer game", { exact: true }).waitFor({ state: "detached", timeout: 10000 });
  });
  await test("home: landing page shows scores, up next and news", async () => {
    await page.goto(BASE + "/home", { waitUntil: "networkidle" });
    await page.getByText("Up next").waitFor();
    await page.getByText(/News for you/).waitFor();
    await page.getByRole("button", { name: /^Physical .*details$/ }).waitFor();
  });

  // 3. Habits: add, check off.
  await test("habits: add a habit and check it off", async () => {
    await page.goto(BASE + "/work?tab=habits", { waitUntil: "networkidle" });
    const box = page.getByPlaceholder("Add a habit");
    await box.fill("Drink water");
    await box.press("Enter");
    await page.getByText("Drink water").waitFor();
    await page.getByRole("button", { name: "Done: Drink water" }).click();
    await page.getByRole("button", { name: "Undo Drink water" }).waitFor({ timeout: 10000 });
    if (await page.getByText(/Browse Library/).count()) throw new Error("library still shown");
  });
  await test("habits: a note for today (partial progress)", async () => {
    await page.getByRole("button", { name: "Note for Drink water" }).click();
    const note = page.getByLabel("Today's note for Drink water");
    await note.fill("did 60 oz");
    await note.press("Enter");
    await page.getByText("📝 did 60 oz").waitFor({ timeout: 10000 });
  });
  await test("habits: workouts section logs a session", async () => {
    const box = page.getByPlaceholder(/New workout/);
    await box.fill("Push day");
    await box.press("Enter");
    await page.getByRole("button", { name: /Push day/ }).click();
    const ex = page.getByPlaceholder("Add an exercise");
    await ex.fill("Bench press");
    await ex.press("Enter");
    await page.getByLabel("Bench press weight").fill("185");
    await page.getByLabel("Bench press sets").fill("3");
    await page.getByLabel("Bench press reps").fill("5");
    await page.getByRole("button", { name: "Log workout" }).click();
    await page.getByText(/Bench press 185 3×5/).waitFor({ timeout: 10000 });
  });
  await test("habits: the coach shows last time → today for a logged lift", async () => {
    await page.goto(BASE + "/work?tab=habits", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Push day/ }).click();
    await page.getByText(/Last 185 × 5,5,5 →/).waitFor({ timeout: 10000 });
  });

  // 4. Journal: notes tab.
  await test("journal: prompts in the empty box, and 'plan tomorrow' makes to-dos", async () => {
    await page.goto(BASE + "/chat?tab=journal", { waitUntil: "networkidle" });
    const ph = await page.getByLabel("Journal").getAttribute("placeholder");
    if (!/Wins —/.test(ph ?? "") || !/Tomorrow —/.test(ph ?? "")) throw new Error(`placeholder: ${ph}`);
    await page.getByLabel("Plan tomorrow").fill("7pm upper workout\nFinish GoodHours QA");
    await page.getByRole("button", { name: "Add to tomorrow" }).click();
    await page.getByText(/Added 2: Upper workout · Finish GoodHours QA/).waitFor({ timeout: 10000 });
  });
  await test("journal: add a note in the Notes tab", async () => {
    await page.goto(BASE + "/chat?tab=journal", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Notes" }).click();
    const box = page.getByLabel("New note");
    await box.fill("Locker combo 12-34-56");
    await box.press("Enter");
    await page.getByText("Locker combo 12-34-56").waitFor();
  });

  // 5. Food: asks how much, nutrient column updates.
  await test("food: 'a bottle of coconut water' asks how much, chip fills it", async () => {
    await page.goto(BASE + "/meals", { waitUntil: "networkidle" });
    await page.getByLabel("Describe what you ate").fill("a bottle of coconut water");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByText("How big was the bottle of coconut water?").waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: "16.9 fl oz" }).click();
    await page.getByText(/^95 kcal/).waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByText(/95 kcal · P/).waitFor({ timeout: 10000 });
  });
  await test("food: nutrient column shows micros and targets", async () => {
    await page.waitForFunction(() => [...document.querySelectorAll("aside li")].some((li) => /Potassium1,25\d\/3,000mg/.test(li.innerText.replace(/\s/g, ""))), null, { timeout: 10000 });
    if (!(await page.locator("aside li", { hasText: "Vitamin D" }).count())) throw new Error("no vitamin D row");
  });
  await test("food: enter numbers yourself", async () => {
    await page.getByRole("button", { name: "or enter numbers yourself" }).click();
    await page.getByLabel("Meal name").fill("Protein bar");
    await page.getByLabel("Food 1", { exact: true }).fill("Protein bar");
    await page.getByLabel("Calories 1", { exact: true }).fill("200");
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByText(/200 kcal · P/).waitFor({ timeout: 10000 });
  });

  // 6. Chat: small talk streams; a meal missing an amount gets a question and chips.
  await test("chat: small talk streams a reply", async () => {
    await page.goto(BASE + "/chat", { waitUntil: "networkidle" });
    const box = page.getByPlaceholder("Message");
    await box.fill("hey how's it going");
    await box.press("Enter");
    const lengths = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 180000) {
      const text = await lastAssistantText(page);
      lengths.push(text.length);
      if (!(await page.locator(".animate-pulse.align-text-bottom").count()) && text.length && !(await page.getByText("Thinking…").count())) break;
      await page.waitForTimeout(150);
    }
    if (new Set(lengths.filter((n) => n > 0)).size < 2) throw new Error("reply did not stream");
  });
  await test("chat: coconut water gets 'how big?', the chip answer fills the meal", async () => {
    await page.getByRole("button", { name: "New chat" }).click();
    const reply = await send(page, "I had a bottle of coconut water");
    if (!/How big was the bottle of coconut water/.test(reply)) throw new Error(`reply: ${reply}`);
    await page.getByRole("button", { name: "16.9 fl oz" }).click();
    await page.getByText(/Updated: 95 kcal/).waitFor({ timeout: 60000 });
  });
  await test("chat: history, star and undo still work", async () => {
    await page.getByRole("button", { name: "Save chat" }).click();
    await page.getByRole("button", { name: "Chat history" }).click();
    await page.getByText("Saved", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Close history" }).click();
    await page.getByRole("button", { name: "New chat" }).click();
    const reply = await send(page, "remind me in 45 minutes to drink water");
    if (!/Reminder/.test(reply)) throw new Error(`reply: ${reply}`);
    await page.getByRole("button", { name: "Undo" }).last().click();
    await page.getByText("↩︎ Undone").first().waitFor({ timeout: 15000 });
  });
  // 7. Scores: real buttons, a details panel with facts, and a refresh after a change.
  await test("scores: tapping an area opens why + how to improve", async () => {
    await page.goto(BASE + "/chat", { waitUntil: "networkidle" });
    const chip = page.getByRole("button", { name: /^Physical .*details$/ });
    await chip.click();
    await page.getByRole("button", { name: "Close details" }).waitFor({ timeout: 10000 });
    const panel = await page.locator("div.rounded-xl.border.p-3").innerText();
    if (!/Stretch|Slept|Workout|training|Food|No data/.test(panel)) throw new Error(`panel: ${panel}`);
    if (!/Do your habit|Log|workout|protein/i.test(panel)) throw new Error(`no improvement tip: ${panel}`);
    if ((await chip.getAttribute("aria-expanded")) !== "true") throw new Error("chip not marked expanded");
  });
  await test("scores: a change shows Updating… and the panel refreshes with it", async () => {
    await page.getByRole("button", { name: /^Physical .*details$/ }).click(); // close
    await page.getByRole("button", { name: /^Spiritual .*details$/ }).click();
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/journal", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rightWithGod: true }) });
      window.dispatchEvent(new CustomEvent("liveimproved:changed"));
      return r.status;
    });
    if (res !== 200) throw new Error(`journal patch ${res}`);
    await page.getByText("Updating…").waitFor({ timeout: 8000 });
    await page.getByText("Marked right with God").waitFor({ timeout: 180000 });
    await page.getByText("Updating…").waitFor({ state: "detached", timeout: 30000 });
  });

  // 8. Journal → Profile: quiz answers become beliefs; "that's wrong" removes one.
  await test("profile: quiz answers show up as beliefs, and ✕ forgets one", async () => {
    await page.goto(BASE + "/chat?tab=profile", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Take the personality quiz|Retake quiz/ }).click();
    await page.getByRole("button", { name: "Watching videos" }).click();
    await page.getByRole("button", { name: "Doing it hands-on" }).click();
    await page.getByRole("button", { name: "About 30 minutes" }).click();
    await page.getByRole("button", { name: "Save answers" }).click();
    const t0 = Date.now();
    for (;;) {
      await page.goto(BASE + "/chat?tab=profile", { waitUntil: "networkidle" });
      if (await page.getByRole("button", { name: /How you learn best/ }).count()) break;
      if (Date.now() - t0 > 150000) throw new Error("quiz answers never reached the profile");
      await page.waitForTimeout(5000);
    }
    await page.getByRole("button", { name: /How you learn best/ }).click();
    const belief = page.getByText("He learns best by: watching videos, doing it hands-on.");
    await belief.waitFor();
    await belief.click();
    await page.getByText("from the quiz").waitFor();
    await page.getByRole("button", { name: /^That's wrong: He learns best by/ }).click();
    await belief.waitFor({ state: "detached", timeout: 10000 });
  });

  await test("profile: log measurements and see them", async () => {
    await page.goto(BASE + "/chat?tab=profile", { waitUntil: "networkidle" });
    const btn = page.getByRole("button", { name: /Log measurements/ });
    if (await btn.count()) {
      await btn.click();
      await page.getByLabel("waist inches").fill("29");
      await page.getByLabel("shoulders inches").fill("46");
      await page.getByRole("button", { name: "Log", exact: true }).click();
      await page.getByText(/shoulder:waist 1.59/).waitFor({ timeout: 10000 });
    } else throw new Error("no measurements button (needs body stats)");
  });

  await test("no browser errors during flows", async () => {
    const errs = page.errors.filter((e) => !/favicon/.test(e));
    if (errs.length) throw new Error(errs.slice(0, 3).join(" | "));
  });
  await ctx.close();

  await browser.close();
  const failed = results.filter((r) => !r[0]);
  console.log(`\nUI: ${results.length - failed.length}/${results.length} passed`);
  process.exit(0);
})();
