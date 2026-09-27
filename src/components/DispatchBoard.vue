<script setup lang="ts">
import { computed } from "vue";
import { ElMessage } from "element-plus";
import type { Order, Rider } from "../types";
import { useDispatchStore } from "../store";
import { formatTime } from "../util";

const store = useDispatchStore();
const { state, riderMap, slotLabel, capacityOf } = store;

/** 可改派的目标骑手：当前时段在职且有余量；返回条目带剩余量用于禁用/提示 */
interface Target {
  rider: Rider;
  remaining: number;
}

function targetsFor(order: Order, excludeCurrent: boolean): Target[] {
  return state.riders
    .filter((r) => r.active)
    .map((r) => {
      const used =
        store.loadOf(r.id, order.slotId) -
        (excludeCurrent && order.riderId === r.id ? 1 : 0);
      return { rider: r, remaining: capacityOf(r, order) - used };
    })
    .filter((t) => t.rider.id !== order.riderId || !excludeCurrent);
}

function onReassign(order: Order, ev: Event) {
  const select = ev.target as HTMLSelectElement;
  const riderId = select.value;
  select.value = "__keep__"; // 复位，便于再次选择同一骑手
  if (riderId === "__keep__") return;
  if (riderId === "__pending__") {
    store.reassignOrder(order.id, null);
    ElMessage.success(`已把 ${order.code} 退回待分配区`);
    return;
  }
  const res = store.reassignOrder(order.id, riderId);
  if (res.ok) {
    ElMessage.success(`已改派给 ${riderMap.value.get(riderId)?.name ?? ""}`);
  } else {
    ElMessage.warning(res.reason ?? "改派失败");
  }
}

function complete(order: Order) {
  store.completeOrder(order.id);
  ElMessage.success(`${order.code} 已送达并记入存档`);
}

function quickAssign(order: Order) {
  const target = store.assignOne(order.id);
  if (target) ElMessage.success(`已分配给 ${riderMap.value.get(target)?.name ?? ""}`);
  else ElMessage.warning("当前时段所有骑手容量已满，订单留在待分配区");
}

function autoAll() {
  const before = store.pendingOrders.value.length;
  store.autoAssignPending();
  const after = store.pendingOrders.value.length;
  if (before - after > 0) ElMessage.success(`自动分配了 ${before - after} 单，剩余 ${after} 单容量不足`);
  else ElMessage.warning("没有可分配的余量，订单继续留在待分配区");
}

/* ---- 按骑手路线分组：已在 store 中按时段+距离排好序，这里拆成时段组 ---- */
function groupsOf(route: Order[]) {
  const groups: { slotId: string; label: string; orders: Order[] }[] = [];
  for (const o of route) {
    let g = groups.find((x) => x.slotId === o.slotId);
    if (!g) {
      g = { slotId: o.slotId, label: slotLabel(o.slotId), orders: [] };
      groups.push(g);
    }
    g.orders.push(o);
  }
  return groups;
}

const activeRiderStats = computed(() => store.riderStats.value.filter((s) => s.rider.active));
const inactiveRiderStats = computed(() => store.riderStats.value.filter((s) => !s.rider.active));
</script>

