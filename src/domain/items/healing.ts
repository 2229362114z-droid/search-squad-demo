export interface HealingTarget {
  readonly id: string;
  readonly health: number;
  readonly maxHealth: number;
}

export interface HealingDistribution {
  readonly healthById: Readonly<Record<string, number>>;
  readonly healedById: Readonly<Record<string, number>>;
  readonly usedAmount: number;
  readonly unusedAmount: number;
}

const EPSILON = 0.000001;
const normalize = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

export function distributeHealingByLowestHealthRatio(
  targets: readonly HealingTarget[],
  totalAmount: number,
): HealingDistribution {
  const healthById: Record<string, number> = Object.fromEntries(
    targets.map((target) => [target.id, target.health]),
  );
  const healedById: Record<string, number> = Object.fromEntries(
    targets.map((target) => [target.id, 0]),
  );
  let remaining = Math.max(0, totalAmount);

  while (remaining > EPSILON) {
    const candidates = targets
      .filter((target) => {
        const health = healthById[target.id] ?? target.health;
        return health > 0 && health < target.maxHealth - EPSILON;
      })
      .sort((left, right) => {
        const ratioDifference =
          (healthById[left.id] ?? left.health) / left.maxHealth -
          (healthById[right.id] ?? right.health) / right.maxHealth;
        return Math.abs(ratioDifference) > EPSILON
          ? ratioDifference
          : targets.indexOf(left) - targets.indexOf(right);
      });
    const lowest = candidates[0];
    if (!lowest) break;

    const lowestRatio =
      (healthById[lowest.id] ?? lowest.health) / lowest.maxHealth;
    const lowestGroup = candidates.filter((target) => {
      const ratio = (healthById[target.id] ?? target.health) / target.maxHealth;
      return Math.abs(ratio - lowestRatio) <= EPSILON;
    });
    const nextTarget = candidates.find((target) => {
      const ratio = (healthById[target.id] ?? target.health) / target.maxHealth;
      return ratio > lowestRatio + EPSILON;
    });
    const targetRatio = nextTarget
      ? (healthById[nextTarget.id] ?? nextTarget.health) / nextTarget.maxHealth
      : 1;
    const amountToTarget = lowestGroup.reduce((total, target) => {
      const health = healthById[target.id] ?? target.health;
      return total + Math.max(0, target.maxHealth * targetRatio - health);
    }, 0);

    if (amountToTarget <= remaining + EPSILON) {
      for (const target of lowestGroup) {
        const health = healthById[target.id] ?? target.health;
        const healing = Math.min(
          target.maxHealth - health,
          Math.max(0, target.maxHealth * targetRatio - health),
        );
        healthById[target.id] = normalize(health + healing);
        healedById[target.id] = normalize(
          (healedById[target.id] ?? 0) + healing,
        );
        remaining = Math.max(0, remaining - healing);
      }
      continue;
    }

    const combinedMaximumHealth = lowestGroup.reduce(
      (total, target) => total + target.maxHealth,
      0,
    );
    const distributedAmount = remaining;
    for (const target of lowestGroup) {
      const health = healthById[target.id] ?? target.health;
      const healing = Math.min(
        target.maxHealth - health,
        distributedAmount * (target.maxHealth / combinedMaximumHealth),
      );
      healthById[target.id] = normalize(health + healing);
      healedById[target.id] = normalize((healedById[target.id] ?? 0) + healing);
    }
    remaining = 0;
  }

  const unusedAmount = normalize(remaining);
  return {
    healthById,
    healedById,
    usedAmount: normalize(Math.max(0, totalAmount) - unusedAmount),
    unusedAmount,
  };
}
