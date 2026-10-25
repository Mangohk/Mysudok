import assert from "node:assert/strict";
import test from "node:test";
import { mount, phaseFromStorage } from "../src/app.ts";
import { IN_PROGRESS_DEBOUNCE_MS, IN_PROGRESS_KEY } from "../src/persist.ts";

/**
 * Real click path through `mount`: 返回 must drop `mysudok.inProgress`
 * immediately, including a save that is still waiting on the debounce.
 */

const memory = new Map<string, string>();
const pagehide: Array<() => void> = [];
const visibility: Array<() => void> = [];

globalThis.localStorage = {
  getItem: (key: string) => (memory.has(key) ? memory.get(key)! : null),
  setItem: (key: string, value: string) => {
    memory.set(key, String(value));
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
  clear: () => {
    memory.clear();
  },
  key: (index: number) => [...memory.keys()][index] ?? null,
  get length() {
    return memory.size;
  },
} as Storage;

globalThis.window = {
  addEventListener(type: string, fn: EventListener) {
    if (type === "pagehide") pagehide.push(fn as () => void);
  },
  removeEventListener() {},
  dispatchEvent() {
    return true;
  },
} as unknown as Window & typeof globalThis;

globalThis.document = {
  visibilityState: "visible",
  addEventListener(type: string, fn: EventListener) {
    if (type === "visibilitychange") visibility.push(fn as () => void);
  },
  removeEventListener() {},
} as unknown as Document;

interface ClickRoot {
  innerHTML: string;
  addEventListener(type: string, fn: (event: { target: unknown; clientX: number; clientY: number }) => void): void;
  querySelector(): null;
  click(action: string, dataset?: Record<string, string>): void;
}

function createRoot(): ClickRoot {
  const clicks: Array<(event: { target: unknown; clientX: number; clientY: number }) => void> = [];
  return {
    innerHTML: "",
    addEventListener(type, fn) {
      if (type === "click") clicks.push(fn);
    },
    querySelector() {
      return null;
    },
    click(action, dataset = {}) {
      const target = {
        dataset: { action, ...dataset },
        closest() {
          return this;
        },
      };
      for (const fn of clicks) fn({ target, clientX: 12, clientY: 24 });
    },
  };
}

function saved(): string | null {
  return localStorage.getItem(IN_PROGRESS_KEY);
}

function reloadOffersContinue(): boolean {
  return phaseFromStorage(localStorage).kind === "resume";
}

async function settle(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPlay(root: ClickRoot): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!root.innerHTML.includes('data-action="back"') || root.innerHTML.includes("正在出題")) {
    if (Date.now() > deadline) throw new Error(`play did not start\n${root.innerHTML.slice(0, 300)}`);
    await settle(15);
  }
}

function emptyCellIndex(html: string): number {
  const match = html.match(/data-action="select" data-index="(\d+)" aria-selected="(?:true|false)" aria-label="[^"]*，空"/);
  if (!match?.[1]) throw new Error("no empty cell");
  return Number(match[1]);
}

function openDigit(html: string): string {
  const match = html.match(/data-action="digit" data-digit="(\d+)" data-remaining="\d+" data-done="false"/);
  if (!match?.[1]) throw new Error("no open digit");
  return match[1];
}

async function deal(root: ClickRoot): Promise<void> {
  mount(root as unknown as HTMLElement);
  root.click("start", { difficulty: "4×4" });
  await waitForPlay(root);
  assert.equal(saved() !== null, true);
  assert.equal(reloadOffersContinue(), true);
}

function hideAndFlush(): void {
  for (const fn of pagehide) fn();
  const documentWithState = document as Document & { visibilityState: DocumentVisibilityState };
  documentWithState.visibilityState = "hidden";
  for (const fn of visibility) fn();
  documentWithState.visibilityState = "visible";
}

