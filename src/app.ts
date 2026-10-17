import {
  armDigit,
  conflictMask,
  createBoard,
  isDigitDone,
  remainingCount,
  restartBoard,
  tapCell,
  undoCell,
  type BoardInput,
} from "./board-input";
import { generate, type Difficulty, type Puzzle } from "./engine/generate";
import { nextSingleCell } from "./engine/hint";
import { TECHNIQUE_LABEL, type AppliedTechnique } from "./engine/techniques";

type Phase =
  | { kind: "home" }
  | { kind: "loading"; difficulty: Difficulty }
  | { kind: "error"; difficulty: Difficulty; message: string }
  | { kind: "play"; play: Play };

interface Play extends BoardInput {
  difficulty: Difficulty;
  puzzle: Puzzle;
  hint: number | null;
  hintNote: string | null;
  complete: boolean;
  confirm: null | "new" | "back" | "restart";
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
  const board = createBoard(puzzle.givens.flat(), puzzle.solution.flat());
  return {
    ...board,
    difficulty,
    puzzle,
    hint: null,
    hintNote: null,
    complete: false,
    confirm: null,
  };
}

function syncComplete(play: Play): void {
  const solution = play.solution;
  play.complete = play.values.every((value, index) => value === solution[index]);
  if (play.complete || (play.selectedDigit !== null && isDigitDone(play, play.selectedDigit))) {
    play.selectedDigit = null;
    play.selectedCell = null;
  }
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
  if (action === "restart") {
    if (phase.kind !== "play") return;
    if (dirty(phase.play)) {
      phase.play.confirm = "restart";
      render();
      return;
    }
    restartBoard(phase.play);
    phase.play.complete = false;
    phase.play.hint = null;
    phase.play.hintNote = null;
    render();
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
    } else if (choice === "restart") {
      restartBoard(phase.play);
      phase.play.complete = false;
      phase.play.hint = null;
      phase.play.hintNote = null;
      render();
    }
    return;
  }
  if (phase.kind !== "play" || phase.play.complete) return;
  const play = phase.play;
  if (action === "select") {
    const index = Number(target.dataset.index);
    tapCell(play, index);
    play.hint = null;
    play.hintNote = null;
    syncComplete(play);
    render();
    return;
  }
  if (action === "digit") {
    armDigit(play, Number(target.dataset.digit));
    play.hintNote = null;
    render();
    return;
  }
  if (action === "notes") {
    play.pencilMode = !play.pencilMode;
    render();
    return;
  }
  if (action === "undo") {
    undoCell(play);
    play.hint = null;
    play.hintNote = null;
    syncComplete(play);
    render();
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
    armDigit(play, Number(event.key));
    play.hintNote = null;
    render();
    return;
  }
  if (event.key === "n" || event.key === "N") {
    event.preventDefault();
    play.pencilMode = !play.pencilMode;
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
    undoCell(play);
    play.hint = null;
    play.hintNote = null;
    syncComplete(play);
    render();
  }
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
  play.selectedCell = null;
  play.hintNote = "提示：這一格可以用唯一候選填上。";
  render();
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

function confirmCopy(kind: Play["confirm"]): string {
  if (kind === "back") return "返回並放棄這一題？";
  if (kind === "restart") return "清除填寫，重開這一題？";
  return "放棄這一題，再出一題？";
}

function boardHtml(play: Play): string {
  const conflicts = conflictMask(play.values);
  const armed = play.selectedDigit;
  const highlight = armed !== null && !isDigitDone(play, armed);
  let html = '<div class="board" role="grid" aria-label="數獨棋盤">';
  for (let index = 0; index < 81; index++) {
    const value = play.values[index];
    const classes = ["cell"];
    if (play.givens[index]) classes.push("given");
    if (index === play.selectedCell) classes.push("selected");
    if (conflicts[index]) classes.push("bad");
    else if (index === play.hint) classes.push("hint");
    else if (highlight && value === armed) classes.push("same");
    const thickRight = (index + 1) % 9 !== 0 && (index + 1) % 3 === 0;
    const row = Math.floor(index / 9);
    const thickBottom = row % 3 === 2 && row !== 8;
    if (thickRight) classes.push("thick-r");
    if (thickBottom) classes.push("thick-b");
    const inner = value !== 0 ? String(value) : notesHtml(play.notes[index]);
    html += `<button type="button" class="${classes.join(" ")}" role="gridcell" data-action="select" data-index="${index}" aria-selected="${index === play.selectedCell}" aria-label="${cellLabel(index, value, play.givens[index])}">${inner}</button>`;
  }
  html += "</div>";
  return html;
}

function padHtml(play: Play): string {
  let digits = "";
  for (let digit = 1; digit <= 9; digit++) {
    const done = isDigitDone(play, digit);
    const armed = !done && play.selectedDigit === digit;
    const remain = remainingCount(play.values, digit);
    const classes = ["pad-key"];
    if (done) classes.push("done");
    if (armed) classes.push("armed");
    const disabled = play.complete || done ? "disabled" : "";
    digits += `<button type="button" class="${classes.join(" ")}" data-action="digit" data-digit="${digit}" data-remaining="${remain}" data-done="${done}" aria-pressed="${armed}" aria-label="數字 ${digit}，剩餘 ${remain}" ${disabled}><span class="pad-digit">${digit}</span><span class="pad-remain">${remain}</span></button>`;
  }
  return `<div class="pad">${digits}</div>`;
}

function playHtml(play: Play): string {
  const label = techniqueLabel(play.puzzle.maxTechnique);
  const status = play.hintNote
    ? `<p class="status" role="status">${esc(play.hintNote)}</p>`
    : `<p class="status quiet">先點數字，再點格子。最高技巧：${esc(label)}</p>`;
  const confirm =
    play.confirm === null
      ? ""
      : `<div class="confirm" role="alertdialog" aria-label="確認">
          <p>${confirmCopy(play.confirm)}</p>
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
  const locked = play.complete ? "disabled" : "";
  return `<section class="play">
    <header class="top">
      <div>
        <p class="eyebrow">${esc(play.difficulty)}</p>
        <h1>${esc(label)}</h1>
      </div>
      <div class="top-actions">
        <button type="button" data-action="new">新局</button>
        <button type="button" data-action="restart">重開</button>
        <button type="button" data-action="back">返回</button>
      </div>
    </header>
    ${boardHtml(play)}
    <div class="undo-bar">
      <button type="button" data-action="undo" ${locked} ${play.undo.length === 0 ? "disabled" : ""}>撤銷</button>
    </div>
    ${status}
    ${confirm}
    <div class="tools">
      <button type="button" data-action="notes" aria-pressed="${play.pencilMode}" ${locked}>筆記</button>
      <button type="button" data-action="hint" ${locked}>提示</button>
    </div>
    ${padHtml(play)}
    ${done}
    <p class="help">1–9 選定數字，再點空格填入。再點同一數字可取消。N 筆記 · Z 撤銷 · H 提示</p>
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
