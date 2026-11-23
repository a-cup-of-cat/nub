# 坠星工厂 开发指南

Nov 23, 2026 · @Bing Liu

本文档把《坠星工厂》的策划案翻译成可以直接开工的开发规格，供 Claude Code、Codex 等 AI 编程代理（以及人类开发者）使用。第一个目标是做出灰砾星的完整可玩版本。

## 1. 使用说明

把本文档导出为 Markdown，保存为代码仓库里的 `docs/SPEC.md`，再建两个入口文件，让 AI 编程代理每次开工前都先读它。

| 文件 | 谁会读 | 内容 |
| --- | --- | --- |
| `docs/SPEC.md` | 所有人 | 本文档全文 |
| `CLAUDE.md` | Claude Code（自动读取） | “开发前先读 docs/SPEC.md，并遵守第 1 节的工作规则”，加上常用命令 |
| `AGENTS.md` | Codex（自动读取） | 与 `CLAUDE.md` 相同 |

第一次开工时，可以对代理说：“阅读 docs/SPEC.md，按第 2 节初始化项目，然后完成里程碑 M1。”

### 给 AI 编程代理的工作规则

1. **一次只做一个里程碑**（第 8 节）。做完跑全部测试，更新 `CHANGELOG.md`，再开始下一个。
2. **数值只放在 `src/data/`**。引擎和界面代码里不写死任何游戏数字，策划以后调数值只改数据文件。
3. **模拟引擎是纯 TypeScript**，不依赖 React 和浏览器 API，必须能在 Node 里跑测试。
4. **只用第 2 节白名单里的依赖**。要加新依赖，先说明理由并征求同意。
5. **素材只用第 7 节允许的授权**，每个素材的来源和授权写进 `CREDITS.md`。
6. **界面文字全部放进 `src/i18n/zh-CN.ts`**，组件里不写中文字面量。
7. **遇到本文档没写清楚的地方**：按最简单、以后好改的方式实现，在代码里标 `// SPEC-GAP:` 并在提交说明里列出。不要自己发明新玩法或新数值。
8. **小步提交**，每个提交都能运行；引擎改动必须带测试。
9. **优先级**：本文档 > 代码注释 > 代理自己的判断。数值以第 4–5 节为准。

## 2. 技术选型与项目结构

纯前端网页游戏，没有后端：TypeScript + Vite + React，产线图用 React Flow，存档在浏览器本地。打包后是静态网站，可以发布到 GitHub Pages、Netlify 或 itch.io。

选 React Flow 是因为它自带节点拖动、连线、缩放平移和触屏支持，策划案里的“可操作的产线图”不用从零写节点编辑器。

### 依赖白名单

安装时用各库当前的稳定版，并用 lock 文件锁定版本。

| 包 | 用途 | 授权 |
| --- | --- | --- |
| `react`、`react-dom` | 界面 | MIT |
| `zustand` | 把引擎状态接到界面 | MIT |
| `@xyflow/react` | 产线图（React Flow） | MIT |
| `lucide-react` | 界面通用图标 | ISC |
| `vite`、`typescript` | 构建与类型 | MIT / Apache-2.0 |
| `vitest` | 单元测试与引擎模拟测试 | MIT |
| `eslint`、`prettier` | 代码规范 | MIT |
| `tsx` | 在 Node 里直接运行 `scripts/simulate.ts` | MIT |

不用游戏引擎（Phaser、Unity 等）：这是以界面为主的经营游戏，普通网页技术更简单。音效用浏览器自带的 Web Audio，不引入音频库。

### 目录结构

```text
crashstar-factory/
├─ docs/SPEC.md            # 本文档
├─ CLAUDE.md  AGENTS.md    # 代理入口
├─ CREDITS.md  CHANGELOG.md
├─ public/
│  ├─ fonts/  sounds/  images/planets/
├─ src/
│  ├─ data/                 # 全部游戏数值（第 4–5 节）
│  │  ├─ items.ts           # 物品：ID、名称键、价值、图标形状
│  │  ├─ machines.ts        # 设备：配方、耗电、费用、占格
│  │  ├─ planets.ts         # 星球：可用设备、环境规则、目标、格子
│  │  ├─ cards.ts           # 海克斯卡
│  │  ├─ shop.ts            # 货架商品
│  │  └─ balance.ts         # 全局常数：涨价系数、加成上限等
│  ├─ engine/               # 纯 TS 模拟引擎（第 3 节）
│  │  ├─ state.ts           # GameState 类型
│  │  ├─ tick.ts            # 每一步的结算
│  │  ├─ allocation.ts      # 资源分配与分流
│  │  ├─ power.ts
│  │  ├─ orders.ts  merchant.ts  cards.ts  blueprint.ts
│  │  ├─ save.ts            # 存档、版本迁移、离线收益
│  │  └─ __tests__/
│  ├─ store/                # Zustand store，包一层引擎
│  ├─ ui/
│  │  ├─ layout/  graph/  list/  merchant/  echo/  common/
│  ├─ i18n/zh-CN.ts         # 全部界面文字与台词
│  ├─ audio/
│  └─ main.tsx
└─ scripts/
   └─ simulate.ts           # 无界面模拟，验证节奏（第 8 节）
```

## 3. 模拟引擎

引擎每秒推进 10 步（`dt = 0.1` 秒）。数据里的速率都是“每分钟”，结算时换算为 `rate / 60 * dt`。引擎是纯函数 `tick(state, dt) => state`，同样的输入必须得到同样的结果。

### 状态结构

```ts
interface GameState {
  version: number;                 // 存档版本，用于迁移
  planetId: PlanetId;
  timeSec: number;                 // 本星球已运行秒数
  rngSeed: number;                 // 订单与抽卡用的随机数种子
  stock: Record<ItemId, number>;   // 库存，没有上限
  machines: Record<MachineId, { count: number; paused: number; recipe: RecipeId }>;
  belts: BeltOverrides;             // 每条供需关系的并行带与网格折点，空数组表示已拆带
  splits: Record<ItemId, SplitSetting>;  // 分流设置（第 5 节）
  gridCapacity: number;
  powerFactor: number;             // 上一步的供电系数 0–1
  credits: number;
  cards: CardId[];
  orders: Order[];
  merchant: MerchantState;
  goalDelivered: Record<ItemId, number>;
  meta: MetaState;                 // 跨星球保留：补给仓、档案馆、蓝图、成就
  lastSavedAt: number;
}
```

