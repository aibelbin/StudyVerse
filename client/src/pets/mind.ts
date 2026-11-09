import type { PetAnim, PetKind } from '../../../shared/types';

/** Something a pet might wander over to. */
export interface Poi {
  x: number;
  z: number;
  kind: 'flower' | 'plant' | 'toy' | 'bench' | 'rock' | 'water' | 'person' | 'pet' | 'garden';
  /** For people and pets: who it is (so greetings aren't repeated straight away). */
  id?: string;
}

export interface MindInput {
  now: number; // ms
  pet: { x: number; z: number };
  owner: { x: number; z: number; speed: number; sitting: boolean; studying: boolean };
  /** Interesting things near the owner (static ones and other players and pets). */
  pois: Poi[];
  /** Somewhere in water near the owner, for pets that swim (null if no water close by). */
  water: { x: number; z: number } | null;
}

export interface MindOutput {
  /** Where to head (null = stay put). */
  target: { x: number; z: number } | null;
  /** 0..1 of the pet's top speed. */
  speed: number;
  /** What to look like while getting there and when there. */
  moving: PetAnim;
  still: PetAnim;
  /** Follow the owner with the trained policy instead of steering to a target. */
  follow: boolean;
}

interface Personality {
  /** How far from the owner it roams when the owner is still, m. */
  roam: number;
  /** How close it keeps while the owner walks. */
  heel: number;
  walk: PetAnim;
  run: PetAnim;
  idle: PetAnim;
  rest: PetAnim;
  /** Relative weights for what to do next when free. */
  weights: { wander: number; sniff: number; greet: number; play: number; rest: number; special: number };
  /** Its own tricks: a still anim it does in place (sometimes after travelling a little). */
  specials: PetAnim[];
  /** Things it especially likes to go and look at. */
  likes: Poi['kind'][];
  swims: boolean;
}

export const PERSONALITY: Record<PetKind, Personality> = {
  kitten: {
    roam: 8, heel: 2.4, walk: 'walk', run: 'run', idle: 'sit', rest: 'sleep',
    weights: { wander: 3, sniff: 3, greet: 2, play: 4, rest: 1.5, special: 4 },
    specials: ['pounce', 'zoom', 'play'], likes: ['flower', 'plant', 'toy', 'pet'], swims: false,
  },
  bunny: {
    roam: 7, heel: 2.2, walk: 'hop', run: 'hop', idle: 'sit', rest: 'flop',
    weights: { wander: 3, sniff: 5, greet: 1.5, play: 1.5, rest: 2, special: 2.5 },
    specials: ['binky', 'sniff'], likes: ['flower', 'garden', 'plant'], swims: false,
  },
  duckling: {
    roam: 4.5, heel: 1.4, walk: 'walk', run: 'run', idle: 'idle', rest: 'sleep',
    weights: { wander: 2, sniff: 2, greet: 2.5, play: 1.5, rest: 1.5, special: 3 },
    specials: ['quack', 'swim'], likes: ['water', 'person', 'pet'], swims: true,
  },
  frog: {
    roam: 6, heel: 2.6, walk: 'leap', run: 'leap', idle: 'sit', rest: 'sit',
    weights: { wander: 1.5, sniff: 1, greet: 1, play: 0.5, rest: 5, special: 3 },
    specials: ['tongue', 'croak', 'swim'], likes: ['water', 'rock', 'flower'], swims: true,
  },
};

type Activity = { name: string; target: { x: number; z: number } | null; speed: number; moving: PetAnim; still: PetAnim; until: number; arriveThen?: PetAnim };

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * A pet's little mind: follows when you walk, and when you stop it wanders, goes to sniff things,
 * greets people, plays with other pets, naps, and does its own tricks, each with its own personality.
 * Deterministic given rand, so it can be tested.
 */
export class PetMind {
  private act: Activity | null = null;
  private recent = new Map<string, number>(); // poi key -> when it was last visited
  private lastStill = 0; // when the owner stopped moving

  constructor(readonly kind: PetKind, private rand: () => number = Math.random) {}

  get personality(): Personality {
    return PERSONALITY[this.kind];
  }

  think(i: MindInput): MindOutput {
    const p = this.personality;
    const toOwner = dist(i.pet, i.owner);
    // The owner is walking (or far away): keep up, at a run when well behind.
    if (i.owner.speed > 0.6 || toOwner > p.roam + 3) {
      this.act = null;
      this.lastStill = i.now;
      const far = toOwner > p.heel + 3;
      return { target: null, speed: far ? 1 : 0.8, moving: far ? p.run : p.walk, still: p.idle, follow: toOwner > p.heel };
    }
    if (!this.act || i.now >= this.act.until) this.act = this.choose(i);
    const a = this.act;
    // Keep it near its person: an activity that drifted too far ends early.
    if (a.target && dist(a.target, i.owner) > p.roam + 1.5) this.act = this.choose(i);
    const arrived = !this.act.target || dist(i.pet, this.act.target) < 0.45;
    return {
      target: arrived ? null : this.act.target,
      speed: this.act.speed,
      moving: this.act.moving,
      still: arrived && this.act.arriveThen ? this.act.arriveThen : this.act.still,
      follow: false,
    };
  }

