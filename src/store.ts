import { computed, reactive, ref, watch } from "vue";
import type {
  AllocateStrategy,
  ArchiveRecord,
  DispatchRules,
  Order,
  Rider,
  Slot,
} from "./types";

/** 订单地址、骑手排班、分配规则、本地存档分开维护，各自独立存档键 */
const KEYS = {
  orders: "hxwlfront-15/dispatch/orders",
  riders: "hxwlfront-15/dispatch/riders",
  rules: "hxwlfront-15/dispatch/rules",
  archive: "hxwlfront-15/dispatch/archive",
} as const;

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function load<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/* ---------------------------------- 种子数据 ---------------------------------- */

const SEED_SLOTS: Slot[] = [
  { id: "slot-morning", label: "10:00-12:00" },
  { id: "slot-afternoon", label: "14:00-16:00" },
  { id: "slot-evening", label: "18:00-20:00" },
];

const SEED_RULES: DispatchRules = {
  strategy: "capacity",
  autoAllocateNew: true,
  slots: SEED_SLOTS,
};

const SEED_RIDERS: Rider[] = [
  {
    id: "rider-a",
    name: "骑手A",
    phone: "13800000001",
    onDuty: true,
    capacity: { "slot-morning": 4, "slot-afternoon": 5, "slot-evening": 3 },
    createdAt: "2026-09-20T08:00:00.000Z",
  },
  {
    id: "rider-b",
    name: "骑手B",
    phone: "13800000002",
    onDuty: true,
    capacity: { "slot-morning": 3, "slot-afternoon": 4, "slot-evening": 4 },
    createdAt: "2026-09-20T08:00:00.000Z",
  },
  {
    id: "rider-c",
    name: "骑手C",
    phone: "13800000003",
    onDuty: true,
    capacity: { "slot-morning": 2, "slot-afternoon": 3, "slot-evening": 5 },
    createdAt: "2026-09-20T08:00:00.000Z",
  },
];

function seedOrders(): Order[] {
  const now = Date.now();
  const rows: Array<[string, number, string, string | null, Order["status"]]> = [
    ["世纪大道 100 号", 1.8, "slot-morning", "rider-a", "assigned"],
    ["潍坊路 21 号", 2.6, "slot-morning", "rider-a", "assigned"],
    ["福山路 55 号", 0.9, "slot-morning", "rider-a", "assigned"],
    ["陆家嘴环路 1200 号", 2.4, "slot-afternoon", "rider-b", "assigned"],
    ["东昌路 47 号", 1.2, "slot-afternoon", "rider-b", "assigned"],
    ["张杨路 500 号", 3.1, "slot-evening", null, "pending"],
    ["浦东南路 88 号", 1.5, "slot-evening", null, "pending"],
  ];
  return rows.map(([address, distance, slotId, riderId, status], i) => ({
    id: `seed-order-${i + 1}`,
    code: `D${String(1001 + i)}`,
    address,
    distance,
    slotId,
    riderId,
    status,
    note: "",
    createdAt: new Date(now - (rows.length - i) * 60000).toISOString(),
  }));
}

/* ----------------------------------- Store ----------------------------------- */

const orders = ref<Order[]>(load(KEYS.orders, seedOrders()));
const riders = ref<Rider[]>(load(KEYS.riders, SEED_RIDERS));
const rules = reactive<DispatchRules>(load(KEYS.rules, SEED_RULES));
const archive = ref<ArchiveRecord[]>(load(KEYS.archive, []));

