import { generate, type Difficulty, type Puzzle } from "./engine/generate";
import { nextSingleCell } from "./engine/hint";
import { TECHNIQUE_LABEL, peersOf, type AppliedTechnique } from "./engine/techniques";

type Phase =
  | { kind: "home" }
  | { kind: "loading"; difficulty: Difficulty }
  | { kind: "error"; difficulty: Difficulty; message: string }
  | { kind: "play"; play: Play };

interface History {
  values: number[];
  notes: number[];
}

interface Play {
  difficulty: Difficulty;
  puzzle: Puzzle;
  values: number[];
  notes: number[];
  givens: boolean[];
  selected: number;
  notesMode: boolean;
  undo: History[];
  hint: number | null;
  hintNote: string | null;
  complete: boolean;
  confirm: null | "new" | "back";
}

const appRoot = { el: null as HTMLElement | null };
let phase: Phase = { kind: "home" };
let requestId = 0;

export function mount(root: HTMLElement): void {
  appRoot.el = root;
  root.addEventListener("click", onClick);
  window.addEventListener("keydown", onKeydown);
  render();
}

function techniqueLabel(id: string): string {
  return TECHNIQUE_LABEL[id as AppliedTechnique] ?? id;
}

function freshPlay(difficulty: Difficulty, puzzle: Puzzle): Play {
  const values = puzzle.givens.flat();
  const firstEmpty = values.findIndex((value) => value === 0);
  return {
    difficulty,
    puzzle,
    values,
    notes: Array(81).fill(0),
    givens: values.map((value) => value !== 0),
    selected: firstEmpty === -1 ? 0 : firstEmpty,
    notesMode: false,
    undo: [],
    hint: null,
    hintNote: null,
    complete: false,
    confirm: null,
  };
}

async function startGame(difficulty: Difficulty): Promise<void> {
  const id = ++requestId;
  phase = { kind: "loading", difficulty };
  render();
  try {
    const puzzle = await generate(difficulty);
    if (id !== requestId) return;
    phase = { kind: "play", play: freshPlay(difficulty, puzzle) };
  } catch (error) {
    if (id !== requestId) return;
    const message = error instanceof Error ? error.message : "出題失敗。";
    phase = { kind: "error", difficulty, message };
  }
  render();
}

function dirty(play: Play): boolean {
  return play.values.some((value, index) => !play.givens[index] && value !== 0) || play.notes.some((note) => note !== 0);
}

function onClick(event: MouseEvent): void {
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "start") {
    const difficulty = target.dataset.difficulty;
    if (difficulty === "入門" || difficulty === "進階") void startGame(difficulty);
    return;
  }
  if (action === "retry") {
    if (phase.kind === "error") void startGame(phase.difficulty);
    return;
  }
  if (action === "back") {
    if (phase.kind === "play" && dirty(phase.play) && !phase.play.complete) {
      phase.play.confirm = "back";
      render();
      return;
    }
    requestId++;
    phase = { kind: "home" };
    render();
    return;
  }
  if (action === "new" || action === "again") {
    if (phase.kind !== "play") return;
    if (action === "new" && dirty(phase.play) && !phase.play.complete) {
      phase.play.confirm = "new";
      render();
      return;
    }
    void startGame(phase.play.difficulty);
    return;
  }
  if (action === "confirm-no") {
    if (phase.kind === "play") phase.play.confirm = null;
    render();
    return;
  }
  if (action === "confirm-yes") {
    if (phase.kind !== "play") return;
    const choice = phase.play.confirm;
    const difficulty = phase.play.difficulty;
    phase.play.confirm = null;
    if (choice === "back") {
      requestId++;
      phase = { kind: "home" };
      render();
    } else if (choice === "new") {
      void startGame(difficulty);
    }
    return;
  }
  if (phase.kind !== "play" || phase.play.complete) return;
  const play = phase.play;
  if (action === "select") {
    const index = Number(target.dataset.index);
    if (Number.isInteger(index) && index >= 0 && index < 81) {
      play.selected = index;
      play.hintNote = null;
      render();
    }
    return;
  }
  if (action === "digit") {
    inputDigit(play, Number(target.dataset.digit));
    return;
  }
  if (action === "notes") {
    play.notesMode = !play.notesMode;
    render();
    return;
  }
  if (action === "clear") {
    clearCell(play);
    return;
  }
  if (action === "undo") {
    undo(play);
    return;
  }
  if (action === "hint") {
    showHint(play);
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (phase.kind !== "play") return;
  const play = phase.play;
  if (play.confirm) {
    if (event.key === "Escape") {
      play.confirm = null;
      render();
    }
    return;
  }
  if (play.complete) return;

  if (event.key >= "1" && event.key <= "9") {
    event.preventDefault();
    inputDigit(play, Number(event.key));
    return;
  }
  if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") {
    event.preventDefault();
    clearCell(play);
    return;
  }
  if (event.key === "n" || event.key === "N") {
    event.preventDefault();
    play.notesMode = !play.notesMode;
    render();
    return;
  }
  if (event.key === "h" || event.key === "H") {
    event.preventDefault();
    showHint(play);
    return;
  }
  if (event.key === "z" || event.key === "Z") {
    event.preventDefault();
    undo(play);
    return;
  }
  if (!event.key.startsWith("Arrow")) return;
  event.preventDefault();
  const row = Math.floor(play.selected / 9);
  const col = play.selected % 9;
  let next = play.selected;
  if (event.key === "ArrowLeft" && col > 0) next -= 1;
  if (event.key === "ArrowRight" && col < 8) next += 1;
  if (event.key === "ArrowUp" && row > 0) next -= 9;
  if (event.key === "ArrowDown" && row < 8) next += 9;
  play.selected = next;
  render();
}

