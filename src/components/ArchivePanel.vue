<script setup lang="ts">
import { computed, ref } from "vue";
import { useDispatchStore } from "../store";
import { formatTime } from "../utils";

const store = useDispatchStore();

const keyword = ref("");
const riderFilter = ref("all");

const filtered = computed(() =>
  store.archive.value.filter(
    (r) =>
      (riderFilter.value === "all" || r.riderId === riderFilter.value) &&
      (keyword.value.trim()
        ? r.order.address.includes(keyword.value.trim()) ||
          r.order.code.includes(keyword.value.trim()) ||
          r.riderName.includes(keyword.value.trim())
        : true),
  ),
);

const byRider = computed(() =>
  store.riders.value
    .map((rider) => ({
      rider,
      count: store.archive.value.filter((r) => r.riderId === rider.id).length,
    }))
    .sort((a, b) => b.count - a.count),
);
</script>

<template>
  <div class="split-layout">
    <section class="panel list-panel">
      <div class="panel-head">
        <h2>送达存档</h2>
        <span class="count">共 {{ filtered.length }} 条</span>
      </div>
      <div class="filter-row">
        <input v-model="keyword" placeholder="搜索单号 / 地址 / 骑手" />
        <select v-model="riderFilter">
          <option value="all">全部骑手</option>
          <option v-for="rider in store.riders.value" :key="rider.id" :value="rider.id">
            {{ rider.name }}
          </option>
        </select>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>单号</th>
              <th>地址</th>
              <th>时段</th>
              <th>送达骑手</th>
              <th>完成时间</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="record in filtered" :key="record.order.id">
              <td class="mono">{{ record.order.code }}</td>
              <td>{{ record.order.address }}</td>
              <td>{{ record.slotLabel }}</td>
              <td>{{ record.riderName }}</td>
              <td class="mono">{{ formatTime(record.completedAt) }}</td>
              <td>
                <button
                  type="button"
                  class="tiny secondary"
                  title="撤销送达，订单回到待分配区重新参与分配"
                  @click="store.undoDelivered(record.order.id)"
                >
                  撤销送达
                </button>
              </td>
            </tr>
            <tr v-if="filtered.length === 0">
              <td colspan="6" class="empty">暂无送达记录</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel stat-panel">
      <h2>骑手完成统计</h2>
      <ul class="rider-stats">
        <li v-for="row in byRider" :key="row.rider.id">
          <span class="rider-name-line">
            <span class="rider-dot" :class="row.rider.onDuty ? 'on' : 'off'" />
            {{ row.rider.name }}
          </span>
          <div class="stat-bar-track">
            <div
              class="stat-bar-fill"
              :style="{
                width: `${Math.max(4, Math.min(100, (row.count / Math.max(1, byRider[0]?.count ?? 1)) * 100))}%`,
              }"
            />
          </div>
          <strong>{{ row.count }} 单</strong>
        </li>
      </ul>
    </section>
  </div>
</template>
