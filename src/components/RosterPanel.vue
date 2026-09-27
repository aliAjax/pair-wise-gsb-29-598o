<script setup lang="ts">
import { ref } from "vue";
import { useDispatchStore } from "../store";
import type { Rider } from "../types";

const store = useDispatchStore();
const { rules } = store;

const newName = ref("");
const newPhone = ref("");
const confirmRider = ref<Rider | null>(null);

function addRider() {
  if (!newName.value.trim()) return;
  store.addRider(newName.value, newPhone.value);
  newName.value = "";
  newPhone.value = "";
}

function setCapacity(rider: Rider, slotId: string, value: number) {
  const n = Math.max(0, Math.min(99, Math.floor(Number(value) || 0)));
  rider.capacity[slotId] = n;
}

function applyAllCapacities(value: number) {
  for (const rider of store.riders.value) {
    for (const slot of rules.slots) rider.capacity[slot.id] = value;
  }
}

function capClass(rider: Rider, slotId: string) {
  return store.loadOf(rider.id, slotId) >= (rider.capacity[slotId] ?? 0) ? "full" : "";
}
</script>

<template>
  <div class="panel roster-panel">
    <div class="panel-head">
      <div>
        <h2>骑手排班与载量</h2>
        <p class="hint">
          为每个骑手按时段维护最大载单量；调低载量或切换下班时，超载路线会自动把最远的订单退回待分配区并尝试改派他人。
        </p>
      </div>
    </div>

    <form class="inline-add" @submit.prevent="addRider">
      <input v-model="newName" placeholder="骑手姓名" required />
      <input v-model="newPhone" placeholder="联系电话（选填）" />
      <button type="submit">新增骑手</button>
    </form>

    <div class="table-wrap">
      <table class="data-table capacity-table">
        <thead>
          <tr>
            <th>骑手</th>
            <th>电话</th>
            <th v-for="slot in rules.slots" :key="slot.id">
              {{ slot.label }}
              <span class="th-sub">最大载单量</span>
            </th>
            <th>状态</th>
            <th></th>
          </tr>
          <tr class="batch-row">
            <td colspan="2" class="muted">整列批量设置</td>
            <td v-for="slot in rules.slots" :key="slot.id">
              <button type="button" class="tiny secondary" @click="applyAllCapacities(3)">全列 3</button>
            </td>
            <td colspan="2"></td>
          </tr>
        </thead>
        <tbody>
          <tr v-for="rider in store.riders.value" :key="rider.id" :class="{ off: !rider.onDuty }">
            <td class="rider-cell">
              <span class="rider-dot" :class="rider.onDuty ? 'on' : 'off'" />
              <strong>{{ rider.name }}</strong>
            </td>
            <td class="muted">{{ rider.phone || "—" }}</td>
            <td v-for="slot in rules.slots" :key="slot.id">
              <div class="cap-edit" :class="capClass(rider, slot.id)">
                <input
                  :value="rider.capacity[slot.id] ?? 0"
                  type="number"
                  min="0"
                  max="99"
                  @input="setCapacity(rider, slot.id, ($event.target as HTMLInputElement).valueAsNumber)"
                />
                <span class="cap-load">/ 已载 {{ store.loadOf(rider.id, slot.id) }}</span>
              </div>
            </td>
            <td>
              <label class="switch">
                <input v-model="rider.onDuty" type="checkbox" />
                <span>{{ rider.onDuty ? "在班" : "下班" }}</span>
              </label>
            </td>
            <td>
              <button type="button" class="danger tiny" @click="confirmRider = rider">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="confirmRider" class="modal-mask" @click.self="confirmRider = null">
      <div class="modal">
        <p>删除骑手 <strong>{{ confirmRider.name }}</strong>？其在途订单将全部退回待分配区。</p>
        <div class="modal-actions">
          <button type="button" class="secondary" @click="confirmRider = null">取消</button>
          <button
            type="button"
            class="danger"
            @click="store.removeRider(confirmRider.id); confirmRider = null"
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
