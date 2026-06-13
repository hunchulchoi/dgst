import { describe, it, expect } from 'vitest';

/** @typedef {{ row: number; col: number; isMine: boolean; neighborMines: number }} TestCell */

// 지뢰찾기 로직을 시뮬레이션하기 위한 함수
/**
 * @param {TestCell[][]} grid
 * @param {number} rows
 * @param {number} cols
 */
function calculateNeighborMines(grid, rows, cols) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!grid[r][c].isMine) {
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].isMine) {
              count++;
            }
          }
        }
        grid[r][c].neighborMines = count;
      }
    }
  }
  return grid;
}

describe('Minesweeper Logic', () => {
  it('중앙 지뢰 주변의 숫자가 정확해야 함', () => {
    // 3x3 그리드, 정중앙(1,1)에만 지뢰가 있는 상황
    let grid = Array.from({ length: 3 }, (_, r) =>
      Array.from({ length: 3 }, (_, c) => ({
        row: r,
        col: c,
        isMine: r === 1 && c === 1,
        neighborMines: 0
      }))
    );

    grid = calculateNeighborMines(grid, 3, 3);

    expect(grid[0][0].neighborMines).toBe(1);
    expect(grid[0][1].neighborMines).toBe(1);
    expect(grid[0][2].neighborMines).toBe(1);
    expect(grid[1][0].neighborMines).toBe(1);
    expect(grid[1][2].neighborMines).toBe(1);
    expect(grid[2][0].neighborMines).toBe(1);
    expect(grid[2][1].neighborMines).toBe(1);
    expect(grid[2][2].neighborMines).toBe(1);
  });

  it('모서리(Edge)에 있는 지뢰도 정확히 계산해야 함', () => {
    // Top-Left (0,0) 에만 지뢰가 있을 때
    let grid = Array.from({ length: 3 }, (_, r) =>
      Array.from({ length: 3 }, (_, c) => ({
        row: r,
        col: c,
        isMine: r === 0 && c === 0,
        neighborMines: 0
      }))
    );

    grid = calculateNeighborMines(grid, 3, 3);

    expect(grid[0][1].neighborMines).toBe(1);
    expect(grid[1][0].neighborMines).toBe(1);
    expect(grid[1][1].neighborMines).toBe(1);
    // 지뢰와 안 인접한 칸들
    expect(grid[1][2].neighborMines).toBe(0);
    expect(grid[2][2].neighborMines).toBe(0);
  });
});
