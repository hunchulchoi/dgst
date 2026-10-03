export const SIZE = 8;
export type Board = number[];
export type Piece = { cells: number[][]; color: number };

export const COLORS = ['#58a6ff', '#ffb84d', '#b18cff', '#50d5a0', '#ff718c', '#57d6e8'];
const SHAPES = [
  [[1]],
  [[1, 1]],
  [[1], [1]],
  [[1, 1, 1]],
  [[1], [1], [1]],
  [[1, 1, 1, 1]],
  [[1], [1], [1], [1]],
  [
    [1, 1],
    [1, 1]
  ],
  [
    [1, 1, 1],
    [1, 1, 1]
  ],
  [
    [1, 1],
    [1, 1],
    [1, 1]
  ],
  [
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1]
  ],
  [
    [1, 0],
    [1, 0],
    [1, 1]
  ],
  [
    [0, 1],
    [0, 1],
    [1, 1]
  ],
  [
    [1, 1, 1],
    [0, 1, 0]
  ],
  [
    [0, 1, 1],
    [1, 1, 0]
  ],
  [
    [1, 1, 0],
    [0, 1, 1]
  ],
  [
    [1, 0],
    [1, 1]
  ],
  [
    [0, 1],
    [1, 1]
  ]
];

export function emptyBoard(): Board {
  return Array(SIZE * SIZE).fill(0);
}

export function drawHand(random = Math.random): Piece[] {
  return Array.from({ length: 3 }, () => ({
    cells: SHAPES[Math.floor(random() * SHAPES.length)].map((row) => [...row]),
    color: 1 + Math.floor(random() * COLORS.length)
  }));
}

export function canPlace(board: Board, piece: Piece, row: number, col: number): boolean {
  if (!Number.isInteger(row) || !Number.isInteger(col)) return false;
  return piece.cells.every((cells, y) =>
    cells.every(
      (cell, x) =>
        !cell ||
        (row + y >= 0 &&
          row + y < SIZE &&
          col + x >= 0 &&
          col + x < SIZE &&
          board[(row + y) * SIZE + col + x] === 0)
    )
  );
}

export function rotatePiece(piece: Piece): Piece {
  return {
    color: piece.color,
    cells: Array.from({ length: piece.cells[0].length }, (_, col) =>
      piece.cells.map((_, row) => piece.cells[piece.cells.length - 1 - row][col])
    )
  };
}

export function hasMove(board: Board, hand: (Piece | null)[]): boolean {
  return hand.some((piece) => {
    if (!piece) return false;
    let rotated = piece;
    for (let turn = 0; turn < 4; turn++) {
      if (board.some((_, i) => canPlace(board, rotated, Math.floor(i / SIZE), i % SIZE))) {
        return true;
      }
      rotated = rotatePiece(rotated);
    }
    return false;
  });
}

export function placePiece(board: Board, piece: Piece, row: number, col: number, combo = 0) {
  if (!canPlace(board, piece, row, col)) return null;
  const next = [...board];
  let blocks = 0;
  piece.cells.forEach((cells, y) =>
    cells.forEach((cell, x) => {
      if (cell) {
        next[(row + y) * SIZE + col + x] = piece.color;
        blocks++;
      }
    })
  );
  // Find both axes before clearing so intersections count as two lines.
  const rows = Array.from({ length: SIZE }, (_, r) => r).filter((r) =>
    next.slice(r * SIZE, (r + 1) * SIZE).every(Boolean)
  );
  const cols = Array.from({ length: SIZE }, (_, c) => c).filter((c) =>
    Array.from({ length: SIZE }, (_, r) => next[r * SIZE + c]).every(Boolean)
  );
  const cleared = next.flatMap((_, i) =>
    rows.includes(Math.floor(i / SIZE)) || cols.includes(i % SIZE) ? [i] : []
  );
  cleared.forEach((i) => {
    next[i] = 0;
  });
  const lines = rows.length + cols.length;
  const streak = lines ? combo + 1 : 0;
  const perfect = lines > 0 && next.every((cell) => cell === 0);
  return {
    board: next,
    cleared,
    lines,
    combo: streak,
    perfect,
    points: blocks * 10 + lines * lines * 100 * streak + (perfect ? 300 : 0)
  };
}
