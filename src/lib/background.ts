/**
 * Work that should finish after the reply is sent (memory compaction, filling in meal nutrition).
 * On Vercel a function is frozen once its response ends, so request handlers register Next's
 * `after()` as the runner (see src/app/api/chat/route.ts). The Telegram worker has no runner and
 * simply lets the promise run.
 */
type Runner = (task: () => Promise<unknown>) => void;
let runner: Runner | null = null;

export function setBackgroundRunner(r: Runner) {
  runner = r;
}

export function inBackground(task: () => Promise<unknown>) {
  const safe = () => task().catch(() => undefined);
  if (runner) {
    try {
      runner(safe);
      return;
    } catch {
      // Outside a request scope: fall through and just run it.
    }
  }
  void safe();
}
