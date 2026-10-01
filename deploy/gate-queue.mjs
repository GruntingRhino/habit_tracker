// The line in front of the model (2 CPU cores: one generation at a time).
//
// Order: chat ("interactive") before scheduled jobs ("normal") before the background brain;
// within a class, whoever was served least recently goes next (so two people take turns),
// then first come first served. Waiting requests are told their position as it changes.

const RANK = { interactive: 0, normal: 1, background: 2 };

export class FairQueue {
  constructor({ concurrency = 1 } = {}) {
    this.concurrency = concurrency;
    this.running = 0;
    this.waiting = [];
    this.served = new Map(); // user → turn number when last served
    this.turn = 0;
    this.seq = 0;
  }

  order() {
    const last = (u) => this.served.get(u) ?? 0;
    return [...this.waiting].sort((a, b) => a.rank - b.rank || last(a.user) - last(b.user) || a.seq - b.seq);
  }

  /** Queue a job. `start(done)` runs when it's its turn; call done() when finished. Returns cancel(). */
  enqueue({ user = "anon", priority = "interactive", start, onPosition }) {
    const entry = { user, rank: RANK[priority] ?? 0, seq: ++this.seq, start, onPosition, lastPos: 0, cancelled: false };
    this.waiting.push(entry);
    this.pump();
    return () => {
      if (entry.cancelled) return;
      entry.cancelled = true;
      const i = this.waiting.indexOf(entry);
      if (i !== -1) {
        this.waiting.splice(i, 1);
        this.notify();
      }
    };
  }

  pump() {
    while (this.running < this.concurrency && this.waiting.length) {
      const next = this.order()[0];
      this.waiting.splice(this.waiting.indexOf(next), 1);
      this.running++;
      // Background work doesn't use up anyone's turn.
      if (next.rank < RANK.background) this.served.set(next.user, ++this.turn);
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        this.running--;
        this.pump();
      };
      try {
        next.start(done);
      } catch {
        done();
      }
    }
    this.notify();
  }

  notify() {
    this.order().forEach((e, i) => {
      if (e.lastPos !== i + 1) {
        e.lastPos = i + 1;
        try {
          e.onPosition?.(i + 1);
        } catch {
          // a client that went away
        }
      }
    });
  }

  get length() {
    return this.waiting.length;
  }
}