function pushHistory(play: Play): void {
  play.undo.push({ values: play.values.slice(), notes: play.notes.slice() });
  if (play.undo.length > 200) play.undo.shift();
}

function inputDigit(play: Play, digit: number): void {
  if (!Number.isInteger(digit) || digit < 1 || digit > 9) return;
  const index = play.selected;
  if (play.givens[index]) {
    play.hintNote = "這一格是題目數字。";
    render();
    return;
  }
  if (play.notesMode) {
    if (play.values[index] !== 0) {
      play.hintNote = "先清除數字，再寫筆記。";
      render();
      return;
    }
    const bit = 1 << digit;
    const next = play.notes[index] ^ bit;
    if (next === play.notes[index]) return;
    pushHistory(play);
    play.notes[index] = next;
    play.hint = null;
    play.hintNote = null;
    render();
    return;
  }

  if (play.values[index] === digit) {
    pushHistory(play);
    play.values[index] = 0;
  } else {
    pushHistory(play);
    play.values[index] = digit;
    play.notes[index] = 0;
    const bit = 1 << digit;
    for (const peer of peersOf(index)) play.notes[peer] &= ~bit;
  }
  play.hint = null;
  play.hintNote = null;
  play.complete = solved(play);
  render();
}

function clearCell(play: Play): void {
  const index = play.selected;
  if (play.givens[index]) {
    play.hintNote = "這一格是題目數字。";
    render();
    return;
  }
  if (play.values[index] === 0 && play.notes[index] === 0) return;
  pushHistory(play);
  play.values[index] = 0;
  play.notes[index] = 0;
  play.hint = null;
  play.hintNote = null;
  play.complete = false;
  render();
}

function undo(play: Play): void {
  const previous = play.undo.pop();
  if (!previous) return;
  play.values = previous.values;
  play.notes = previous.notes;
  play.hint = null;
  play.hintNote = null;
  play.complete = solved(play);
  render();
}

function showHint(play: Play): void {
  const index = nextSingleCell(play.values);
  if (index === null) {
    play.hint = null;
    play.hintNote = "暫時沒有唯一候選，可以用筆記先排除。";
    render();
    return;
  }
  play.hint = index;
  play.selected = index;
  play.hintNote = "提示：這一格可以用唯一候選填上。";
  render();
}

function solved(play: Play): boolean {
  const solution = play.puzzle.solution.flat();
  return play.values.every((value, index) => value === solution[index]);
}

function conflictMask(values: readonly number[]): boolean[] {
  const bad = Array<boolean>(81).fill(false);
  const mark = (cells: number[]) => {
    const where = new Map<number, number[]>();
    for (const index of cells) {
      const value = values[index];
      if (!value) continue;
      const list = where.get(value);
      if (list) list.push(index);
      else where.set(value, [index]);
    }
    for (const list of where.values()) {
      if (list.length < 2) continue;
      for (const index of list) bad[index] = true;
    }
  };
  for (let row = 0; row < 9; row++) mark(Array.from({ length: 9 }, (_, col) => row * 9 + col));
  for (let col = 0; col < 9; col++) mark(Array.from({ length: 9 }, (_, row) => row * 9 + col));
  for (let box = 0; box < 9; box++) {
    const row0 = Math.floor(box / 3) * 3;
    const col0 = (box % 3) * 3;
    const cells: number[] = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) cells.push((row0 + row) * 9 + (col0 + col));
    }
    mark(cells);
  }
  return bad;
}

function cellLabel(index: number, value: number, given: boolean): string {
  const row = Math.floor(index / 9) + 1;
  const col = (index % 9) + 1;
  if (value === 0) return `第${row}行第${col}列，空`;
  return `第${row}行第${col}列，${given ? "題目" : "填入"} ${value}`;
}

function notesHtml(mask: number): string {
  let html = '<span class="notes">';
  for (let digit = 1; digit <= 9; digit++) {
    const on = (mask & (1 << digit)) !== 0;
    html += `<i>${on ? digit : ""}</i>`;
  }
  html += "</span>";
  return html;
}

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

