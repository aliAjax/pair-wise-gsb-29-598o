<script setup lang="ts">
import { ref } from "vue";
import { useDispatchStore } from "../store";
import type { AllocateStrategy } from "../types";

const store = useDispatchStore();
const { rules } = store;

const newSlotLabel = ref("");
const confirmReset = ref(false);

function addSlot() {
  const label = newSlotLabel.value.trim();
  if (!label) return;
  if (rules.slots.some((s) => s.label === label)) return;
  store.addSlot(label);
  newSlotLabel.value = "";
}

const strategies: Array<{ value: AllocateStrategy; title: string; desc: string }> = [
  {
    value: "capacity",
    title: "余量优先",
    desc: "新订单先分给该时段剩余载量最大的骑手，适合尽量留足整单空间。",
  },
  {
    value: "balance",
    title: "负载均衡",
    desc: "新订单先分给该时段在途订单最少的骑手，让所有人手上单数接近。",
  },
];
</script>

<template>
  <div class="split-layout rules-layout">
    <section class="panel">
      <h2>配送时段</h2>
      <p class="hint">
        时段与订单地址、骑手排班分开维护。新增时段会给所有骑手补上默认载量 3，可在排班页调整。
      </p>
      <ul class="slot-list">
        <li v-for="slot in rules.slots" :key="slot.id">
          <span class="slot-name">{{ slot.label }}</span>
          <span class="muted">
            待分配
            {{ store.slotSummary.value.find((r) => r.slot.id === slot.id)?.pending ?? 0 }} 单
          </span>
          <button
            type="button"
            class="danger tiny"
            :disabled="rules.slots.length <= 1"
            :title="rules.slots.length <= 1 ? '至少保留一个时段' : '删除时段'"
            @click="store.removeSlot(slot.id)"
          >
            删除
          </button>
        </li>
      </ul>
      <form class="inline-add" @submit.prevent="addSlot">
        <input v-model="newSlotLabel" placeholder="如 12:00-14:00" required />
        <button type="submit">新增时段</button>
      </form>
    </section>

    <section class="panel">
      <h2>分配规则</h2>
      <div class="strategy-list">
        <label
          v-for="item in strategies"
          :key="item.value"
          class="strategy-item"
          :class="{ active: rules.strategy === item.value }"
        >
          <input v-model="rules.strategy" type="radio" name="strategy" :value="item.value" />
          <div>
            <strong>{{ item.title }}</strong>
            <p>{{ item.desc }}</p>
          </div>
        </label>
      </div>

      <label class="switch big">
        <input v-model="rules.autoAllocateNew" type="checkbox" />
        <span>
          新订单进入时立即自动分配
          <small class="muted">关闭后新订单一律先进待分配区，由调度员手动改派</small>
        </span>
      </label>

      <div class="danger-zone">
        <h3>本地存档</h3>
        <p class="hint">
          订单地址、骑手排班、分配规则、送达记录分别存档在浏览器 localStorage，重新打开页面仍可接着调度。
        </p>
        <button type="button" class="danger" @click="confirmReset = true">清空本地存档并恢复演示数据</button>
      </div>
    </section>

    <div v-if="confirmReset" class="modal-mask" @click.self="confirmReset = false">
      <div class="modal">
        <p>将清空全部订单、骑手、规则和送达存档，恢复为初始演示数据，确定继续？</p>
        <div class="modal-actions">
          <button type="button" class="secondary" @click="confirmReset = false">取消</button>
          <button type="button" class="danger" @click="store.resetAll()">确认清空</button>
        </div>
      </div>
    </div>
  </div>
</template>