同一种设备如果有两个配方（如熔炉炼铁 / 炼铜），在数据里拆成两个设备 ID，但共用一个 `costGroup`：涨价按整组的总台数计算。

### 每一步的结算顺序

1. **算需求**：对每组未暂停的设备，满速需求 = 配方输入 × 台数 × 速度倍率 × dt/60。耗电设备再乘以上一步的 `powerFactor`。
2. **输运与分配**：先按第 6 节的传送带容量和共段负载限制可送达需求，再把当前库存按分流模式分给各消耗者。设备按实际送达量与满速需求的比值结算开工率。
3. **算效率**：设备组的效率 `e = min(1, 每种输入的 配额/需求)`。开工率（界面显示的那个百分比）= `e × powerFactor`（不耗电设备为 `e`）。
4. **消耗与产出**：按 `e` 扣掉输入，按同样的比例增加产出。没用完的配额留在库存里。
5. **结算电力**：供电 = 各发电设备本步实际输出（燃煤电厂按其 `e`，太阳能按昼夜，核电站按燃料）。需求 = 所有未暂停的耗电设备的额定耗电之和。`powerFactor = min(1, 供电 / 需求)`，供下一步使用。
6. **其他系统**：更新订单倒计时、商人来访、昼夜、矿脉储量、成就。

碎石机、挖煤机和所有发电设备都不耗电。这保证全厂停电时也能靠“碎石机 → 挖煤机 → 燃煤电厂”重新起步。

### 分配模式

| 模式 | 规则 |
| --- | --- |
| 默认（按需求比例） | 每个消耗者得到 `需求 × min(1, 库存 / 总需求)` |
| 手动分流 | 玩家给每个消耗者设定份额（合计 100%）。先给每个消耗者 `min(需求, 库存 × 份额)`，剩下的再按未满足需求的比例分配，不浪费 |
| 智能分流阀（优先级） | 按玩家排的顺序依次给足：`配额 = min(需求, 剩余库存)` |

### 倍率与上限

- 速度倍率 = 所有“速度 / 产量”类加成相乘，**封顶 3**（`balance.maxMultiplier`）。速度加成同时放大输入和输出，配比不变。
- 只加产出、不加输入的效果（量子复制 +5%）和只减输入的效果（精密工艺 −20%），换算成等效倍率后也计入这个上限。
- 霜原上所有耗电设备的额定耗电 ×1.5。
- 晨昏上昼夜周期 180 秒：前 120 秒白天，后 60 秒夜晚，太阳能夜间输出 0。

### 矿脉储量（仅余烬）

每台采矿设备建造时自带一个矿位：普通矿位 1,500，铀矿位 300。挖完后这台设备停工，状态为“枯竭”，只能拆除。在余烬上建新的采矿设备需要先花信用点“勘探矿位”，价格见第 5 节。实现上用每组采矿设备的储量数组记录每台的剩余量。

### 随机、存档与离线收益

- 所有随机（订单、抽卡、收购清单）用带种子的伪随机数（如 mulberry32），种子存在状态里，保证测试可复现。
- 存档存在 `localStorage`，JSON 格式，带 `version` 字段和迁移函数。每 10 秒和页面隐藏时自动保存。提供“导出 / 导入存档”（一段可复制的文本）。
- **离线收益**：读档时按离线秒数补算，最多 7,200 秒，用 1 秒步长快速模拟。离线期间只结算生产，订单倒计时和商人来访暂停，不惩罚离开的玩家。回来时由回声报告离线产出。

## 4. 游戏数据

以下数据是策划案第 3 轮的定稿数值，直接拆进 `src/data/` 即可。所有速率都是**每分钟**，耗电单位是“电”。后面的星球默认包含之前所有星球的原料和设备，除非星球规则另有限制。

### 物品

`value` 是物品价值，用于订单奖励和收购价（第 5 节）；`shape` 决定图标外形（第 7 节）。通关部件不进入订单和收购，`value` 为 `null`。

```ts
// shape: ore | ingot | part | electronic | fluid | component
export const ITEMS = {
  // 星球 1 灰砾
  stone:{name:'石头',value:0.2,shape:'ore'}, iron_ore:{name:'铁矿',value:1,shape:'ore'},
  copper_ore:{name:'铜矿',value:1,shape:'ore'}, coal:{name:'煤',value:1,shape:'ore'},
  quartz:{name:'石英',value:1,shape:'ore'}, iron_ingot:{name:'铁锭',value:2,shape:'ingot'},
  copper_ingot:{name:'铜锭',value:2,shape:'ingot'}, part:{name:'零件',value:4,shape:'part'},
  copper_wire:{name:'铜线',value:1.5,shape:'part'}, wafer:{name:'硅片',value:4,shape:'electronic'},
  circuit:{name:'电路',value:12,shape:'electronic'}, chip:{name:'芯片',value:50,shape:'electronic'},
  // 星球 2 晨昏
  bauxite:{name:'铝土矿',value:1,shape:'ore'}, glass:{name:'玻璃',value:2.5,shape:'ingot'},
  aluminum:{name:'铝锭',value:4,shape:'ingot'}, steel:{name:'钢材',value:6,shape:'ingot'},
  motor:{name:'电机',value:22,shape:'component'}, solar_panel:{name:'太阳能板',value:25,shape:'component'},
  machine_bed:{name:'机床床身',value:null,shape:'component'}, servo:{name:'伺服电机',value:null,shape:'component'},
  cnc:{name:'数控系统',value:null,shape:'electronic'},
  // 星球 3 赤沙
  water:{name:'水',value:0.5,shape:'fluid'}, oil:{name:'石油',value:1,shape:'fluid'},
  rocket_fuel:{name:'火箭燃料',value:2.5,shape:'fluid'}, plastic:{name:'塑料',value:3,shape:'ingot'},
  lds:{name:'低密度结构',value:80,shape:'component'}, rcu:{name:'火箭控制单元',value:460,shape:'electronic'},
  // 星球 4 霜原
  titanium_ore:{name:'钛矿',value:2,shape:'ore'}, rare_earth:{name:'稀土',value:4,shape:'ore'},
  titanium_alloy:{name:'钛合金',value:10,shape:'ingot'}, sensor:{name:'传感器',value:135,shape:'electronic'},
  satellite:{name:'卫星',value:null,shape:'component'}, probe:{name:'深空探测器',value:null,shape:'component'},
  // 星球 5 余烬
  uranium:{name:'铀',value:5,shape:'ore'}, fuel_rod:{name:'核燃料棒',value:50,shape:'component'},
  hull:{name:'船体',value:null,shape:'component'}, warp_engine:{name:'跃迁引擎',value:null,shape:'component'},
  life_support:{name:'生命维持舱',value:null,shape:'component'}, nav_core:{name:'导航核心',value:null,shape:'electronic'},
} as const;
```

