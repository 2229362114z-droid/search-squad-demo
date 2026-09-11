import type {
  PrototypeDangerRulesConfig,
  PrototypeRoomConfig,
} from '@/src/config/types';

export function roomDangerForDistance(
  kind: PrototypeRoomConfig['kind'],
  distanceFromStart: number,
  rules: PrototypeDangerRulesConfig,
): number {
  if (kind === 'boss') return rules.bossDanger;

  const baseDanger = Math.min(
    rules.maximumDanger,
    Math.floor(distanceFromStart / rules.roomsPerLevel) + 1,
  );

  return baseDanger;
}
