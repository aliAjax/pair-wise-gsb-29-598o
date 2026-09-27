<script setup lang="ts">
import { ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useDispatchStore } from "../store";

const store = useDispatchStore();
const { state } = store;
const newSlot = ref("");

function addSlot() {
  const label = newSlot.value.trim();
  if (!label) return;
  if (state.rules.slots.some((s) => s.label === label)) {
    ElMessage.warning("该时段已存在");
    return;
  }
  store.addSlot(label);
  newSlot.value = "";
  ElMessage.success("时段已加入排班，新时段默认各位骑手容量为 0");
}

async function removeSlot(slotId: string) {
  const label = state.rules.slots.find((s) => s.id === slotId)?.label;
  try {
    await ElMessageBox.confirm(
      `删除时段「${label}」会同时删除该时段下尚未送达的订单（已送达存档保留）。确定删除吗？`,
      "删除时段",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }
  store.removeSlot(slotId);
  ElMessage.success("时段已删除");
}

function reassignPending() {
  const before = store.pendingOrders.value.length;
  store.autoAssignPending();
  const after = store.pendingOrders.value.length;
  ElMessage.success(`已按新规则重算：分配 ${before - after} 单，待分配 ${after} 单`);
}
</script>

<template>
  <div class="page-cols">
    <section class="panel">
      <h2>配送时段</h2>
      <p class="panel-hint">时段被骑手排班容量和订单共同引用，删除时段会连带移除该时段的未送达订单。</p>
      <div class="slot-list">
        <div v-for="(slot, i) in state.rules.slots" :key="slot.id" class="slot-row">
          <span class="slot-order">{{ i + 1 }}</span>
          <span class="slot-label">{{ slot.label }}</span>
          <button type="button" class="btn sm danger" @click="removeSlot(slot.id)">删除</button>
        </div>
        <div v-if="state.rules.slots.length === 0" class="empty">尚无时段，请添加。</div>
      </div>
      <form class="slot-add" @submit.prevent="addSlot">
        <input v-model="newSlot" type="text" placeholder="如：12:00-14:00" />
        <button type="submit" class="btn primary">添加时段</button>
      </form>
    </section>

    <section class="panel">
      <h2>自动分配规则</h2>
      <div class="rule-block">
        <h3>新订单进入时</h3>
        <label class="radio-row">
          <input type="radio" value="balance" v-model="state.rules.strategy" />
          <span>
            <strong>均衡装载</strong>
            <em>优先分给当前时段余量最接近上限的骑手，让多人负载均衡</em>
          </span>
        </label>
        <label class="radio-row">
          <input type="radio" value="sequence" v-model="state.rules.strategy" />
          <span>
            <strong>顺序占满</strong>
            <em>按骑手排班顺序依次装满，第一人满载后再分给下一人</em>
          </span>
        </label>
        <p class="panel-hint">两种策略都只分给「在职 + 该时段容量有余量」的骑手；装不下的订单留在待分配区。</p>
      </div>

      <div class="rule-block">
        <h3>录入新订单</h3>
        <label class="check-row">
          <input type="checkbox" v-model="state.rules.autoAssignNew" />
          <span>提交后立即按规则自动分配（关闭则新订单全部先进入待分配区）</span>
        </label>
        <button type="button" class="btn secondary" @click="reassignPending">按当前规则重算待分配区</button>
      </div>
    </section>
  </div>
</template>
