import { computed, reactive, watch } from "vue";
import type {
  ArchiveOrder,
  DispatchRules,
  NewOrderInput,
  Order,
  Rider,
  Slot,
} from "./types";

/** 四类数据分开存档：订单地址、骑手排班、分配规则、本地存档（已送达） */
const STORAGE_KEYS = {
  orders: "hxwlfront-15:orders",
  riders: "hxwlfront-15:riders",
  rules: "hxwlfront-15:rules",
  archive: "hxwlfront-15:archive",
};

const now = () => new Date().toISOString();
const uid = () =>
  (crypto as Crypto).randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function dateStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

const SEED_SLOTS: Slot[] = [
  { id: "slot-morning", label: "10:00-12:00" },
  { id: "slot-afternoon", label: "14:00-16:00" },
  { id: "slot-evening", label: "18:00-20:00" },
];

function seedRiders(): Rider[] {
  const mk = (
    name: string,
    phone: string,
    caps: [string, number][],
    active = true
  ): Rider => ({
    id: `rider-${name.slice(-1).toLowerCase()}`,
    name,
    phone,
    active,
    capacities: Object.fromEntries(caps),
    createdAt: now(),
  });
  return [
    mk("骑手A", "13800000001", [
      ["slot-morning", 4],
      ["slot-afternoon", 5],
      ["slot-evening", 3],
    ]),
    mk("骑手B", "13800000002", [
      ["slot-morning", 3],
      ["slot-afternoon", 4],
      ["slot-evening", 4],
    ]),
    mk("骑手C", "13800000003", [
      ["slot-morning", 2],
      ["slot-afternoon", 3],
      ["slot-evening", 5],
    ], false),
  ];
}

function seedOrders(): Order[] {
  const mk = (
    code: string,
    address: string,
    distance: number,
    slotId: string,
    riderId: string | null,
    note = ""
  ): Order => ({
    id: uid(),
    code,
    address,
    distance,
    slotId,
    note,
    riderId,
    createdAt: now(),
  });
  return [
    mk("DM-001", "世纪大道 100 号", 1.8, "slot-morning", "rider-a", "优先配送"),
    mk("DM-002", "张杨路 500 号", 0.9, "slot-morning", "rider-a"),
    mk("DM-003", "陆家嘴环路 1200 号", 2.4, "slot-afternoon", "rider-b", "待确认门禁"),
    mk("DM-004", "东方路 339 号", 1.2, "slot-morning", "rider-b"),
    mk("DM-005", "浦东南路 88 号", 3.1, "slot-afternoon", null),
    mk("DM-006", "潍坊路 27 号", 2.0, "slot-morning", null),
  ];
}

function load<T>(key: string, fallback: () => T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback();
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback();
  }
}

interface State {
  orders: Order[];
  riders: Rider[];
  rules: DispatchRules;
  archive: ArchiveOrder[];
}

const state = reactive<State>({
  orders: load(STORAGE_KEYS.orders, seedOrders),
  riders: load(STORAGE_KEYS.riders, seedRiders),
  rules: load<DispatchRules>(STORAGE_KEYS.rules, () => ({
    slots: SEED_SLOTS,
    strategy: "balance",
    autoAssignNew: true,
  })),
  archive: load(STORAGE_KEYS.archive, () => []),
});

/* ------------------------------ 本地持久化（四类分开） ------------------------------ */

watch(
  () => JSON.stringify(state.orders),
  (v) => localStorage.setItem(STORAGE_KEYS.orders, v)
);
watch(
  () => JSON.stringify(state.riders),
  (v) => localStorage.setItem(STORAGE_KEYS.riders, v)
);
watch(
  () => JSON.stringify(state.rules),
  (v) => localStorage.setItem(STORAGE_KEYS.rules, v)
);
watch(
  () => JSON.stringify(state.archive),
  (v) => localStorage.setItem(STORAGE_KEYS.archive, v)
);

// 首次加载（含演示数据）即落盘，保证四类存档键从一开始就分开存在
localStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(state.orders));
localStorage.setItem(STORAGE_KEYS.riders, JSON.stringify(state.riders));
localStorage.setItem(STORAGE_KEYS.rules, JSON.stringify(state.rules));
localStorage.setItem(STORAGE_KEYS.archive, JSON.stringify(state.archive));

