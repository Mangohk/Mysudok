# Mysudok

A small static Sudoku game. Pick **初級**, **中級**, **高級**, or **專家**, then fill a 9×9 puzzle. There is no account. An unfinished game stays in this browser. A finished game can add one to a shared completion count.

Difficulty is the hardest solving technique a human-style solver has to use, after the puzzle is checked for a unique solution. It is not the number of clues.

## GitHub Pages

Live site: [https://mangohk.github.io/Mysudok/](https://mangohk.github.io/Mysudok/)

Pages must use **GitHub Actions** as the source. **Deploy from a branch** publishes this repository root, including the unbuilt `index.html` that loads `/src/main.ts`. Browsers cannot run that file.

[`.github/workflows/pages.yml`](.github/workflows/pages.yml) runs on every push to `main`. It runs `npm ci`, `npm test`, and `npm run build`, then uploads `dist/` with `actions/upload-pages-artifact` and publishes it with `actions/deploy-pages`.

`vite.config.ts` sets `base` to `/Mysudok/`. The built page requests scripts and styles from `/Mysudok/assets/…`, which matches this project site. The workflow fails the build if `dist/index.html` does not contain that prefix, or if it still points at `/src/main.ts`.

### One-time setting

This has to be selected once. The workflow file cannot switch it.

1. Merge the workflow to `main`.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**. Leave **Deploy from a branch** unselected. That branch option is what is serving the raw TypeScript page today (`main` / `/`).
4. If the deploy job did not succeed (it fails while Source is still a branch), open the **Actions** tab, choose **Deploy to GitHub Pages**, and run **Run workflow** on `main`.

After that, the site serves the built app. Later pushes to `main` publish a new `dist/` on their own.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173/Mysudok/](http://localhost:5173/Mysudok/). The `/Mysudok/` base matches a GitHub project site.

```bash
npm test
npm run build
npm run preview
```

`npm run build` typechecks and writes the static site to `dist/`. Preview it at [http://localhost:4173/Mysudok/](http://localhost:4173/Mysudok/).

## Completion count

Home shows one line, **已完成 N 局**, under the six difficulty buttons and above the openzeloku credit. 4×4, 6×6, 初級, 中級, 高級, and 專家 share that total. If the count cannot be read, the same line says **已完成 — 局**. Solving, leaving, and starting another puzzle still work.

The page reads `VITE_COMPLETION_API_URL` when Vite builds (no trailing slash). Leave it unset or empty to skip the network: nothing is requested, and the line stays on **已完成 — 局**. For local dev, put the public Worker origin in `.env.local`. For GitHub Pages, set the repository variable `VITE_COMPLETION_API_URL`. The build does not embed a Cloudflare API token.

```bash
# .env.local
VITE_COMPLETION_API_URL=https://mysudok-completions.<account>.workers.dev
```

The Worker lives in [`worker/`](worker/). `GET /count` reads the total. `POST /complete` adds one and returns the new total. The KV binding is `COMPLETIONS`. The total is the string key `mysudok:completions:total`. CORS allows `https://mangohk.github.io` and the local Vite origins (`http://localhost:5173` and `http://127.0.0.1:5173`, plus preview on port 4173).

Create the namespace, paste its id into `worker/wrangler.toml` in place of the placeholder, then deploy. Do not commit `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID`. This repo does not deploy the Worker.

```bash
cd worker
npx wrangler kv namespace create COMPLETIONS
npx wrangler deploy
```

`wrangler deploy` uses a Cloudflare login, or those two variables in the shell. `npx wrangler dev` from `worker/` simulates KV locally.

## Play

1. Home: choose **初級**, **中級**, **高級**, or **專家**. The four buttons are a vertical stack, each full width, with a short description and `data-difficulty`. There is no technique-practice entry. 初級, 中級, and 高級 show「正在出題…」while `generate` searches. **專家** draws first from the static bank (`public/bank-by-hardest.jsonl`, served at `/Mysudok/bank-by-hardest.jsonl`) where `hardest` is `y_wing` or `swordfish`, then applies the same deal-time morph. If that pool is empty or the file cannot be loaded, it tries one short `generate` (a few attempts, not an open-ended search). If that also misses, the screen says「專家題庫暫空」. **新局** on an expert game draws again, preferring a different bank id. **返回** goes back to the difficulty choice.
2. Board, digit first: tap **1–9** to arm that digit (nothing is written yet). Cells that already show it are highlighted in beige. Tap an empty cell to fill it, or, in **筆記**, to toggle that candidate. Tap the same digit again to disarm it. Tap a filled cell you wrote to erase it. Givens cannot be edited. After a fill, the digit stays armed so you can keep placing it, and that same digit is cleared from pencil notes in the same row, column, and box. **上一步** undoes that fill and those note changes together. **填滿候選**, in the **⋯** menu, writes every legal candidate into the empty cells as pencil notes. That rewrite is one undo step, and the status line says「已填合法候選 · 可上一步」. Each digit button shows how many of that digit are still missing (`9 −` the number already on the board). A digit turns green when it sits in all nine solution cells and none of those cells conflict. While a puzzle is unfinished, the top-left header is blank: no difficulty, no **最高技巧**, no technique name, and no「仲剩 N 格」. After the puzzle is solved, that header returns, and the completion card still labels the puzzle ceiling as **最高技巧** above the technique name. While the board is unfinished and no hint is open, the status line is only「先點數字，再點格子。」. **新局** deals another puzzle. **重開** clears your fills on this puzzle. **返回** goes back to the difficulty choice.
3. **提示** scans local techniques #1 → #3, then the Notes gate, then #5 → #10, then #11 → #15. It does not use openzeloku `nextHint`. Names in the header and in hints are Title Case English. Reason sentences stay Cantonese. #11–#15 are **Pointing Pairs**, **Pointing Triples**, **X-Wing**, **Y-Wing**, and **Swordfish**.

   **Last Free Cell**, **Last Remaining Cell**, and **Last Possible Number** are three presses. The first highlights the cell and the reason, with no digit. **Last Free Cell** then says「填入 〔n〕。」. **Last Remaining Cell** says「〔n〕喺呢行／列／宮只剩這一格。」 and paints the whole house plus the cells that already show that digit. **Last Possible Number** says「呢行、列、宮合埋只剩〔n〕。」 and paints the cell plus the digits already used in its row, column, and box. The button is then **填入**. The third press writes through the normal fill path (peer notes clear, one undo step) and leaves the hint. The hint status names the technique being taught. It does not reuse the **最高技巧** label.

   **Notes In Sudoku** appears only after #1–#3 all miss and the board still has no pencil marks. The copy asks for notes. The hint button becomes **填滿候選** (writes every legal candidate, one undo step). **稍後** closes the hint without writing. The next hint then starts at #5.

   **Obvious Singles** and **Hidden Singles** stay on four presses. The first highlights only the target; the button stays **提示**. The second reveals the digit (Hidden Singles also paints the house: a light background on the unit, a blue frame on the other empty cells). The button becomes **再提示**. The third says to fill that digit and leaves only the target highlighted; the button is **填入**. The fourth writes.

   **Obvious Pairs**, **Obvious Triples**, **Hidden Pairs**, and **Hidden Triples** are four presses and do not fill a digit. The first names the technique and the reason, with no digits, and marks only the pair or triple. The button stays **提示**. The second names the locked digits and the house (行／列／宮), paints that whole house, and keeps a frame on the pattern cells. Filled cells in the house are not marked as evidence. The button is **再提示**. The third says which candidates to delete or keep and marks the cells that will be cleared. The button is **清候選**, not **填入**. The fourth clears those pencil notes in one undo step and leaves the hint. The status line says「已清候選 · 可上一步」.

   **Pointing Pairs**, **Pointing Triples**, **X-Wing**, **Y-Wing**, and **Swordfish** use that same four-press clear. They never fill a digit. Box-line reduction is taught as Pointing Pairs or Pointing Triples: box → line first, then line → box, with copy for that direction. The last button is **清候選**.

   If nothing in #1–#15 applies, the status line says「解唔落。」. Arming a digit, undoing, filling a cell, **填滿候選**, **新局**, or **重開** leaves the hint.
4. **⋯** opens one list: **填滿候選**, then **檢查錯格**. **檢查錯格** asks first, then marks player fills that disagree with the solution with an orange striped fill. That state is separate from the beige highlight on cells that already show the armed digit. It does not change the board. Editing a cell, **上一步**, **新局**, or **重開** clears those marks.
5. A duplicate in a row, column, or box turns those cells light red. A finished board that matches the solution shows「完成」and **最高技巧** with the puzzle’s technique name. The「先點數字，再點格子。」line is not shown after the puzzle is complete.

Keyboard: `1`–`9` arm a digit, `N` notes, `H` hint, `Z` 上一步.

Play state stays in memory only.

## How a puzzle is generated

```ts
type Difficulty = "初級" | "中級" | "高級" | "專家";

type Puzzle = {
  givens: number[][]; // 0 = empty
  solution: number[][];
  maxTechnique: string;
  unique: true;
};

generate(d: Difficulty): Promise<Puzzle>;
```

Implementation: [`src/engine/generate.ts`](src/engine/generate.ts).

1. Ask [`openzeloku`](https://github.com/mr-girff/openzeloku) (MIT) for a 9×9 seed (`easy` / `medium` / `expert`).
2. Confirm a unique solution with `countSolutions(grid, 9, 2)`.
3. Rate the grid with local `analyze`. `maxTechnique` is the hardest step that had to be applied. This does not use openzeloku `rate()`.
4. 初級 keeps the puzzle only when every step is #1–#3. 中級 keeps it when the hardest step is #5–#10. 高級 keeps it when the hardest step is #11–#13 (`pointing_pairs`, `pointing_triples`, `x_wing`) and rejects #14+. 專家 keeps it when the hardest step is #14 or #15 (`y_wing`, `swordfish`). An attempt may add or remove clues from that unique puzzle until the rating lands in the band.
5. 初級 has a soft quota for Last Possible Number. The streak is kept in memory and in `localStorage` (`mysudok.beginnerNonLpnStreak`). After 3 consecutive 初級 puzzles whose `maxTechnique` is not `last_possible_number`, the next 初級 search carves toward exactly that technique (still scanning #1 → #2 → #3, with #2 digit → cell and #3 cell → digit). If that carve misses, any #1–#3 puzzle is accepted and the streak continues. A #3 result resets the streak. 中級, 高級, and 專家 are not part of this quota.
6. Retry up to 40 seeds. If none match, generation throws and the UI says so. The 專家 product path does not rely on this loop: it deals from the bank first, and the fallback passes a smaller `maxAttempts` so the wait stays bounded.
7. Every dealt puzzle — a generated 初級／中級／高級 grid, a short 專家 regenerate, and an expert bank draw — then passes through `applyDealMorph` in [`src/engine/morph.ts`](src/engine/morph.ts). The morph permutes digits 1–9, permutes the three bands and the rows inside each band, and permutes the three stacks and the columns inside each stack. It does not transpose or reflect. Givens and the solution share one map. `maxTechnique` stays the label from `generate` or from the bank `hardest` id. The morph is not written back into the bank, and the app does not analyze the grid again.

Clue count is only a side effect of carving a grid. The accept/reject decision is the technique rating.

### Expert bank

The static JSONL asset (5200 puzzles) stays on disk and is not a practice mode. The page can fetch it from the Vite `base` (`/Mysudok/`). Runtime does not run Python and does not download puzzles from another origin. `parseBank` / `filterByHardest` / `drawEntry` live in [`src/engine/bank.ts`](src/engine/bank.ts). [`src/engine/expert-deal.ts`](src/engine/expert-deal.ts) keeps the rows whose `hardest` is `y_wing` or `swordfish` (800 puzzles, `band: "expert"`). A bank row becomes the existing `Puzzle` (`givens` and `solution` as `number[][]`, `maxTechnique` = `hardest`, `unique: true`) only after the deal-time morph. The in-play header shows the difficulty name **專家** and the Title Case technique via `techniqueTitle`. Hints still scan #1–#15.

### Technique map

| Rank | id | Name | 難度 |
| ---: | --- | --- | --- |
| 1 | `last_free_cell` | Last Free Cell | 初級 |
| 2 | `last_remaining_cell` | Last Remaining Cell | 初級 |
| 3 | `last_possible_number` | Last Possible Number | 初級 |
| 4 | `notes` | Notes In Sudoku | 中級 gate, not a solving step |
| 5 | `obvious_singles` | Obvious Singles | 中級 |
| 6 | `obvious_pairs` | Obvious Pairs | 中級 |
| 7 | `obvious_triples` | Obvious Triples | 中級 |
| 8 | `hidden_singles` | Hidden Singles | 中級 |
| 9 | `hidden_pairs` | Hidden Pairs | 中級 |
| 10 | `hidden_triples` | Hidden Triples | 中級 |
| 11 | `pointing_pairs` | Pointing Pairs | 高級 |
| 12 | `pointing_triples` | Pointing Triples | 高級 |
| 13 | `x_wing` | X-Wing | 高級 |
| 14 | `y_wing` | Y-Wing | 專家 |
| 15 | `swordfish` | Swordfish | 專家 |

初級: `maxTechnique` is only `last_free_cell`, `last_remaining_cell`, or `last_possible_number`. Those detectors read placed digits. They are not the old naked/hidden single aliases.

中級: `maxTechnique` is one of #5–#10. The solve used an intermediate technique and did not need #11+.

高級: `maxTechnique` is one of #11–#13. A puzzle whose hardest step is Y-Wing or Swordfish is not 高級. The hint button still teaches the clears after #1–#10, including on an 專家 game: Pointing Pairs and Pointing Triples (box → line, then line → box claiming under the same names), X-Wing, Y-Wing, and Swordfish. Box-line reduction is applied and counted as Pointing Pairs or Pointing Triples.

專家: `maxTechnique` is `y_wing` or `swordfish`. The home and in-play difficulty name is **專家**.

Anything still unsolved after Swordfish is rejected.

### Why this wrapper does not trust `rate()` alone

openzeloku's `rate()` detects some patterns as signals only and tags anything past singles as `guess`. This app uses openzeloku to generate seeds and to prove uniqueness (`countSolutions`). Hints and difficulty both come from [`src/engine/techniques.ts`](src/engine/techniques.ts) and [`src/engine/hint.ts`](src/engine/hint.ts): place #1–#3 from the ink, then eliminate and place #5–#15 from the candidate mask. A rating is kept only when the filled grid matches `countSolutions`.

## Credits

Puzzle engine: [openzeloku](https://github.com/mr-girff/openzeloku) by Zeloku, MIT License.

## Out of scope

Accounts, saved progress, skill trees, exams, and a backend other than the shared completion counter.
