/** Largeurs des colonnes du tableau arborescent (px). */
export const COLS = {
  name: 270,
  project: 104,
  estimate: 46,
  effort: 46,
  remaining: 46,
  assignees: 80,
  start: 60,
  end: 60,
  status: 96,
} as const;

export const TABLE_WIDTH = Object.values(COLS).reduce((a, b) => a + b, 0);
