# Mysudok

A small static Sudoku game. Pick **入門** or **進階**, then fill a generated 9×9 puzzle. There is no account, no saved progress, and no backend.

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

## Play

1. Home: choose **入門** or **進階**. The app shows「正在出題…」while it searches.
2. Board: tap a cell, then a digit. **筆記** toggles pencil marks. **清除**, **復原**, and **提示** are under the grid. **新遊戲** deals another puzzle of the same difficulty. **返回** goes back to the difficulty choice.
3. **提示** highlights the next cell that [openzeloku](https://github.com/mr-girff/openzeloku) `nextHint` can fill with a naked or hidden single. It does not reveal the digit. If the next step is a pair or harder, the hint says no single is available.
4. A finished board that matches the solution shows「完成」.

Keyboard: arrow keys, `1`–`9`, `N` notes, `H` hint, Backspace clear, `Z` undo.

Play state stays in memory only.

## How a puzzle is generated

```ts
type Difficulty = "入門" | "進階";

type Puzzle = {
  givens: number[][]; // 0 = empty
  solution: number[][];
  maxTechnique: string;
  unique: true;
};

generate(d: Difficulty): Promise<Puzzle>;
```

Implementation: [`src/engine/generate.ts`](src/engine/generate.ts).

1. Ask [`openzeloku`](https://github.com/mr-girff/openzeloku) (MIT) for a 9×9 puzzle (`easy` for 入門, `hard` for 進階).
2. Confirm a unique solution with `countSolutions(grid, 9, 2)`.
3. Rate the grid with the techniques below. `maxTechnique` is the hardest one that had to be applied.
4. 入門 keeps the puzzle only when `maxTechnique` is a single. 進階 keeps it only when `maxTechnique` is a pair, pointing, or box-line technique. For 進階, the attempt may also remove or restore clues from that unique puzzle, still checking uniqueness, until the rating lands in the 進階 band.
5. Retry up to 40 times. If none match, generation throws and the UI says so.

Clue count is only a side effect of carving a grid. The accept/reject decision is the technique rating.

### Technique map

Ids are openzeloku's `TechniqueName` strings.

| Rank | id | 中文 | 難度 |
| ---: | --- | --- | --- |
| 1 | `naked_single` | 顯式唯一 | 入門 |
| 2 | `hidden_single` | 隱式唯一 | 入門 |
| 3 | `naked_pair` | 顯式數對 | 進階 |
| 4 | `hidden_pair` | 隱式數對 | 進階 |
| 5 | `pointing_pair` | 區塊指向 | 進階 |
| 6 | `box_line_reduction` | 宮線排除 | 進階 |

入門: `maxTechnique` is only `naked_single` or `hidden_single`.

進階: `maxTechnique` is at least a pair or a pointing / box-line step (`naked_pair`, `hidden_pair`, `pointing_pair`, or `box_line_reduction`). The puzzle must still be finished with those techniques.

Not used, and cause a reject: naked/hidden triple, `x_wing`, `swordfish`, `guess`.

### Why this wrapper does not trust `rate()` alone

openzeloku's `rate()` detects `naked_pair` and `pointing_pair` as signals only. Those branches do not eliminate candidates, so any puzzle that singles cannot finish is also tagged `guess`. `hidden_pair` and `box_line_reduction` are declared ids but are not applied there.

This app still uses openzeloku to generate boards, to prove uniqueness (`countSolutions`), and for the level-1 hint (`nextHint`). The rating pass in [`src/engine/techniques.ts`](src/engine/techniques.ts) applies the same ids as real steps: place singles, then eliminate with naked pair, hidden pair, pointing, and box-line reduction. If cells remain, the puzzle needs a harder technique or a guess and is discarded. A rating is kept only when the filled grid matches `countSolutions`.

## Credits

Puzzle engine: [openzeloku](https://github.com/mr-girff/openzeloku) by Zeloku, MIT License.

## Out of scope

Accounts, saved progress, skill trees, exams, and any server.
