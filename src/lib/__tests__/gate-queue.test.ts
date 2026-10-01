import { describe, expect, it } from "vitest";
import { FairQueue } from "../../../deploy/gate-queue.mjs";

function harness() {
  const q = new FairQueue({ concurrency: 1 });
  const order: string[] = [];
  const positions: Record<string, number[]> = {};
  const dones: Record<string, () => void> = {};
  const add = (name: string, user: string, priority = "interactive") =>
    q.enqueue({ user, priority, start: (done: () => void) => { order.push(name); dones[name] = done; }, onPosition: (p: number) => (positions[name] ??= []).push(p) });
  return { q, order, positions, dones, add };
}

describe("model queue", () => {
  it("one at a time, chat before scheduled jobs before background", () => {
    const h = harness();
    h.add("bg1", "abhay", "background");
    h.add("job", "abhay", "normal");
    h.add("chat", "friend", "interactive");
    expect(h.order).toEqual(["bg1"]);
    h.dones.bg1();
    expect(h.order).toEqual(["bg1", "chat"]);
    h.dones.chat();
    expect(h.order).toEqual(["bg1", "chat", "job"]);
  });

  it("two people take turns instead of one hogging the line", () => {
    const h = harness();
    h.add("a1", "abhay");
    h.add("a2", "abhay");
    h.add("a3", "abhay");
    h.add("f1", "friend");
    h.dones.a1();
    expect(h.order).toEqual(["a1", "f1"]);
    h.dones.f1();
    h.dones.a2?.();
    expect(h.order.slice(0, 3)).toEqual(["a1", "f1", "a2"]);
  });

  it("tells waiting requests their position as it changes", () => {
    const h = harness();
    h.add("a1", "abhay");
    h.add("f1", "friend");
    h.add("f2", "friend");
    expect(h.positions.f1).toEqual([1]);
    expect(h.positions.f2).toEqual([2]);
    h.dones.a1();
    expect(h.positions.f2).toEqual([2, 1]);
  });

  it("a request that gives up leaves the line", () => {
    const h = harness();
    h.add("a1", "abhay");
    const cancel = h.add("f1", "friend");
    h.add("f2", "friend");
    cancel();
    h.dones.a1();
    expect(h.order).toEqual(["a1", "f2"]);
  });
});

describe("background work", () => {
  it("doesn't count as anyone's turn", () => {
    const h = harness();
    h.add("bg", "abhay", "background");
    h.add("mine", "abhay");
    h.add("theirs", "friend");
    h.dones.bg();
    expect(h.order).toEqual(["bg", "mine"]);
  });
});
