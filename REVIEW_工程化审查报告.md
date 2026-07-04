# AHU_App 工程化审查报告

> 审查日期: 2026-06-18
> 审查范围: 工程计算正确性 + UI/UX 设计
> 审查目标: 评估当前实现是否适合"工程实际计算"用途,定位失真点与优化方向
> 适用版本: 当前 working tree(参见 `git log` 获取确切 commit)

本报告不修改任何源码,仅作为后续优化的依据。所有问题按 **Critical / Major / Minor** 三级分类,每条给出 `file:line`、问题描述、对工程的影响、修复建议。

---

## 第一部分:工程计算审查

审查对象:`calculations.js`、`renderer.js`(计算路径)、`extreme.js`、`component_design.js`。

引用标准:GB/T 35226-2017(湿空气)、GB 50736-2012(暖通设计)、GB/T 14294-2026(组合式空调机组)、GB/T 23341.1-2018(涡轮增压器)、GB/T 18300-2025、GB/T 29736-2013、JB/T 2379(电加热器)。

### 1.1 Critical — 计算结果失真或违反标准

#### EC1. 冷却盘管按 BF=0 建模,负荷与冷冻水流量被高估 11%~43%
- **位置**:`renderer.js:734-738`、`renderer.js:2909-2912`、`renderer.js:3197-3200`
- **现状**:
  ```js
  T_coil = calcTemperatureFromW(W_out, 95, P_atm);          // ADP @ 95% RH
  Q_coil_actual = Math.max(0, massFlow * (h_in - enthalpy(T_coil, W_out)));
  ```
  把盘管当作 100% 接触(BF=0),所有空气都达到 ADP。真实 AHU 盘管 BF≈0.1~0.3(GB/T 14294)。按定义 `h_out = h_adp + BF·(h_in − h_adp)`,真实盘管负荷应为 `ṁ(h_in − h_out)`。当前公式 `ṁ(h_in − h_adp)` 把负荷放大了 `1/(1−BF)` 倍。
- **影响**:盘管负荷、冷冻水流量、阀门 Kvs、水泵扬程全部偏大 11%~43%,直接导致设备选型偏大、投资浪费。
- **建议**:
  1. 增加 `BF` 输入(默认 0.15),仅用于 ADP 出水温度选择;
  2. 盘管负荷严格用能量平衡 `Q_coil = ṁ·(h_in − h_out)`,与 BF 无关;
  3. ADP-RH=95% 改为盘管属性输入(典型 90%~95%)。

#### EC2. `calcDewPoint` / `calcTemperatureFromW` 返回 -100℃ 哨兵值并向下传播
- **位置**:`renderer.js:289-292`、`renderer.js:298-303`、`component_design.js:85`、`component_design.js:128`
- **现状**:
  ```js
  function calcDewPoint(P_v_kPa) {
    if (P_v_kPa <= 0.61078) return -100;   // ← 0℃ 以下露点全部截断
    ...
  }
  ```
  冬季预设(`tempIn=-5℃, rhIn=10%`)的 `P_v≈0.042 kPa` 触发哨兵,焓湿图显示"露点温度: 入口 -100.0℃"。更严重的是 `component_design.js:128` 的 `(T_coil < dewPoint ? "✅ 可有效除湿" : ...)` 在 `dewPoint=-100` 时永远判负,误报"除湿效果有限"。
- **影响**:冬季低湿工况显示失真;除湿能力判定错误。
- **建议**:删除哨兵分支,反 Magnus 公式本身支持负值;仅在 `P_v<=0` 时返回 `NaN`,调用方渲染"露点计算失败"而非参与比较。

