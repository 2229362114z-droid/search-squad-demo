export interface RandomSample {
  readonly state: number;
  readonly value: number;
}

const NON_ZERO_FALLBACK = 0x6d2b79f5;

export function seedToRandomState(seed: string | number): number {
  if (typeof seed === 'number') {
    const normalized = seed >>> 0;
    return normalized === 0 ? NON_ZERO_FALLBACK : normalized;
  }

  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const normalized = hash >>> 0;
  return normalized === 0 ? NON_ZERO_FALLBACK : normalized;
}

export function nextRandom(state: number): RandomSample {
  let next = state >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  next >>>= 0;
  if (next === 0) next = NON_ZERO_FALLBACK;
  return { state: next, value: next / 0x1_0000_0000 };
}

export function randomInteger(
  state: number,
  minimum: number,
  maximum: number,
): { readonly state: number; readonly value: number } {
  if (maximum < minimum) {
    throw new Error('随机整数范围无效');
  }
  const sample = nextRandom(state);
  const range = maximum - minimum + 1;
  return {
    state: sample.state,
    value: minimum + Math.floor(sample.value * range),
  };
}

export function weightedIndex(
  state: number,
  weights: readonly number[],
): { readonly state: number; readonly index: number } {
  if (weights.length === 0) throw new Error('加权随机候选不能为空');
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (total <= 0) return { state, index: 0 };

  const sample = nextRandom(state);
  const threshold = sample.value * total;
  let accumulated = 0;
  for (let index = 0; index < weights.length; index += 1) {
    accumulated += Math.max(0, weights[index] ?? 0);
    if (threshold < accumulated) {
      return { state: sample.state, index };
    }
  }
  return { state: sample.state, index: weights.length - 1 };
}