（中文名在实现时移到 `zh-CN.ts`，这里写出来只是为了对照。）

### 设备

`in` / `out` 为每分钟用量；`power` 为耗电（负数表示发电）；`cost` 为第一台的建造费用；`fp` 为占格；`base:true` 的设备在后续星球降价（第 5 节）。灰砾没有电力系统，在灰砾上 `powerFactor` 恒为 1。

```ts
export const MACHINES = {
  // —— 星球 1 灰砾 ——
  crusher:        {planet:1, out:{stone:60}, power:0, cost:{stone:10}, fp:1, base:true},
  iron_drill:     {planet:1, out:{iron_ore:30}, power:1, cost:{stone:40}, fp:1, base:true},
  copper_drill:   {planet:1, out:{copper_ore:30}, power:1, cost:{stone:40}, fp:1, base:true},
  coal_drill:     {planet:1, out:{coal:30}, power:0, cost:{stone:40}, fp:1, base:true},
  quartz_drill:   {planet:1, out:{quartz:20}, power:1, cost:{stone:60, iron_ingot:10}, fp:1, base:true},
  furnace_iron:   {planet:1, costGroup:'furnace', in:{iron_ore:30, coal:10}, out:{iron_ingot:30}, power:2, cost:{stone:80}, fp:2, base:true},
  furnace_copper: {planet:1, costGroup:'furnace', in:{copper_ore:30, coal:10}, out:{copper_ingot:30}, power:2, cost:{stone:80}, fp:2, base:true},
  assembler:      {planet:1, in:{iron_ingot:30}, out:{part:15}, power:1, cost:{iron_ingot:30}, fp:1, base:true},
  wire_drawer:    {planet:1, in:{copper_ingot:15}, out:{copper_wire:30}, power:1, cost:{iron_ingot:20, copper_ingot:10}, fp:1, base:true},
  circuit_fab:    {planet:1, in:{part:5, copper_wire:20}, out:{circuit:5}, power:2, cost:{iron_ingot:40, part:20}, fp:2, base:true},
  wafer_fab:      {planet:1, in:{quartz:20, coal:10}, out:{wafer:10}, power:2, cost:{stone:100, iron_ingot:30}, fp:2, base:true},
  chip_fab:       {planet:1, in:{circuit:15, wafer:10}, out:{chip:5}, power:3, cost:{part:60, circuit:40}, fp:4, base:true},
  // —— 星球 2 晨昏 ——
  coal_plant:      {planet:2, in:{coal:10}, out:{}, power:-20, cost:{stone:200}, fp:2},
  solar_station:   {planet:2, out:{}, power:-6, solar:true, cost:{solar_panel:5, stone:50}, fp:3}, // 夜间 0
  bauxite_drill:   {planet:2, out:{bauxite:20}, power:1, cost:{stone:80, iron_ingot:20}, fp:1},
  electrolyzer:    {planet:2, in:{bauxite:20}, out:{aluminum:10}, power:15, cost:{steel:60, copper_wire:30}, fp:3},
  steel_furnace:   {planet:2, in:{iron_ingot:30, coal:15}, out:{steel:15}, power:3, cost:{stone:150, iron_ingot:40}, fp:2},
  glass_kiln:      {planet:2, in:{quartz:20}, out:{glass:10}, power:2, cost:{stone:120}, fp:2},
  solar_panel_fab: {planet:2, in:{glass:10, wafer:10, aluminum:10}, out:{solar_panel:5}, power:2, cost:{steel:40, circuit:20}, fp:2},
  motor_fab:       {planet:2, in:{copper_wire:15, steel:5, part:10}, out:{motor:5}, power:3, cost:{steel:40, part:30}, fp:2},
  precision_shop:  {planet:2, power:4, cost:{steel:80, chip:20}, fp:4, recipes:{
    machine_bed:{in:{steel:20, aluminum:10}, out:{machine_bed:1}},
    servo:{in:{motor:4, chip:4}, out:{servo:2}},
    cnc:{in:{chip:4, circuit:6, copper_wire:10}, out:{cnc:1}} }},
  // —— 星球 3 赤沙 ——
  oil_pump:     {planet:3, out:{oil:25}, power:2, cost:{steel:60}, fp:1},
  water_pump:   {planet:3, out:{water:20}, power:1, cost:{steel:40}, fp:1},
  refinery:     {planet:3, in:{oil:20, water:10}, out:{plastic:10}, power:4, cost:{steel:80, motor:20}, fp:3},
  fuel_plant:   {planet:3, in:{oil:10, water:20}, out:{rocket_fuel:10}, power:4, cost:{steel:80, motor:20}, fp:3},
  lds_fab:      {planet:3, in:{aluminum:10, steel:10, plastic:10}, out:{lds:2}, power:4, cost:{steel:60, plastic:30}, fp:3},
  rcu_fab:      {planet:3, in:{chip:5, circuit:10, plastic:5}, out:{rcu:1}, power:5, cost:{steel:60, chip:20}, fp:3},
  // —— 星球 4 霜原 ——
  titanium_drill:   {planet:4, out:{titanium_ore:10}, power:2, cost:{steel:60, motor:10}, fp:1},
  rare_earth_drill: {planet:4, out:{rare_earth:5}, power:2, cost:{steel:60, motor:10}, fp:1},
  ti_furnace:       {planet:4, in:{titanium_ore:20, aluminum:10}, out:{titanium_alloy:10}, power:10, cost:{steel:100, lds:20}, fp:3},
  sensor_fab:       {planet:4, in:{rare_earth:4, chip:4, glass:4}, out:{sensor:2}, power:4, cost:{titanium_alloy:50, chip:20}, fp:2},
  space_assembly:   {planet:4, power:6, cost:{titanium_alloy:100, rcu:10}, fp:6, recipes:{
    satellite:{in:{solar_panel:5, sensor:2.5, titanium_alloy:10, rcu:2.5}, out:{satellite:0.5}},
    probe:{in:{sensor:5, titanium_alloy:10, rocket_fuel:25}, out:{probe:0.5}} }},
  // —— 星球 5 余烬 ——
  uranium_drill: {planet:5, out:{uranium:5}, power:4, cost:{titanium_alloy:50, motor:10}, fp:1},
  fuel_rod_fab:  {planet:5, in:{uranium:10, steel:5, water:10}, out:{fuel_rod:2}, power:8, cost:{titanium_alloy:100, lds:20}, fp:4},
  nuclear_plant: {planet:5, in:{fuel_rod:1}, out:{}, power:-100, cost:{titanium_alloy:150, lds:50, rcu:10}, fp:6},
  shipyard:      {planet:5, power:10, cost:{titanium_alloy:200, rcu:20}, fp:8, recipes:{
    hull:{in:{titanium_alloy:20, lds:10}, out:{hull:1}},
    warp_engine:{in:{fuel_rod:20, motor:10, titanium_alloy:20}, out:{warp_engine:1}},
    life_support:{in:{water:50, plastic:20, chip:10}, out:{life_support:1}},
    nav_core:{in:{chip:20, sensor:10}, out:{nav_core:1}} }},
};

// 替代配方：通过海克斯或图纸解锁，只在当前星球有效
export const ALT_RECIPES = {
  arc_steel:       {machine:'steel_furnace', in:{iron_ingot:30}, out:{steel:15}, power:12},
  plastic_circuit: {machine:'circuit_fab', in:{copper_wire:15, plastic:5}, out:{circuit:5}, power:2},
};
```

