/** 配送时段（在“分配规则”中统一维护，骑手排班和订单都引用这里的时段） */
export interface Slot {
  id: string;
  /** 形如 10:00-12:00 */
  label: string;
}

/** 骑手；capacities 按 slotId 维护每个时段的最大载单量 */
export interface Rider {
  id: string;
  name: string;
  phone: string;
  /** 在职参与自动分配；停用后只保留在排班表中 */
  active: boolean;
  capacities: Record<string, number>;
  createdAt: string;
}

/** 活动订单（待分配 / 配送中） */
export interface Order {
  id: string;
  /** 业务单号，如 DM20260927-003 */
  code: string;
  address: string;
  /** 距站点距离 km，用于路线由近到远排序 */
  distance: number;
  slotId: string;
  note: string;
  /** null 表示在待分配区 */
  riderId: string | null;
  createdAt: string;
}

/** 已送达订单（从路线移出后进入本地存档） */
export interface ArchiveOrder {
  id: string;
  code: string;
  address: string;
  distance: number;
  slotLabel: string;
  note: string;
  /** 送达时快照骑手信息，骑手被删除也不影响存档 */
  riderId: string;
  riderName: string;
  createdAt: string;
  completedAt: string;
}

/** 自动分配策略：均衡余量 或 按骑手顺序占满 */
export type AllocateStrategy = "balance" | "sequence";

/** 分配规则（与订单地址、骑手排班、本地存档分开持久化） */
export interface DispatchRules {
  slots: Slot[];
  strategy: AllocateStrategy;
  /** 新订单是否立即自动分配，否则进入待分配区 */
  autoAssignNew: boolean;
}

export interface NewOrderInput {
  address: string;
  distance: number;
  slotId: string;
  note: string;
}
