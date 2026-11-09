export type Gift = 'letter' | 'cookie' | 'balloon' | 'cupcake' | 'cactus' | 'bouquet' | 'duck' | 'box' | 'bear' | 'starJar';

export interface GiftInfo {
  name: string;
  emoji: string;
  price: number;
  /** What its owner can do with it from their keepsakes. */
  use?: 'eat' | 'release';
  color: string;
}

export const GIFTS: Record<Gift, GiftInfo> = {
  letter: { name: 'love letter', emoji: '💌', price: 5, color: '#ff9fb0' },
  cookie: { name: 'cookie', emoji: '🍪', price: 6, use: 'eat', color: '#d9a066' },
  balloon: { name: 'balloon', emoji: '🎈', price: 8, use: 'release', color: '#ff5a6a' },
  cupcake: { name: 'cupcake', emoji: '🧁', price: 10, use: 'eat', color: '#f7a1c4' },
  cactus: { name: 'mini cactus', emoji: '🌵', price: 12, color: '#6fbf5f' },
  bouquet: { name: 'bouquet', emoji: '💐', price: 15, color: '#ff8fab' },
  duck: { name: 'rubber duckie', emoji: '🦆', price: 18, color: '#ffd84d' },
  box: { name: 'surprise box', emoji: '🎁', price: 20, color: '#7ab8ff' },
  bear: { name: 'plushie bear', emoji: '🧸', price: 25, color: '#c98a5a' },
  starJar: { name: 'star jar', emoji: '✨', price: 30, color: '#ffe68a' },
};

export const GIFT_KINDS = Object.keys(GIFTS) as Gift[];
export const isGift = (x: unknown): x is Gift => typeof x === 'string' && x in GIFTS;

/** "a plushie bear", "an …" */
export const aGift = (g: Gift) => `${/^[aeiou]/.test(GIFTS[g].name) ? 'an' : 'a'} ${GIFTS[g].name}`;

export interface Keepsake {
  id: number;
  gift: Gift;
  fromName: string;
}

export interface Status {
  emoji: string;
  text: string;
  /** Server time it clears itself, or null to keep it. */
  until: number | null;
}

export const STATUS_PRESETS: { emoji: string; text: string }[] = [
  { emoji: '🍜', text: 'Eating' }, { emoji: '😴', text: 'Napping' }, { emoji: '📚', text: 'Studying' },
  { emoji: '☕', text: 'Coffee break' }, { emoji: '🚶', text: 'Be right back' }, { emoji: '🎧', text: 'In the zone' },
];
export const STATUS_MINUTES = [30, 60, 240] as const;
export const STATUS_TEXT_MAX = 40;

export type Feature = 'globalChat' | 'dms' | 'voice' | 'gifts' | 'stageScreen' | 'notes' | 'trucks' | 'golf';
export const FEATURES: Record<Feature, string> = {
  globalChat: 'Everyone chat', dms: 'Private messages', voice: 'Voice chat', gifts: 'Gifts',
  stageScreen: 'Stage screen', notes: 'Notice board', trucks: 'Trucks', golf: 'Mini-golf',
};
export const FEATURE_KINDS = Object.keys(FEATURES) as Feature[];
export type Features = Record<Feature, boolean>;
export const allOn = (): Features => Object.fromEntries(FEATURE_KINDS.map((f) => [f, true])) as Features;

/** What the admin panel lists for each player. */
export interface AdminPlayer {
  id: string;
  name: string;
  scene: string;
  online: boolean;
  kp: number;
  status: Status | null;
  mutedUntil: number | null;
  bannedUntil: number | null;
}
