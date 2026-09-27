<script setup lang="ts">
import { reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useDispatchStore } from "../store";

const store = useDispatchStore();
const { state, loadOf } = store;

const addForm = reactive({ name: "", phone: "" });

function addRider() {
  if (!addForm.name.trim()) {
    ElMessage.warning("请填写骑手姓名");
    return;
  }
  if (state.riders.some((r) => r.name === addForm.name.trim())) {
    ElMessage.warning("已存在同名骑手");
    return;
  }
  store.addRider(addForm.name, addForm.phone);
  ElMessage.success(`已新增骑手 ${addForm.name.trim()}，请为各时段设置最大载单量`);
  addForm.name = "";
  addForm.phone = "";
}

/** 数字输入受控：失格/清空时保留原值，避免输入过程被 0 覆盖 */
function commitCap(riderId: string, slotId: string, raw: string | number) {
  const v = Number(raw);
  if (Number.isFinite(v) && v >= 0) {
    const before = loadOf(riderId, slotId);
    store.setCapacity(riderId, slotId, v);
    const after = loadOf(riderId, slotId);
    if (before > after) {
      ElMessage.warning("容量收紧，最远的超额订单已退回待分配区");
    }
  }
}

async function toggle(riderId: string) {
  const rider = store.riderMap.value.get(riderId);
  if (!rider) return;
  if (rider.active) {
    try {
      await ElMessageBox.confirm(
        `停用 ${rider.name} 后，其在途订单会全部退回待分配区。确定停用吗？`,
        "停用排班",
        { type: "warning", confirmButtonText: "停用", cancelButtonText: "取消" }
      );
    } catch {
      return;
    }
  }
  store.toggleRider(riderId);
  ElMessage.success(rider.active ? `已启用 ${rider.name}` : `已停用 ${rider.name}`);
}

async function remove(riderId: string) {
  const rider = store.riderMap.value.get(riderId);
  if (!rider) return;
  try {
    await ElMessageBox.confirm(
      `删除 ${rider.name} 后，其在途订单会退回待分配区；历史存档中保留其姓名。确定删除吗？`,
      "删除骑手",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }
  store.deleteRider(riderId);
  ElMessage.success("已删除");
}
</script>

<template>
  <div class="page-cols">
    <section class="panel">
      <h2>新增骑手</h2>
      <form class="form-grid" @submit.prevent="addRider">
        <label>
          姓名
          <input v-model="addForm.name" type="text" placeholder="如：骑手D" required />
        </label>
        <label>
          手机号
          <input v-model="addForm.phone" type="text" placeholder="选填" />
        </label>
        <button type="submit" class="btn primary">加入排班</button>
      </form>
      <p class="panel-hint">
        新增骑手默认各时段载单量为 0（表示该时段不排班），在右侧为其设置容量后才参与自动分配。
      </p>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>骑手排班与分时段载单量</h2>
      </div>
      <div v-if="state.riders.length === 0" class="empty">暂无骑手，请先新增。</div>
      <div v-else class="rider-schedule">
        <article v-for="rider in state.riders" :key="rider.id" class="schedule-card" :class="{ off: !rider.active }">
          <header class="schedule-head">
            <div>
              <h3>
                {{ rider.name }}
                <span v-if="!rider.active" class="off-tag">已停用</span>
              </h3>
              <p class="muted">{{ rider.phone || "未填手机号" }}</p>
            </div>
            <div class="table-ops">
              <button type="button" class="btn sm secondary" @click="toggle(rider.id)">
                {{ rider.active ? "停用" : "启用" }}
              </button>
              <button type="button" class="btn sm danger" @click="remove(rider.id)">删除</button>
            </div>
          </header>

          <div v-if="state.rules.slots.length === 0" class="empty">暂无时段，请先在「分配规则」中添加。</div>
          <div v-else class="cap-edit-list">
            <div v-for="slot in state.rules.slots" :key="slot.id" class="cap-edit-row">
              <span class="cap-label">{{ slot.label }}</span>
              <input
                class="cap-input"
                type="number"
                min="0"
                step="1"
                :value="rider.capacities[slot.id] ?? 0"
                :disabled="!rider.active"
                @change="commitCap(rider.id, slot.id, ($event.target as HTMLInputElement).value)"
              />
              <span class="muted cap-unit">单上限 · 当前 {{ loadOf(rider.id, slot.id) }} 单在途</span>
            </div>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
