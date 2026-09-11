import type { SearchRewardConfig } from '@/src/config/types';
import {
  addItemAuto,
  removeItem,
  type AddItemResult,
  type InventoryItem,
  type InventoryState,
} from './inventory';

export interface CollectValuableResult extends AddItemResult {
  readonly displaced?: InventoryItem;
  readonly displacedValue?: number;
}

/** Only automatic search collection may trade an entire lower-value loot stack. */
export function collectValuable(
  inventory: InventoryState,
  reward: Pick<
    SearchRewardConfig,
    'id' | 'value' | 'width' | 'height' | 'maxStack'
  >,
  instanceId: string,
  definitions: ReadonlyMap<string, SearchRewardConfig>,
): CollectValuableResult {
  const ordinary = addItemAuto(inventory, reward, instanceId);
  if (ordinary.accepted || !definitions.has(reward.id)) return ordinary;
  const candidates = inventory.items
    .flatMap((item) => {
      const definition = definitions.get(item.itemId);
      return definition
        ? [{ item, value: definition.value * item.quantity }]
        : [];
    })
    .sort(
      (a, b) => a.value - b.value || a.item.y - b.item.y || a.item.x - b.item.x,
    );
  const lowest = candidates[0];
  if (!lowest || reward.value <= lowest.value) return ordinary;
  const replacement = addItemAuto(
    removeItem(inventory, lowest.item.instanceId),
    reward,
    instanceId,
  );
  return replacement.accepted
    ? { ...replacement, displaced: lowest.item, displacedValue: lowest.value }
    : ordinary;
}