#### EC3. `satPressure`(Magnus 水面)在 T<0℃ 不分冰面,`satVaporPressure`(Sonntag 冰面)是死代码
- **位置**:`calculations.js:14-16`(水面 Magnus)、`calculations.js:51-59`(冰面 Sonntag)、`calculations.js:65-68`(`calcHumidityRatio` 调 `satPressure`)
- **现状**:GB/T 35226-2017 要求 T<0℃ 使用冰面饱和水汽压。主路径 `satPressure` 不分冰面;Sonntag 函数 grep 全代码零调用。
- **影响**:冬季工况不符合 GB/T 35226-2017;在 -10℃ 以下水面/冰面饱和压差异显著。
- **建议**:`satPressure` 内增加 `if (T<0)` 冰面分支,或全部路由到 `satVaporPressure`;删除未使用的那一个。

#### EC4. 盘管面积从未计算,排数按 Q 大小拍脑袋
- **位置**:`component_design.js:79`
  ```js
  var coil_rows = Q_coil > 50 ? 8 : Q_coil > 20 ? 6 : Q_coil > 5 ? 4 : 2;
  ```
- **现状**:无 LMTD、无传热系数 K、无空气侧/水侧热阻分解。真实翅片管盘管 K≈30~60 W/m²·K,面积 `A = Q/(K·ΔT_lm)·F_foul`。
- **影响**:工程师无法校核盘管能否在设计点满足负荷;排数选择无任何热力学依据。
- **建议**:增加盘管详细计算模块 — LMTD 由空气/水进出口温度求,K 按盘管几何取(4 排 Cu/Al 翅片管典型 45 W/m²·K),`A = Q/(K·LMTD)·1.1`(污垢系数 1.1),再由 `A = A_face × 翅片密度 × 翅高 × 排数` 反推排数。

#### EC5. 风机全压按 800~1200Pa 估算,未按回路阻力累加
- **位置**:`extreme.js:309`、`extreme.js:400`
  ```js
  desc: "离心风机,变频调速。全压按 800~1200Pa 估算,电机功率按 (Q×P)/(1000×η_fan×η_motor)。"
  ```
- **现状**:无滤网(50~100 Pa)、盘管(30~80 Pa/排)、加热器(20~50 Pa)、加湿器(30~80 Pa)、风管(1~3 Pa/m)、弯头损失的累加。`extreme.js:400` 隐式把 ΔP=1000 Pa 当魔法数。
- **影响**:风机选型可能在小阻力系统偏大、在多排盘管+长风管系统偏小,无法保证设计风量。
- **建议**:在 `analyzeFan` 中显式求和 `ΔP_total = ΔP_filter + ΔP_coil×rows + ΔP_heater + ΔP_humid + ΔP_duct×L + ΔP_fittings`,再 `P_motor = Q·ΔP_total/(η_fan·η_motor·1000)`,η_fan 前向叶轮 0.6 / 后向 0.75。

#### EC6. `component_design.js:240` 运算符优先级 bug,加湿器选型文案永远走假分支
- **位置**:`component_design.js:240`
  ```js
  { label: "选型依据", value: T_out >= 10 + "℃ → " + (T_out >= 10 ? ... ) }
  ```
- **现状**:`10 + "℃ → "` 先求值为 `"10℃ → "`,然后 `T_out >= "10℃ → "` 被强转为 `T_out >= NaN` → 永远 false。整个三元表达式恒走 false 分支,文案始终为"等焓加湿(湿膜)…蒸汽冷凝风险低"。
- **影响**:加湿器选型依据显示错误,工程师可能误选加湿方式。
- **建议**:加括号 `(T_out >= 10) + " ℃ → " + (...)`。

#### EC7. `component_design.js:84` 用硬编码 80%RH 算露点,忽略实际 rhIn
- **位置**:`component_design.js:84`
  ```js
  var dewPoint = calcDewPoint((80 / 100) * satPressure(T_in));
  ```
- **现状**:`rhIn` 在 `component_design.js:207` 已读取,但此处用硬编码 80%。
- **影响**:RH 摆动 10%~95% 的测试台工况下,露点校核失去意义。
- **建议**:`calcDewPoint((rhIn/100) * satPressure(T_in))`。

