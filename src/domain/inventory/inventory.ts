import type { SupplyConfig } from '@/src/config/types';

export interface InventoryItem {
  readonly instanceId: string;
  readonly itemId: string;
  readonly quantity: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface InventoryState {
  readonly width: number;
  readonly height: number;
  readonly items: readonly InventoryItem[];
}

export interface Position {
  readonly x: number;
  readonly y: number;
}

export interface AddItemResult {
  readonly accepted: boolean;
  readonly inventory: InventoryState;
  readonly instanceId?: string;
  readonly reason?: 'inventory_full';
}

export interface MoveItemResult {
  readonly accepted: boolean;
  readonly inventory: InventoryState;
  readonly reason?: 'unknown_instance' | 'invalid_placement';
}

export function createInventory(width: number, height: number): InventoryState {
  return { width, height, items: [] };
}

export function canPlace(
  inventory: InventoryState,
  width: number,
  height: number,
  position: Position,
  ignoredInstanceId?: string,
): boolean {
  if (
    position.x < 0 ||
    position.y < 0 ||
    position.x + width > inventory.width ||
    position.y + height > inventory.height
  ) {
    return false;
  }

  return inventory.items.every((item) => {
    if (item.instanceId === ignoredInstanceId) return true;
    return (
      position.x + width <= item.x ||
      item.x + item.width <= position.x ||
      position.y + height <= item.y ||
      item.y + item.height <= position.y
    );
  });
}

export function findFirstPlacement(
  inventory: InventoryState,
  width: number,
  height: number,
): Position | null {
  for (let y = 0; y <= inventory.height - height; y += 1) {
    for (let x = 0; x <= inventory.width - width; x += 1) {
      if (canPlace(inventory, width, height, { x, y })) return { x, y };
    }
  }
  return null;
}

export function addItemAuto(
  inventory: InventoryState,
  definition: Pick<SupplyConfig, 'id' | 'width' | 'height' | 'maxStack'>,
  instanceId: string,
): AddItemResult {
  return addItemQuantityAuto(inventory, definition, instanceId, 1);
}

export function addItemQuantityAuto(
  inventory: InventoryState,
  definition: Pick<SupplyConfig, 'id' | 'width' | 'height' | 'maxStack'>,
  instanceId: string,
  quantity: number,
): AddItemResult {
  if (quantity <= 0) return { accepted: true, inventory, instanceId };

  let remaining = quantity;
  let firstAcceptedInstanceId: string | undefined;
  let nextInventory = inventory;

  const stackIds = nextInventory.items
    .filter(
      (item) =>
        item.itemId === definition.id && item.quantity < definition.maxStack,
    )
    .map((item) => item.instanceId);

  for (const stackId of stackIds) {
    if (remaining <= 0) break;
    const stack = nextInventory.items.find(
      (item) => item.instanceId === stackId,
    );
    if (!stack) continue;
    const added = Math.min(definition.maxStack - stack.quantity, remaining);
    nextInventory = {
      ...nextInventory,
      items: nextInventory.items.map((item) =>
        item.instanceId === stackId
          ? { ...item, quantity: item.quantity + added }
          : item,
      ),
    };
    firstAcceptedInstanceId ??= stackId;
    remaining -= added;
  }

  let placedStackIndex = 0;
  while (remaining > 0) {
    const position = findFirstPlacement(
      nextInventory,
      definition.width,
      definition.height,
    );
    if (!position) {
      return { accepted: false, inventory, reason: 'inventory_full' };
    }
    const placedInstanceId =
      placedStackIndex === 0 ? instanceId : `${instanceId}:${placedStackIndex}`;
    const placedQuantity = Math.min(definition.maxStack, remaining);
    nextInventory = {
      ...nextInventory,
      items: [
        ...nextInventory.items,
        {
          instanceId: placedInstanceId,
          itemId: definition.id,
          quantity: placedQuantity,
          x: position.x,
          y: position.y,
          width: definition.width,
          height: definition.height,
        },
      ],
    };
    firstAcceptedInstanceId ??= placedInstanceId;
    remaining -= placedQuantity;
    placedStackIndex += 1;
  }

  return {
    accepted: true,
    inventory: nextInventory,
    instanceId: firstAcceptedInstanceId,
  };
}

export function moveItem(
  inventory: InventoryState,
  instanceId: string,
  position: Position,
): MoveItemResult {
  const target = inventory.items.find((item) => item.instanceId === instanceId);
  if (!target) {
    return { accepted: false, inventory, reason: 'unknown_instance' };
  }
  if (
    !canPlace(
      inventory,
      target.width,
      target.height,
      position,
      target.instanceId,
    )
  ) {
    return { accepted: false, inventory, reason: 'invalid_placement' };
  }
  return {
    accepted: true,
    inventory: {
      ...inventory,
      items: inventory.items.map((item) =>
        item.instanceId === instanceId
          ? { ...item, x: position.x, y: position.y }
          : item,
      ),
    },
  };
}

export function removeOne(
  inventory: InventoryState,
  instanceId: string,
): InventoryState {
  const target = inventory.items.find((item) => item.instanceId === instanceId);
  if (!target) return inventory;
  if (target.quantity > 1) {
    return {
      ...inventory,
      items: inventory.items.map((item) =>
        item.instanceId === instanceId
          ? { ...item, quantity: item.quantity - 1 }
          : item,
      ),
    };
  }
  return {
    ...inventory,
    items: inventory.items.filter((item) => item.instanceId !== instanceId),
  };
}

export function removeItem(
  inventory: InventoryState,
  instanceId: string,
): InventoryState {
  return {
    ...inventory,
    items: inventory.items.filter((item) => item.instanceId !== instanceId),
  };
}

export function isValidInventory(inventory: InventoryState): boolean {
  return inventory.items.every((item, index) => {
    const withoutCurrent = {
      ...inventory,
      items: inventory.items.filter((_, otherIndex) => otherIndex !== index),
    };
    return canPlace(withoutCurrent, item.width, item.height, item);
  });
}
