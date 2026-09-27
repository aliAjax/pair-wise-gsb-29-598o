<script setup lang="ts">
import { computed, ref } from "vue";
import { useDispatchStore } from "./store";
import DispatchBoard from "./components/DispatchBoard.vue";
import OrderPanel from "./components/OrderPanel.vue";
import RiderPanel from "./components/RiderPanel.vue";
import RulesPanel from "./components/RulesPanel.vue";
import ArchivePanel from "./components/ArchivePanel.vue";

type TabId = "board" | "orders" | "riders" | "rules" | "archive";

const tabs: { id: TabId; label: string }[] = [
  { id: "board", label: "调度台" },
  { id: "orders", label: "订单地址" },
  { id: "riders", label: "骑手排班" },
  { id: "rules", label: "分配规则" },
  { id: "archive", label: "本地存档" },
];

const activeTab = ref<TabId>("board");
const store = useDispatchStore();
const overview = computed(() => store.overview.value);
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">城市末端配送 · 调度台</p>
          <h1>末端配送调度控制台</h1>
          <p class="subtitle">
            分时段维护骑手最大载单量；新订单按时段与余量自动分配，装不下留在待分配区；
            同一骑手路线按距离由近到远排列，送达即移出并记录完成时间。
          </p>
        </div>
      </header>

      <section class="metrics">
        <article class="metric">
          <span>在途订单</span>
          <strong>{{ overview.active }}</strong>
          <em class="metric-sub">已分配 {{ overview.assigned }} · 待分配 {{ overview.pending }}</em>
        </article>
        <article class="metric" :class="{ alert: overview.pending > 0 }">
          <span>待分配区</span>
          <strong>{{ overview.pending }}</strong>
          <em class="metric-sub">{{ overview.pending > 0 ? "等待调度员改派" : "全部已上车" }}</em>
        </article>
        <article class="metric">
          <span>平均运距</span>
          <strong>{{ overview.avgDistance }}<i>km</i></strong>
          <em class="metric-sub">在途订单距站点均值</em>
        </article>
        <article class="metric">
          <span>累计送达</span>
          <strong>{{ overview.done }}</strong>
          <em class="metric-sub">已记入本地存档</em>
        </article>
      </section>

      <nav class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          class="tab"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
          <span v-if="tab.id === 'board' && overview.pending > 0" class="tab-dot">{{ overview.pending }}</span>
        </button>
      </nav>

      <DispatchBoard v-if="activeTab === 'board'" />
      <OrderPanel v-else-if="activeTab === 'orders'" />
      <RiderPanel v-else-if="activeTab === 'riders'" />
      <RulesPanel v-else-if="activeTab === 'rules'" />
      <ArchivePanel v-else />

      <footer class="footer">
        数据保存在本机浏览器 localStorage：订单地址、骑手排班、分配规则、送达存档四类分开存储，关闭后重新打开仍可接着调度。
      </footer>
    </div>
  </main>
</template>
