import type { Hat, Look } from './types';

export const HATS: Hat[] = ['none', 'beanie', 'cap', 'bucket', 'flower'];

export const HAT_LABELS: Record<Hat, string> = {
  none: 'No hat',
  beanie: 'Beanie',
  cap: 'Cap',
  bucket: 'Bucket hat',
  flower: 'Flower crown',
};

export const BODY_COLORS = ['#f4a6a6', '#f7c873', '#a8d8a0', '#9cc9f0', '#c9b2f2', '#f2b5d4', '#8fd3c7', '#f0e6d2'];
export const SKIN_TONES = ['#fde3cf', '#f3c9a5', '#e0ac83', '#c68a5e', '#9a6440', '#6b4329'];

export const DEFAULT_LOOK: Look = { body: '#9cc9f0', skin: '#f3c9a5', hat: 'beanie' };
