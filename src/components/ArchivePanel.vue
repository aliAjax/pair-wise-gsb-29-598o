<script setup lang="ts">
import { computed, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useDispatchStore } from "../store";
import { formatTime } from "../util";

const store = useDispatchStore();
const { state } = store;

const filterRider = ref<string>("all");
const filterSlot = ref<string>("all");

const filtered = computed(() =>
  state.archive.filter(
    (o) =>
      (filterRider.value === "all" || o.riderId === filterRider.value) &&
      (filterSlot.value === "all" || o.slotLabel === filterSlot.value)
  )
);

const slotOptions = computed(() => [...new Set(state.archive.map((o) => o.slotLabel))]);

const stats = computed(() => {
  const total = filtered.value.length;
  const sum = filtered.value.reduce((s, o) => s + o.distance, 0);
  return { total, avg: total ? (sum / total).toFixed(1) : "0.0" };
});

async function clearArchive() {
  if (state.archive.length === 0) return;
  try {
    await ElMessageBox.confirm(
      `将清空全部 ${state.archive.length} 条送达存档，此操作不可恢复。确定继续吗？`,
      "清空存档",
      { type: "warning", confirmButtonText: "清空", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }
  store.clearArchive();
  ElMessage.success("送达存档已清空");
}

async function resetAll() {
  try {
    await ElMessageBox.confirm(
      "将清空订单、骑手排班、分配规则和送达存档，恢复为演示数据。确定继续吗？",
      "恢复演示数据",
      { type: "warning", confirmButtonText: "恢复", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }
  store.resetAll();
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>本地存档 · 已送达订单（{{ state.archive.length }}）</h2>
      <div class="table-ops">
        <button type="button" class="btn sm danger" :disabled="state.archive.length === 0" @click="clearArchive">
          清空存档
        </button>
        <button type="button" class="btn sm secondary" @click="resetAll">恢复演示数据</button>
      </div>
    </div>
    <p class="panel-hint">订单送达即从路线移出并记录完成时间，独立保存在浏览器本地，重新打开页面仍可查看。</p>

    <div class="filter-bar">
      <label>
        骑手
        <select v-model="filterRider">
          <option value="all">全部</option>
          <option v-for="rider in state.riders" :key="rider.id" :value="rider.id">{{ rider.name }}</option>
        </select>
      </label>
      <label>
        时段
        <select v-model="filterSlot">
          <option value="all">全部</option>
          <option v-for="label in slotOptions" :key="label" :value="label">{{ label }}</option>
        </select>
      </label>
      <span class="muted">筛选结果：{{ stats.total }} 单，平均距离 {{ stats.avg }} km</span>
    </div>

    <div v-if="filtered.length === 0" class="empty">暂无符合条件的送达记录。</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>单号</th>
          <th>地址</th>
          <th>距离</th>
          <th>时段</th>
          <th>送达骑手</th>
          <th>下单时间</th>
          <th>完成时间</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="o in filtered" :key="o.id">
          <td>{{ o.code }}</td>
          <td>
            {{ o.address }}
            <span v-if="o.note" class="muted block-note">（{{ o.note }}）</span>
          </td>
          <td>{{ o.distance.toFixed(1) }}</td>
          <td>{{ o.slotLabel }}</td>
          <td>{{ o.riderName }}</td>
          <td>{{ formatTime(o.createdAt) }}</td>
          <td><strong class="done-time">{{ formatTime(o.completedAt) }}</strong></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