带 `recipes` 的设备（精密车间、航天总装厂、船坞）一次只生产一种部件，玩家在节点上切换。航天总装厂的数字对应“每件 2 分钟”；船坞每件 1 分钟。

### 星球与通关目标

| 星球 | ID | 初始格子 | 环境规则 | 海克斯轮数（来访进度点） | 通关目标（需交付） |
| --- | --- | --- | --- | --- | --- |
| 灰砾 | `grit` | 40 | 无电力系统 | 1（50%） | 智能中心：50 芯片 + 100 电路 + 200 零件 |
| 晨昏 | `dusk` | 60 | 昼夜周期 120 + 60 秒；挖煤机最多 6 台 | 2（33%、66%） | 工业母机：10 机床床身 + 20 伺服电机 + 10 数控系统 |
| 赤沙 | `redsand` | 80 | 抽水机最多 6 台 | 3（25%、50%、75%） | 火箭：50 低密度结构 + 100 火箭燃料 + 30 火箭控制单元 |
| 霜原 | `frost` | 100 | 耗电 ×1.5 | 3（25%、50%、75%） | 星图：发射 6 卫星 + 2 探测器，每次发射消耗 20 火箭燃料 |
| 余烬 | `ember` | 120 | 矿脉有储量（第 3 节） | 3（25%、50%、75%） | 星舰：10 船体 + 4 跃迁引擎 + 2 生命维持舱 + 1 导航核心 |

通关进度 = 已交付材料的价值 ÷ 全部所需材料的价值。通关部件没有 `value`，计算进度时按其配方原料价值之和估算。玩家在目标面板上手动点“交付”，把库存放进目标。

### 黄金比例（用于测试）

这些组合必须在模拟里精确配平，中间产品零积压、零短缺。

| 星球 | 组合 | 每分钟净产出 |
| --- | --- | --- |
| 灰砾 | 1 iron\_drill + 1 copper\_drill + 1 coal\_drill + 1 quartz\_drill + 1 furnace\_iron + 1 furnace\_copper + 1 assembler + 2 wire\_drawer + 3 circuit\_fab + 1 wafer\_fab + 1 chip\_fab | 5 chip |
| 晨昏 | 1 coal\_drill + 3 coal\_plant + 4 electrolyzer + 4 bauxite\_drill | 40 aluminum（采铝钻机另需 4 电） |
| 赤沙 | 2 oil\_pump + 2 water\_pump + 2 refinery + 1 fuel\_plant | 20 plastic + 10 rocket\_fuel |
| 霜原 | 2 titanium\_drill + 1 bauxite\_drill + 1 electrolyzer + 1 ti\_furnace | 10 titanium\_alloy |
| 余烬 | 2 uranium\_drill + 1 fuel\_rod\_fab + 2 nuclear\_plant | 200 电（需外部供给 5 steel + 10 water） |

## 5. 系统规则

所有常数放在 `src/data/balance.ts`，下文括号里给出建议的常数名。

### 建造、拆除与格子

- **建造费用**：第 n 台（从 0 计，按 `costGroup` 合计）= `ceil(基础费用 × 1.10^n)`（`costGrowth`）。`base:true` 的设备在第 k 颗星球再乘 `0.75^(k-1)`（`baseDiscount`）。
- **格子**：建造前检查剩余格子≥设备占格，否则不能建。扩建一次 +4 格（货架购买）。
- **拆除**：返还最后一台建造费用的 50%（`refundRate`，模块化拆装卡改为 100%），释放格子。
- **暂停**：暂停的设备不生产、不耗电、仍占格。
- **手动挖掘**：每次点击 +1 石头。
- **存量限制**：晨昏挖煤机最多 6 台；赤沙抽水机最多 6 台。

### 登陆与离开星球

- **登陆补给**：每颗新星球开局自带 2 台已建好的碎石机和 200 石头，加上带过来的信用点。这是开发默认值，策划案未定，标 `SPEC-GAP`。灰砾是开局，没有补给。
- **通关**：目标材料全部交付后，老锈来一次临别特卖（货架 7 折），玩家确认“离开”后播放通关演出、进入下一颗星球。
- **携带信用点**：上限 = 100 + 100 × 补给仓扩容次数，超出部分作废。
- 海克斯、分流阀、图纸在离开时清空；补给仓、档案馆、蓝图、成就保留在 `meta`。