<template>
  <div class="board">
    <!-- 待分配区 -->
    <section class="panel pending-panel">
      <div class="panel-head">
        <h2>待分配区 <span class="count-badge warn">{{ store.pendingOrders.value.length }}</span></h2>
        <button type="button" class="btn" :disabled="store.pendingOrders.value.length === 0" @click="autoAll">
          一键自动分配
        </button>
      </div>
      <p class="panel-hint">新订单按「时段 + 余量」自动分配；所有骑手都装不下的订单留在这里，可手动改派。</p>

      <div v-if="store.pendingOrders.value.length === 0" class="empty">暂无待分配订单，容量充足 🎉</div>
      <div v-else class="pending-list">
        <article v-for="order in store.pendingOrders.value" :key="order.id" class="order-card pending-card">
          <div class="order-main">
            <div class="order-title">
              <span class="code">{{ order.code }}</span>
              <span class="slot-chip">{{ slotLabel(order.slotId) }}</span>
            </div>
            <p class="address">📍 {{ order.address }}</p>
            <div class="order-meta">
              <span>距站点 {{ order.distance.toFixed(1) }} km</span>
              <span v-if="order.note" class="note-text">备注：{{ order.note }}</span>
              <span class="muted">{{ formatTime(order.createdAt) }} 下单</span>
            </div>
          </div>
          <div class="order-ops">
            <button type="button" class="btn sm" @click="quickAssign(order)">自动分配</button>
            <select class="reassign-select" value="__keep__" @change="onReassign(order, $event)">
              <option value="__keep__">手动改派…</option>
              <option value="__pending__">留在待分配区</option>
              <option v-for="t in targetsFor(order, true)" :key="t.rider.id" :value="t.rider.id" :disabled="t.remaining <= 0">
                {{ t.rider.name }}（余 {{ Math.max(0, t.remaining) }} 单）{{ t.remaining <= 0 ? "·已满" : "" }}
              </option>
            </select>
          </div>
        </article>
      </div>
    </section>

    <!-- 骑手路线 -->
    <section class="riders-panel">
      <div class="panel-head">
        <h2>骑手路线 <span class="count-badge">{{ activeRiderStats.length }} 人当班</span></h2>
        <button type="button" class="btn secondary" @click="store.rebalanceAll()">全部重排</button>
      </div>
      <p class="panel-hint">路线按时段顺序、同一段内按距离由近到远排列；送达后订单移出路线并记录完成时间。</p>

      <div class="rider-grid">
        <article v-for="stat in activeRiderStats" :key="stat.rider.id" class="rider-card">
          <header class="rider-head">
            <div>
              <h3>{{ stat.rider.name }}</h3>
              <p class="muted rider-phone">{{ stat.rider.phone || "未填手机号" }}</p>
            </div>
            <div class="rider-summary">
              <strong>{{ stat.activeCount }}</strong><span>在途单</span>
              <strong>{{ stat.totalDistance.toFixed(1) }}</strong><span>km</span>
            </div>
          </header>

          <!-- 分时段容量 -->
          <div class="cap-row" v-for="row in stat.slotLoads" :key="row.slot.id">
            <span class="cap-label">{{ row.slot.label }}</span>
            <div class="cap-track">
              <div
                class="cap-fill"
                :class="{ full: row.remaining <= 0 && row.capacity > 0, zero: row.capacity === 0 }"
                :style="{ width: `${row.capacity ? Math.min(100, (row.used / row.capacity) * 100) : 0}%` }"
              />
            </div>
            <span class="cap-num" :class="{ over: row.remaining < 0 }">
              {{ row.used }}/{{ row.capacity }}
              <em v-if="row.capacity > 0">余 {{ row.remaining }}</em>
              <em v-else class="muted">不排班</em>
            </span>
          </div>

          <div v-if="stat.route.length === 0" class="empty sm-empty">暂无在途订单</div>
          <div v-else class="route-groups">
            <div v-for="group in groupsOf(stat.route)" :key="group.slotId" class="route-group">
              <h4 class="route-slot">{{ group.label }}</h4>
              <ol class="route-list">
                <li v-for="(order, idx) in group.orders" :key="order.id" class="route-stop">
                  <span class="stop-index">{{ idx + 1 }}</span>
                  <div class="stop-body">
                    <div class="stop-line">
                      <span class="code">{{ order.code }}</span>
                      <span class="stop-distance">{{ order.distance.toFixed(1) }} km</span>
                    </div>
                    <p class="address">{{ order.address }}</p>
                    <div v-if="order.note" class="note-text">备注：{{ order.note }}</div>
                  </div>
                  <div class="stop-ops">
                    <button type="button" class="btn sm primary" @click="complete(order)">送达</button>
                    <select
                      class="reassign-select sm"
                      value="__keep__"
                      @change="onReassign(order, $event)"
                    >
                      <option value="__keep__">改派</option>
                      <option value="__pending__">退回待分配区</option>
                      <option
                        v-for="t in targetsFor(order, true)"
                        :key="t.rider.id"
                        :value="t.rider.id"
                        :disabled="t.remaining <= 0"
                      >
                        {{ t.rider.name }}（余 {{ Math.max(0, t.remaining) }} 单）{{ t.remaining <= 0 ? "·已满" : "" }}
                      </option>
                    </select>
                  </div>
                </li>
              </ol>
            </div>
          </div>
        </article>

        <article v-if="activeRiderStats.length === 0" class="empty rider-empty">
          当前没有当班骑手，请在「骑手排班」中新增或启用骑手。
        </article>
      </div>

      <div v-if="inactiveRiderStats.length" class="inactive-tip">
        停用中：
        <span v-for="s in inactiveRiderStats" :key="s.rider.id" class="inactive-name">{{ s.rider.name }}</span>
        （在「骑手排班」中可重新启用，停用前的在途单已退回待分配区）
      </div>
    </section>
  </div>
</template>