/* --------------------------------- 基础查询与工具 --------------------------------- */

const riderMap = computed(() => {
  const m = new Map<string, Rider>();
  for (const r of state.riders) m.set(r.id, r);
  return m;
});

const slotMap = computed(() => {
  const m = new Map<string, Slot>();
  for (const s of state.rules.slots) m.set(s.id, s);
  return m;
});

function slotLabel(slotId: string): string {
  return slotMap.value.get(slotId)?.label ?? "（时段已删除）";
}

function capacityOf(rider: Rider, slotId: string): number {
  return Number(rider.capacities[slotId] ?? 0);
}

/** 骑手在某时段的在途订单（不含已送达） */
function loadOf(riderId: string, slotId: string): number {
  return state.orders.filter((o) => o.riderId === riderId && o.slotId === slotId).length;
}

/** 骑手在某时段的剩余载单量 */
function remainingOf(rider: Rider, slotId: string): number {
  return capacityOf(rider, slotId) - loadOf(rider.id, slotId);
}

/** 同一骑手的路线：先按时段顺序，再按距离由近到远 */
const slotIndexById = computed(() => {
  const m = new Map<string, number>();
  state.rules.slots.forEach((s, i) => m.set(s.id, i));
  return m;
});

function routeOrders(riderId: string): Order[] {
  return state.orders
    .filter((o) => o.riderId === riderId)
    .sort((a, b) => {
      const sa = slotIndexById.value.get(a.slotId) ?? Number.MAX_SAFE_INTEGER;
      const sb = slotIndexById.value.get(b.slotId) ?? Number.MAX_SAFE_INTEGER;
      if (sa !== sb) return sa - sb;
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.createdAt.localeCompare(b.createdAt);
    });
}

/* --------------------------------- 自动分配核心 --------------------------------- */

/**
 * 为某条订单选骑手：同一时段、在职、容量有余量。
 * balance 取余量最接近的（均衡装载）；sequence 取排班表中第一个放得下的。
 * 返回 null 表示装不下，订单留在待分配区。
 */
function pickRiderId(slotId: string, excludeOrderId?: string): string | null {
  const candidates = state.riders
    .filter((r) => r.active && capacityOf(r, slotId) > 0)
    .map((r) => ({ rider: r, remaining: remainingOf(r, slotId) }))
    .filter((c) => {
      if (c.remaining <= 0) return false;
      if (!excludeOrderId) return true;
      // 改派重算时：当前订单本身不计入占用
      const current = state.orders.find((o) => o.id === excludeOrderId);
      const used = loadOf(c.rider.id, slotId) - (current?.riderId === c.rider.id ? 1 : 0);
      return capacityOf(c.rider, slotId) - used > 0;
    });

  if (candidates.length === 0) return null;
  if (state.rules.strategy === "sequence") {
    return candidates.sort(
      (a, b) => state.riders.indexOf(a.rider) - state.riders.indexOf(b.rider)
    )[0].rider.id;
  }
  // balance：余量最小（最贴近容量）优先，余量相同则当前单量少的优先
  candidates.sort((a, b) => {
    if (a.remaining !== b.remaining) return a.remaining - b.remaining;
    return (
      loadOf(a.rider.id, slotId) - loadOf(b.rider.id, slotId) ||
      state.riders.indexOf(a.rider) - state.riders.indexOf(b.rider)
    );
  });
  return candidates[0].rider.id;
}

function assignOrder(order: Order) {
  const target = pickRiderId(order.slotId);
  order.riderId = target; // null = 留待分配区
}

/* --------------------------------- 订单操作 --------------------------------- */

let seq = 0;
function nextCode(): string {
  seq += 1;
  const sameDay =
    state.orders.filter((o) => o.code.includes(dateStamp())).length +
    state.archive.filter((o) => o.code.includes(dateStamp())).length;
  const n = String(sameDay + seq).padStart(3, "0");
  return `DM${dateStamp()}-${n}`;
}

function addOrder(input: NewOrderInput): Order {
  const order: Order = {
    id: uid(),
    code: nextCode(),
    address: input.address.trim(),
    distance: Number(input.distance),
    slotId: input.slotId,
    note: input.note.trim(),
    riderId: null,
    createdAt: now(),
  };
  state.orders.unshift(order);
  if (state.rules.autoAssignNew) assignOrder(order);
  return order;
}

