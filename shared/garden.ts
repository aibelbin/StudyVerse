import { PLOT_SPOTS, WATER_BOOST } from './constants';

export type Flower = 'tulip' | 'daisy' | 'sunflower' | 'poppy' | 'lavender' | 'rose' | 'lotus' | 'glowLily';

export interface FlowerInfo {
  name: string;
  plural: string;
  /** Focus minutes from seed to bloom. */
  growMin: number;
  /** KP to unlock for good (0 = free). */
  price: number;
  /** KP for picking a bloom. */
  harvestKp: number;
  /** Petal and centre colours. */
  color: string;
  accent: string;
}

export const FLOWERS: Record<Flower, FlowerInfo> = {
  tulip: { name: 'tulip', plural: 'tulips', growMin: 25, price: 0, harvestKp: 5, color: '#ff6f8f', accent: '#ffd36e' },
  daisy: { name: 'daisy', plural: 'daisies', growMin: 30, price: 0, harvestKp: 5, color: '#ffffff', accent: '#ffcf3a' },
  sunflower: { name: 'sunflower', plural: 'sunflowers', growMin: 40, price: 0, harvestKp: 5, color: '#ffc531', accent: '#7a4a24' },
  poppy: { name: 'poppy', plural: 'poppies', growMin: 45, price: 0, harvestKp: 5, color: '#ff5a3c', accent: '#2b2b2b' },
  lavender: { name: 'lavender', plural: 'lavender', growMin: 60, price: 15, harvestKp: 10, color: '#a98be8', accent: '#7b5cc4' },
  rose: { name: 'rose', plural: 'roses', growMin: 75, price: 25, harvestKp: 10, color: '#e8364f', accent: '#b01e36' },
  lotus: { name: 'lotus', plural: 'lotuses', growMin: 90, price: 30, harvestKp: 10, color: '#ffb7d0', accent: '#fff2a8' },
  glowLily: { name: 'glow-lily', plural: 'glow-lilies', growMin: 120, price: 40, harvestKp: 10, color: '#a8f0ff', accent: '#e8ffff' },
};

export const FLOWER_KINDS = Object.keys(FLOWERS) as Flower[];
export const isFlower = (x: unknown): x is Flower => typeof x === 'string' && x in FLOWERS;
/** The wallet item that unlocks a rare flower. */
export const seedItem = (f: Flower) => `seed-${f}`;

export type Stage = 'seed' | 'sprout' | 'bud' | 'bloom';

export function stageOf(progress: number, growMin: number): Stage {
  const k = progress / growMin;
  return k >= 1 ? 'bloom' : k >= 0.6 ? 'bud' : k >= 0.25 ? 'sprout' : 'seed';
}

export interface Spot {
  flower: Flower;
  /** Focus minutes grown so far. */
  progress: number;
}

export interface PlotState {
  kind: 'plot';
  owner: string | null;
  ownerName: string | null;
  spots: (Spot | null)[];
  /** Focus minutes left at the watered (faster) rate. */
  boostMin: number;
  vase: Flower | null;
  /** The owner's last focus finish or garden action (server ms). */
  lastActive: number;
}

export const emptyPlot = (): PlotState => ({
  kind: 'plot', owner: null, ownerName: null, spots: Array(PLOT_SPOTS).fill(null), boostMin: 0, vase: null, lastActive: 0,
});

/**
 * A finished focus session's minutes grow every planted, unbloomed spot; while the plot is watered
 * they count 50% extra. Returns the new state and the flowers that reached bloom just now.
 */
export function grow(s: PlotState, focusMin: number): { state: PlotState; bloomed: Flower[] } {
  const boosted = Math.min(focusMin, s.boostMin);
  const gain = focusMin + WATER_BOOST * boosted;
  const bloomed: Flower[] = [];
  const spots = s.spots.map((sp) => {
    if (!sp) return null;
    const need = FLOWERS[sp.flower].growMin;
    if (sp.progress >= need) return sp;
    const progress = Math.min(need, sp.progress + gain);
    if (progress >= need) bloomed.push(sp.flower);
    return { ...sp, progress };
  });
  const planted = s.spots.some((sp) => sp && sp.progress < FLOWERS[sp.flower].growMin);
  return { state: { ...s, spots, boostMin: planted ? s.boostMin - boosted : s.boostMin }, bloomed };
}