### 订单

- 同时最多 3 张。物品从玩家当前**正在生产**、且 `value` 不为空的非原料物品里随机选。
- 数量 = 该物品当前每分钟产量 × 3，取整到 5，最少 5。
- 限时 = max(180 秒, 预计用时 × 2)。
- 奖励 = 数量 × value ÷ 10，取整到 5。
- 完成后 30 秒补一张新订单；主动放弃或超时，该栏冷却 120 秒。

### 行商来访

- 通关进度跨过第 4 节表里的进度点时，铜铃号到港。老锈一直等到玩家打开并关闭商人界面为止。
- 每次来访包含：海克斯三选一（免费）、货架、收购清单。
- **收购清单**：随机 2–3 种已解锁、有价值的物品；单价 = value ÷ 10 × 随机 1.2–1.5；每卖 50 件单价 −10%，最低到原价 50%。

### 海克斯卡

- **抽卡**：从“已到出现星球、尚未拥有”的卡里抽。基础权重：普通 60、稀有 35、传说 5。玩家已拥有某流派至少 1 张时，该流派的卡权重 ×1.5。
- **刷新**：同一次来访第 k 次刷新（从 0 计）价格 10 × 2^k，再乘星球系数。
- **总上限**：所有速度 / 产量类加成相乘不超过 ×3；信用点类不计入。达到上限时，卡牌显示“已达上限”。

| ID | 卡名 | 流派 | 稀有度 | 最早星球 | 效果 |
| --- | --- | --- | --- | --- | --- |
| `boost_mining` | 采矿 +15% | — | 普通 | 1 | 所有采矿设备速度 ×1.15 |
| `boost_smelting` | 冶炼 +15% | — | 普通 | 1 | 熔炉类设备速度 ×1.15 |
| `boost_assembly` | 组装 +15% | — | 普通 | 1 | 其余加工设备速度 ×1.15 |
| `boost_power` | 发电 +20% | — | 普通 | 2 | 发电设备输出 ×1.2 |
| `order_bonus` | 订单奖励 +20% | — | 普通 | 1 | 订单信用点 ×1.2 |
| `cheap_grid` | 扩建优惠 | — | 普通 | 1 | 扩建费用 ×0.7 |
| `arc_furnace` | 电弧熔炉 | 电力 | 稀有 | 2 | 熔炉与炼钢炉不再耗煤，每座耗电改为 8 |
| `heat_recovery` | 余热回收 | 电力 | 稀有 | 2 | 每座熔炉向电网返还 2 电 |
| `battery_bank` | 储能电池组 | 电力 | 稀有 | 2 | 存储多余电力，最多 200 电·分钟，缺电时自动放出 |
| `superconductor` | 超导电网 | 电力 | 稀有 | 2 | 供电 ≥ 需求 ×1.2 时，全厂速度 ×1.15 |
| `bulk_contract` | 批量合同 | 商贸 | 稀有 | 1 | 订单数量 ×2，奖励 ×3 |
| `regular` | 老主顾 | 商贸 | 稀有 | 1 | 连续完成订单每单 +10%，最多 +100%；放弃或超时清零 |
| `merchant_friend` | 商人之友 | 商贸 | 稀有 | 1 | 每次来访变成四选一 |
| `haggle` | 讨价还价 | 商贸 | 稀有 | 1 | 货架 ×0.75，刷新费用固定不递增 |
| `lean` | 精益生产 | 精工 | 稀有 | 1 | 每个空格全厂速度 +2%，最多 +40% |
| `heavy` | 重型设备 | 精工 | 稀有 | 1 | 之后新建的设备占格 ×2，输入输出 ×2.5 |
| `modular` | 模块化拆装 | 精工 | 稀有 | 1 | 拆除返还 100% |
| `precision` | 精密工艺 | 精工 | 稀有 | 1 | 加工设备输入 ×0.8 |
| `airdrop` | 空投补给 | 开拓 | 稀有 | 1 | 下一颗星球登陆补给翻倍 |
| `pioneer_horn` | 开荒号角 | 开拓 | 稀有 | 1 | 本星球前 15 分钟全厂速度 ×2（中途拿到则持续到第 15 分钟） |
| `first_free` | 第一桶金 | 开拓 | 稀有 | 1 | 每种设备当前星球的第一台免费 |
| `pick_master` | 机械镐大师 | 开拓 | 稀有 | 1 | 手动挖掘可选任意已解锁原料，每次 ×10 |
| `automation_core` | 自动化核心 | — | 传说 | 1 | 全厂速度 ×1.5 |
| `black_market` | 黑市渠道 | — | 传说 | 1 | 任意时候可把有价值的物品卖给老锈，单价 value ÷ 10，每卖 50 件 −10%，最低 50% |
| `quantum_copy` | 量子复制 | — | 传说 | 1 | 所有产出 ×1.05 |

### 货架

非永久商品价格在第 k 颗星球乘 `1.5^(k-1)`。

| ID | 商品 | 价格 | 涨价 / 说明 |
| --- | --- | --- | --- |
| `grid_plus` | 厂房扩建 +4 格 | 80 | 每次 ×1.3，换星球重置 |
| `blueprint_card` | 配方图纸（电弧炼钢 / 塑料电路） | 150 | 晨昏起；本星球有效 |
| `overtime` | 加班令 | 60 | 全厂 ×1.5 持续 10 分钟，不叠加，计入 ×3 上限 |
| `emergency_battery` | 应急电池 | 40 | 晨昏起；60 秒内提供 50 电 |
| `supply_crate` | 原料补给箱 | 50 | 本星球每种已解锁原料各 200 |
| `buy_machine` | 设备直购 | 该设备当前建造材料价值 ÷ 5 | 仍占格、仍计入涨价 |
| `valve` | 智能分流阀 | 40 | 同星球每多一个 ×1.2；装在一种物品上 |
| `survey` | 勘探矿位 | 30 | 仅余烬；每次 ×1.2 |
| `supply_pod` | 登陆补给仓扩容（永久） | 200 | 每次 +100；携带上限 +100 |
| `archive` | 档案馆（永久） | 300 | 一次性；每颗新星球开局送一张随机配方图纸 |
| `bp_recorder` | 蓝图记录仪（永久） | 250 | 含 1 个蓝图位 |
| `bp_slot` | 蓝图位（永久） | 150 | 每次 +50 |