/** 完成配送：从路线移出，记录完成时间，进入本地存档 */
function completeOrder(orderId: string) {
  const idx = state.orders.findIndex((o) => o.id === orderId);
  if (idx < 0) return;
  const order = state.orders[idx];
  if (!order.riderId) return;
  const rider = riderMap.value.get(order.riderId);
  state.archive.unshift({
    id: order.id,
    code: order.code,
    address: order.address,
    distance: order.distance,
    slotLabel: slotLabel(order.slotId),
    note: order.note,
    riderId: order.riderId,
    riderName: rider?.name ?? "未知骑手",
    createdAt: order.createdAt,
    completedAt: now(),
  });
  state.orders.splice(idx, 1);
}

/** 调度员改派：把订单派给指定骑手；目标满载则拒绝；改派后余量与路线立即重算 */
function reassignOrder(orderId: string, riderId: string | null): { ok: boolean; reason?: string } {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, reason: "订单不存在" };
  if (riderId === null) {
    order.riderId = null; // 退回待分配区
    return { ok: true };
  }
  const rider = riderMap.value.get(riderId);
  if (!rider) return { ok: false, reason: "骑手不存在" };
  if (!rider.active) return { ok: false, reason: "该骑手已停用排班" };
  const used = loadOf(riderId, order.slotId) - (order.riderId === riderId ? 1 : 0);
  if (used >= capacityOf(rider, order.slotId)) {
    return { ok: false, reason: `${slotLabel(order.slotId)} 容量已满（${capacityOf(rider, order.slotId)} 单）` };
  }
  order.riderId = riderId;
  return { ok: true };
}

/** 对待分配区一键自动分配（新增规则变更后也可手动触发） */
function autoAssignPending() {
  state.orders
    .filter((o) => o.riderId === null)
    .forEach((o) => assignOrder(o));
}

/** 单条订单自动分配，返回选中的骑手 id（null 表示容量不足） */
function assignOne(orderId: string): string | null {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return null;
  if (order.riderId === null) assignOrder(order);
  return order.riderId;
}

/** 全部重新按规则自动分配（在途单也参与重排） */
function rebalanceAll() {
  state.orders.forEach((o) => (o.riderId = null));
  // 按创建顺序逐条分配，保证容量约束
  [...state.orders]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .forEach((o) => assignOrder(o));
}

function deleteOrder(orderId: string) {
  const idx = state.orders.findIndex((o) => o.id === orderId);
  if (idx >= 0) state.orders.splice(idx, 1);
}

/** 编辑订单地址信息；更换时段后若骑手在新时段容量不足则拒绝 */
function updateOrder(
  orderId: string,
  patch: Partial<Pick<Order, "address" | "distance" | "slotId" | "note">>
): { ok: boolean; reason?: string } {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, reason: "订单不存在" };
  const nextSlotId = patch.slotId ?? order.slotId;
  if (order.riderId) {
    const rider = riderMap.value.get(order.riderId);
    if (rider) {
      const used =
        loadOf(rider.id, nextSlotId) - (nextSlotId === order.slotId ? 1 : 0);
      if (used >= capacityOf(rider, nextSlotId)) {
        return {
          ok: false,
          reason: `${rider.name} 在 ${slotLabel(nextSlotId)} 容量不足，请先把该单改派或退回待分配区`,
        };
      }
    }
  }
  if (patch.address !== undefined) order.address = patch.address.trim();
  if (patch.distance !== undefined) order.distance = Number(patch.distance);
  if (patch.slotId !== undefined) order.slotId = patch.slotId;
  if (patch.note !== undefined) order.note = patch.note.trim();
  return { ok: true };
}

/* --------------------------------- 骑手 / 时段维护 --------------------------------- */

function addRider(name: string, phone: string): Rider {
  const rider: Rider = {
    id: uid(),
    name: name.trim(),
    phone: phone.trim(),
    active: true,
    capacities: Object.fromEntries(state.rules.slots.map((s) => [s.id, 0])),
    createdAt: now(),
  };
  state.riders.push(rider);
  return rider;
}

