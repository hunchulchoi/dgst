/**
 * 수도쿠 지옥(Hell) 모드 생성기.
 * WSC처럼 판마다 변형 규칙 1개(낮은 확률로 2개 하이브리드)를 적용한다.
 *  - 대각선(Diagonal/X): 양 메인 대각선에도 1~9 중복 금지
 *  - 안티나이트(Anti-Knight): 체스 나이트 이동 거리 칸에 같은 숫자 금지
 *  - 킬러(Killer): 케이지 합 표시, 케이지 내 숫자 중복 금지
 *  - 온도계(Thermo): 전구에서 끝으로 갈수록 숫자가 strictly 증가
 */

const SIZE = 9;
const BOX = 3;
const CELL_COUNT = SIZE * SIZE;
const FULL_MASK = 0x3fe; // 1~9 비트
const KNIGHT_OFFSETS = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1]
];

/**
 * 두 칸이 체스 나이트 이동 거리인지
 * @param {number} row1
 * @param {number} col1
 * @param {number} row2
 * @param {number} col2
 * @returns {boolean}
 */
export function isKnightPeer(row1, col1, row2, col2) {
  const dr = Math.abs(row1 - row2);
  const dc = Math.abs(col1 - col2);
  return (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
}

/**
 * 칸이 두 메인 대각선 중 하나 위에 있는지
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
export function isDiagonalCell(row, col) {
  return row === col || row + col === SIZE - 1;
}

/**
 * @template T
 * @param {T[]} values
 * @returns {T[]}
 */
function shuffle(values) {
  const next = values.slice();
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/** @param {number} mask @returns {number} */
function popcount(mask) {
  let count = 0;
  while (mask) {
    mask &= mask - 1;
    count += 1;
  }
  return count;
}

// 칸 메타데이터: 행/열/박스/대각선 플래그/나이트 피어 (flat index 기준)
const CELL_ROW = new Array(CELL_COUNT);
const CELL_COL = new Array(CELL_COUNT);
const CELL_BOX = new Array(CELL_COUNT);
const CELL_DIAG = new Array(CELL_COUNT); // 1: 주대각선, 2: 부대각선, 3: 둘 다
const CELL_KNIGHTS = new Array(CELL_COUNT);
for (let i = 0; i < CELL_COUNT; i++) {
  const row = Math.floor(i / SIZE);
  const col = i % SIZE;
  CELL_ROW[i] = row;
  CELL_COL[i] = col;
  CELL_BOX[i] = Math.floor(row / BOX) * BOX + Math.floor(col / BOX);
  CELL_DIAG[i] = (row === col ? 1 : 0) | (row + col === SIZE - 1 ? 2 : 0);
  const knights = [];
  for (const [dr, dc] of KNIGHT_OFFSETS) {
    const r = row + dr;
    const c = col + dc;
    if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) knights.push(r * SIZE + c);
  }
  CELL_KNIGHTS[i] = knights;
}

/**
 * 비트마스크 기반 증분 솔버. 행/열/박스는 항상, 대각선/나이트는 옵션으로 검사한다.
 * @param {number[][]} grid
 * @param {{ diagonal?: boolean; knight?: boolean }} [opts]
 */
function makeSolver(grid, opts = {}) {
  const useDiag = Boolean(opts.diagonal);
  const useKnight = Boolean(opts.knight);
  const values = new Array(CELL_COUNT).fill(0);
  const rowM = new Array(SIZE).fill(0);
  const colM = new Array(SIZE).fill(0);
  const boxM = new Array(SIZE).fill(0);
  const diagM = [0, 0];
  const knightM = new Array(CELL_COUNT).fill(0);
  // 나이트 피어 여러 칸이 같은 값을 가질 수 있어 카운트로 관리한다.
  const knightC = Array.from({ length: CELL_COUNT }, () => new Uint8Array(10));

  /**
   * @param {number} index
   * @param {number} value
   */
  function place(index, value) {
    const bit = 1 << value;
    values[index] = value;
    rowM[CELL_ROW[index]] |= bit;
    colM[CELL_COL[index]] |= bit;
    boxM[CELL_BOX[index]] |= bit;
    if (useDiag) {
      if (CELL_DIAG[index] & 1) diagM[0] |= bit;
      if (CELL_DIAG[index] & 2) diagM[1] |= bit;
    }
    if (useKnight) {
      for (const peer of CELL_KNIGHTS[index]) {
        if (++knightC[peer][value] === 1) knightM[peer] |= bit;
      }
    }
  }

  /**
   * @param {number} index
   * @param {number} value
   */
  function unplace(index, value) {
    const bit = 1 << value;
    values[index] = 0;
    rowM[CELL_ROW[index]] &= ~bit;
    colM[CELL_COL[index]] &= ~bit;
    boxM[CELL_BOX[index]] &= ~bit;
    if (useDiag) {
      if (CELL_DIAG[index] & 1) diagM[0] &= ~bit;
      if (CELL_DIAG[index] & 2) diagM[1] &= ~bit;
    }
    if (useKnight) {
      for (const peer of CELL_KNIGHTS[index]) {
        if (--knightC[peer][value] === 0) knightM[peer] &= ~bit;
      }
    }
  }

  /**
   * @param {number} index
   * @returns {number} 허용 값 비트마스크
   */
  function candMask(index) {
    let used =
      rowM[CELL_ROW[index]] | colM[CELL_COL[index]] | boxM[CELL_BOX[index]] | knightM[index];
    if (CELL_DIAG[index] & 1) used |= diagM[0];
    if (CELL_DIAG[index] & 2) used |= diagM[1];
    return FULL_MASK & ~used;
  }

  /** @returns {number} 후보가 가장 적은 빈 칸, 없으면 -1 */
  function bestEmpty() {
    let best = -1;
    let bestCount = 10;
    for (let i = 0; i < CELL_COUNT; i++) {
      if (values[i] !== 0) continue;
      const count = popcount(candMask(i));
      if (count < bestCount) {
        best = i;
        bestCount = count;
        if (count <= 1) break;
      }
    }
    return best;
  }

  for (let i = 0; i < CELL_COUNT; i++) {
    const value = grid[CELL_ROW[i]][CELL_COL[i]];
    if (value !== 0) place(i, value);
  }

  return { values, place, unplace, candMask, bestEmpty };
}

/**
 * 해 개수를 limit까지 센다. 노드 예산 초과 시 limit을 반환해
 * "유일하지 않을 수 있음"으로 보수적으로 처리한다.
 * @param {ReturnType<typeof makeSolver>} solver
 * @param {number} limit
 * @param {{ left: number }} budget
 * @returns {number}
 */
function countSolutions(solver, limit, budget) {
  if (budget.left-- <= 0) return limit;
  const spot = solver.bestEmpty();
  if (spot === -1) return 1;

  let count = 0;
  let mask = solver.candMask(spot);
  while (mask) {
    const bit = mask & -mask;
    mask &= mask - 1;
    const value = 31 - Math.clz32(bit);
    solver.place(spot, value);
    count += countSolutions(solver, limit, budget);
    solver.unplace(spot, value);
    if (count >= limit) return count;
  }
  return count;
}

/**
 * @param {ReturnType<typeof makeSolver>} solver
 * @param {{ left: number }} budget
 * @returns {boolean}
 */
function fillRandom(solver, budget) {
  if (budget.left-- <= 0) return false;
  const spot = solver.bestEmpty();
  if (spot === -1) return true;

  const bits = [];
  let mask = solver.candMask(spot);
  while (mask) {
    const bit = mask & -mask;
    mask &= mask - 1;
    bits.push(bit);
  }
  for (const bit of shuffle(bits)) {
    const value = 31 - Math.clz32(bit);
    solver.place(spot, value);
    if (fillRandom(solver, budget)) return true;
    solver.unplace(spot, value);
  }
  return false;
}

/**
 * 활성 규칙을 만족하는 완성 해 생성
 * @param {{ diagonal?: boolean; knight?: boolean }} rules
 * @returns {number[][]}
 */
function generateSolution(rules) {
  const empty = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  for (let attempt = 0; attempt < 32; attempt++) {
    const solver = makeSolver(empty, rules);
    const budget = { left: attempt === 31 ? Number.MAX_SAFE_INTEGER : 40_000 };
    if (fillRandom(solver, budget)) {
      const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
      for (let i = 0; i < CELL_COUNT; i++) grid[CELL_ROW[i]][CELL_COL[i]] = solver.values[i];
      return grid;
    }
  }
  throw new Error('수도쿠 지옥 해 생성 실패');
}

/**
 * 유일해를 유지하며 숫자를 파낸다.
 * @param {number[][]} solution
 * @param {number} clues
 * @param {{ diagonal?: boolean; knight?: boolean }} rules
 * @returns {number[][]}
 */
function digPuzzle(solution, clues, rules) {
  const solver = makeSolver(solution, rules);
  const positions = shuffle(Array.from({ length: CELL_COUNT }, (_, i) => i));
  let remaining = CELL_COUNT;

  for (const index of positions) {
    if (remaining <= clues) break;
    const value = solver.values[index];
    if (value === 0) continue;
    solver.unplace(index, value);
    if (countSolutions(solver, 2, { left: 60_000 }) !== 1) {
      solver.place(index, value);
    } else {
      remaining -= 1;
    }
  }

  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  for (let i = 0; i < CELL_COUNT; i++) grid[CELL_ROW[i]][CELL_COL[i]] = solver.values[i];
  return grid;
}

/**
 * @param {number} index
 * @returns {number[]}
 */
function orthogonalNeighbors(index) {
  const row = Math.floor(index / SIZE);
  const col = index % SIZE;
  const out = [];
  if (row > 0) out.push(index - SIZE);
  if (row < SIZE - 1) out.push(index + SIZE);
  if (col > 0) out.push(index - 1);
  if (col < SIZE - 1) out.push(index + 1);
  return out;
}

/**
 * @returns {number}
 */
function pickCageSize() {
  const roll = Math.random();
  if (roll < 0.45) return 2;
  if (roll < 0.8) return 3;
  return 4;
}

/**
 * 킬러 케이지 생성. 연결된 2~4칸 영역, 영역 내 숫자 중복 없음.
 * @param {number[][]} solution
 * @returns {Array<{ cells: number[]; sum: number }>}
 */
function generateCages(solution) {
  const owner = new Array(CELL_COUNT).fill(-1);
  /** @type {Array<{ cells: number[]; values: Set<number> }>} */
  const cages = [];
  /** @param {number} index */
  const valueAt = (index) => solution[CELL_ROW[index]][CELL_COL[index]];

  for (const start of shuffle(Array.from({ length: CELL_COUNT }, (_, i) => i))) {
    if (owner[start] !== -1) continue;

    const id = cages.length;
    const target = pickCageSize();
    const cells = [start];
    const values = new Set([valueAt(start)]);
    owner[start] = id;

    while (cells.length < target) {
      const options = new Set();
      for (const cell of cells) {
        for (const next of orthogonalNeighbors(cell)) {
          if (owner[next] === -1 && !values.has(valueAt(next))) options.add(next);
        }
      }
      if (!options.size) break;
      const next = [...options][Math.floor(Math.random() * options.size)];
      owner[next] = id;
      cells.push(next);
      values.add(valueAt(next));
    }

    if (cells.length === 1) {
      // 외딴 1칸 케이지는 공짜 힌트가 되므로 인접 케이지에 흡수시킨다.
      const host = neighborsCage(start, owner, cages, valueAt(start));
      if (host !== -1) {
        owner[start] = host;
        cages[host].cells.push(start);
        cages[host].values.add(valueAt(start));
        continue;
      }
    }

    cages.push({ cells, values });
  }

  return cages.map((cage) => ({
    cells: cage.cells.slice().sort((a, b) => a - b),
    sum: cage.cells.reduce((acc, cell) => acc + valueAt(cell), 0)
  }));
}

/**
 * @param {number} index
 * @param {number[]} owner
 * @param {Array<{ cells: number[]; values: Set<number> }>} cages
 * @param {number} value
 * @returns {number}
 */
function neighborsCage(index, owner, cages, value) {
  for (const next of shuffle(orthogonalNeighbors(index))) {
    const id = owner[next];
    if (id !== -1 && !cages[id].values.has(value)) return id;
  }
  return -1;
}

/**
 * 온도계 생성. 해에서 strictly 증가하는 인접 경로를 찾는다.
 * @param {number[][]} solution
 * @param {number} count
 * @returns {number[][]} 각 온도계는 전구(최솟값)→끝 칸 인덱스 배열
 */
function generateThermos(solution, count = 3) {
  const used = new Set();
  const thermos = [];
  /** @param {number} index */
  const valueAt = (index) => solution[CELL_ROW[index]][CELL_COL[index]];
  let attempts = 0;

  while (thermos.length < count && attempts < 500) {
    attempts += 1;
    const start = Math.floor(Math.random() * CELL_COUNT);
    if (used.has(start)) continue;

    const path = [start];
    while (path.length < 5) {
      const last = path[path.length - 1];
      const options = orthogonalNeighbors(last).filter(
        (next) => !used.has(next) && !path.includes(next) && valueAt(next) > valueAt(last)
      );
      if (!options.length) break;
      path.push(options[Math.floor(Math.random() * options.length)]);
      if (path.length >= 3 && Math.random() < 0.55) break;
    }

    if (path.length >= 3) {
      thermos.push(path);
      for (const cell of path) used.add(cell);
    }
  }
  return thermos;
}

/**
 * 케이지 메타: 칸→케이지 id, 라벨 칸→합계
 * @param {Array<{ cells: number[]; sum: number }>} cages
 * @returns {{ of: number[]; labels: Record<number, number> }}
 */
export function buildCageMeta(cages) {
  const of = new Array(CELL_COUNT).fill(-1);
  /** @type {Record<number, number>} */
  const labels = {};
  cages.forEach((cage, id) => {
    for (const cell of cage.cells) of[cell] = id;
    labels[cage.cells[0]] = cage.sum;
  });
  return { of, labels };
}

/**
 * 케이지 경계 inset box-shadow. 경계당 한 번만 그리기 위해 위/왼쪽만 본다.
 * @param {number} row
 * @param {number} col
 * @param {number[]} of
 * @returns {string}
 */
export function cageInsetShadow(row, col, of) {
  const index = row * SIZE + col;
  const mine = of[index];
  if (mine === undefined || mine === -1) return '';
  const color = 'var(--hell-cage-color)';
  const parts = [];
  if (row > 0 && of[index - SIZE] !== mine) parts.push(`inset 0 2px 0 0 ${color}`);
  if (col > 0 && of[index - 1] !== mine) parts.push(`inset 2px 0 0 0 ${color}`);
  return parts.join(', ');
}

/** 지옥 모드 변형 규칙 라벨 */
export const HELL_RULE_LABELS = {
  diagonal: '대각선X',
  knight: '안티나이트',
  killer: '킬러',
  thermo: '온도계'
};

/**
 * 판마다 적용할 변형 규칙을 고른다. WSC처럼 단일 변형이 기본이고
 * 낮은 확률로 2개 규칙 하이브리드가 출제된다.
 * @returns {{ diagonal: boolean; knight: boolean; killer: boolean; thermo: boolean }}
 */
function pickRules() {
  const keys = ['diagonal', 'knight', 'killer', 'thermo'];
  const count = Math.random() < 0.2 ? 2 : 1;
  const picked = shuffle(keys).slice(0, count);
  return {
    diagonal: picked.includes('diagonal'),
    knight: picked.includes('knight'),
    killer: picked.includes('killer'),
    thermo: picked.includes('thermo')
  };
}

/**
 * 지옥 모드 한 판 생성
 * @param {number} [clues]
 * @returns {{ puzzle: number[][]; solution: number[][]; rules: { diagonal: boolean; knight: boolean; killer: boolean; thermo: boolean }; cages: Array<{ cells: number[]; sum: number }>; thermos: number[][] }}
 */
export function generateHellGame(clues = 24) {
  const rules = pickRules();
  const solution = generateSolution(rules);
  const puzzle = digPuzzle(solution, clues, rules);
  return {
    puzzle,
    solution,
    rules,
    cages: rules.killer ? generateCages(solution) : [],
    thermos: rules.thermo ? generateThermos(solution, rules.diagonal || rules.knight ? 3 : 5) : []
  };
}
