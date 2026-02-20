export interface FruitType {
  level: number;
  value: number;
  radius: number;
  color: string;
  label: string;
}

export const FRUITS: FruitType[] = [
  { level: 0, value: 2, radius: 20, color: '#eee4da', label: '2' },
  { level: 1, value: 4, radius: 26, color: '#ede0c8', label: '4' },
  { level: 2, value: 8, radius: 32, color: '#f2b179', label: '8' },
  { level: 3, value: 16, radius: 38, color: '#f59563', label: '16' },
  { level: 4, value: 32, radius: 44, color: '#f67c5f', label: '32' },
  { level: 5, value: 64, radius: 50, color: '#f65e3b', label: '64' },
  { level: 6, value: 128, radius: 56, color: '#edcf72', label: '128' },
  { level: 7, value: 256, radius: 62, color: '#edcc61', label: '256' },
  { level: 8, value: 512, radius: 68, color: '#edc850', label: '512' },
  { level: 9, value: 1024, radius: 74, color: '#edc53f', label: '1024' },
  { level: 10, value: 2048, radius: 80, color: '#edc22e', label: '2048' }
];

export const WALL_THICKNESS = 20;
export const GAME_WIDTH = 360; // Slightly wider to fit fruits
export const GAME_HEIGHT = 600;
