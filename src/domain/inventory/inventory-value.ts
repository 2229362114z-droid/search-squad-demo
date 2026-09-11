import type { GameConfig } from '@/src/config/types';
import type { InventoryState } from '@/src/domain/inventory/inventory';

/** Supplies use their purchase price; loot uses its configured appraisal value. */
export function getInventoryValue(
  inventory: InventoryState,
  config: Pick<GameConfig, 'suppliesById' | 'searchRewardsById'>,
): number {
  return inventory.items.reduce((total, item) => {
    const unitValue =
      config.suppliesById.get(item.itemId)?.price ??
      config.searchRewardsById.get(item.itemId)?.value ??
      0;
    return total + unitValue * item.quantity;
  }, 0);
}
