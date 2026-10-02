import { describe, expect, it } from 'vitest';
import { emptyBoard, drawHand, canPlace, hasMove, placePiece } from './gameUtils';

const single = { cells: [[1]], color: 1 };
const square = {
  cells: [
    [1, 1],
    [1, 1]
  ],
  color: 2
};

describe('Block Blast', () => {
  it('rejects overlap, out-of-bounds and fractional positions without modifying the board', () => {
    const board = emptyBoard();
    board[0] = 3;
    expect(canPlace(board, square, 0, 0)).toBe(false);
    expect(canPlace(board, square, 7, 7)).toBe(false);
    expect(canPlace(board, square, -1, 0)).toBe(false);
    expect(canPlace(board, square, 0.5, 0)).toBe(false);
    expect(placePiece(board, square, 0, 0)).toBeNull();
    expect(board.filter(Boolean)).toEqual([3]);
  });

  it('clears intersecting row and column simultaneously and scores both', () => {
    const board = emptyBoard();
    for (let i = 1; i < 8; i++) {
      board[i] = 2;
      board[i * 8] = 3;
    }
    const result = placePiece(board, single, 0, 0)!;
    expect(result.lines).toBe(2);
    expect(result.cleared).toHaveLength(15);
    expect(result.board).toEqual(emptyBoard());
    expect(result.points).toBe(710);
    expect(result.perfect).toBe(true);
    expect(board[1]).toBe(2);
  });

  it('preserves occupied cells outside cleared lines without gravity', () => {
    const board = emptyBoard();
    board.fill(2, 0, 7);
    board[63] = 4;
    const result = placePiece(board, single, 0, 7, 2)!;
    expect(result.lines).toBe(1);
    expect(result.combo).toBe(3);
    expect(result.points).toBe(310);
    expect(result.board[63]).toBe(4);
    expect(result.board.filter(Boolean)).toEqual([4]);
  });

  it('resets the combo when a placement clears no lines', () => {
    const result = placePiece(emptyBoard(), square, 2, 3, 5)!;
    expect(result.combo).toBe(0);
    expect(result.points).toBe(40);
    expect(result.board.filter(Boolean)).toHaveLength(4);
  });

  it('ends only when none of the remaining pieces fit', () => {
    const board = Array(64).fill(1);
    board[63] = 0;
    expect(hasMove(board, [square, null, single])).toBe(true);
    expect(hasMove(board, [square, null, null])).toBe(false);
    expect(hasMove(board, [null, null, null])).toBe(false);
  });

  it('tests occupied shape cells rather than the entire bounding rectangle', () => {
    const board = emptyBoard();
    board[0] = 2;
    expect(
      canPlace(
        board,
        {
          cells: [
            [0, 1],
            [1, 1]
          ],
          color: 1
        },
        0,
        0
      )
    ).toBe(true);
  });

  it('draws three independent pieces with valid colors', () => {
    const hand = drawHand(() => 0);
    expect(hand).toHaveLength(3);
    hand[0].cells[0][0] = 0;
    expect(hand[1].cells).toEqual([[1]]);
    expect(drawHand(() => 0.999).every((piece) => piece.color === 6)).toBe(true);
    expect(drawHand(() => 0)[0].cells).toEqual([[1]]);
  });
});