#### EC8. 加湿器能耗 0.77 kW·h/kg 用了饱和蒸汽焓,应为汽化潜热
- **位置**:`extreme.js:33`、`extreme.js:252`
- **现状**:0.77 kW·h/kg = 2772 kJ/kg 是 100℃ 饱和蒸汽焓;电极加湿器需供给的是汽化潜热 ≈2257 kJ/kg = 0.627 kW·h/kg(扣除给水显热后约 0.62~0.66)。
- **影响**:加湿器电功率高估约 20%。
- **建议**:改为 0.62 kW·h/kg,或由 `h_steam − h_feedwater` 显式计算。

#### EC9. `Q_cooling/Q_heating/m_dehumid` 用 `Math.max(0, …)` 静默截断
- **位置**:`renderer.js:726-728`
- **现状**:`Q_cooling = Math.max(0, massFlow * (h_in - h_out))` 等三处。当用户意图除湿但 `W_out > W_in` 时,`m_dehumid=0` 且无任何提示;当 `tempOut > tempIn` 时 `Q_cooling=0` 隐藏了真实的反向负荷。
- **影响**:工程师在工况方向选错时得不到反馈,误以为计算正常。
- **建议**:内部保留有符号值;UI 显示工况标签(制冷/制热/加湿/除湿)由符号推导;当 `W_out > W_in` 但用户选了冷却模式时弹黄色警告条。

### 1.2 Major — 边界/校验/硬编码

| 编号 | 位置 | 问题 | 建议 |
|------|------|------|------|
| EM1 | `renderer.js:687-708` | RH 未校验;`P_v > P_atm` 未拦截 → `humidityRatio` 分母变负 → 负 W | 加 `rh∈[0,100]` 校验;`P_v >= P_atm*0.98` 时警告"状态超出物理可能" |
| EM2 | `renderer.js:766`、`2923`、`3211` | 冷冻水 ΔT=5℃ 在三处重复硬编码 | 抽 `chwDeltaT` 输入,默认 5K(对应 7/12℃ 供回水) |
| EM3 | `renderer.js:705` | `P_atm` 下限 80 kPa 拒绝拉萨(65)、昆明(81) | 下限改 60 kPa;加可选海拔输入 `P=101.325·(1−2.25577e-5·h)^5.2559` |
| EM4 | `renderer.js:772` | 空气密度用干空气 R,忽略湿度 → 50%RH 下约 1% 误差 | 用虚温 `T_v = T(1+1.6078·W)/(1+W)` |
| EM5 | `extreme.js:81`、`171`、`220` | 极值分析仅取单角点(mf=max,T_in=max,RH_in=max,T_out=min,RH_out=min),非 64 角点包络扫描 | 对每个组件遍历 2⁶ 角点取 max Q,并表格化标注最不利工况 |
| EM6 | `extreme.js:222` | 加湿器安全系数复用 `KHeating=1.15` | 独立 `K_humid` 参数,默认 1.20(GB/T 29736-2013) |
| EM7 | `extreme.js:671` | 水阀选型传 `coil.sel`(原始 Q_max)而非 `sel_safe`(含安全系数)→ 阀门 Kvs 偏小约 9% | 传 `coil.sel_safe` |
| EM8 | `extreme.js:375`、`component_design.js:113` | 水管 DN 估算无流速校核(GB 50736 要求冷冻水 1.0~2.0 m/s) | 显式求 `v = Q/(ρ·A)`,超界警告 |
| EM9 | `extreme.js:332` | `analyzeWaterSystem` 只算 RO 给水,无水泵扬程、无膨胀水箱 | 增加 `analyzePump(coil_dP, valve_dP, pipe_L, fittings)`;膨胀水箱 `V = α·ΔT·V_sys/(1−p1/p2)` |
| EM10 | `extreme.js:349`、`360` | 结构段长 `[0.6,0.5,0.4,0.5,1.0,0.3]` 与高径比 1.5 硬编码,与排数/滤网等级无关 | 段长 = 排数×排距 + 滤网等级深度 + 加热器级数 |
| EM11 | `component_design.js:107,119`、`extreme.js:434-436` | 材质用通用 HVAC 铜管铝翅片+304SS,未考虑测试台进风含油雾/窜气(NOx/SOx) | 按进风洁净度等级(GB/T 23341.1-2018)提供 316L 管/环氧涂层翅片选项 |
| EM12 | `renderer.js:683-831`、`2877-2925`、`3173-3212` | 三处近重复计算块,改一处需改三处 | 抽 `computeState(inputs)` 返回 data 对象 |

