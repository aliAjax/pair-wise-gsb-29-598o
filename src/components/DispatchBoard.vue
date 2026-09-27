<script setup lang="ts">
import { computed, ref } from "vue";
import { useDispatchStore, type RiderRoute } from "../store";
import type { Order } from "../types";
import { formatClock } from "../utils";

const store = useDispatchStore();
const { rules, riders } = store;

const notice = ref("");
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
function flash(message: string) {
  notice.value = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (notice.value = ""), 2600);
}

/** 待分配区改派 / 路线内改派：同槽位选择立即生效，两侧路线与统计自动重算 */
function reassign(order: Order, event: Event) {
  const raw = (event.target as HTMLSelectElement).value;
  const target = raw === "__pending" ? "" : raw;
  const ok = store.assignTo(order.id, target || null);
  if (!ok) {
    const rider = riders.value.find((r) => r.id === target);
    flash(`改派失败：${rider?.name ?? "目标骑手"}该时段已满载`);
  } else if (target) {
    flash(`已改派给 ${riders.value.find((r) => r.id === target)?.name}`);
  } else {
    flash(`订单 ${order.code} 已移回待分配区`);
  }
}

function deliver(order: Order) {
  store.markDelivered(order.id);
  flash(`订单 ${order.code} 已送达并移出路线`);
}

function autoAllocate() {
  const stuck = store.allocateAllPending();
  flash(stuck > 0 ? `${stuck} 单装不下，仍留在待分配区` : "待分配订单已全部分出");
}

/** 只展示在班骑手中该时段有余量、或当前已挂载该单的骑手 */
function riderOptions(order: Order) {
  const current = order.riderId;
  return riders.value.filter(
    (r) =>
      r.onDuty &&
      (r.id === current || store.remainingOf(r, order.slotId) > 0),
  );
}

function slotLabel(id: string) {
  return store.slotMap.value[id]?.label ?? "未知时段";
}

const activeSlotId = ref(store.rules.slots[0]?.id ?? "");
const activeSlot = computed(
  () => rules.slots.find((s) => s.id === activeSlotId.value) ?? rules.slots[0],
);

const pendingInSlot = computed(() =>
  store.pendingOrders.value.filter((o) => o.slotId === activeSlot.value?.id),
);

const routesInSlot = computed<RiderRoute[]>(() =>
  store.riderRoutes.value.filter(
    (r) => r.slotId === activeSlot.value?.id && (r.rider.onDuty || r.load > 0),
  ),
);

const loadRate = (r: RiderRoute) =>
  r.capacity > 0 ? Math.min(100, Math.round((r.load / r.capacity) * 100)) : 0;
</script>

