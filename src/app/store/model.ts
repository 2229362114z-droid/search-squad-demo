import type {
  InventoryItem,
  InventoryState,
} from '@/src/domain/inventory/inventory';
import type { CombatEvent, CombatState } from '@/src/domain/combat';
import type { EnemyNature } from '@/src/config/types';
import type { RelicInstance } from '@/src/domain/items/combat-items';
import type {
  GrowthLevels,
  GrowthTrack,
} from '@/src/domain/progression/progression';
import type {
  EventCombatBoost,
  ExplorationEventState,
} from '@/src/domain/events/exploration-events';

export interface RelicDraft {
  readonly seed: number;
  readonly candidateIds: readonly string[];
  readonly selectedId: string | null;
}

export type AppPhase =
  | { readonly type: 'shop' }
  | { readonly type: 'relic-selection' }
  | { readonly type: 'exploring' }
  | { readonly type: 'combat'; readonly roomId: string }
  | { readonly type: 'extracting'; readonly startedAtMs: number }
  | { readonly type: 'settlement-success'; readonly extractedValue: number }
  | { readonly type: 'settlement-failure' };

export type RoomKind =
  | 'start'
  | 'combat'
  | 'elite'
  | 'treasure'
  | 'boss'
  | 'merchant';

export interface RoomNode {
  readonly shopItemIds?: readonly string[];
  readonly nature?: EnemyNature;
  readonly id: string;
  readonly displayName: string;
  readonly kind: RoomKind;
  readonly danger: number;
  readonly x: number;
  readonly y: number;
  readonly neighbors: readonly string[];
  readonly discovered: boolean;
  readonly visited: boolean;
  readonly cleared: boolean;
  readonly searched: boolean;
}

export interface SearchPointState {
  readonly id: string;
  readonly roomId: string;
  readonly positionIndex: number;
  readonly qualityId: string;
  readonly qualityName: string;
  readonly color: string;
  readonly durationMs: number;
  readonly approachDurationMs: number;
  readonly rewards: readonly {
    readonly id: string;
    readonly displayName: string;
    readonly description: string;
    readonly artId: string;
    readonly value: number;
    readonly width: number;
    readonly height: number;
    readonly maxStack: number;
  }[];
  readonly completedRewardCount: number;
  readonly leftoverRewardIndexes: readonly number[];
  readonly status:
    | 'hidden'
    | 'locked'
    | 'queued'
    | 'moving'
    | 'active'
    | 'completed'
    | 'abandoned';
  readonly searcherId: string | null;
  readonly searcherName: string | null;
}

export interface LootAnnouncementState {
  readonly id: string;
  readonly searcherId: string;
  readonly displayName: string;
  readonly qualityName: string;
  readonly color: string;
}

export interface PartyMemberState {
  readonly id: string;
  readonly displayName: string;
  readonly role: string;
  readonly health: number;
  readonly maxHealth: number;
  readonly energy: number;
}

export interface RunState {
  readonly blockedEdges?: readonly string[];
  readonly relicChoices?: {
    readonly id: string;
    readonly candidateIds: readonly string[];
  } | null;
  readonly pendingEvent: ExplorationEventState | null;
  readonly eventBoost: EventCombatBoost | null;
  readonly relics: readonly RelicInstance[];
  readonly droppedRelics: readonly RelicInstance[];
  /** Equipped instance awaiting acknowledgement, or ground instance awaiting replacement. */
  readonly pendingRelic: string | null;
  readonly runId: string;
  readonly seed: number;
  readonly currentRoomId: string;
  readonly terror: number;
  readonly nextCombatBoost: {
    readonly damageRatio: number;
    readonly reductionRatio: number;
  } | null;
  /** 阴阳符：下一场战斗中异色遗物基础战力的生效比例，未使用时为 null。 */
  readonly nextCombatOffNatureRatio: number | null;
  /** 当前这场战斗实际采用的异色基础比例，开战时定下，供界面显示。 */
  readonly activeOffNatureRatio: number;
  readonly inventory: InventoryState;
  readonly droppedItems: readonly InventoryItem[];
  readonly party: readonly PartyMemberState[];
  readonly combat: CombatState | null;
  readonly lastCombatEvents: readonly CombatEvent[];
  readonly rooms: readonly RoomNode[];
  readonly searchPoints: readonly SearchPointState[];
  readonly lootAnnouncements: readonly LootAnnouncementState[];
  readonly lootValue: number;
}

