/**
 * Trains the pet policy with OpenAI-style Evolution Strategies (antithetic sampling, rank-shaped
 * returns, Adam). Pure TypeScript, no dependencies. Run it on a remote machine, never the Mac:
 *   node --import tsx pets/train.ts [iterations] [out.json]
 */
import { writeFileSync } from 'node:fs';
import { fallbackBrain, mlpForward, PARAMS } from '../shared/pets/brain';
import { runEpisode } from '../shared/pets/sim';
import { rng } from '../shared/rng';

const ITERS = Number(process.argv[2] ?? 300);
const OUT = process.argv[3] ?? 'shared/pets/policy.json';
const PAIRS = 32;
const SIGMA = 0.05;
const LR = 0.03;
const EPISODES = 3;

const r = rng(12345);
const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

const theta = Float64Array.from({ length: PARAMS }, () => gauss() * 0.1);
const m = new Float64Array(PARAMS);
const v = new Float64Array(PARAMS);
const evalParams = (p: Float64Array, seeds: number[]) => seeds.reduce((s, sd) => s + runEpisode((obs) => mlpForward(p, obs), sd), 0) / seeds.length;

const holdout = [9001, 9002, 9003, 9004, 9005, 9006];
const fallbackScore = holdout.reduce((s, sd) => s + runEpisode(fallbackBrain, sd), 0) / holdout.length;
const randomScore = holdout.reduce((s, sd) => s + runEpisode(() => [r() * 2 - 1, r() * 2 - 1], sd), 0) / holdout.length;
console.log(`params ${PARAMS} | baseline: fallback ${fallbackScore.toFixed(3)}, random ${randomScore.toFixed(3)}`);

let best = { score: -Infinity, params: Float64Array.from(theta) };
const started = Date.now();
for (let it = 1; it <= ITERS; it++) {
  const seeds = Array.from({ length: EPISODES }, (_, k) => it * 101 + k);
  const eps: Float64Array[] = [];
  const scores: number[] = [];
  const cand = new Float64Array(PARAMS);
  for (let k = 0; k < PAIRS; k++) {
    const e = Float64Array.from({ length: PARAMS }, gauss);
    eps.push(e);
    for (const sign of [1, -1]) {
      for (let i = 0; i < PARAMS; i++) cand[i] = theta[i] + sign * SIGMA * e[i];
      scores.push(evalParams(cand, seeds));
    }
  }
  // Rank-shape returns to [-0.5, 0.5] so a few lucky episodes don't dominate.
  const order = scores.map((s, i) => [s, i] as const).sort((a, b) => a[0] - b[0]);
  const shaped = new Float64Array(scores.length);
  order.forEach(([, i], rank) => (shaped[i] = rank / (scores.length - 1) - 0.5));
  const t = it;
  for (let i = 0; i < PARAMS; i++) {
    let g = 0;
    for (let k = 0; k < PAIRS; k++) g += (shaped[2 * k] - shaped[2 * k + 1]) * eps[k][i];
    g = -g / (2 * PAIRS * SIGMA) + 0.005 * theta[i]; // minimise -return, with a little weight decay
    m[i] = 0.9 * m[i] + 0.1 * g;
    v[i] = 0.999 * v[i] + 0.001 * g * g;
    theta[i] -= (LR * (m[i] / (1 - 0.9 ** t))) / (Math.sqrt(v[i] / (1 - 0.999 ** t)) + 1e-8);
  }
  if (it % 10 === 0 || it === ITERS) {
    const score = evalParams(theta, holdout);
    if (score > best.score) best = { score, params: Float64Array.from(theta) };
    console.log(`iter ${it} | holdout ${score.toFixed(3)} | best ${best.score.toFixed(3)} | ${((Date.now() - started) / 1000).toFixed(0)}s`);
  }
}

writeFileSync(OUT, JSON.stringify({
  version: 1,
  method: 'evolution-strategies',
  trainedAt: new Date().toISOString(),
  iterations: ITERS,
  score: best.score,
  baselines: { fallback: fallbackScore, random: randomScore },
  params: Array.from(best.params, (x) => Math.round(x * 1e5) / 1e5),
}));
console.log(`wrote ${OUT}: holdout ${best.score.toFixed(3)} (fallback ${fallbackScore.toFixed(3)}, random ${randomScore.toFixed(3)})`);