function persist(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

watch(orders, (value) => persist(KEYS.orders, value), { deep: true });
watch(riders, (value) => persist(KEYS.riders, value), { deep: true });
watch(rules, (value) => persist(KEYS.rules, value), { deep: true });
watch(archive, (value) => persist(KEYS.archive, value), { deep: true });

// 首次打开（使用种子数据）也立即落盘，保证四类存档键齐全、重开可恢复
if (!localStorage.getItem(KEYS.orders)) persist(KEYS.orders, orders.value);
if (!localStorage.getItem(KEYS.riders)) persist(KEYS.riders, riders.value);
if (!localStorage.getItem(KEYS.rules)) persist(KEYS.rules, rules);
if (!localStorage.getItem(KEYS.archive)) persist(KEYS.archive, archive.value);

/* --------------------------------- 调度纯逻辑 --------------------------------- */

/** 某骑手在某时段当前已分配（在途、未送达）的订单数 */
function loadOf(riderId: string, slotId: string): number {
  return orders.value.filter(
    (o) => o.status !== "delivered" && o.riderId === riderId && o.slotId === slotId,
  ).length;
}

/** 某骑手在某时段的最大载单量，排班表里没配时按 0 处理（即不能装） */
function capacityOf(rider: Rider, slotId: string): number {
  return Number(rider.capacity[slotId] ?? 0);
}

function remainingOf(rider: Rider, slotId: string): number {
  return capacityOf(rider, slotId) - loadOf(rider.id, slotId);
}

/**
 * 为订单挑骑手：只看在班骑手，按当前分配规则排序。
 * capacity：余量（上限-在途）最大者优先；balance：在途负载最小者优先。
 * 余量相同 / 负载相同时，用排班顺序兜底，保证分配结果稳定。
 */
function pickRider(slotId: string): Rider | null {
  const candidates = riders.value
    .map((rider, index) => ({ rider, index }))
    .filter(({ rider }) => rider.onDuty && remainingOf(rider, slotId) > 0);

  if (candidates.length === 0) return null;

  const strategy: AllocateStrategy = rules.strategy;
  candidates.sort((a, b) => {
    if (strategy === "balance") {
      const diff = loadOf(a.rider.id, slotId) - loadOf(b.rider.id, slotId);
      if (diff !== 0) return diff;
    }
    const diff = remainingOf(b.rider, slotId) - remainingOf(a.rider, slotId);
    if (diff !== 0) return diff;
    return a.index - b.index;
  });
  return candidates[0].rider;
}

/** 尝试自动分配一单，装不下返回 false（留在待分配区） */
function tryAllocate(order: Order): boolean {
  if (order.status !== "pending") return order.riderId !== null;
  const rider = pickRider(order.slotId);
  if (!rider) return false;
  order.riderId = rider.id;
  order.status = "assigned";
  return true;
}

/* --------------------------------- 业务动作 ---------------------------------- */

function nextOrderCode(): string {
  let max = 1000;
  for (const order of orders.value) {
    const n = Number(order.code.replace(/\D/g, ""));
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  for (const record of archive.value) {
    const n = Number(record.order.code.replace(/\D/g, ""));
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return `D${max + 1}`;
}

function addOrder(input: { address: string; distance: number; slotId: string; note: string }) {
  const order: Order = {
    id: uid("order"),
    code: nextOrderCode(),
    address: input.address.trim(),
    distance: Number(input.distance),
    slotId: input.slotId,
    riderId: null,
    status: "pending",
    note: input.note.trim(),
    createdAt: new Date().toISOString(),
  };
  orders.value.unshift(order);
  if (rules.autoAllocateNew) tryAllocate(order);
}

/** 调度员手动把待分配订单改派/指派给某骑手，满载则拒绝 */
function assignTo(orderId: string, riderId: string | null): boolean {
  const order = orders.value.find((o) => o.id === orderId);
  if (!order || order.status === "delivered") return false;

  if (riderId === null) {
    order.riderId = null;
    order.status = "pending";
    return true;
  }

  const rider = riders.value.find((r) => r.id === riderId);
  if (!rider) return false;

  // 同骑手无需动作；改派到新骑手时要按目标骑手当前余量判断
  if (order.riderId !== riderId && remainingOf(rider, order.slotId) <= 0) {
    return false;
  }
  order.riderId = riderId;
  order.status = "assigned";
  return true;
}

/** 一键尝试把待分配区所有订单分出去，返回仍装不下的单数 */
function allocateAllPending(): number {
  let stuck = 0;
  for (const order of [...orders.value].reverse()) {
    if (order.status === "pending" && !tryAllocate(order)) stuck += 1;
  }
  return stuck;
}

/** 送达：从路线移出，记入存档并记下完成时间 */
function markDelivered(orderId: string, at = new Date()) {
  const order = orders.value.find((o) => o.id === orderId);
  if (!order || !order.riderId) return;
  const rider = riders.value.find((r) => r.id === order.riderId);
  const slot = rules.slots.find((s) => s.id === order.slotId);
  order.status = "delivered";
  archive.value.unshift({
    order: { ...order },
    riderId: order.riderId,
    riderName: rider?.name ?? "未知骑手",
    slotLabel: slot?.label ?? "未知时段",
    completedAt: at.toISOString(),
  });
  // 已送订单从路线移出：解除与骑手的挂载，但保留订单地址记录
  order.riderId = null;
}

/** 从存档撤销送达，订单回到待分配区重新参与分配 */
function undoDelivered(archiveId: string) {
  const index = archive.value.findIndex((r) => r.order.id === archiveId);
  if (index < 0) return;
  const record = archive.value[index];
  const order = orders.value.find((o) => o.id === archiveId);
  if (order) {
    order.status = "pending";
    order.riderId = null;
    tryAllocate(order);
  }
  archive.value.splice(index, 1);
}

function removeOrder(orderId: string) {
  orders.value = orders.value.filter((o) => o.id !== orderId);
}

/* --------------------------------- 骑手维护 ---------------------------------- */

function addRider(name: string, phone: string) {
  riders.value.push({
    id: uid("rider"),
    name: name.trim(),
    phone: phone.trim(),
    onDuty: true,
    capacity: Object.fromEntries(rules.slots.map((s) => [s.id, 3])),
    createdAt: new Date().toISOString(),
  });
}

function removeRider(riderId: string) {
  // 该骑手在途订单全部退回待分配区
  for (const order of orders.value) {
    if (order.riderId === riderId && order.status !== "delivered") {
      order.riderId = null;
      order.status = "pending";
    }
  }
  riders.value = riders.value.filter((r) => r.id !== riderId);
}

/* --------------------------------- 时段维护 ---------------------------------- */

function addSlot(label: string) {
  const id = uid("slot");
  rules.slots.push({ id, label: label.trim() });
  for (const rider of riders.value) rider.capacity[id] = 3;
}

function removeSlot(slotId: string) {
  if (rules.slots.length <= 1) return;
  const fallback = rules.slots.find((s) => s.id !== slotId);
  if (!fallback) return;
  // 该时段在途订单退回待分配区；所有关联订单转到剩余的第一个时段
  for (const order of orders.value) {
    if (order.slotId !== slotId) continue;
    order.slotId = fallback.id;
    if (order.status === "assigned") {
      order.riderId = null;
      order.status = "pending";
      tryAllocate(order);
    }
  }
  for (const rider of riders.value) delete rider.capacity[slotId];
  rules.slots = rules.slots.filter((s) => s.id !== slotId);
}

/** 骑手载量或在班状态变更后，超载骑手的路线单按距离由远到近退回，直到不超载 */
watch(
  () => riders.value.map((r) => `${r.id}:${r.onDuty}:${JSON.stringify(r.capacity)}`).join("|"),
  () => {
    for (const rider of riders.value) {
      for (const slot of rules.slots) {
        const cap = rider.onDuty ? capacityOf(rider, slot.id) : 0;
        const onRoute = orders.value
          .filter((o) => o.riderId === rider.id && o.slotId === slot.id && o.status === "assigned")
          .sort((a, b) => b.distance - a.distance);
        while (onRoute.length > cap) {
          const order = onRoute.shift();
          if (!order) break;
          order.riderId = null;
          order.status = "pending";
          // 退回后尝试交给其他有余量的骑手
          tryAllocate(order);
        }
      }
    }
  },
);

/** 清空全部本地存档，回到初始演示数据 */
function resetAll() {
  localStorage.removeItem(KEYS.orders);
  localStorage.removeItem(KEYS.riders);
  localStorage.removeItem(KEYS.rules);
  localStorage.removeItem(KEYS.archive);
  location.reload();
}

/* --------------------------------- 视图数据 ---------------------------------- */

const slotMap = computed(() => Object.fromEntries(rules.slots.map((s) => [s.id, s])));
const riderMap = computed(() => Object.fromEntries(riders.value.map((r) => [r.id, r])));

const pendingOrders = computed(() =>
  orders.value
    .filter((o) => o.status === "pending")
    .sort((a, b) => a.slotId.localeCompare(b.slotId) || a.distance - b.distance),
);

export interface RouteOrder extends Order {
  seq: number;
}
export interface RiderRoute {
  rider: Rider;
  slotId: string;
  slotLabel: string;
  capacity: number;
  /** 路线：同一骑手同一时段，按距离由近到远 */
  route: RouteOrder[];
  load: number;
  remaining: number;
  distance: number;
}

const riderRoutes = computed<RiderRoute[]>(() => {
  const result: RiderRoute[] = [];
  for (const rider of riders.value) {
    for (const slot of rules.slots) {
      const route = orders.value
        .filter((o) => o.riderId === rider.id && o.slotId === slot.id && o.status === "assigned")
        .sort((a, b) => a.distance - b.distance)
        .map((order, i) => ({ ...order, seq: i + 1 }));
      const cap = capacityOf(rider, slot.id);
      result.push({
        rider,
        slotId: slot.id,
        slotLabel: slot.label,
        capacity: cap,
        route,
        load: route.length,
        remaining: cap - route.length,
        distance: route.reduce((sum, o) => sum + o.distance, 0),
      });
    }
  }
  return result;
});

/** 每个时段的余量汇总，供待分配订单提示“还能不能装下” */
const slotSummary = computed(() =>
  rules.slots.map((slot) => {
    const onDuty = riders.value.filter((r) => r.onDuty);
    const capacity = onDuty.reduce((sum, r) => sum + capacityOf(r, slot.id), 0);
    const load = orders.value.filter(
      (o) => o.slotId === slot.id && o.status === "assigned",
    ).length;
    return {
      slot,
      capacity,
      load,
      remaining: capacity - load,
      pending: orders.value.filter((o) => o.slotId === slot.id && o.status === "pending").length,
    };
  }),
);

const metrics = computed(() => {
  const total = orders.value.length;
  const assigned = orders.value.filter((o) => o.status === "assigned").length;
  const pending = orders.value.filter((o) => o.status === "pending").length;
  const delivered = archive.value.length;
  const active = orders.value.filter((o) => o.status !== "delivered");
  const avgDistance =
    active.length > 0
      ? (active.reduce((s, o) => s + o.distance, 0) / active.length).toFixed(1)
      : "0.0";
  return { total, assigned, pending, delivered, avgDistance };
});

export function useDispatchStore() {
  return {
    // state
    orders,
    riders,
    rules,
    archive,
    // derived
    slotMap,
    riderMap,
    pendingOrders,
    riderRoutes,
    slotSummary,
    metrics,
    // helpers
    remainingOf,
    capacityOf,
    loadOf,
    // actions
    addOrder,
    assignTo,
    allocateAllPending,
    markDelivered,
    undoDelivered,
    removeOrder,
    addRider,
    removeRider,
    addSlot,
    removeSlot,
    resetAll,
  };
}
