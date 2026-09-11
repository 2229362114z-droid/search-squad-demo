import type { RoomNode } from '@/src/app/store/model';
import { foresightRadius } from '@/src/domain/progression/progression';

export type RoomVisibility = 'hidden' | 'full';
type RoomGraphNode = Pick<RoomNode, 'id' | 'neighbors'>;

export function roomsWithinDistance(
  startId: string,
  rooms: readonly RoomGraphNode[],
  radius: number,
): ReadonlySet<string> {
  const distance = new Map<string, number>([[startId, 0]]);
  const queue = [startId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) continue;
    const currentDistance = distance.get(id) ?? 0;
    if (currentDistance >= radius) continue;
    const room = rooms.find((candidate) => candidate.id === id);
    for (const neighbor of room?.neighbors ?? []) {
      if (distance.has(neighbor)) continue;
      distance.set(neighbor, currentDistance + 1);
      queue.push(neighbor);
    }
  }
  return new Set(distance.keys());
}

export function roomVisibility(
  room: RoomNode,
  foresightRoomIds: ReadonlySet<string>,
): RoomVisibility {
  if (room.discovered || room.kind === 'boss') return 'full';
  return foresightRoomIds.has(room.id) ? 'full' : 'hidden';
}

export function foresightRoomIds(
  currentRoomId: string,
  rooms: readonly RoomGraphNode[],
  level: number,
): ReadonlySet<string> {
  return roomsWithinDistance(currentRoomId, rooms, foresightRadius(level));
}