<template>
  <div class="board">
    <transition name="fade">
      <div v-if="notice" class="toast">{{ notice }}</div>
    </transition>

    <!-- 时段总览 -->
    <div class="slot-overview">
      <button
        v-for="row in store.slotSummary.value"
        :key="row.slot.id"
        type="button"
        class="slot-card"
        :class="{ active: activeSlotId === row.slot.id }"
        @click="activeSlotId = row.slot.id"
      >
        <span class="slot-card-label">{{ row.slot.label }}</span>
        <strong>{{ row.load }}/{{ row.capacity }}</strong>
        <span class="slot-card-sub">
          在途 / 载量 · 余 {{ row.remaining }}
        </span>
        <span v-if="row.pending > 0" class="slot-card-pending">{{ row.pending }} 单待分配</span>
      </button>
    </div>

    <div class="board-grid">
      <!-- 待分配区 -->
      <section class="panel pending-panel">
        <div class="panel-head">
          <div>
            <h2>待分配区</h2>
            <p class="hint">按时段与余量自动分配，装不下的订单留在这里</p>
          </div>
          <button
            type="button"
            class="secondary small"
            :disabled="pendingInSlot.length === 0"
            @click="autoAllocate"
          >
            一键再分配
          </button>
        </div>

        <div v-if="pendingInSlot.length === 0" class="empty">
          该时段没有待分配订单
        </div>
        <article v-for="order in pendingInSlot" :key="order.id" class="order-card pending-card">
          <div class="order-head">
            <span class="order-code">{{ order.code }}</span>
            <span class="distance">{{ order.distance.toFixed(1) }} km</span>
          </div>
          <p class="address">{{ order.address }}</p>
          <p v-if="order.note" class="order-note">{{ order.note }}</p>
          <div class="assign-row">
            <select
              :value="order.riderId ?? ''"
              @change="reassign(order, $event)"
            >
              <option value="">改派给骑手…</option>
              <option v-for="rider in riderOptions(order)" :key="rider.id" :value="rider.id">
                {{ rider.name }}（余 {{ store.remainingOf(rider, order.slotId) }}）
              </option>
            </select>
          </div>
        </article>
      </section>

      <!-- 骑手路线 -->
      <section class="panel routes-panel">
        <div class="panel-head">
          <div>
            <h2>骑手路线 · {{ activeSlot?.label }}</h2>
            <p class="hint">同一骑手按距离由近到远排序，点击送达即移出路线并记录完成时间</p>
          </div>
        </div>

        <div v-if="routesInSlot.length === 0" class="empty">该时段暂无排班骑手</div>
        <div v-else class="route-columns">
          <article
            v-for="entry in routesInSlot"
            :key="entry.rider.id"
            class="rider-col"
            :class="{ off: !entry.rider.onDuty, full: entry.remaining <= 0 && entry.capacity > 0 }"
          >
            <header class="rider-head">
              <div>
                <p class="rider-name">
                  {{ entry.rider.name }}
                  <span v-if="!entry.rider.onDuty" class="badge badge-off">下班</span>
                </p>
                <p class="rider-phone">{{ entry.rider.phone || '未填电话' }}</p>
              </div>
              <div class="cap-num">
                <strong>{{ entry.load }}/{{ entry.capacity }}</strong>
                <span>在途/载量</span>
              </div>
            </header>

            <div class="cap-track">
              <div
                class="cap-fill"
                :class="{ warn: entry.remaining <= 0 }"
                :style="{ width: `${loadRate(entry)}%` }"
              />
            </div>

            <ol v-if="entry.route.length > 0" class="route-list">
              <li v-for="order in entry.route" :key="order.id" class="route-stop">
                <span class="stop-seq">{{ order.seq }}</span>
                <div class="stop-body">
                  <div class="stop-line">
                    <span class="order-code">{{ order.code }}</span>
                    <span class="distance">{{ order.distance.toFixed(1) }} km</span>
                  </div>
                  <p class="address">{{ order.address }}</p>
                  <div class="stop-actions">
                    <button type="button" class="small primary" @click="deliver(order)">送达</button>
                    <select
                      :key="`${order.id}-${entry.route.length}`"
                      @change="reassign(order, $event)"
                    >
                      <option value="" disabled selected>改派…</option>
                      <option value="__pending">移回待分配</option>
                      <option
                        v-for="rider in riderOptions(order).filter((r) => r.id !== entry.rider.id)"
                        :key="rider.id"
                        :value="rider.id"
                      >
                        {{ rider.name }}（余 {{ store.remainingOf(rider, order.slotId) }}）
                      </option>
                    </select>
                  </div>
                </div>
              </li>
            </ol>
            <div v-else class="empty small-empty">暂无路线订单</div>

            <footer class="rider-foot">
              <span>路线里程 {{ entry.distance.toFixed(1) }} km</span>
              <span v-if="slotLabel(entry.slotId)">{{ entry.slotLabel }}</span>
            </footer>
          </article>
        </div>
      </section>
    </div>

    <!-- 最近送达 -->
    <section v-if="store.archive.value.length > 0" class="panel recent-panel">
      <h2>最近送达</h2>
      <div class="recent-list">
        <span v-for="record in store.archive.value.slice(0, 6)" :key="record.order.id" class="recent-chip">
          {{ record.order.code }} · {{ record.riderName }} · {{ formatClock(record.completedAt) }}
        </span>
      </div>
    </section>
  </div>
</template>