### 1.3 Minor — 计算

- **EF1** `calculations.js:43-45` `fmt(v,d)=toFixed(d)`:`0.004 kW` 显示为"0.00 kW"。建议负荷<10 kW 用 3 位小数或有效数字。
- **EF2** `massFlow` 标签未标明干空气/湿空气。湿空气热力学公式要求干空气 kg/s,用户若输入总流量会有约 1% 系统误差。
- **EF3** `extreme.js:97-98` `var rhLevels` 重复声明两次(复制粘贴遗留)。
- **EF4** `component_design.js:274` 引用 GB/T 18300-2025 为"自动控制钠离子交换器",但电极加湿器给水应引用 GB/T 17323(瓶装纯净水)或工艺水标准。
- **EF5** `extreme.js:160` `desc` 声称"×1.10 (GB/T 14294-2026)"但 `sel` 字段不含安全系数(只在 `sel_safe`),描述误导。
- **EF6** `component_design.js:36` `importFromCalc` 的 `Q_reheat` 把再热与预热合并;`extreme.js:analyzeHeater` 分开。统一一种约定。

---

## 第二部分:UI/UX 审查

审查对象:`index.html`、`styles.css`、`renderer.js`(交互层)、`main.js`(窗口/菜单)。

### 2.1 Critical — 阻塞工程师工作流

#### UC1. 无输入校验反馈,`alert()` 打断输入
- **位置**:`renderer.js:693-708`、`index.html:51,59,67,75,83,91`
- **现状**:每个数字输入有 `min/max/step` HTML 属性,但 `onParamChange()` 只触发自动计算,不夹紧、不变红、不显示提示。超范围时弹原生 `alert()`,抢焦点、不可 Enter 关闭(部分 Windows/Electron 构建)。grep `borderColor|invalid|error|aria-` 零匹配。
- **影响**:工程师误输入静默通过或被打断;无 inline 错误标识。
- **建议**:加 `oninput` 校验器,超界时切 `.invalid` 类(红框+inline 文案),禁用 `#calcBtn` 直到全部合法;删除所有 `alert()`。

#### UC2. `switchTab` 靠解析 `onclick` 字符串匹配
- **位置**:`renderer.js:45-50`
  ```js
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].getAttribute("onclick").indexOf(tabName) !== -1) { ... }
  }
  ```
- **现状**:标签名互为子串即坏(如 `design` vs `qa-design-*`);全部 inline `onclick="switchTab('x')"`;无 `role="tab"`/`aria-selected`。
- **影响**:后续重构易引入 bug;无键盘可访问性。
- **建议**:每个按钮加 `data-tab="calc"`,在 `.tab-bar` 上单一事件委托;设 ARIA tab 角色。

#### UC3. 焓湿图是静态 canvas,无交互/无导出
- **位置**:`index.html:115`、`renderer.js:2622-2700`
- **现状**:仅 `ctx.fillRect/lineTo` 绘制,canvas 零 `mousemove`/`click` 监听。SVG/PDF 导出(`renderer.js:4289-4407`)只认 SVG 元素,无法导出此 canvas。
- **影响**:工程师无法读取过程点 T/RH/W,无法放大 ADP 区,无法单独存图。
- **建议**:canvas → SVG;入口/出口/ADP 点内联标注 T/RH/W;加 `mousemove` tooltip;`exportSvgElement()` 接到图区按钮。

