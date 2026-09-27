/* 逻辑冒烟测试：node 通过 esbuild 临时打包后执行，不进入构建产物 */

// localStorage 桩必须在 import store 之前就位（store 模块加载时即读取存档）
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};

const { useDispatchStore } = await import("../src/store");

const flush = () => new Promise((r) => setTimeout(r, 0));
let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("断言失败: " + msg);
  passed++;
  console.log("  ✓", msg);
}

async function main() {
  const store = useDispatchStore();
  const { state } = store;

  await flush();

  console.log("1. 种子数据与四类存档键");
  assert(state.orders.length === 6, "种子有 6 条活动订单");
  assert(state.riders.length === 3, "种子有 3 名骑手");
  assert(mem.has("hxwlfront-15:orders"), "订单已独立持久化");
  assert(mem.has("hxwlfront-15:riders"), "排班已独立持久化");
  assert(mem.has("hxwlfront-15:rules"), "规则已独立持久化");
  assert(mem.has("hxwlfront-15:archive"), "存档已独立持久化");

  const morning = "slot-morning";
  const afternoon = "slot-afternoon";

  console.log("2. 待分配订单自动分配（均衡策略：余量打平时给当前单量少的）");
  // 种子上午：A 2 单/容量4，B 1 单/容量3，待分配 1 单(DM-006 2.0km)
  store.autoAssignPending();
  const dm006 = state.orders.find((o) => o.code === "DM-006")!;
  assert(dm006.riderId === "rider-b", "DM-006 分给当前单量较少的骑手B");

  console.log("3. 容量装满后新订单留在待分配区");
  // 上午总容量 A4+B3=7，已用 4，再连续加 3 单装满，第 4 单装不下
  for (let i = 0; i < 3; i++) {
    const o = store.addOrder({ address: `装满测试${i}`, distance: 1 + i * 0.3, slotId: morning, note: "" });
    assert(o.riderId !== null, `第 ${i + 1} 单成功上车`);
  }
  const overflow = store.addOrder({ address: "装不下的单", distance: 2.6, slotId: morning, note: "" });
  assert(overflow.riderId === null, "容量耗尽后新订单留在待分配区");
  assert(store.remainingOf(state.riders[0], morning) === 0, "骑手A上午余量为 0");
  assert(store.remainingOf(state.riders[1], morning) === 0, "骑手B上午余量为 0");

  console.log("4. 满载骑手不可改派");
  const res = store.reassignOrder(overflow.id, "rider-a");
  assert(!res.ok && /容量已满/.test(res.reason ?? ""), "改派给满载骑手被拒绝并说明原因");

  console.log("5. 路线按距离从近到远");
  const routeB = store.routeOrders("rider-b").filter((o) => o.slotId === morning);
  const distances = routeB.map((o) => o.distance);
  assert(
    distances.every((d, i) => i === 0 || distances[i - 1] <= d),
    `骑手B上午路线距离递增: ${distances.join(" → ")}`
  );

  console.log("6. 送达移出路线并记录完成时间，腾出余量后可改派");
  const nearestB = routeB[0];
  const beforeCount = store.routeOrders("rider-b").length;
  store.completeOrder(nearestB.id);
  await flush();
  assert(!state.orders.some((o) => o.id === nearestB.id), "已送达订单从活动订单中移除");
  assert(store.routeOrders("rider-b").length === beforeCount - 1, "路线单量减 1");
  const arc = state.archive.find((a) => a.id === nearestB.id)!;
  assert(!!arc.completedAt && arc.riderName === "骑手B", "存档记录了完成时间与骑手快照");
  const res2 = store.reassignOrder(overflow.id, "rider-b");
  assert(res2.ok, "腾出余量后改派成功");

  console.log("7. 容量收紧，最远超额订单退回待分配区");
  // 送达后 B 上午原 3 单减 1，再加改派 1 单，回到 3 单；收紧到 1
  const bMorning = state.orders.filter((o) => o.riderId === "rider-b" && o.slotId === morning);
  const far = [...bMorning].sort((a, b) => b.distance - a.distance)[0];
  store.setCapacity("rider-b", morning, 1);
  const bounced = state.orders.find((o) => o.id === far.id)!;
  assert(bounced.riderId === null, `最远订单(${far.distance}km)退回待分配区`);
  const kept = state.orders.filter((o) => o.riderId === "rider-b" && o.slotId === morning);
  assert(kept.length === 1, "B 上午仅保留 1 单");

  console.log("8. 停用骑手后在途单退回待分配区");
  store.setCapacity("rider-b", morning, 3);
  const onB = state.orders.filter((o) => o.riderId === "rider-b").length;
  assert(onB > 0, "骑手B有在途单");
  store.toggleRider("rider-b");
  assert(state.orders.every((o) => o.riderId !== "rider-b"), "停用后在途单全部退回");
  store.toggleRider("rider-b");

  console.log("9. 全部重排遵循容量约束");
  store.rebalanceAll();
  assert(
    state.riders.every((r) =>
      state.rules.slots.every((s) => store.loadOf(r.id, s.id) <= store.capacityOf(r, s.id))
    ),
    "重排后无人超容"
  );

  console.log("10. 下午时段与上午容量独立（上午已满不影响下午）");
  const aMorn = store.addOrder({ address: "下午单", distance: 1.1, slotId: afternoon, note: "" });
  assert(aMorn.riderId !== null, "上午满载后下午订单仍能按下午容量上车");

  console.log(`\n全部 ${passed} 条断言通过 ✅`);
}

await main();
