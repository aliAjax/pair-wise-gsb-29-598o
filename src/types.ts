/** 配送时段，如 10:00-12:00，归属于分配规则维护 */
export interface Slot {
  id: string;
  label: string;
}

/** 骑手：按时段维护最大载单量 capacity[slotId] */
export interface Rider {
  id: string;
  name: string;
  phone: string;
  /** key 为时段 id，value 为该时段最大载单量 */
  capacity: Record<string, number>;
  onDuty: boolean;
  createdAt: string;
}

export type OrderStatus = "pending" | "assigned" | "delivered";

/** 订单地址：地址、距站点距离、所属时段，独立于骑手与规则维护 */
export interface Order {
  id: string;
  code: string;
  address: string;
  /** 距配送站点距离 km，用于同一路线由近到远排序 */
  distance: number;
  slotId: string;
  riderId: string | null;
  status: OrderStatus;
  note: string;
  createdAt: string;
}

/** 已送订单存档：从路线移出时生成，完成时间在此记录 */
export interface ArchiveRecord {
  order: Order;
  riderId: string;
  riderName: string;
  slotLabel: string;
  completedAt: string;
}

/**
 * 分配规则：
 * - capacity：余量优先，先给该时段剩余载量最大的骑手
 * - balance：负载均衡，先给该时段已载最少的骑手
 */
export type AllocateStrategy = "capacity" | "balance";

export interface DispatchRules {
  strategy: AllocateStrategy;
  /** 新订单进入时是否立即自动分配，关闭则一律先进待分配区 */
  autoAllocateNew: boolean;
  slots: Slot[];
}