#### UC4. 无物理合理性校验
- **位置**:`renderer.js:694-706`(仅校验单字段范围)
- **现状**:出口 RH > 入口 RH(冷却工况)、ADP 低于冷冻水供水温度+1℃ 等组合异常不警告,静默渲染数值。
- **影响**:工程校核工具静默输出误导数据,性质严重。
- **建议**:在结果区上方加黄色 `.calc-tip` 警告条,触发条件包括:`rhOut > rhIn`(冷却模式)、`T_coil < T_chw_supply + 1`、`W_out > W_in && 用户选冷却`。

#### UC5. 8+ 种按钮样式无层级
- **位置**:`styles.css:199`(`#calcBtn`)、`210`(`#resetBtn`)、`1736`(`.toolbar-btn`)、`1474`(`.preset-btn`)、`1098`(`.nav-btn`)、`1169`(`.module-tab`)、`2091`(`.design-tab-btn`)、`2227`(`.extreme-btn`)、`2000-2079`(QA 5 个变体)
- **现状**:`开始计算` 与预设/导出/标签同等显眼;QA 区一行 5 个等权按钮;主蓝 `#2b6cb0` 被 `.extreme-btn`/`.qa-send-btn`/`.design-tab-btn.active` 共用。
- **影响**:主要操作不突出,工程师视线无落点。
- **建议**:每屏仅一个 CTA 用蓝渐变;预设/标签/导出降为 ghost/outline;QA 5 按钮合并为"发送"+ overflow 菜单。

#### UC6. 极值/导出无 loading 反馈
- **位置**:`index.html:106`(导出)、`index.html:282-285`(极值 `#extremeProgress`)
- **现状**:多秒 PDF 导出期间界面冻结,无 spinner/禁用。
- **影响**:工程师以为卡死,重复点击。
- **建议**:导出期间禁用按钮 + 状态栏显示"导出中…"。

### 2.2 Major — 布局/可读性/反馈

| 编号 | 位置 | 问题 | 建议 |
|------|------|------|------|
| UM1 | `index.html:16-22` | 前 4 个 tab 纯中文,后 3 个带 emoji(💬🔧📊) | 统一为纯文字 |
| UM2 | `index.html:46-93` | 输入项扁平排列,无入口/出口/大气分组 | 三组 `<fieldset>`:入口空气状态 / 出口目标状态 / 工况与大气 |
| UM3 | `index.html:127-130` | "详细计算过程"始终展开,右栏成文字墙 | `<details>` 默认折叠 |
| UM4 | `index.html:109-111` | 无"工况判定"横幅(制冷/制热/混合) | 加 `#modeVerdict` 彩色横幅 |
| UM5 | `index.html:183-190`、`styles.css:551-587` | 设备选型 2 列卡片,工程师需对比表 | 改为 spec table(行=方案,列=规格) |
| UM6 | `index.html:234-247` | 零部件设计 tab 复制整套输入框,无 min/max/range-hint | 复用计算 tab 值(只读+override 复选框)或镜像校验 |
| UM7 | 全源 | 数字无 `tabular-nums`,列对不齐 | `font-variant-numeric: tabular-nums` 加到 `.result-value`、`.air-state-table td`、`.brand-table td`、`.extreme-sel-value` |
| UM8 | `index.html:32-34` | 预设一次性覆盖表单,无夏/冬并排对比 | 加冻结对比列 |
| UM9 | `index.html:49,57,65,…` | `.info-icon` 用原生 `title`,多行 GB 标准文本几乎不可读 | CSS/JS popover,即时显示多行 |
| UM10 | `main.js` 全文 | 无原生菜单、无快捷键(Ctrl+1..7、F5、Ctrl+E、Esc) | `Menu.setApplicationMenu`:File/Edit/View/Help |
| UM11 | `renderer.js:166-170` | 输入变化无"参数已修改,请重新计算"提示(autoCalc 关闭时) | 加 stale banner / 结果区变灰 |
| UM12 | `styles.css:2453` | 极值参数网格在 900×600 min 窗口下 2 列布局错乱 | 断点改 1000px |
| UM13 | `styles.css:268` | 结果数字 1.05rem,投影仪看不清 | 主要负荷提到 1.5rem hero 行 |
| UM14 | `styles.css:15,36,519` | 渐变背景/紫蓝 header 像 consumer app | body 纯色 `#f7fafc`,header 纯色 `#1a365d` |
| UM15 | `styles.css:140,1995,2210` | `:focus` 而非 `:focus-visible`,鼠标点击留焦点环 | 换 `:focus-visible` |
| UM16 | `styles.css:210-214` | "恢复默认"与"开始计算"等权,误点丢数据 | 降级为 ghost link + 确认对话框 |

