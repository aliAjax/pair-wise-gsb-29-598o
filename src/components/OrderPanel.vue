<script setup lang="ts">
import { computed, ref } from "vue";
import { useDispatchStore } from "../store";
import type { OrderStatus } from "../types";
import { formatTime } from "../utils";

const store = useDispatchStore();
const { rules } = store;

const address = ref("");
const distance = ref<number>(1);
const slotId = ref(rules.slots[0]?.id ?? "");
const note = ref("");

const filterStatus = ref<"all" | OrderStatus>("all");
const filterSlot = ref<string>("all");
const keyword = ref("");

const filtered = computed(() =>
  [...store.orders.value]
    .filter((o) => filterStatus.value === "all" || o.status === filterStatus.value)
    .filter((o) => filterSlot.value === "all" || o.slotId === filterSlot.value)
    .filter((o) =>
      keyword.value.trim()
        ? o.address.includes(keyword.value.trim()) || o.code.includes(keyword.value.trim())
        : true,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
);

function submit() {
  if (!address.value.trim() || !slotId.value) return;
  store.addOrder({
    address: address.value,
    distance: Number(distance.value) || 0,
    slotId: slotId.value,
    note: note.value,
  });
  address.value = "";
  distance.value = 1;
  note.value = "";
}

function statusText(status: OrderStatus) {
  return status === "pending" ? "待分配" : status === "assigned" ? "配送中" : "已送达";
}

function slotLabel(id: string) {
  return store.slotMap.value[id]?.label ?? "（时段已删除）";
}
function riderName(id: string | null) {
  return id ? store.riderMap.value[id]?.name ?? "（骑手已删除）" : "—";
}
</script>

<template>
  <div class="split-layout">
    <form class="panel form-panel" @submit.prevent="submit">
      <h2>新增订单地址</h2>
      <p class="hint">订单地址与骑手排班分开维护；提交后按当前规则自动分配，装不下进入待分配区。</p>
      <div class="form-grid">
        <label>
          详细地址
          <input v-model="address" placeholder="如：世纪大道 100 号" required />
        </label>
        <div class="form-row">
          <label>
            距站点距离 km
            <input v-model.number="distance" type="number" min="0" step="0.1" required />
          </label>
          <label>
            配送时段
            <select v-model="slotId" required>
              <option v-for="slot in rules.slots" :key="slot.id" :value="slot.id">
                {{ slot.label }}
              </option>
            </select>
          </label>
        </div>
        <label>
          订单备注
          <textarea v-model="note" placeholder="楼宇、门禁电话、交接要求等" />
        </label>
        <button type="submit">提交并自动分配</button>
      </div>
    </form>

    <section class="panel list-panel">
      <div class="panel-head">
        <h2>订单地址库</h2>
        <span class="count">共 {{ filtered.length }} 单</span>
      </div>

      <div class="filter-row">
        <input v-model="keyword" placeholder="搜索单号或地址" />
        <select v-model="filterSlot">
          <option value="all">全部时段</option>
          <option v-for="slot in rules.slots" :key="slot.id" :value="slot.id">
            {{ slot.label }}
          </option>
        </select>
        <select v-model="filterStatus">
          <option value="all">全部状态</option>
          <option value="pending">待分配</option>
          <option value="assigned">配送中</option>
          <option value="delivered">已送达</option>
        </select>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>单号</th>
              <th>地址</th>
              <th>距离</th>
              <th>时段</th>
              <th>状态 / 骑手</th>
              <th>录入时间</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="order in filtered" :key="order.id">
              <td class="mono">{{ order.code }}</td>
              <td>
                {{ order.address }}
                <span v-if="order.note" class="cell-note" :title="order.note">📝</span>
              </td>
              <td>{{ order.distance.toFixed(1) }} km</td>
              <td>{{ slotLabel(order.slotId) }}</td>
              <td>
                <span class="inline-status" :class="order.status">{{ statusText(order.status) }}</span>
                <span class="muted">{{ riderName(order.riderId) }}</span>
              </td>
              <td class="muted">{{ formatTime(order.createdAt) }}</td>
              <td>
                <button
                  type="button"
                  class="danger tiny"
                  @click="store.removeOrder(order.id)"
                >
                  删除
                </button>
              </td>
            </tr>
            <tr v-if="filtered.length === 0">
              <td colspan="7" class="empty">没有符合条件的订单</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
