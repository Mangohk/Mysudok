import {
  armDigit,
  clearCandidateDigits,
  conflictMask,
  createBoard,
  emptyCellCount,
  fillAllCandidates,
  isDigitDone,
  placedADigit,
  remainingCount,
  restartBoard,
  tapCell,
  undoCell,
  writeDigit,
  wrongFillIndexes,
  type BoardInput,
} from "./board-input";
import { loadPracticeBank, peekPracticeBank, type BankEntry } from "./engine/bank";
import { dealExpert } from "./engine/expert-deal";
import { generate, type Difficulty, type Puzzle } from "./engine/generate";
import {
  emptyHintView,
  hintButtonLabel,
  hintCellClasses,
  pressHint,
  techniqueTitle,
  type HintAction,
  type HintView,
} from "./engine/hint";
import { applyDealMorph } from "./engine/morph";

type Phase =
  | { kind: "home" }
  | { kind: "loading"; difficulty: Difficulty }
  | { kind: "error"; difficulty: Difficulty; message: string }
  | { kind: "play"; play: Play };

interface Play extends BoardInput {
  difficulty: Difficulty;
  /** Set when this deal came from the expert bank, so the next draw can skip it. */
  bankId: string | null;
  puzzle: Puzzle;
  hintStep: HintView["step"];
  hintIndexes: number[];
  hintTechnique: string | null;
  hintAction: HintAction | null;
  hintNote: string | null;
  candidateNote: string | null;
  checkNote: string | null;
  wrongMarks: number[] | null;
  menuOpen: boolean;
  complete: boolean;
  confirm: null | "new" | "back" | "restart" | "check";
}

const appRoot = { el: null as HTMLElement | null };
let phase: Phase = { kind: "home" };
let requestId = 0;

/** Puzzle ceiling. Kept apart from the technique named in the hint status. */
export const CEILING_LABEL = "最高技巧";

/** Digit-first coach. Hidden once the puzzle is complete. */
export const DIGIT_FIRST_COACH = "先點數字，再點格子。";

export const HOME_BLURB: Record<Difficulty, string> = {
  初級: "最後一格、剩餘格、唯一數字",
  中級: "筆記之後嘅單一、數對、三數組",
  高級: "區塊指向、X-Wing",
  專家: "Y-Wing、Swordfish",
};

/** In-play difficulty name. Shown for 專家 the same way as the other three. */
export function playEyebrowMarkup(difficulty: Difficulty): string {
  return `<p class="eyebrow" data-difficulty="${esc(difficulty)}">${esc(difficulty)}</p>`;
}

/** Status under the board. The coach line is only for an unfinished, idle game. */
export function playStatusMarkup(complete: boolean, banner: string | null): string {
  if (banner) return `<p class="status" role="status">${statusTextHtml(banner)}</p>`;
  if (complete) return "";
  return `<p class="status quiet" data-coach="digit-first">${esc(DIGIT_FIRST_COACH)}</p>`;
}

/** Title Case names that can show up in a hint sentence. Wrapped so a narrow status line can break them. */
const STATUS_TECHNIQUE_NAMES = [
  "Last Free Cell",
  "Last Remaining Cell",
  "Last Possible Number",
  "Notes In Sudoku",
  "Obvious Singles",
  "Obvious Pairs",
  "Obvious Triples",
  "Hidden Singles",
  "Hidden Pairs",
  "Hidden Triples",
  "Pointing Pairs",
  "Pointing Triples",
  "X-Wing",
  "Y-Wing",
  "Swordfish",
] as const;

function statusTextHtml(text: string): string {
  let html = esc(text);
  for (const name of STATUS_TECHNIQUE_NAMES) {
    html = html.split(name).join(`<span class="tech-name">${name}</span>`);
  }
  return html;
}

/**
 * Home list for #1–#10. Names and URLs are the locked sudoku.com table.
 * #11+ stays off this list.
 */