### 2.3 Minor — 视觉打磨

- **UF1** `renderer.js:836-856` 结果标签 emoji 过多(💧🔥❄🌡⚡📋🚰🧪📊🌀📐📏)。颜色语义已足够,删除。
- **UF2** `styles.css:910,1127,1419,2358,2363` 五个 < 900px 断点是死代码(Electron min 窗口 900)。
- **UF3** `index.html:322-324` 状态栏未用于警告。加 `.status-bar.warn`/`.error` 黄/红底色。
- **UF4** `styles.css:636` `brand-table` 无 zebra striping。加 `tbody tr:nth-child(even){background:#f7fafc}`。
- **UF5** `index.html:115`、`styles.css:1767-1774` canvas 600×530 在 HiDPI 屏轻微模糊。应用 `devicePixelRatio` 缩放。
- **UF6** `index.html:98-101` "可复制" textarea 永久占输入面板空间。改"📋 复制参数"按钮。
- **UF7** styles.css 内色彩漂移:header 用 `#667eea→#764ba2`(紫蓝),主按钮用 `#2b6cb0→#2c5282`(蓝)。统一主蓝 `#2b6cb0`。

---

## 第三部分:修复优先级建议

### P0 — 计算失真(必修,否则工具不可信)
EC1(BF 模型)、EC2(露点哨兵)、EC4(盘管面积)、EC5(风机阻力)、EC6(运算符 bug)、EC7(80%RH 硬编码)、EC8(加湿器能耗)、EC9(静默截断)。

### P1 — 计算边界/校验
EC3(冰面 Magnus)、EM1~EM12。

### P2 — UI 阻塞性问题
UC1(校验反馈)、UC3(焓湿图交互)、UC4(物理校验)、UC6(导出 loading)。

### P3 — UI 布局/可读性
UM1~UM16。

### P4 — 视觉打磨
UF1~UF7、UC2(switchTab 重构)、UC5(按钮层级)。

### 建议的架构性重构(若做整体优化)

1. **计算层**:抽 `computeState(inputs)` 统一三处重复块;所有有符号值内部保留,UI 层再决定显示与工况标签。
2. **校验层**:集中式 `validateInput(field) → {ok, msg}`,驱动红框 + 禁用按钮 + 状态栏提示,替换所有 `alert()`。
3. **可视化层**:canvas → SVG 焓湿图,支持 hover tooltip + 点标注 + 导出。这是工程价值最高的一步。
4. **菜单层**:Electron `Menu` + 快捷键,让工具具备原生工程软件手感。
5. **视觉收敛**:统一主蓝 `#2b6cb0`、删渐变/emoji、`tabular-nums`、`<details>` 折叠次要内容。

---

## 附:审查方法说明

- 工程计算部分:对照 GB/T 35226-2017、GB 50736-2012、GB/T 14294-2026 等标准的公式与典型工程取值范围,逐函数审查 `calculations.js` / `renderer.js` 计算路径 / `extreme.js` / `component_design.js`。
- UI 部分:对照 `index.html` 结构、`styles.css` 视觉规则、`renderer.js` 交互逻辑,从信息架构与交互设计两个维度评估。
- 所有 `file:line` 引用基于 2026-06-18 的 working tree;后续 commit 后行号可能漂移,请以函数名/关键字为准。
- 本报告未修改任何源码。