export interface RootState {
  readonly revision: number;
  readonly app: AppPhase;
  readonly gm: {
    readonly eventTriggerAlways: boolean;
  };
  readonly profile: {
    readonly coins: number;
    readonly growth: GrowthLevels;
  };
  readonly preparation: {
    readonly relicDraft: RelicDraft | null;
    readonly inventory: InventoryState;
  };
  readonly run: RunState | null;
  readonly configMeta: {
    readonly version: string;
    readonly hash: string;
  };
  readonly notice: string | null;
}

export type GameCommand =
  | {
      readonly type: 'toggle-gm-event-trigger';
      readonly enabled: boolean;
    }
  | {
      readonly type: 'retreat-event';
      readonly eventId: string;
      readonly expectedRoll: number;
    }
  | {
      readonly type: 'buy-room-supply';
      readonly roomId: string;
      readonly itemId: string;
    }
  | {
      readonly type: 'choose-relic';
      readonly rewardId: string;
      readonly itemId?: string;
      readonly replaceInstanceId?: string;
    }
  | {
      readonly type: 'upgrade-growth';
      readonly track: GrowthTrack;
      readonly expectedLevel: number;
    }
  | {
      readonly type: 'roll-event-dice';
      readonly eventId: string;
      readonly expectedRoll: number;
      readonly dieIndex?: number;
    }
  | {
      readonly type: 'resolve-event';
      readonly eventId: string;
      readonly expectedRoll: number;
    }
  | { readonly type: 'finish-event'; readonly eventId: string }
  | {
      readonly type: 'buy-event-supply';
      readonly eventId: string;
      readonly itemId: string;
    }
  | { readonly type: 'select-starting-relic'; readonly itemId: string }
  | { readonly type: 'back-to-shop' }
  | { readonly type: 'confirm-start-run' }
  | { readonly type: 'discard-relic'; readonly instanceId: string }
  | { readonly type: 'pick-up-relic'; readonly instanceId: string }
  | { readonly type: 'resolve-relic'; readonly replaceInstanceId?: string }
  | { readonly type: 'buy-supply'; readonly itemId: string }
  | { readonly type: 'refund-supply'; readonly instanceId: string }
  | { readonly type: 'start-run' }
  | { readonly type: 'use-supply'; readonly instanceId: string }
  | { readonly type: 'discard-run-item'; readonly instanceId: string }
  | { readonly type: 'pick-up-dropped-item'; readonly instanceId: string }
  | {
      readonly type: 'move-preparation-item';
      readonly instanceId: string;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: 'move-run-item';
      readonly instanceId: string;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: 'select-room';
      readonly roomId: string;
      readonly confirmLethal?: boolean;
    }
  | { readonly type: 'advance-combat'; readonly deltaMs: number }
  | { readonly type: 'release-ultimate'; readonly characterId: string }
  | { readonly type: 'arrive-search-point'; readonly searchPointId: string }
  | { readonly type: 'complete-search-point'; readonly searchPointId: string }
  | {
      readonly type: 'pick-up-search-leftover';
      readonly searchPointId: string;
    }
  | { readonly type: 'unlock-search-point'; readonly searchPointId: string }
  | { readonly type: 'start-extraction'; readonly nowMs: number }
  | { readonly type: 'cancel-extraction' }
  | { readonly type: 'complete-extraction' }
  | { readonly type: 'complete-settlement' }
  | { readonly type: 'dismiss-notice' };

export interface CommandResult {
  readonly accepted: boolean;
  readonly reason?:
    | 'invalid_phase'
    | 'growth_maxed'
    | 'carry_limit'
    | 'relic_required'
    | 'unknown_item'
    | 'insufficient_coins'
    | 'inventory_full'
    | 'invalid_placement'
    | 'unknown_instance'
    | 'supply_unusable'
    | 'missing_key'
    | 'room_not_adjacent'
    | 'route_blocked'
    | 'extraction_unavailable'
    | 'ultimate_unavailable'
    | 'stale_command';
  readonly requiresConfirmation?: {
    readonly type: 'lethal-terror-move';
    readonly roomId: string;
    readonly memberIds: readonly string[];
  };
}

export interface DomainEvent {
  readonly type:
    | 'movement-event-started'
    | 'movement-event-rolled'
    | 'movement-event-resolved'
    | 'profile-updated'
    | 'run-started'
    | 'room-entered'
    | 'combat-started'
    | 'combat-ended'
    | 'search-started'
    | 'searcher-arrived'
    | 'search-item-completed'
    | 'search-completed'
    | 'search-leftover-collected'
    | 'search-point-unlocked'
    | 'terror-changed'
    | 'terror-damage-applied'
    | 'extraction-started'
    | 'run-extracted';
  readonly atRevision: number;
  readonly payload?: Readonly<Record<string, unknown>>;
}
