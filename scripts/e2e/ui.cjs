/* eslint-disable */
// Browser tests for LiveImproved against a local server on a seeded test DB.
// Usage: APP_URL=http://127.0.0.1:3101 CHROME=<chromium> PLAYWRIGHT_CORE=<path to playwright-core> node scripts/e2e/ui.cjs
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const fs = require("fs");

const BASE = process.env.APP_URL || "http://127.0.0.1:3101";
const SHOTS = process.env.SHOTS || __dirname + "/shots";
fs.mkdirSync(SHOTS, { recursive: true });
const PAGES = ["/chat", "/todos", "/habits", "/meals", "/entry", "/entry?tab=notes", "/settings"];
const REDIRECTS = [["/projects", /\/todos/], ["/notes", /\/entry\?tab=notes/], ["/weights", /\/habits/]];
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
        const navItems = await page.locator(mobile ? "nav.fixed a" : "aside nav a").count();
        if (navItems !== 5) throw new Error(`expected 5 nav items, saw ${navItems}`);
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
    await page.goto(BASE + "/todos", { waitUntil: "networkidle" });
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

  // 3. Habits: add, check off.
  await test("habits: add a habit and check it off", async () => {
    await page.goto(BASE + "/habits", { waitUntil: "networkidle" });
    const box = page.getByPlaceholder("Add a habit");
    await box.fill("Drink water");
    await box.press("Enter");
    await page.getByText("Drink water").waitFor();
    await page.getByRole("button", { name: "Done: Drink water" }).click();
    await page.getByRole("button", { name: "Undo Drink water" }).waitFor({ timeout: 10000 });
    if (await page.getByText(/Browse Library/).count()) throw new Error("library still shown");
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

  // 4. Journal: notes tab.
  await test("journal: add a note in the Notes tab", async () => {
    await page.goto(BASE + "/entry", { waitUntil: "networkidle" });
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
    await page.getByRole("button", { name: "500 ml" }).click();
    await page.getByText(/^95 kcal/).waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByText(/95 kcal · P/).waitFor({ timeout: 10000 });
  });
  await test("food: nutrient column shows micros and targets", async () => {
    await page.waitForFunction(() => [...document.querySelectorAll("aside li")].some((li) => li.innerText.replace(/\s/g, "").includes("Potassium1,250/3,000mg")), null, { timeout: 10000 });
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
    await page.getByRole("button", { name: "500 ml" }).click();
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