export const SKILL_REFERENCE: readonly { rank: number; name: string; href: string }[] = [
  { rank: 1, name: "Last free cell", href: "https://sudoku.com/sudoku-rules/last-free-cell/" },
  { rank: 2, name: "Last remaining cell", href: "https://sudoku.com/sudoku-rules/last-remaining-cell/" },
  { rank: 3, name: "Last possible number", href: "https://sudoku.com/sudoku-rules/last-possible-number/" },
  { rank: 4, name: "Notes in Sudoku", href: "https://sudoku.com/sudoku-rules/notes-in-sudoku/" },
  { rank: 5, name: "Obvious singles", href: "https://sudoku.com/sudoku-rules/obvious-singles/" },
  { rank: 6, name: "Obvious pairs", href: "https://sudoku.com/sudoku-rules/obvious-pairs/" },
  { rank: 7, name: "Obvious triples", href: "https://sudoku.com/sudoku-rules/obvious-triples/" },
  { rank: 8, name: "Hidden singles", href: "https://sudoku.com/sudoku-rules/hidden-singles/" },
  { rank: 9, name: "Hidden pairs", href: "https://sudoku.com/sudoku-rules/hidden-pairs/" },
  { rank: 10, name: "Hidden triples", href: "https://sudoku.com/sudoku-rules/hidden-triples/" },
];

/** Secondary link. The primary control on each row is the sudoku.com Reference. */
export const TECHNIQUE_MAP_HREF = "https://github.com/Mangohk/Mysudok#technique-map";

export function skillReferenceMarkup(): string {
  const items = SKILL_REFERENCE.map(
    (skill) =>
      `<li><span class="skill-rank">#${skill.rank}</span><span class="skill-name">${esc(skill.name)}</span><a href="${esc(skill.href)}" target="_blank" rel="noopener">Reference</a></li>`,
  ).join("");
  return `<section class="skills" aria-label="技巧參考"><h2>技巧</h2><ol class="skill-list">${items}</ol><p class="skill-map">GitHub technique map <a href="${esc(TECHNIQUE_MAP_HREF)}" target="_blank" rel="noopener">Technique map</a></p></section>`;
}

export function mount(root: HTMLElement): void {
  appRoot.el = root;
  root.addEventListener("click", onClick);
  window.addEventListener("keydown", onKeydown);
  render();
}

function techniqueLabel(id: string): string {
  return techniqueTitle(id);
}

function hintViewOf(play: Play): HintView {
  return {
    step: play.hintStep,
    indexes: play.hintIndexes,
    technique: play.hintTechnique,
    action: play.hintAction,
    note: play.hintNote,
  };
}

function applyHintView(play: Play, view: HintView): void {
  play.hintStep = view.step;
  play.hintIndexes = view.indexes;
  play.hintTechnique = view.technique;
  play.hintAction = view.action;
  play.hintNote = view.note;
}

function freshPlay(difficulty: Difficulty, puzzle: Puzzle, bankId: string | null = null): Play {
  const board = createBoard(puzzle.givens.flat(), puzzle.solution.flat());
  return {
    ...board,
    difficulty,
    bankId,
    puzzle,
    hintStep: 0,
    hintIndexes: [],
    hintTechnique: null,
    hintAction: null,
    hintNote: null,
    candidateNote: null,
    checkNote: null,
    wrongMarks: null,
    menuOpen: false,
    complete: false,
    confirm: null,
  };
}

function resetHint(play: Play): void {
  applyHintView(play, emptyHintView(null));
}

function clearWrong(play: Play): void {
  play.wrongMarks = null;
  play.checkNote = null;
}

function applyRestart(play: Play): void {
  restartBoard(play);
  play.complete = false;
  play.menuOpen = false;
  resetHint(play);
  play.candidateNote = null;
  clearWrong(play);
}

function syncComplete(play: Play): void {
  const solution = play.solution;
  play.complete = play.values.every((value, index) => value === solution[index]);
  if (play.complete || (play.selectedDigit !== null && isDigitDone(play, play.selectedDigit))) {
    play.selectedDigit = null;
    play.selectedCell = null;
  }
}

