<script setup lang="ts">
import { reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { Order } from "../types";
import { useDispatchStore } from "../store";
import { formatTime } from "../util";

const store = useDispatchStore();
const { state, riderMap, slotLabel } = store;

const blank = () => ({
  address: "",
  distance: 1,
  slotId: state.rules.slots[0]?.id ?? "",
  note: "",
});

const form = reactive(blank());

function submit() {
  if (!form.address.trim()) {
    ElMessage.warning("请填写订单地址");
    return;
  }
  if (!form.slotId) {
    ElMessage.warning("请先在「分配规则」中维护配送时段");
    return;
  }
  const order = store.addOrder({ ...form });
  if (order.riderId) {
    ElMessage.success(`新订单已分配给 ${riderMap.value.get(order.riderId)?.name}`);
  } else if (state.rules.autoAssignNew) {
    ElMessage.warning("当前时段容量已满，订单进入待分配区");
  } else {
    ElMessage.success("订单已加入待分配区");
  }
  Object.assign(form, blank());
}

/* ---- 编辑 ---- */
const editing = ref<Order | null>(null);
const editForm = reactive(blank());

function startEdit(order: Order) {
  editing.value = order;
  editForm.address = order.address;
  editForm.distance = order.distance;
  editForm.slotId = order.slotId;
  editForm.note = order.note;
}

function saveEdit() {
  if (!editing.value) return;
  const res = store.updateOrder(editing.value.id, {
    address: editForm.address,
    distance: editForm.distance,
    slotId: editForm.slotId,
    note: editForm.note,
  });
  if (res.ok) {
    ElMessage.success("订单已更新，路线与统计已重算");
    editing.value = null;
  } else {
    ElMessage.warning(res.reason ?? "保存失败");
  }
}

async function remove(order: Order) {
  try {
    await ElMessageBox.confirm(`确定删除订单 ${order.code}（${order.address}）吗？`, "删除订单", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
    });
    store.deleteOrder(order.id);
    ElMessage.success("已删除");
  } catch {
    /* 取消 */
  }
}

function riderText(order: Order): string {
  return order.riderId ? riderMap.value.get(order.riderId)?.name ?? "（骑手已删除）" : "待分配";
}
</script>

<template>
  <div class="page-cols">
    <section class="panel">
      <h2>新增订单地址</h2>
      <p class="panel-hint">地址、距离和时段在这里维护；提交后按规则自动进入某条路线或待分配区。</p>
      <form class="form-grid" @submit.prevent="submit">
        <label>
          收货地址
          <input v-model="form.address" type="text" placeholder="如：世纪大道 100 号" required />
        </label>
        <div class="form-row">
          <label>
            距站点 km
            <input v-model.number="form.distance" type="number" min="0" step="0.1" required />
          </label>
          <label>
            配送时段
            <select v-model="form.slotId" required>
              <option v-for="s in state.rules.slots" :key="s.id" :value="s.id">{{ s.label }}</option>
            </select>
          </label>
        </div>
        <label>
          备注
          <textarea v-model="form.note" placeholder="门禁、联系电话、易碎等" />
        </label>
        <button type="submit" class="btn primary">提交并分配</button>
      </form>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>活动订单（{{ state.orders.length }}）</h2>
      </div>
      <div v-if="state.orders.length === 0" class="empty">暂无活动订单，全部订单均已送达或未录入。</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>单号</th>
            <th>地址</th>
            <th>距离</th>
            <th>时段</th>
            <th>所属骑手</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="order in state.orders" :key="order.id">
            <td>{{ order.code }}</td>
            <td>
              {{ order.address }}
              <span v-if="order.note" class="muted block-note">（{{ order.note }}）</span>
            </td>
            <td>{{ order.distance.toFixed(1) }}</td>
            <td>{{ slotLabel(order.slotId) }}</td>
            <td>
              <span :class="['rider-tag', { pending: !order.riderId }]">{{ riderText(order) }}</span>
            </td>
            <td class="table-ops">
              <button type="button" class="btn sm secondary" @click="startEdit(order)">编辑</button>
              <button type="button" class="btn sm danger" @click="remove(order)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 编辑弹层 -->
    <div v-if="editing" class="modal-mask" @click.self="editing = null">
      <div class="modal">
        <h3>编辑订单 {{ editing.code }}</h3>
        <div class="form-grid">
          <label>
            收货地址
            <input v-model="editForm.address" type="text" />
          </label>
          <div class="form-row">
            <label>
              距站点 km
              <input v-model.number="editForm.distance" type="number" min="0" step="0.1" />
            </label>
            <label>
              配送时段
              <select v-model="editForm.slotId">
                <option v-for="s in state.rules.slots" :key="s.id" :value="s.id">{{ s.label }}</option>
              </select>
            </label>
          </div>
          <label>
            备注
            <textarea v-model="editForm.note" />
          </label>
          <p v-if="editing.riderId" class="modal-tip">
            当前在 {{ riderText(editing) }} 路线上；更换时段若容量不足将无法保存。
          </p>
          <div class="modal-ops">
            <button type="button" class="btn secondary" @click="editing = null">取消</button>
            <button type="button" class="btn primary" @click="saveEdit">保存</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
