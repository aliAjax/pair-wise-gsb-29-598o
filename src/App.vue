<script setup lang="ts">
import { computed, ref } from "vue";
import DispatchBoard from "./components/DispatchBoard.vue";
import OrderPanel from "./components/OrderPanel.vue";
import RosterPanel from "./components/RosterPanel.vue";
import RulesPanel from "./components/RulesPanel.vue";
import ArchivePanel from "./components/ArchivePanel.vue";
import { useDispatchStore } from "./store";

const store = useDispatchStore();

const tabs = [
  { key: "board", label: "调度台" },
  { key: "orders", label: "订单地址" },
  { key: "roster", label: "骑手排班" },
  { key: "rules", label: "分配规则" },
  { key: "archive", label: "送达存档" },
] as const;

type TabKey = (typeof tabs)[number]["key"];
const activeTab = ref<TabKey>("board");

const metricCards = computed(() => [
  { label: "待分配", value: store.metrics.value.pending, tone: "warn" },
  { label: "配送中", value: store.metrics.value.assigned, tone: "primary" },
  { label: "已送达", value: store.metrics.value.delivered, tone: "ok" },
  { label: "订单总数", value: store.metrics.value.total, tone: "neutral" },
  { label: "在途平均距离", value: `${store.metrics.value.avgDistance} km`, tone: "neutral" },
]);
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">城市末端配送 · 调度台</p>
          <h1>订单调度看板</h1>
          <p class="subtitle">
            按时段维护骑手载量，新订单按时段余量自动分配；路线由近到远，送达即移出并记录完成时间，改派即时重算。
          </p>
        </div>
        <div class="stack">
          <span class="tag">本地自动存档</span>
          <span class="tag">刷新不丢单</span>
        </div>
      </header>

      <section class="metrics">
        <article v-for="card in metricCards" :key="card.label" class="metric" :class="card.tone">
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
        </article>
      </section>

      <nav class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="tab"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
          <span v-if="tab.key === 'board' && store.metrics.value.pending > 0" class="tab-badge">
            {{ store.metrics.value.pending }}
          </span>
        </button>
      </nav>

      <DispatchBoard v-if="activeTab === 'board'" />
      <OrderPanel v-else-if="activeTab === 'orders'" />
      <RosterPanel v-else-if="activeTab === 'roster'" />
      <RulesPanel v-else-if="activeTab === 'rules'" />
      <ArchivePanel v-else-if="activeTab === 'archive'" />
    </div>
  </main>
</template>
