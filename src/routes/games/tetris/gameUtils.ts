/** 테트리스 보드·피스·스테이지 로직 */

export const COLS = 10;
export const ROWS = 20;
export const HIDDEN_ROWS = 2;
export const TOTAL_ROWS = ROWS + HIDDEN_ROWS;

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

export interface ActivePiece {
  type: PieceType;
  rotation: number;
  x: number;
  y: number;
}

export interface StageConfig {
  stage: number;
  linesTarget: number;
  dropIntervalMs: number;
  label: string;
}

export type BoardCell = PieceType | null;
export type Board = BoardCell[][];

export interface LineClearResult {
  board: Board;
  linesCleared: number;
}

export interface HardDropResult {
  piece: ActivePiece;
  distance: number;
}

export interface PlacementScoreResult {
  lineScore: number;
  comboBonus: number;
  backToBackBonus: number;
  total: number;
  nextCombo: number;
  nextBackToBack: boolean;
}

/** 4×4 피스 매트릭스 (행 우선) */
const SHAPES: Record<PieceType, readonly number[][]> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  O: [
    [0, 1, 1, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  T: [
    [0, 1, 0, 0],
    [1, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  S: [
    [0, 1, 1, 0],
    [1, 1, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  Z: [
    [1, 1, 0, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  J: [
    [1, 0, 0, 0],
    [1, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  L: [
    [0, 0, 1, 0],
    [1, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ]
};

export const PIECE_COLORS: Record<PieceType, string> = {
  I: '#00f0f0',
  O: '#f0f000',
  T: '#a000f0',
  S: '#00f000',
  Z: '#f00000',
  J: '#0000f0',
  L: '#f0a000'
};

export const STAGES: StageConfig[] = [
  { stage: 1, linesTarget: 5, dropIntervalMs: 850, label: '입문' },
  { stage: 2, linesTarget: 8, dropIntervalMs: 750, label: '초급' },
  { stage: 3, linesTarget: 10, dropIntervalMs: 650, label: '중급' },
  { stage: 4, linesTarget: 12, dropIntervalMs: 550, label: '숙련' },
  { stage: 5, linesTarget: 15, dropIntervalMs: 450, label: '고급' },
  { stage: 6, linesTarget: 18, dropIntervalMs: 380, label: '전문' },
  { stage: 7, linesTarget: 20, dropIntervalMs: 320, label: '달인' },
  { stage: 8, linesTarget: 22, dropIntervalMs: 270, label: '마스터' },
  { stage: 9, linesTarget: 25, dropIntervalMs: 220, label: '챔피언' },
  { stage: 10, linesTarget: 30, dropIntervalMs: 180, label: '최종' }
];

const PIECE_TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

const LINE_SCORES = [0, 100, 300, 500, 800] as const;

/** 빈 보드 생성 */
export function createEmptyBoard(): Board {
  return Array.from({ length: TOTAL_ROWS }, () => Array<BoardCell>(COLS).fill(null));
}

/** 보너스 스테이지 공용 시작 보드: 오른쪽 한 칸이 빈 4줄 우물 */
export function createBonusBoard(): Board {
  const board = createEmptyBoard();
  const colors: PieceType[] = ['J', 'L', 'S', 'Z'];
  for (let row = TOTAL_ROWS - 4; row < TOTAL_ROWS; row++) {
    for (let col = 0; col < COLS - 1; col++) {
      board[row][col] = colors[(row + col) % colors.length];
    }
  }
  return board;
}

/** 4×4 매트릭스 90° 시계 회전 */
export function rotateMatrix(matrix: readonly number[][]): number[][] {
  const size = matrix.length;
  const rotated = Array.from({ length: size }, () => Array(size).fill(0));
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      rotated[col][size - 1 - row] = matrix[row][col];
    }
  }
  return rotated;
}

/** 회전 상태에 따른 피스 셀 매트릭스 */
export function getShapeMatrix(type: PieceType, rotation: number): number[][] {
  let matrix = SHAPES[type].map((row) => [...row]);
  const turns = ((rotation % 4) + 4) % 4;
  for (let i = 0; i < turns; i++) {
    matrix = rotateMatrix(matrix);
  }
  return matrix;
}

/** 보드 좌표 기준 피스 셀 목록 */
export function getPieceCells(piece: ActivePiece): Array<{ x: number; y: number }> {
  const matrix = getShapeMatrix(piece.type, piece.rotation);
  const cells: Array<{ x: number; y: number }> = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      if (matrix[row][col]) {
        cells.push({ x: piece.x + col, y: piece.y + row });
      }
    }
  }
  return cells;
}

/** 피스 배치 가능 여부 */
export function canPlace(board: Board, piece: ActivePiece): boolean {
  for (const { x, y } of getPieceCells(piece)) {
    if (x < 0 || x >= COLS || y >= TOTAL_ROWS) return false;
    if (y >= 0 && board[y][x] !== null) return false;
  }
  return true;
}

/** 피스 이동 */
export function movePiece(piece: ActivePiece, dx: number, dy: number): ActivePiece {
  return { ...piece, x: piece.x + dx, y: piece.y + dy };
}

/** 피스 회전 (벽킥 포함) */
export function rotateActivePiece(board: Board, piece: ActivePiece): ActivePiece | null {
  const nextRotation = (piece.rotation + 1) % 4;
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    const candidate: ActivePiece = { ...piece, rotation: nextRotation, x: piece.x + kick };
    if (canPlace(board, candidate)) return candidate;
  }
  return null;
}

/** 고스트(미리보기) 피스 위치 */
export function getGhostPiece(board: Board, piece: ActivePiece): ActivePiece {
  let ghost = { ...piece };
  while (canPlace(board, movePiece(ghost, 0, 1))) {
    ghost = movePiece(ghost, 0, 1);
  }
  return ghost;
}

/** 하드 드롭 */
export function hardDrop(board: Board, piece: ActivePiece): HardDropResult {
  let current = { ...piece };
  let distance = 0;
  while (canPlace(board, movePiece(current, 0, 1))) {
    current = movePiece(current, 0, 1);
    distance += 1;
  }
  return { piece: current, distance };
}

/** 피스 고정 */
export function lockPiece(board: Board, piece: ActivePiece): Board {
  const next = board.map((row) => [...row]);
  for (const { x, y } of getPieceCells(piece)) {
    if (y >= 0 && y < TOTAL_ROWS && x >= 0 && x < COLS) {
      next[y][x] = piece.type;
    }
  }
  return next;
}

/** 완성된 줄 제거 */
export function clearLines(board: Board): LineClearResult {
  const remaining: Board = [];
  let linesCleared = 0;

  for (let row = 0; row < TOTAL_ROWS; row++) {
    const full = board[row].every((cell) => cell !== null);
    if (full) {
      linesCleared += 1;
    } else {
      remaining.push([...board[row]]);
    }
  }

  while (remaining.length < TOTAL_ROWS) {
    remaining.unshift(Array<BoardCell>(COLS).fill(null));
  }

  return { board: remaining, linesCleared };
}

/** 줄 클리어 점수 */
export function calculateLineScore(linesCleared: number, stage: number): number {
  if (linesCleared <= 0 || linesCleared > 4) return 0;
  return LINE_SCORES[linesCleared] * stage;
}

/** 하드 드롭 보너스 */
export function calculateHardDropScore(distance: number): number {
  return distance * 2;
}

/** 수동 소프트 드롭 보너스 (한 칸당 1점) */
export function calculateSoftDropScore(distance: number): number {
  return Math.max(0, distance);
}

/** 줄 클리어·콤보·백투백을 합산한 배치 점수 */
export function calculatePlacementScore(
  linesCleared: number,
  stage: number,
  currentCombo: number,
  backToBackActive: boolean
): PlacementScoreResult {
  if (linesCleared <= 0) {
    return {
      lineScore: 0,
      comboBonus: 0,
      backToBackBonus: 0,
      total: 0,
      nextCombo: 0,
      nextBackToBack: backToBackActive
    };
  }

  const lineScore = calculateLineScore(linesCleared, stage);
  const nextCombo = currentCombo + 1;
  const comboBonus = Math.max(0, nextCombo - 1) * 50 * stage;
  const isTetris = linesCleared === 4;
  const backToBackBonus = isTetris && backToBackActive ? Math.floor(lineScore * 0.5) : 0;
  return {
    lineScore,
    comboBonus,
    backToBackBonus,
    total: lineScore + comboBonus + backToBackBonus,
    nextCombo,
    nextBackToBack: isTetris
  };
}

/** 스폰 위치 피스 생성 (히든 버퍼 바로 아래에서 보이도록) */
export function spawnPiece(type: PieceType): ActivePiece {
  return { type, rotation: 0, x: 3, y: HIDDEN_ROWS };
}

/** 스폰 불가 = 게임오버 */
export function isSpawnBlocked(board: Board, piece: ActivePiece): boolean {
  return !canPlace(board, piece);
}

/** 7-bag 랜덤 시퀀스 */
export function createBag(): PieceType[] {
  const bag = [...PIECE_TYPES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

/** 모든 플레이어에게 동일한 보너스 피스 순서 */
export function createBonusQueue(): PieceType[] {
  const sequence: PieceType[] = ['I', 'T', 'O', 'L', 'J', 'S', 'Z'];
  return Array.from({ length: 6 }, () => sequence).flat();
}

/** 스테이지 설정 (1-based) */
export function getStageConfig(stage: number): StageConfig {
  const index = Math.min(Math.max(stage, 1), STAGES.length) - 1;
  return STAGES[index];
}

/** 현재 스테이지 클리어 여부 */
export function isStageComplete(stageLines: number, stage: number): boolean {
  return stageLines >= getStageConfig(stage).linesTarget;
}

/** 전체 클리어 여부 */
export function isGameComplete(stage: number): boolean {
  return stage > STAGES.length;
}

/** 큐에 피스가 부족하면 bag 채우기 */
export function ensureQueue(queue: PieceType[]): PieceType[] {
  let next = [...queue];
  while (next.length < 4) {
    next = [...next, ...createBag()];
  }
  return next;
}

/** 다음 피스 큐에서 하나 꺼내기 */
export function drawNextPiece(queue: PieceType[]): { piece: PieceType; queue: PieceType[] } {
  const ensured = ensureQueue(queue);
  return { piece: ensured[0], queue: ensured.slice(1) };
}