### 分流与蓝图

- **分流**：每种物品的 `SplitSetting` 为 `{mode:'default'}`、`{mode:'manual', shares:Record<MachineId, number>}` 或 `{mode:'priority', order:MachineId[]}`。`priority` 模式需要在这种物品上装了分流阀。规则见第 3 节。
- **蓝图**：保存为 `{name, machines:{id:{count, recipe}}, splits}`。使用时按顺序排入建造队列：材料和格子够就建，不够就等；当前星球不可用的设备跳过并提示。队列可以随时取消。

### 成就

| ID | 名称 | 条件 |
| --- | --- | --- |
| `first_stone` | 第一块石头 | 手动挖掘 1 次 |
| `ai_alive` | 它活过来了 | 完成灰砾目标 |
| `golden_ratio` | 黄金比例 | 至少 5 组设备开工率全部 ≥ 99%，且所有中间产品库存 10 分钟内变化不超过 ±5% |
| `long_night` | 熬过长夜 | 晨昏一整个夜晚 powerFactor 始终为 1 |
| `regular_50` | 老锈的熟客 | 累计完成 50 张订单 |
| `rebuild` | 推倒重来 | 10 秒内拆除 10 台以上设备 |
| `full_set` | 凑齐了 | 拥有某流派的全部 4 张卡 |
| `back_to_stars` | 重返星空 | 完成余烬目标 |

## 6. 界面规格

界面的核心要求是“一眼看到哪里卡住，一步走到解决办法”。界面只显示已解锁的东西：电力表在晨昏才出现，水在赤沙才出现。所有提醒用横幅和音效，不弹窗；只有玩家自己点开的商人界面是弹层。

### 布局

| 区域 | 桌面（宽度 ≥ 1024 px） | 手机（< 768 px） |
| --- | --- | --- |
| 顶部状态栏 | 星球、格子、信用点、运行时间，以及后续解锁的环境与电力 | 状态项自动换行 |
| 资源库存 | 独立可收起的多列面板，展示所有已发现资源的可用整件数量、实测产量和净变化 | 两列自动换行，纵向阅读 |
| 左栏（约 280 px） | 通关目标各材料进度与“交付”按钮、最多 3 张订单、铜铃号入口、手动挖掘按钮 | 底部标签“目标与订单” |
| 中间（自适应） | 两个标签：产线图（默认）、文字列表 | 底部标签“设备” |
| 右栏（约 300 px） | 回声面板 | 底部标签“回声” |

### 产线图（React Flow）

