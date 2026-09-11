import type { RoomNode, RunState } from '@/src/app/store/model';

export const routeEdgeKey = (a: string, b: string): string =>
  [a, b].sort().join('|');
export const isExtractionRoom = (room: Pick<RoomNode, 'kind'>): boolean =>
  ['start', 'boss', 'merchant'].includes(room.kind);
export function canExtractFromRun(run: RunState): boolean {
  const room = run.rooms.find((r) => r.id === run.currentRoomId);
  return (
    !!room &&
    isExtractionRoom(room) &&
    (room.kind !== 'boss' || room.cleared) &&
    !run.pendingEvent &&
    !run.pendingRelic &&
    run.party.some((member) => member.health > 0)
  );
}