test("B1 dirty 返回 確定 clears the in-progress save before reload", async () => {
  memory.clear();
  const root = createRoot();
  await deal(root);

  const digit = openDigit(root.innerHTML);
  const index = emptyCellIndex(root.innerHTML);
  root.click("digit", { digit });
  root.click("select", { index: String(index) });
  assert.match(root.innerHTML, new RegExp(`填入 ${digit}`));

  root.click("back");
  assert.match(root.innerHTML, /返回並放棄這一題？/);
  assert.match(root.innerHTML, /data-action="confirm-yes">確定/);
  assert.match(root.innerHTML, /data-action="confirm-no">繼續/);
  assert.equal(saved() !== null, true);
  assert.equal(reloadOffersContinue(), true);

  root.click("confirm-no");
  assert.equal(root.innerHTML.includes("返回並放棄這一題？"), false);
  assert.match(root.innerHTML, /data-action="back">返回/);
  assert.equal(saved() !== null, true);

  root.click("back");
  assert.match(root.innerHTML, /返回並放棄這一題？/);
  root.click("confirm-yes");

  assert.match(root.innerHTML, /class="home"/);
  assert.equal(root.innerHTML.includes("有未完成的一局"), false);
  assert.equal(root.innerHTML.includes("返回並放棄這一題？"), false);
  assert.equal(saved(), null);
  hideAndFlush();
  await settle(IN_PROGRESS_DEBOUNCE_MS + 50);
  assert.equal(saved(), null);
  assert.equal(reloadOffersContinue(), false);
  assert.equal(phaseFromStorage(localStorage).kind, "home");
});

test("B2 undirty 返回 clears the opening save so reload does not offer continue", async () => {
  memory.clear();
  const root = createRoot();
  await deal(root);
  assert.equal(/aria-label="[^"]*填入 \d/.test(root.innerHTML), false);

  const row = root.innerHTML.slice(root.innerHTML.indexOf('class="top-action-row"'), root.innerHTML.indexOf('class="play-main"'));
  assert.ok(row.indexOf('data-action="restart"') < row.indexOf('data-action="new"'));
  assert.ok(row.indexOf('data-action="new"') < row.indexOf('data-action="back"'));

  root.click("back");
  assert.equal(root.innerHTML.includes("返回並放棄這一題？"), false);
  assert.match(root.innerHTML, /class="home"/);
  assert.equal(root.innerHTML.includes("有未完成的一局"), false);
  assert.equal(saved(), null);
  hideAndFlush();
  await settle(IN_PROGRESS_DEBOUNCE_MS + 50);
  assert.equal(saved(), null);
  assert.equal(reloadOffersContinue(), false);
  assert.equal(phaseFromStorage(localStorage).kind, "home");
});

test("B3 a saved game still offers continue and restores the same fill", async () => {
  memory.clear();
  const root = createRoot();
  await deal(root);
  const digit = openDigit(root.innerHTML);
  const index = emptyCellIndex(root.innerHTML);
  root.click("digit", { digit });
  root.click("select", { index: String(index) });
  await settle(IN_PROGRESS_DEBOUNCE_MS + 40);
  assert.match(saved() ?? "", new RegExp(`"values"`));
  const raw = saved();
  assert.equal(raw !== null, true);

  const reloaded = createRoot();
  mount(reloaded as unknown as HTMLElement);
  assert.match(reloaded.innerHTML, /有未完成的一局。要繼續定開新局？/);
  assert.match(reloaded.innerHTML, /data-action="resume-keep">繼續上一局/);
  assert.match(reloaded.innerHTML, /data-action="resume-drop">開新局/);
  assert.equal(saved(), raw);

  reloaded.click("resume-keep");
  assert.match(reloaded.innerHTML, new RegExp(`data-index="${index}"[^>]*aria-label="[^"]*填入 ${digit}"`));
  assert.equal(reloaded.innerHTML.includes("有未完成的一局"), false);
  assert.equal(saved(), raw);
  assert.equal(reloadOffersContinue(), true);
});
