import { describe, expect, it } from 'vitest';
import {
  calculateHardDropScore,
  calculateLineScore,
  calculatePlacementScore,
  calculateSoftDropScore,
  canPlace,
  clearLines,
  createBonusBoard,
  createBonusQueue,
  createEmptyBoard,
  createStageBoard,
  drawNextPiece,
  getGhostPiece,
  getStageConfig,
  getStageGarbageRows,
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

    const atFloor = movePiece(piece, 0, 20);
    expect(canPlace(board, atFloor)).toBe(false);

    board[3][4] = 'I';
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
    expect(calculateSoftDropScore(5)).toBe(5);
  });

  it('rewards consecutive clears with combos', () => {
    expect(calculatePlacementScore(1, 2, 0, false)).toEqual({
      lineScore: 200,
      comboBonus: 0,
      backToBackBonus: 0,
      total: 200,
      nextCombo: 1,
      nextBackToBack: false
    });
    expect(calculatePlacementScore(2, 2, 1, false).comboBonus).toBe(100);
    expect(calculatePlacementScore(0, 2, 3, false).nextCombo).toBe(0);
  });

  it('rewards back-to-back tetrises and breaks the chain on a smaller clear', () => {
    const first = calculatePlacementScore(4, 3, 0, false);
    expect(first.backToBackBonus).toBe(0);
    expect(first.nextBackToBack).toBe(true);

    const second = calculatePlacementScore(4, 3, first.nextCombo, first.nextBackToBack);
    expect(second.backToBackBonus).toBe(1200);
    expect(second.total).toBe(3750);
    expect(calculatePlacementScore(1, 3, second.nextCombo, true).nextBackToBack).toBe(false);
  });

  it('tracks stage progress and has 20 increasingly fast stages', () => {
    expect(STAGES.length).toBe(20);
    expect(getStageConfig(1).linesTarget).toBe(5);
    expect(getStageConfig(20).dropIntervalMs).toBeLessThan(getStageConfig(10).dropIntervalMs);
    expect(isStageComplete(4, 1)).toBe(false);
    expect(isStageComplete(5, 1)).toBe(true);
  });

  it('adds deterministic garbage rows after stage 10', () => {
    expect(getStageGarbageRows(10)).toBe(0);
    expect(getStageGarbageRows(11)).toBe(2);
    expect(getStageGarbageRows(20)).toBe(6);
    expect(createStageBoard(10)).toEqual(createEmptyBoard());

    const stage11 = createStageBoard(11);
    expect(stage11).toEqual(createStageBoard(11));
    expect(stage11.slice(0, 20).every((row) => row.every((cell) => cell === null))).toBe(true);
    expect(
      stage11.slice(20).every((row) => row.some((cell) => cell === null) && row.some(Boolean))
    ).toBe(true);
  });

  it('draws from 7-bag queue without emptying', () => {
    const first = drawNextPiece([]);
    expect(first.piece).toBeTruthy();
    expect(first.queue.length).toBeGreaterThan(0);
    const second = drawNextPiece(first.queue);
    expect(second.piece).not.toBe(first.piece);
  });

  it('creates the deterministic bonus challenge', () => {
    const board = createBonusBoard();
    for (let row = 18; row < 22; row++) {
      expect(board[row].slice(0, 9).every((cell) => cell !== null)).toBe(true);
      expect(board[row][9]).toBeNull();
    }

    const queue = createBonusQueue();
    expect(queue).toHaveLength(42);
    expect(queue.slice(0, 7)).toEqual(['I', 'T', 'O', 'L', 'J', 'S', 'Z']);
    expect(queue.slice(7, 14)).toEqual(queue.slice(0, 7));
  });

  it('lets the opening bonus I-piece clear the four-line well', () => {
    const board = createBonusBoard();
    const rotated = rotateActivePiece(board, spawnPiece('I'));
    expect(rotated).not.toBeNull();
    const aimed = movePiece(rotated!, 4, 0);
    const dropped = hardDrop(board, aimed);
    const result = clearLines(lockPiece(board, dropped.piece));
    expect(result.linesCleared).toBe(4);
  });
});