async function loadBankEntries(): Promise<BankEntry[] | null> {
  try {
    return peekPracticeBank() ?? (await loadPracticeBank());
  } catch {
    return null;
  }
}

async function startGame(difficulty: Difficulty, avoidId?: string | null): Promise<void> {
  const id = ++requestId;
  phase = { kind: "loading", difficulty };
  render();
  try {
    const dealt =
      difficulty === "專家"
        ? await dealExpert({
            entries: await loadBankEntries(),
            avoidId,
            regenerate: (maxAttempts) => generate("專家", undefined, { maxAttempts }),
          })
        : { puzzle: applyDealMorph(await generate(difficulty)), bankId: null as string | null };
    if (id !== requestId) return;
    phase = { kind: "play", play: freshPlay(difficulty, dealt.puzzle, dealt.bankId) };
  } catch (error) {
    if (id !== requestId) return;
    const message = error instanceof Error ? error.message : "出題失敗。";
    phase = { kind: "error", difficulty, message };
  }
  render();
}

function redraw(play: Play): void {
  void startGame(play.difficulty, play.bankId);
}

function leavePlay(): void {
  requestId++;
  phase = { kind: "home" };
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
    if (difficulty === "初級" || difficulty === "中級" || difficulty === "高級" || difficulty === "專家") {
      void startGame(difficulty);
    }
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
    if (phase.kind === "play") {
      leavePlay();
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
    redraw(phase.play);
    return;
  }
  if (action === "restart") {
    if (phase.kind !== "play") return;
    if (dirty(phase.play)) {
      phase.play.confirm = "restart";
      render();
      return;
    }
    applyRestart(phase.play);
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
    const play = phase.play;
    play.confirm = null;
    if (choice === "back") {
      leavePlay();
    } else if (choice === "new") {
      redraw(play);
    } else if (choice === "restart") {
      applyRestart(phase.play);
      render();
    } else if (choice === "check") {
      const wrong = wrongFillIndexes(phase.play);
      phase.play.wrongMarks = wrong;
      phase.play.candidateNote = null;
      phase.play.checkNote = wrong.length === 0 ? "未發現錯填。" : `已標 〔${wrong.length}〕 格唔啱 · 改完可繼續。`;
      phase.play.menuOpen = false;
      render();
    }
    return;
  }
  if (phase.kind !== "play" || phase.play.confirm) return;
  const play = phase.play;
  if (action === "menu") {
    play.menuOpen = !play.menuOpen;
    render();
    return;
  }
  play.menuOpen = false;
  if (play.complete) return;
  if (action === "select") {
    const index = Number(target.dataset.index);
    const beforeValues = play.values.slice();
    const before = play.undo.length;
    tapCell(play, index);
    if (play.undo.length !== before) {
      clearWrong(play);
      if (placedADigit(beforeValues, play.values)) resetHint(play);
    }
    syncComplete(play);
    render();
    return;
  }
  if (action === "digit") {
    const before = play.selectedDigit;
    armDigit(play, Number(target.dataset.digit));
    if (play.selectedDigit !== before) resetHint(play);
    render();
    return;
  }
  if (action === "notes") {
    play.pencilMode = !play.pencilMode;
    render();
    return;
  }
  if (action === "fill-candidates") {
    fillAllCandidates(play);
    resetHint(play);
    play.candidateNote = "已填合法候選 · 可上一步";
    render();
    return;
  }
  if (action === "undo") {
    undoCell(play);
    resetHint(play);
    play.candidateNote = null;
    clearWrong(play);
    syncComplete(play);
    render();
    return;
  }
  if (action === "hint-later") {
    resetHint(play);
    render();
    return;
  }
  if (action === "hint") {
    showHint(play);
    return;
  }
  if (action === "check-wrong") {
    play.confirm = "check";
    render();
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (phase.kind !== "play") return;
  const play = phase.play;
  if (event.key === "Escape") {
    play.confirm = null;
    play.menuOpen = false;
    render();
    return;
  }
  if (play.confirm || play.complete) return;

  if (event.key >= "1" && event.key <= "9") {
    event.preventDefault();
    const before = play.selectedDigit;
    armDigit(play, Number(event.key));
    if (play.selectedDigit !== before) resetHint(play);
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
    resetHint(play);
    play.candidateNote = null;
    clearWrong(play);
    syncComplete(play);
    render();
  }
}

function showHint(play: Play): void {
  const result = pressHint(hintViewOf(play), play.values, play.notes, play.puzzle.givens.flat());
  if (result.fillCandidates) {
    fillAllCandidates(play);
    applyHintView(play, emptyHintView(null));
    play.candidateNote = "已填合法候選 · 可上一步";
    play.selectedCell = null;
    render();
    return;
  }
  if (result.clearNotes) {
    clearCandidateDigits(play, result.clearNotes.indexes, result.clearNotes.digits);
    applyHintView(play, result.view);
    play.candidateNote = "已清候選 · 可上一步";
    play.selectedCell = null;
    render();
    return;
  }
  const unchanged =
    result.write === null &&
    result.view.step === play.hintStep &&
    result.view.note === play.hintNote &&
    result.view.technique === play.hintTechnique;
  if (unchanged) {
    render();
    return;
  }
  if (result.write) {
    const before = play.values.slice();
    if (writeDigit(play, result.write.index, result.write.digit) && placedADigit(before, play.values)) {
      clearWrong(play);
    }
    syncComplete(play);
  }
  const started = play.hintStep === 0 && result.view.step === 1;
  applyHintView(play, result.view);
  if (started) play.selectedCell = null;
  play.candidateNote = null;
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

export function confirmCopy(kind: Play["confirm"]): string {
  if (kind === "back") return "返回並放棄這一題？";
  if (kind === "restart") return "重開並放棄而家進度？";
  if (kind === "new") return "開新局並放棄這一題？";
  if (kind === "check") return "會對答案標出唔啱嘅格（求救），唔會改你嘅盤。確定？";
  return "";
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
    if (play.wrongMarks?.includes(index)) classes.push("wrong");
    const hintClasses = conflicts[index]
      ? []
      : hintCellClasses(play.hintTechnique, play.hintStep, play.hintIndexes, index, value);
    if (hintClasses.length > 0) classes.push(...hintClasses);
    else if (!conflicts[index] && !classes.includes("wrong") && highlight && value === armed) classes.push("same");
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

export interface PadKey {
  digit: number;
  remain: number;
  done: boolean;
  armed: boolean;
  disabled: boolean;
}

/** Digit pad keys in visual order. Always 1–9; a finished digit only changes style. */
export function padKeys(board: BoardInput, complete: boolean): PadKey[] {
  const keys: PadKey[] = [];
  for (let digit = 1; digit <= 9; digit++) {
    const done = isDigitDone(board, digit);
    keys.push({
      digit,
      remain: remainingCount(board.values, digit),
      done,
      armed: !done && board.selectedDigit === digit,
      disabled: complete || done,
    });
  }
  return keys;
}

export function padMarkup(board: BoardInput, complete: boolean): string {
  const digits = padKeys(board, complete)
    .map((key) => {
      const classes = ["pad-key"];
      if (key.done) classes.push("done");
      if (key.armed) classes.push("armed");
      const disabled = key.disabled ? "disabled" : "";
      return `<button type="button" class="${classes.join(" ")}" data-action="digit" data-digit="${key.digit}" data-remaining="${key.remain}" data-done="${key.done}" aria-pressed="${key.armed}" aria-label="數字 ${key.digit}，剩餘 ${key.remain}" ${disabled}><span class="pad-digit">${key.digit}</span><span class="pad-remain">${key.remain}</span></button>`;
    })
    .join("");
  return `<div class="pad">${digits}</div>`;
}

function padHtml(play: Play): string {
  return padMarkup(play, play.complete);
}

function playHtml(play: Play): string {
  const label = techniqueLabel(play.puzzle.maxTechnique);
  const banner = play.hintNote ?? play.candidateNote ?? play.checkNote;
  const status = playStatusMarkup(play.complete, banner);
  const hintLabel = hintButtonLabel(play.hintStep, play.hintTechnique);
  const locked = play.complete ? "disabled" : "";
  const menu = play.menuOpen
    ? `<div class="menu-pop" role="menu"><button type="button" data-action="fill-candidates" ${locked}>填滿候選</button><button type="button" data-action="check-wrong">檢查錯格</button></div>`
    : "";
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
        <p class="ceiling-kicker">${esc(CEILING_LABEL)}</p>
        <p class="done-technique">${esc(label)}</p>
        <div class="done-actions">
          <button type="button" class="primary" data-action="again">再來一題</button>
          <button type="button" data-action="back">返回</button>
        </div>
      </div>`
    : "";
  return `<section class="play" data-difficulty="${esc(play.difficulty)}">
    <header class="top">
      <div class="top-copy">
        ${playEyebrowMarkup(play.difficulty)}
        <p class="ceiling-kicker">${esc(CEILING_LABEL)}</p>
        <h1>${esc(label)}</h1>
        <p class="left">仲剩 ${emptyCellCount(play)} 格</p>
      </div>
      <div class="top-actions">
        <div class="top-action-row">
          <button type="button" data-action="restart">重開</button>
          <button type="button" data-action="new">新局</button>
          <button type="button" data-action="back">返回</button>
        </div>
        ${confirm}
      </div>
    </header>
    <div class="play-main">
      ${boardHtml(play)}
    </div>
    <div class="play-rail">
      ${status}
      ${done}
      <div class="tools">
        <button type="button" data-action="notes" aria-pressed="${play.pencilMode}" ${locked}>筆記</button>
        <button type="button" data-action="undo" ${locked} ${play.undo.length === 0 ? "disabled" : ""}>上一步</button>
        <button type="button" data-action="hint" ${locked}>${hintLabel}</button>
        ${
          play.hintTechnique === "notes" && play.hintStep >= 1
            ? `<button type="button" class="minor" data-action="hint-later" ${locked}>稍後</button>`
            : ""
        }
        <div class="menu">
          <button type="button" data-action="menu" aria-expanded="${play.menuOpen}" aria-haspopup="menu" aria-label="更多" ${locked}>⋯</button>
          ${menu}
        </div>
      </div>
      ${padHtml(play)}
    </div>
    <p class="help">1–9 選定數字，再點空格填入。再點同一數字可取消。N 筆記 · Z 上一步 · H 提示</p>
  </section>`;
}

export function homeHtml(): string {
  return `<section class="home">
    <header class="mast">
      <p class="brand">Mysudok</p>
      <h1>數獨</h1>
      <p class="lede">難度由這一題需要的最高解題技巧決定。</p>
    </header>
    <div class="choices">
      <button type="button" class="choice intro" data-action="start" data-difficulty="初級">
        <span class="kicker">初級</span>
        <span class="blurb">${esc(HOME_BLURB.初級)}</span>
      </button>
      <button type="button" class="choice mid" data-action="start" data-difficulty="中級">
        <span class="kicker">中級</span>
        <span class="blurb">${esc(HOME_BLURB.中級)}</span>
      </button>
      <button type="button" class="choice advanced" data-action="start" data-difficulty="高級">
        <span class="kicker">高級</span>
        <span class="blurb">${esc(HOME_BLURB.高級)}</span>
      </button>
      <button type="button" class="choice expert" data-action="start" data-difficulty="專家">
        <span class="kicker">專家</span>
        <span class="blurb">${esc(HOME_BLURB.專家)}</span>
      </button>
    </div>
    ${skillReferenceMarkup()}
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
  if (phase.kind === "play" && phase.play.complete) {
    root.querySelector(".done")?.scrollIntoView({ block: "nearest" });
  }
}