function setCapacity(riderId: string, slotId: string, value: number) {
  const rider = riderMap.value.get(riderId);
  if (!rider) return;
  const capacity = Math.max(0, Math.floor(value));
  rider.capacities[slotId] = capacity;
  // 容量收紧后，超出的最远订单自动退回待分配区（路线按距离由近到远保留）
  const overflow = loadOf(riderId, slotId) - capacity;
  if (overflow > 0) {
    const victims = state.orders
      .filter((o) => o.riderId === riderId && o.slotId === slotId)
      .sort((a, b) => b.distance - a.distance)
      .slice(0, overflow);
    victims.forEach((o) => (o.riderId = null));
  }
}

function toggleRider(riderId: string) {
  const rider = riderMap.value.get(riderId);
  if (!rider) return;
  rider.active = !rider.active;
  if (!rider.active) {
    // 停用：在途单退回待分配区，等待调度员改派
    state.orders.forEach((o) => {
      if (o.riderId === riderId) o.riderId = null;
    });
  }
}

function deleteRider(riderId: string) {
  state.orders.forEach((o) => {
    if (o.riderId === riderId) o.riderId = null;
  });
  state.riders = state.riders.filter((r) => r.id !== riderId);
}

function addSlot(label: string) {
  state.rules.slots.push({ id: uid(), label: label.trim() });
  state.riders.forEach((r) => (r.capacities[state.rules.slots[state.rules.slots.length - 1].id] = 0));
}

function removeSlot(slotId: string) {
  state.rules.slots = state.rules.slots.filter((s) => s.id !== slotId);
  state.orders = state.orders.filter((o) => o.slotId !== slotId);
  state.riders.forEach((r) => delete r.capacities[slotId]);
}

/* --------------------------------- 存档操作 --------------------------------- */

function clearArchive() {
  state.archive = [];
}

/** 清空全部本地存档并恢复演示数据 */
function resetAll() {
  localStorage.removeItem(STORAGE_KEYS.orders);
  localStorage.removeItem(STORAGE_KEYS.riders);
  localStorage.removeItem(STORAGE_KEYS.rules);
  localStorage.removeItem(STORAGE_KEYS.archive);
  location.reload();
}

/* --------------------------------- 汇总统计 --------------------------------- */

const pendingOrders = computed(() =>
  state.orders
    .filter((o) => o.riderId === null)
    .sort((a, b) => {
      const sa = slotIndexById.value.get(a.slotId) ?? Number.MAX_SAFE_INTEGER;
      const sb = slotIndexById.value.get(b.slotId) ?? Number.MAX_SAFE_INTEGER;
      return sa - sb || a.distance - b.distance;
    })
);

interface RiderStats {
  rider: Rider;
  route: Order[];
  activeCount: number;
  totalDistance: number;
  /** slotId -> 单量/容量 */
  slotLoads: { slot: Slot; used: number; capacity: number; remaining: number }[];
}

const riderStats = computed<RiderStats[]>(() =>
  state.riders.map((rider) => {
    const route = routeOrders(rider.id);
    return {
      rider,
      route,
      activeCount: route.length,
      totalDistance: route.reduce((sum, o) => sum + o.distance, 0),
      slotLoads: state.rules.slots.map((slot) => {
        const used = loadOf(rider.id, slot.id);
        const capacity = capacityOf(rider, slot.id);
        return { slot, used, capacity, remaining: capacity - used };
      }),
    };
  })
);

const overview = computed(() => {
  const active = state.orders.length;
  const pending = pendingOrders.value.length;
  const assigned = active - pending;
  const done = state.archive.length;
  const distance = state.orders.reduce((s, o) => s + o.distance, 0);
  return {
    active,
    pending,
    assigned,
    done,
    avgDistance: active ? (distance / active).toFixed(1) : "0.0",
  };
});

export function useDispatchStore() {
  return {
    state,
    // queries
    riderMap,
    slotMap,
    slotLabel,
    capacityOf,
    loadOf,
    remainingOf,
    routeOrders,
    pendingOrders,
    riderStats,
    overview,
    // orders
    addOrder,
    completeOrder,
    reassignOrder,
    autoAssignPending,
    assignOne,
    rebalanceAll,
    deleteOrder,
    updateOrder,
    // riders & slots
    addRider,
    setCapacity,
    toggleRider,
    deleteRider,
    addSlot,
    removeSlot,
    // rules & persistence
    clearArchive,
    resetAll,
  };
}
