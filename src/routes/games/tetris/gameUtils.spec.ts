import { describe, expect, it } from 'vitest';
import {
  calculateHardDropScore,
  calculateLineScore,
  canPlace,
  clearLines,
  createEmptyBoard,
  drawNextPiece,
  getGhostPiece,
  getStageConfig,
  hardDrop,
  isStageComplete,
  lockPiece,
  movePiece,
  rotateActivePiece,
  spawnPiece,
  STAGES
} from './gameUtils.js';

describe('tetris gameUtils', () => {
  it('creates empty 10x22 board', () => {
    const board = createEmptyBoard();
    expect(board.length).toBe(22);
    expect(board[0].length).toBe(10);
    expect(board.every((row) => row.every((cell) => cell === null))).toBe(true);
  });

  it('detects collision with floor and blocks', () => {
    const board = createEmptyBoard();
    const piece = spawnPiece('O');
    expect(canPlace(board, piece)).toBe(true);

    const atFloor = movePiece(piece, 0, 21);
    expect(canPlace(board, atFloor)).toBe(false);

    board[1][4] = 'I';
    expect(canPlace(board, spawnPiece('T'))).toBe(false);
  });

  it('clears full lines', () => {
    const board = createEmptyBoard();
    for (let col = 0; col < 10; col++) {
      board[21][col] = 'J';
    }
    const result = clearLines(board);
    expect(result.linesCleared).toBe(1);
    expect(result.board[21].every((cell) => cell === null)).toBe(true);
  });

  it('rotates with simple wall kick', () => {
    const board = createEmptyBoard();
    const piece = spawnPiece('T');
    const rotated = rotateActivePiece(board, piece);
    expect(rotated).not.toBeNull();
    expect(rotated?.rotation).toBe(1);
  });

  it('hard drop returns distance and ghost lands on stack', () => {
    const board = createEmptyBoard();
    for (let col = 0; col < 10; col++) {
      board[21][col] = 'L';
    }
    const piece = spawnPiece('I');
    const dropped = hardDrop(board, piece);
    expect(dropped.distance).toBeGreaterThan(0);
    const ghost = getGhostPiece(board, piece);
    expect(ghost.y).toBe(dropped.piece.y);
  });

  it('scores lines and hard drop by stage', () => {
    expect(calculateLineScore(4, 3)).toBe(800 * 3);
    expect(calculateHardDropScore(5)).toBe(10);
  });

  it('tracks stage progress and has 10 stages', () => {
    expect(STAGES.length).toBe(10);
    expect(getStageConfig(1).linesTarget).toBe(5);
    expect(isStageComplete(4, 1)).toBe(false);
    expect(isStageComplete(5, 1)).toBe(true);
  });

  it('draws from 7-bag queue without emptying', () => {
    const first = drawNextPiece([]);
    expect(first.piece).toBeTruthy();
    expect(first.queue.length).toBeGreaterThan(0);
    const second = drawNextPiece(first.queue);
    expect(second.piece).not.toBe(first.piece);
  });
});