  /** Picks what to do next. */
  private choose(i: MindInput): Activity {
    const p = this.personality;
    const r = this.rand;
    const near = (o: { x: number; z: number }, max: number) => dist(o, i.owner) <= max;
    const fresh = (poi: Poi) => i.now - (this.recent.get(this.key(poi)) ?? -1e9) > 40_000;
    const between = (lo: number, hi: number) => lo + r() * (hi - lo);
    const spot = (radius: number) => {
      const a = r() * Math.PI * 2;
      const d = 1 + r() * (radius - 1);
      return { x: i.owner.x + Math.cos(a) * d, z: i.owner.z + Math.sin(a) * d };
    };
    // Studying (or just sat down for a while): curl up close by.
    if (i.owner.studying || (i.owner.sitting && i.now - this.lastStill > 20_000 && r() < 0.6)) {
      return { name: 'rest', target: spot(2.2), speed: 0.5, moving: p.walk, still: p.rest, until: i.now + between(20_000, 40_000) };
    }
    const people = i.pois.filter((o) => o.kind === 'person' && near(o, p.roam + 2) && fresh(o));
    const pets = i.pois.filter((o) => o.kind === 'pet' && near(o, p.roam + 2) && fresh(o));
    const things = i.pois.filter((o) => o.kind !== 'person' && o.kind !== 'pet' && near(o, p.roam) && fresh(o));
    const w = { ...p.weights };
    if (!people.length) w.greet = 0;
    if (!pets.length) w.play *= 0.4; // still plays a little on its own (chasing its tail, batting at you)
    if (!things.length) w.sniff = 0;
    const total = Object.values(w).reduce((s, v) => s + v, 0);
    let pick = r() * total;
    const choice = (Object.keys(w) as (keyof typeof w)[]).find((k) => (pick -= w[k]) < 0) ?? 'wander';
    const go = (poi: Poi) => {
      this.recent.set(this.key(poi), i.now);
      const a = r() * Math.PI * 2;
      return { x: poi.x + Math.cos(a) * 0.7, z: poi.z + Math.sin(a) * 0.7 };
    };
    switch (choice) {
      case 'sniff': {
        const liked = things.filter((o) => p.likes.includes(o.kind));
        const pool = liked.length && r() < 0.7 ? liked : things;
        const poi = pool[Math.floor(r() * pool.length)];
        return { name: 'sniff', target: go(poi), speed: 0.7, moving: p.walk, still: 'sniff', until: i.now + between(5000, 9000) };
      }
      case 'greet': {
        const who = people[Math.floor(r() * people.length)];
        return { name: 'greet', target: go(who), speed: 0.85, moving: p.walk, still: 'play', until: i.now + between(4000, 7000) };
      }
      case 'play': {
        if (pets.length) {
          const friend = pets[Math.floor(r() * pets.length)];
          return { name: 'play', target: go(friend), speed: 1, moving: p.run, still: 'play', until: i.now + between(5000, 8000) };
        }
        // nobody to play with: bat at its person's feet
        return { name: 'play', target: { x: i.owner.x + (r() - 0.5) * 1.4, z: i.owner.z + 0.9 }, speed: 0.9, moving: p.run, still: 'play', until: i.now + between(3000, 5000) };
      }
      case 'rest':
        return { name: 'rest', target: spot(3), speed: 0.5, moving: p.walk, still: r() < 0.5 ? p.rest : p.idle, until: i.now + between(9000, 18_000) };
      case 'special': {
        const trick = p.specials[Math.floor(r() * p.specials.length)];
        if (trick === 'swim') {
          if (!i.water) break;
          return { name: 'swim', target: i.water, speed: 0.7, moving: p.walk, still: 'swim', arriveThen: 'swim', until: i.now + between(10_000, 18_000) };
        }
        if (trick === 'zoom') {
          // the zoomies: a dash to a spot and straight back out to another
          return { name: 'zoom', target: spot(p.roam), speed: 1, moving: 'zoom', still: 'sit', until: i.now + between(2200, 3500) };
        }
        if (trick === 'tongue') {
          const poi = things.find((o) => o.kind === 'water' || o.kind === 'flower');
          return { name: 'tongue', target: poi ? go(poi) : null, speed: 0.8, moving: p.walk, still: 'tongue', until: i.now + between(3500, 6000) };
        }
        return { name: trick, target: r() < 0.5 ? spot(3) : null, speed: 0.7, moving: p.walk, still: trick, until: i.now + between(2500, 4500) };
      }
    }
    return { name: 'wander', target: spot(p.roam), speed: between(0.45, 0.75), moving: p.walk, still: p.idle, until: i.now + between(4000, 8000) };
  }

  private key(poi: Poi): string {
    return poi.id ?? `${poi.kind}:${poi.x.toFixed(1)}:${poi.z.toFixed(1)}`;
  }
}