- **节点**：一种设备（含配方）一个节点。显示名称 × 台数、配方、开工率条和状态标签（“满负荷”“缺铜线 63%”“供不应求”“已暂停”），以及 “+”“−”“暂停”按钮。可切换配方的节点有配方下拉框，也接受从配方卡拖放。
- **传送带**：用有方向的格状带面连接已建设备的出料口和接收口。带上显示物料和实际流量。选择「铺设传送带」后可点选供料和接收设备，也可从列表选线。点击空格设置途经点，确认后生效。支持撤回折点、坐标输入、增加并行带、拆带和恢复默认线路。
- **输运结算**：灰砾单带试行上限为 60 件/分。下游需求均分给可通行的并行带，各带受单带上限限制。横竖相邻两格间的同一段带面共享容量，双向均计入；只相交于一点的两条带各自通行。共段按申请量比例分配，整条线路取最紧段的比例。再按库存、分流设置和配方中最缺的原料计算实际消耗。产出仍进入已有的物品库存。
- **布置与存档**：设备建齐后自动补一条正交带。玩家设定的途经点会绕开已建设备；找不到通路时显示受阻。拖动设备后按已存折点重算。手动拆空的供需关系保持断开。出料口所在设备暂停仍可发库存，拆掉最后一台则断供。灰砾的带面免费，不占厂房格子。v1 存档载入 v2 时保留库存、设备和阵列位置，为已有供需关系补默认线路。离线生产使用同一套输运规则。
- **速率读数**：库存面板每个游戏秒更新一次。库存显示整件，毛产量和净变化分别按采样时长加权平均。绝对速率达到 1 件/秒时按秒显示，低于门槛按分钟显示；零显示为 0/秒。净变化含生产与设备消耗，手挖、建造、交易和交付只改变库存。配方和带面流量也使用相同的单位门槛。引擎仍以 0.1 秒步进。
- **设计参考**：采用定向输送、分支争用和独立并行线路提高吞吐的思路。灰砾的带速与交叉规则采用上文的项目数值。[《异星工厂》官方 Wiki · Belt transport system](https://wiki.factorio.com/Belt_transport_system)
- **分流点**：一种物品有 2 个以上消耗者时，在分叉处画一个小圆点，点开出现滑块（手动分流）或可拖动排序的列表（装了分流阀后）。
- **自动布局**：开始输运后优先显示已建设备，可用「添加设备」查看待建节点。没手动摆过的节点按产业链深度分层，从左到右排列（原料在最左）。用自己写的简单分层算法，不加布局库。手动位置存在存档的 `ui.nodePositions` 里，不影响数值。
- **框选**：框选一组节点后可“存为蓝图”（需要蓝图记录仪）。
- **供需颜色**：修好智能中心后开放。节点边框绿色 = 产出 ≥ 消耗 ×1.15，琥珀 = 1.0–1.15，红 = < 1.0。修复前只显示开工率条。
- **全线平衡**：一个连通的子图里所有节点开工率 ≥ 99%、且中间产品库存不再增长时，整组发光 2 秒，回声说“全线平衡”；同一组 5 分钟内不重复。

### 文字列表

与产线图操作完全同步。按层级分组：采集、冶炼、加工、高级、电力、通关部件。每行：名称 × 台数、配方、开工率条、状态标签、建造费用（不够的材料标红）、建造 / 拆除 / 暂停。支持 ×1 / ×10 / 最大 批量建造。

### 回声面板

- **瓶颈算法**：对每种被消耗的物品算“满载产出 ÷ 满载消耗”，取最低的 3 个（且 < 1.15）。建议数量 = `ceil((消耗 − 产出) / 单台生产者产量)`。每条建议带“跳到 XX”按钮，定位并高亮对应节点或行。
- **修复前**：只给 1 条提示，文字随机缺字（用“▯”代替并轻微闪烁）。
- **修复后**：完整建议 + 产线分析表（每种物品的产出、消耗、净值、实测速率、状态）。
- **消息记录**：订单完成、商人到港、离线收益、成就。

### 商人界面

弹层，分三块：海克斯卡（3 或 4 张，稀有度边框、流派角标和“电力流 1/4”计数、趣味说明）与刷新按钮；货架（买不起的置灰）；收购清单（输入数量或“全部卖出”）。顶部是老锈的一句台词，按场景从字符串文件里取。

### 状态提示

| 状态 | 呈现 | 点击后 |
| --- | --- | --- |
| 缺料 | 开工率条琥珀色，标签“缺 X  n%”；上游显示“供不应求” | 跳到上游并高亮 |
| 电力不足 | 电力表变红，显示“全厂 ×0.72” | 跳到电力分组 |
| 格子已满 | 建造按钮变为“格子已满” | 小菜单：扩建（价格）/ 选择拆除 |
| 订单剩 30 秒 | 倒计时变红并轻微闪烁 | 显示还差多少、哪台设备生产 |
| 订单可交付 | 订单卡亮起“交付” | 交付，飘出信用点 |
| 铜铃号到港 | 铃声 + 顶部横幅，左栏入口亮起 | 打开商人界面 |
| 矿脉即将枯竭 | 储量 < 10% 时显示“即将枯竭 · 剩 3 分钟” | 列出可勘探矿位 |

### 视觉与可访问性

- 暗色仪表盘风格。颜色全部用 CSS 变量：状态色固定（`--ok` 绿、`--tight` 琥珀、`--short` 红），星球色只用于背景和装饰（`--planet-bg`、`--planet-accent`）。
- 星球色调：灰砾灰石 + 琥珀应急灯；晨昏白天暖橙、夜晚深紫；赤沙赤褐 + 沙黄；霜原冰蓝 + 白；余烬暗红 + 余烬橙。
- 字体：正文 Noto Sans SC；标题 Noto Serif SC；数字和回声台词用等宽字体 JetBrains Mono；老锈台词用一种手写风格中文字体（见第 7 节）。数字一律等宽对齐。
- 状态同时用颜色和文字表达；按钮点击区域 ≥ 44 px；全部操作可用键盘完成；系统开启“减少动态效果”时关闭光点流动和闪烁。

## 7. 文案与素材

### 字符串文件

所有界面文字和台词放在 `src/i18n/zh-CN.ts`，按下面的命名空间组织，以后加英文版只需新增一个文件。

```ts
export const zhCN = {
  items:    { iron_ore: '铁矿', /* … */ },
  machines: { furnace_iron: '熔炉（炼铁）', /* … */ },
  planets:  { grit: { name: '灰砾', brief: '…' }, /* … */ },
  echo:     { opening: […], fullBalance: '全线平衡。', /* … */ },
  rusty:    { firstMeet: '…', arrive: '…', /* … */ },
  cards:    { arc_furnace: { name: '电弧熔炉', desc: '…', flavor: '…' }, /* … */ },
  achievements: { /* … */ },
  ui:       { build: '建造', demolish: '拆除', /* … */ },
};
```

**游戏名**：《坠星工厂》。**角色**：主角不说话；飞船 AI“回声”负责教学、建议和旁白；行商“老锈”开货船“铜铃号”。语气：句子短，带一点冷幽默，孤独但不压抑。

### 核心文案

**开场**（回声，灰砾）

> ……检测到……生命体征。维生舱完整度 31%。
>
> 飞船……已解体。残骸信号 5 处，分布在……数据损坏。
>
> 建议：捡石头。我知道……这听起来不太像……救援计划。

**星球登陆简报**（回声）

| 星球 | 简报 |
| --- | --- |
| 灰砾 | 坠落点……灰砾。可用资源：铁、铜、煤、石英。没有……其他东西。 |
| 晨昏 | 晨昏自转很快：白天两分钟，夜晚一分钟。煤矿稀少，太阳能会是好帮手，前提是你能熬过每一个夜晚。工业母机的信号就在附近。 |
| 赤沙 | 赤沙。气温宜人，如果你是一块石头的话。地下有石油，水源只有六处，请珍惜。 |
| 霜原 | 霜原，地表温度零下 140 度，所有设备耗电增加一半。好消息是：这里看星星特别清楚，正适合画星图。 |
| 余烬 | 余烬。矿藏丰富，但每一处矿脉都会挖空。这是最后一站。造好这艘船，我们就继续出发。 |

**老锈台词**

| 键 | 场景 | 台词 |
| --- | --- | --- |
| `firstMeet` | 初次见面 | 哟，还活着呢？铜铃号，老锈。我收货，也卖货，偶尔捣人，不做慈善。 |
| `arrive` | 来访 | 叮——老锈到了。看看今天带了什么好东西。 |
| `pick` | 三选一 | 挑一件吧，算见面礼。下次可就要收钱了……开玩笑的，下次也送。 |
| `favor` | 卡池偏向已有流派时 | 我记得你喜欢{流派}那套玩意儿，这回特地多带了几件。别谢我，记得多交货。 |
| `reroll` | 刷新 | 不满意？行，我再翻翻箱底。不过翻箱底也是要力气的。 |
| `poor` | 信用点不够 | 信用点不够啊朋友。老锈记账，但不赊账。 |
| `farewellSale` | 临别特卖 | 要走了？剩下这些我也懒得拉回去，便宜卖你。 |
| `goodbye` | 余烬送别 | 星暴带那边……替我看看外面现在什么样。走吧，别回头，铜铃号不送第二次。 |

**结局**

> 回声：跃迁引擎点火。航线稳定。星暴带……在身后了。
>
> （中继信标传来一条消息）老锈：货款记得结。……一路顺风。
>
> 回声：新的星域就在前面。要继续勘探吗？

**海克斯卡趣味说明**（写在卡牌效果下方）

| 卡 ID | 说明 |
| --- | --- |
| `arc_furnace` | 煤？那是上个时代的东西。 |
| `heat_recovery` | 热量不会消失，只会被老锈拿去卖钱。 |
| `bulk_contract` | 数量翻倍，报酬翻三倍。老锈说这叫诚意。 |
| `lean` | 空地也是一种设备。 |
| `first_free` | 第一台免费，第二台就不好说了。 |
| `black_market` | 别问货从哪来，也别问去哪了。 |
| `quantum_copy` | 它有时候会多造一个。没人知道为什么，回声也不知道。 |

其余卡牌和未写到的台词先用占位文字，标 `SPEC-GAP`，由策划补写。成就名见第 5 节。

### 素材来源与授权

**允许的授权**：CC0、MIT、ISC、Apache-2.0、SIL OFL（字体）、CC BY 4.0（必须在 `CREDITS.md` 和游戏内“致谢”页署名）。**不允许**：带 NC（非商业）或 ND 的 CC 授权、来源不明的素材、从其他游戏里拆出来的素材。

| 类别 | 建议来源 | 授权 | 说明 |
| --- | --- | --- | --- |
| 正文、标题字体 | Noto Sans SC、Noto Serif SC（Google Fonts） | OFL | 中文字体很大，发布前按 `zh-CN.ts` 里用到的字做子集化 |
| 数字与回声字体 | JetBrains Mono | OFL | 中文部分回退到 Noto Sans SC |
| 老锈的手写风字体 | 霞鹜文楷（LXGW WenKai） | OFL | 同样做子集化 |
| 界面通用图标 | Lucide | ISC | 已在依赖白名单 |
| 物品与设备图标 | 自己用 SVG 绘制 | 自有 | 24 px 网格、2 px 线宽；外形按 `shape`：原矿不规则多边形，锭和板材长方块，零件齿轮，电子产品方格，流体水滴，组件六边形 |
| 音效 | Kenney.nl 音效包；或用 jsfxr 自己生成 | CC0 / 自有 | 铜铃声、提示音、建造与拆除声 |
| 环境底噪 | Freesound 上标为 CC0 的录音 | CC0 | 风声、风沙、冰裂、低沉地鸣 |
| 星球插画 | M1 用 CSS 渐变 + SVG 剪影占位，正式版再定 | 自有 | 用 AI 生成图时，先确认工具条款允许商用，并记入 `CREDITS.md` |

`CREDITS.md` 每条记录：文件路径、作者、来源链接、授权。无法确认授权的素材一律不用。

## 8. 里程碑与验收标准

先做出灰砾星的完整可玩版本（M1），试玩、调数值，再逐星扩展。每个里程碑结束时，游戏都必须能从头玩到当前内容的结尾。

| 里程碑 | 内容 | 验收标准 |
| --- | --- | --- |
| M0 项目初始化 | Vite + React + TS 脚手架、ESLint / Prettier、Vitest、目录结构、`CLAUDE.md` / `AGENTS.md` / `CREDITS.md`、空的数据文件 | `npm run dev`、`npm test`、`npm run build` 都能运行 |
| M1 灰砾可玩版 | 引擎（默认分配、建造 / 拆除 / 暂停、格子、涨价）；灰砾全部数据；手动挖掘；订单；老锈来访 1 次（灰砾可用的卡、货架、收购）；通关目标与交付；产线图（节点、连线、+/−、拖动、自动布局）与文字列表；回声面板（修复前 / 后）；5 步新手引导；开场与通关演出；存档、离线收益；手机单栏布局 | 全部测试通过；节奏模拟的通关时间在 25–45 分钟；人工试玩能不看说明玩到通关 |
| M2 晨昏 | 电力系统、昼夜、太阳能、挖煤机上限；钢 / 铝 / 电机链与精密车间；手动分流与分流阀；替代配方与图纸；电力流派卡；星球切换、登陆补给、携带信用点；蓝图记录仪与蓝图 | 灰砾 → 晨昏连续可玩；晨昏模拟时间 40–70 分钟 |
| M3 赤沙与霜原 | 流体与抽水机上限；火箭目标；低温耗电；航天总装厂与发射 | 可玩到霜原通关 |
| M4 余烬与结局 | 矿脉储量与勘探；核电；星舰目标；老锈送别与结局；无尽远征入口（简版：通关后可任选一颗星球重玩，卡池全开，标 `SPEC-GAP` 待策划完善） | 主线完整可玩 |
| M5 打磨 | 音效与环境音、光点流动与全线平衡效果、成就、致谢页、字体子集化、发布到静态网站 | 首屏加载 < 3 秒；手机和桌面都能完整游玩 |

### 测试要求

1. **单元测试**：建造费用公式（含 `costGroup` 和星球降价）、三种分配模式、×3 加成封顶、订单生成（固定种子结果一致）、存档迁移。
2. **黄金比例测试**：对第 4 节的每一组，先给充足的初始库存跑 5 分钟进入稳态，再量 5 分钟：目标产品每分钟净产出误差 < 1%，中间产品库存变化 < 1%。需要外部输入的组合（晨昏缺 4 电、霜原需 45 电、余烬需钢和水）用测试专用的无限源补足。
3. **节奏模拟**：`scripts/simulate.ts` 里写一个贪心机器人：每 5 秒检查一次，有瓶颈就建最缺物品的生产者，没有就按黄金产线继续扩建；能交付就交付；挖石头按每秒 2 次计算。输出通关时间和一份时间线 CSV。结果是给数值策划调参用的数据：超出验收范围时只警告，不要自行修改数值。
4. **人工试玩清单**：能不看说明完成新手引导；缺料时能用“跳到”找到上游；关掉页面再打开存档与离线收益正确；手机上能建造、交付、和老锈交易。

### 反馈回路

每完成一个里程碑，把节奏模拟结果、人工试玩感受和代码里所有 `SPEC-GAP` 整理给策划。策划更新策划案和本文档后，再开始下一个里程碑。
