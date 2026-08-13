/** @type {Record<string, string>} */
export const ARCADE_GAME_LABELS = {
  slot: '뺑뺑이',
  seotda: '섯다',
  ssamchi: '짤짤이',
  'medal-janken': '짱껨보'
};

/** @param {string | null | undefined} game */
export function getArcadeGameLabel(game) {
  return game ? (ARCADE_GAME_LABELS[game] ?? game) : '';
}
