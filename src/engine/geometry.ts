/**
 * Shared board geometry. 4×4 is 2×2 boxes, 6×6 is 2×3 (height × width), 9×9 is 3×3.
 * Digit domain is 1…size. Peer order matches the historical 9×9 scan: row, then column, then box.
 */

export type BoardSize = 4 | 6 | 9;

export type ClassicDifficulty = "初級" | "中級" | "高級" | "專家";
export type MiniDifficulty = "4×4" | "6×6";
export type Difficulty = MiniDifficulty | ClassicDifficulty;

export interface Geometry {
  size: BoardSize;
  boxH: number;
  boxW: number;
  cellCount: number;
  /** Bits 1…size. Size 9 is `0x3fe`, the mask the 9×9 solver already used. */
  allDigits: number;
  rows: readonly (readonly number[])[];
  cols: readonly (readonly number[])[];
  boxes: readonly (readonly number[])[];
  units: readonly (readonly number[])[];
  peers: readonly (readonly number[])[];
}

const CACHE = new Map<BoardSize, Geometry>();

function build(size: BoardSize, boxH: number, boxW: number): Geometry {
  const cellCount = size * size;
  const allDigits = (1 << (size + 1)) - 2;
  const rows = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => row * size + col),
  );
  const cols = Array.from({ length: size }, (_, col) =>
    Array.from({ length: size }, (_, row) => row * size + col),
  );
  const across = size / boxW;
  const boxes = Array.from({ length: (size / boxH) * across }, (_, box) => {
    const row0 = Math.floor(box / across) * boxH;
    const col0 = (box % across) * boxW;
    const cells: number[] = [];
    for (let row = 0; row < boxH; row++) {
      for (let col = 0; col < boxW; col++) cells.push((row0 + row) * size + (col0 + col));
    }
    return cells;
  });
  const boxAt = (index: number) => {
    const row = Math.floor(index / size);
    const col = index % size;
    return Math.floor(row / boxH) * across + Math.floor(col / boxW);
  };
  const peers = Array.from({ length: cellCount }, (_, index) => {
    const set = new Set<number>();
    for (const peer of rows[Math.floor(index / size)] ?? []) if (peer !== index) set.add(peer);
    for (const peer of cols[index % size] ?? []) if (peer !== index) set.add(peer);
    for (const peer of boxes[boxAt(index)] ?? []) if (peer !== index) set.add(peer);
    return [...set];
  });
  return {
    size,
    boxH,
    boxW,
    cellCount,
    allDigits,
    rows,
    cols,
    boxes,
    units: [...rows, ...cols, ...boxes],
    peers,
  };
}

export function geometryOf(size: BoardSize): Geometry {
  const cached = CACHE.get(size);
  if (cached) return cached;
  const built =
    size === 4 ? build(4, 2, 2) : size === 6 ? build(6, 2, 3) : build(9, 3, 3);
  CACHE.set(size, built);
  return built;
}

export function geometryFromLength(length: number): Geometry | null {
  if (length === 16) return geometryOf(4);
  if (length === 36) return geometryOf(6);
  if (length === 81) return geometryOf(9);
  return null;
}

export function isMiniDifficulty(value: string): value is MiniDifficulty {
  return value === "4×4" || value === "6×6";
}

export function isClassicDifficulty(value: string): value is ClassicDifficulty {
  return value === "初級" || value === "中級" || value === "高級" || value === "專家";
}

export function isDifficulty(value: string): value is Difficulty {
  return isMiniDifficulty(value) || isClassicDifficulty(value);
}

export function boardSizeOf(difficulty: Difficulty): BoardSize {
  if (difficulty === "4×4") return 4;
  if (difficulty === "6×6") return 6;
  return 9;
}

export function geometryOfDifficulty(difficulty: Difficulty): Geometry {
  return geometryOf(boardSizeOf(difficulty));
}