function boardHtml(play: Play): string {
  const conflicts = conflictMask(play.values);
  const selectedValue = play.values[play.selected];
  const peers = new Set(peersOf(play.selected));
  let html = '<div class="board" role="grid" aria-label="數獨棋盤">';
  for (let index = 0; index < 81; index++) {
    const value = play.values[index];
    const classes = ["cell"];
    if (play.givens[index]) classes.push("given");
    if (index === play.selected) classes.push("selected");
    if (conflicts[index]) classes.push("bad");
    else if (index === play.hint) classes.push("hint");
    else if (selectedValue !== 0 && value === selectedValue) classes.push("same");
    else if (peers.has(index)) classes.push("peer");
    const thickRight = (index + 1) % 9 !== 0 && (index + 1) % 3 === 0;
    const row = Math.floor(index / 9);
    const thickBottom = row % 3 === 2 && row !== 8;
    if (thickRight) classes.push("thick-r");
    if (thickBottom) classes.push("thick-b");
    const inner = value !== 0 ? String(value) : notesHtml(play.notes[index]);
    html += `<button type="button" class="${classes.join(" ")}" role="gridcell" data-action="select" data-index="${index}" aria-selected="${index === play.selected}" aria-label="${cellLabel(index, value, play.givens[index])}">${inner}</button>`;
  }
  html += "</div>";
  return html;
}

function playHtml(play: Play): string {
  const label = techniqueLabel(play.puzzle.maxTechnique);
  const status = play.hintNote ? `<p class="status" role="status">${esc(play.hintNote)}</p>` : `<p class="status quiet">最高技巧：${esc(label)}</p>`;
  const confirm =
    play.confirm === null
      ? ""
      : `<div class="confirm" role="alertdialog" aria-label="確認">
          <p>${play.confirm === "back" ? "返回並放棄這一題？" : "放棄這一題，再出一題？"}</p>
          <button type="button" data-action="confirm-yes">確定</button>
          <button type="button" data-action="confirm-no">繼續</button>
        </div>`;
  const done = play.complete
    ? `<div class="done" role="dialog" aria-labelledby="done-title">
        <h2 id="done-title">完成</h2>
        <p>最高技巧：${esc(label)}</p>
        <div class="done-actions">
          <button type="button" class="primary" data-action="again">再來一題</button>
          <button type="button" data-action="back">返回</button>
        </div>
      </div>`
    : "";
  const disabled = play.complete ? "disabled" : "";
  let digits = "";
  for (let digit = 1; digit <= 9; digit++) {
    digits += `<button type="button" data-action="digit" data-digit="${digit}" ${disabled}>${digit}</button>`;
  }
  return `<section class="play">
    <header class="top">
      <div>
        <p class="eyebrow">${esc(play.difficulty)}</p>
        <h1>${esc(label)}</h1>
      </div>
      <div class="top-actions">
        <button type="button" data-action="new">新遊戲</button>
        <button type="button" data-action="back">返回</button>
      </div>
    </header>
    ${boardHtml(play)}
    ${status}
    ${confirm}
    <div class="tools">
      <button type="button" data-action="notes" aria-pressed="${play.notesMode}" ${disabled}>筆記</button>
      <button type="button" data-action="clear" ${disabled}>清除</button>
      <button type="button" data-action="undo" ${disabled} ${play.undo.length === 0 ? "disabled" : ""}>復原</button>
      <button type="button" data-action="hint" ${disabled}>提示</button>
    </div>
    <div class="pad">${digits}</div>
    ${done}
    <p class="help">方向鍵移動 · 1–9 填入 · N 筆記 · Z 復原 · H 提示</p>
  </section>`;
}

function homeHtml(): string {
  return `<section class="home">
    <header class="mast">
      <p class="brand">Mysudok</p>
      <h1>數獨</h1>
      <p class="lede">難度由這一題需要的最高解題技巧決定。</p>
    </header>
    <div class="choices">
      <button type="button" class="choice intro" data-action="start" data-difficulty="入門">
        <span class="kicker">入門</span>
        <span class="blurb">顯式唯一、隱式唯一</span>
      </button>
      <button type="button" class="choice advanced" data-action="start" data-difficulty="進階">
        <span class="kicker">進階</span>
        <span class="blurb">數對、區塊指向、宮線排除</span>
      </button>
    </div>
    <p class="credit">題目引擎 <a href="https://github.com/mr-girff/openzeloku">openzeloku</a>（MIT）</p>
  </section>`;
}

function loadingHtml(difficulty: Difficulty): string {
  return `<section class="loading" role="status" aria-live="polite">
    <span class="spinner" aria-hidden="true"></span>
    <h1>正在出題…</h1>
    <p>${esc(difficulty)}</p>
  </section>`;
}

function errorHtml(message: string): string {
  return `<section class="error">
    <p class="brand">Mysudok</p>
    <h1>出題失敗</h1>
    <p>${esc(message)}</p>
    <div class="done-actions">
      <button type="button" class="primary" data-action="retry">再試一次</button>
      <button type="button" data-action="back">返回</button>
    </div>
  </section>`;
}

function render(): void {
  const root = appRoot.el;
  if (!root) return;
  if (phase.kind === "home") root.innerHTML = homeHtml();
  else if (phase.kind === "loading") root.innerHTML = loadingHtml(phase.difficulty);
  else if (phase.kind === "error") root.innerHTML = errorHtml(phase.message);
  else root.innerHTML = playHtml(phase.play);
}
