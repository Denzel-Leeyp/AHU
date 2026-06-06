// ============================================
// renderer.js - 前端交互逻辑
// 涡轮增压器测试台进气空调 (AHU) 计算器 v2.0
// 包含：参数计算、设计流程、设备选型、实时计算、标准引用
// 依赖：calculations.js (热力学函数), tutorial.js (教学系统)
// ============================================

// ==========================================
// 零、导出入口（自动检测环境）
// ==========================================

function handleExport() {
  // 检测是否在Electron环境中
  try {
    require("electron");
    // 在Electron中，使用Node.js直接保存文件
    exportReportElectron();
  } catch (e) {
    // 在浏览器中，使用Blob下载
    exportReport();
  }
}

// ==========================================
// 一、标签页切换
// ==========================================

function switchTab(tabName) {
  // 隐藏所有标签内容
  var contents = document.querySelectorAll(".tab-content");
  for (var i = 0; i < contents.length; i++) {
    contents[i].classList.remove("active");
  }

  // 取消所有标签按钮的高亮
  var btns = document.querySelectorAll(".tab-btn");
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.remove("active");
  }

  // 显示选中的标签
  document.getElementById("tab-" + tabName).classList.add("active");

  // 高亮对应的按钮
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].getAttribute("onclick").indexOf(tabName) !== -1) {
      btns[i].classList.add("active");
      break;
    }
  }

  // 更新状态栏
  var tabNames = {
    calc: "参数计算",
    guide: "设计指南",
    knowledge: "知识库",
    selection: "设备选型建议"
  };
  document.getElementById("statusText").textContent = "当前页面：" + tabNames[tabName];

  // 切换到教学指南时初始化教程
  if (tabName === "guide") {
    if (document.getElementById("tutorialSlide").innerHTML === "") {
      currentModule = "beginner";
      currentStepIndex = 0;
      initTutorial();
    }
  }

  // 切换到知识库时初始化
  if (tabName === "knowledge") {
    initKnowledgeBase();
  }
}

// ==========================================
// 三、工况预设
// ==========================================

/**
 * 设置预设工况
 * @param {string} preset - 'summer' | 'winter' | 'standard'
 */
function setPreset(preset) {
  var presets = {
    summer:  { massFlow: 1.1,  tempIn: 40, rhIn: 95, tempOut: 20, rhOut: 50, atm: 101.325 },
    winter:  { massFlow: 1.1,  tempIn: -5, rhIn: 10, tempOut: 25, rhOut: 50, atm: 101.325 },
    standard:{ massFlow: 0.5,  tempIn: 25, rhIn: 60, tempOut: 20, rhOut: 50, atm: 101.325 }
  };
  var p = presets[preset];
  if (!p) return;

  document.getElementById("massFlow").value = p.massFlow;
  document.getElementById("tempIn").value = p.tempIn;
  document.getElementById("rhIn").value = p.rhIn;
  document.getElementById("tempOut").value = p.tempOut;
  document.getElementById("rhOut").value = p.rhOut;
  document.getElementById("atmPressure").value = p.atm;

  // 高亮被点击的预设按钮
  var btns = document.querySelectorAll(".preset-btn");
  for (var i = 0; i < btns.length; i++) {
    btns[i].style.fontWeight = "normal";
  }
  event.target.style.fontWeight = "bold";

  document.getElementById("statusText").textContent =
    "已切换至" + (preset === "summer" ? "夏季极端" : preset === "winter" ? "冬季极端" : "标准测试") + "工况";

  // 如果开启了实时计算则自动计算
  if (document.getElementById("autoCalc").checked) {
    calculate();
  }
}

// ==========================================
// 四、实时计算
// ==========================================

var autoCalcTimer = null;

/** 切换实时计算开关 */
function toggleAutoCalc() {
  var enabled = document.getElementById("autoCalc").checked;
  document.getElementById("statusText").textContent =
    enabled ? "实时计算已开启 - 参数变化时自动更新" : "实时计算已关闭";
  if (enabled) {
    calculate();
  }
}

/** 参数变化时的回调（防抖300ms） */
function onParamChange() {
  if (!document.getElementById("autoCalc").checked) return;
  if (autoCalcTimer) clearTimeout(autoCalcTimer);
  autoCalcTimer = setTimeout(function() {
    calculate();
  }, 300);
}

// ==========================================
// 五、空气状态参数汇总表
// ==========================================

function buildAirStateSummary(data) {
  return '<table class="air-state-table">' +
    '<caption>进口空气状态</caption>' +
    '<tr><th>参数</th><th>符号</th><th>数值</th><th>单位</th><th>物理含义</th></tr>' +
    '<tr><td class="param-name">干球温度</td><td>T₁</td><td class="highlight">' + fmt(data.tempIn, 1) + '</td><td>℃</td><td>空气实际温度</td></tr>' +
    '<tr><td class="param-name">相对湿度</td><td>RH₁</td><td class="highlight">' + fmt(data.rhIn, 1) + '</td><td>%</td><td>水蒸气饱和程度</td></tr>' +
    '<tr><td class="param-name">饱和水汽压</td><td>P_sat₁</td><td>' + fmt(data.P_sat_in, 4) + '</td><td>kPa</td><td>该温度下最大水蒸气分压力</td></tr>' +
    '<tr><td class="param-name">水蒸气分压力</td><td>P_v₁</td><td>' + fmt(data.P_v_in, 4) + '</td><td>kPa</td><td>实际水蒸气分压力</td></tr>' +
    '<tr><td class="param-name">含湿量</td><td>W₁</td><td class="highlight">' + fmt(data.W_in * 1000, 3) + '</td><td>g/kg</td><td>每kg干空气含水蒸气量</td></tr>' +
    '<tr><td class="param-name">比焓</td><td>h₁</td><td class="highlight">' + fmt(data.h_in, 2) + '</td><td>kJ/kg</td><td>空气总热量(显热+潜热)</td></tr>' +
    '</table>' +
    '<table class="air-state-table">' +
    '<caption>出口空气状态</caption>' +
    '<tr><th>参数</th><th>符号</th><th>数值</th><th>单位</th><th>物理含义</th></tr>' +
    '<tr><td class="param-name">干球温度</td><td>T₂</td><td class="highlight">' + fmt(data.tempOut, 1) + '</td><td>℃</td><td>处理后空气温度</td></tr>' +
    '<tr><td class="param-name">相对湿度</td><td>RH₂</td><td class="highlight">' + fmt(data.rhOut, 1) + '</td><td>%</td><td>处理后空气湿度</td></tr>' +
    '<tr><td class="param-name">饱和水汽压</td><td>P_sat₂</td><td>' + fmt(data.P_sat_out, 4) + '</td><td>kPa</td><td>该温度下最大水蒸气分压力</td></tr>' +
    '<tr><td class="param-name">水蒸气分压力</td><td>P_v₂</td><td>' + fmt(data.P_v_out, 4) + '</td><td>kPa</td><td>实际水蒸气分压力</td></tr>' +
    '<tr><td class="param-name">含湿量</td><td>W₂</td><td class="highlight">' + fmt(data.W_out * 1000, 3) + '</td><td>g/kg</td><td>每kg干空气含水蒸气量</td></tr>' +
    '<tr><td class="param-name">比焓</td><td>h₂</td><td class="highlight">' + fmt(data.h_out, 2) + '</td><td>kJ/kg</td><td>空气总热量(显热+潜热)</td></tr>' +
    '</table>';
}

// ==========================================
// 六-1. 物理意义解释与工程设计经验
// ==========================================

function buildPhysicsExplanation(data) {
  var html = '<div class="physics-section">';
  html += '<h3>📖 核心参数物理意义与工程设计经验</h3>';

  // 1. 干球温度
  html += '<div class="physics-item">';
  html += '<h4>🌡️ 干球温度 (Dry Bulb Temperature)</h4>';
  html += '<div class="physics-def"><strong>物理定义：</strong>用普通温度计在空气中测得的温度，即空气的实际温度。它是湿空气状态最基本的参数之一，直接影响空气的密度、比热容和饱和水汽压。</div>';
  html += '<div class="physics-meaning"><strong>物理意义：</strong>干球温度反映了空气分子的平均动能。温度越高，空气分子运动越剧烈，空气能容纳的水蒸气也越多。在本工况中，入口温度 ' + data.tempIn + '℃ 对应的饱和水汽压为 ' + fmt(data.P_sat_in, 4) + ' kPa，出口温度 ' + data.tempOut + '℃ 对应的饱和水汽压为 ' + fmt(data.P_sat_out, 4) + ' kPa。</div>';
  html += '<div class="engineering-exp"><strong>工程设计经验：</strong><ul>';
  html += '<li>涡轮增压器测试台进气温度通常要求控制在 20℃ ±5℃ 范围内，温度波动应 < ±0.5℃</li>';
  html += '<li>温度每升高 10℃，空气密度约降低 3%，会影响风机风量和换热效率</li>';
  html += '<li>夏季高温工况（如 40℃）制冷负荷显著增加，表冷器选型需按最不利工况计算</li>';
  html += '<li>冬季低温工况（如 -5℃）需考虑防冻保护，加热器启动时应先开风机后开加热</li>';
  html += '<li>温度传感器应安装在空气混合均匀处，距表冷器出口至少 1.5m 以上</li>';
  html += '</ul></div></div>';

  // 2. 相对湿度
  html += '<div class="physics-item">';
  html += '<h4>💧 相对湿度 (Relative Humidity, RH)</h4>';
  html += '<div class="physics-def"><strong>物理定义：</strong>空气中实际水蒸气分压力与同温度下饱和水蒸气分压力之比，以百分比表示。RH = (P_v / P_sat) × 100%。它反映了空气接近饱和的程度。</div>';
  html += '<div class="physics-meaning"><strong>物理意义：</strong>相对湿度表示空气"还能装多少水"。RH = 100% 表示空气已饱和，再多水蒸气就会凝结成水；RH = 0% 表示空气完全干燥（实际不存在）。本工况中，入口 RH = ' + data.rhIn + '%，出口 RH = ' + data.rhOut + '%。</div>';
  html += '<div class="engineering-exp"><strong>工程设计经验：</strong><ul>';
  html += '<li>测试台进气湿度通常要求控制在 50% ±20% RH，波动应 < ±3%</li>';
  html += '<li>RH > 80% 时，管道和设备表面易结露，需加强保温</li>';
  html += '<li>RH < 30% 时，静电风险增加，对精密仪器不利</li>';
  html += '<li>夏季高湿工况（如 95% RH）除湿负荷大，表冷器表面温度必须低于空气露点温度</li>';
  html += '<li>冬季低湿工况（如 10% RH）需加湿，加湿量 = 质量流量 × (出口含湿量 - 入口含湿量)</li>';
  html += '<li>湿度传感器应避开冷热源直射，安装在回风混合均匀处</li>';
  html += '</ul></div></div>';

  // 3. 饱和水蒸气
  html += '<div class="physics-item">';
  html += '<h4>☁️ 饱和水汽压 (Saturated Vapor Pressure)</h4>';
  html += '<div class="physics-def"><strong>物理定义：</strong>在给定温度下，空气中水蒸气达到饱和状态时的分压力。此时空气中的水蒸气含量达到最大值，再多就会凝结。计算公式采用 Magnus 公式：P_sat = 0.61078 × exp(17.27 × T / (T + 237.3)) kPa。</div>';
  html += '<div class="physics-meaning"><strong>物理意义：</strong>饱和水汽压是温度的函数，温度越高，饱和水汽压越大。这意味着高温空气能"装"更多水蒸气。本工况中，入口 ' + data.tempIn + '℃ 时 P_sat = ' + fmt(data.P_sat_in, 4) + ' kPa，出口 ' + data.tempOut + '℃ 时 P_sat = ' + fmt(data.P_sat_out, 4) + ' kPa，两者相差 ' + fmt(Math.abs(data.P_sat_in - data.P_sat_out), 4) + ' kPa。</div>';
  html += '<div class="engineering-exp"><strong>工程设计经验：</strong><ul>';
  html += '<li>饱和水汽压随温度呈指数增长：0℃ 时约 0.61 kPa，20℃ 时约 2.34 kPa，40℃ 时约 7.38 kPa</li>';
  html += '<li>表冷器设计时，其表面温度必须低于空气露点温度（即 P_v 对应的饱和温度），才能有效除湿</li>';
  html += '<li>露点温度计算：已知 P_v，反推 T_dew = 237.3 × ln(P_v/0.61078) / (17.27 - ln(P_v/0.61078))</li>';
  html += '<li>本工况入口露点温度约 ' + fmt(calcDewPoint(data.P_v_in), 1) + '℃，表冷器出水温度应低于此值才能除湿</li>';
  html += '<li>海拔升高时大气压降低，但饱和水汽压只与温度有关，不受海拔影响</li>';
  html += '</ul></div></div>';

  // 4. 水蒸气分压力
  html += '<div class="physics-item">';
  html += '<h4>🔬 水蒸气分压力 (Water Vapor Partial Pressure)</h4>';
  html += '<div class="physics-def"><strong>物理定义：</strong>湿空气中水蒸气组分所产生的分压力。根据道尔顿分压定律，湿空气总压力 = 干空气分压力 + 水蒸气分压力。计算公式：P_v = RH × P_sat。</div>';
  html += '<div class="physics-meaning"><strong>物理意义：</strong>水蒸气分压力直接反映了空气中水蒸气的"绝对含量"。与相对湿度不同，P_v 不受温度影响，是一个绝对量。本工况中，入口 P_v = ' + fmt(data.P_v_in, 4) + ' kPa，出口 P_v = ' + fmt(data.P_v_out, 4) + ' kPa。</div>';
  html += '<div class="engineering-exp"><strong>工程设计经验：</strong><ul>';
  html += '<li>P_v 是计算含湿量的关键参数：W = 0.622 × P_v / (P_atm - P_v)</li>';
  html += '<li>当 P_v = P_sat 时，空气饱和，RH = 100%，此时温度即为露点温度</li>';
  html += '<li>水蒸气分压力差是湿迁移的驱动力，可用于分析墙体结露风险</li>';
  html += '<li>本工况入口 P_v = ' + fmt(data.P_v_in, 4) + ' kPa，对应含湿量 ' + fmt(data.W_in * 1000, 2) + ' g/kg；出口 P_v = ' + fmt(data.P_v_out, 4) + ' kPa，对应含湿量 ' + fmt(data.W_out * 1000, 2) + ' g/kg</li>';
  html += '<li>除湿过程中，P_v 从 ' + fmt(data.P_v_in, 4) + ' kPa 降至 ' + fmt(data.P_v_out, 4) + ' kPa，含湿量减少 ' + fmt((data.W_in - data.W_out) * 1000, 2) + ' g/kg</li>';
  html += '</ul></div></div>';

  // 5. 比焓
  html += '<div class="physics-item">';
  html += '<h4>⚡ 比焓 (Specific Enthalpy)</h4>';
  html += '<div class="physics-def"><strong>物理定义：</strong>单位质量干空气及其所含水蒸气的总热量。计算公式：h = 1.006 × T + W × (2501 + 1.86 × T) kJ/kg。其中 1.006 × T 为干空气显热，W × 2501 为水蒸气潜热，W × 1.86 × T 为水蒸气显热。</div>';
  html += '<div class="physics-meaning"><strong>物理意义：</strong>比焓是空调负荷计算的核心参数。它包含了温度变化带来的"显热"和水蒸气变化带来的"潜热"两部分。1kg 干空气从状态1变化到状态2，需要吸收或释放的热量 = h₂ - h₁。本工况中，入口 h₁ = ' + fmt(data.h_in, 2) + ' kJ/kg，出口 h₂ = ' + fmt(data.h_out, 2) + ' kJ/kg，焓差 Δh = ' + fmt(data.h_in - data.h_out, 2) + ' kJ/kg。</div>';
  html += '<div class="engineering-exp"><strong>工程设计经验：</strong><ul>';
  html += '<li>空调冷负荷计算必须用焓差法（Q = ṁ × Δh），不能用温差法，因为温差法忽略了除湿的潜热负荷</li>';
  html += '<li>在高湿工况下，潜热负荷可占总负荷的 40%~60%，忽略潜热会严重低估制冷需求</li>';
  html += '<li>本工况制冷量 Q_c = ' + fmt(data.Q_cooling, 2) + ' kW，其中显热占比约 ' + fmt(calcSensibleRatio(data), 0) + '%，潜热占比约 ' + fmt(100 - calcSensibleRatio(data), 0) + '%</li>';
  html += '<li>焓湿图（h-d 图）是空调设计的核心工具，可在图上直观看出空气处理过程</li>';
  html += '<li>2501 kJ/kg 是 0℃ 时水的汽化潜热，意味着蒸发 1kg 水需要吸收 2501 kJ 热量</li>';
  html += '<li>再热过程（先冷却除湿，再加热到目标温度）看似浪费能量，但这是精确控制温湿度的必要手段</li>';
  html += '</ul></div></div>';

  html += '</div>';
  return html;
}

/** 计算露点温度 (Magnus公式反推，P_v单位为kPa，需转换为hPa) */
function calcDewPoint(P_v_kPa) {
  var P_v_hPa = P_v_kPa * 10; // kPa → hPa
  if (P_v_hPa <= 0.61078) return -100;
  return 237.3 * Math.log(P_v_hPa / 0.61078) / (17.27 - Math.log(P_v_hPa / 0.61078));
}

/** 计算显热占比 */
function calcSensibleRatio(data) {
  var sensibleHeat = data.massFlow * 1.006 * Math.abs(data.tempIn - data.tempOut);
  var totalHeat = Math.max(data.Q_cooling, 0.001);
  return Math.min(100, (sensibleHeat / totalHeat) * 100);
}

// ==========================================
// 六、生成详细计算过程（含物理意义）
// ==========================================

function buildProcessSteps(data) {
  var steps = [];

  // 步骤1: 入口空气参数
  steps.push(
    '<div class="step-item">' +
    '<div class="step-title">步骤 1：计算入口空气参数</div>' +
    '<div class="step-formula">已知：T₁ = ' + data.tempIn + ' ℃, RH₁ = ' + data.rhIn + '%, P_atm = ' + fmt(data.P_atm, 3) + ' kPa</div>' +
    '<div class="step-formula">饱和水汽压 P_sat₁ = 0.61078 × exp(17.27 × ' + data.tempIn + ' / (' + data.tempIn + ' + 237.3))</div>' +
    '<div class="step-result">P_sat₁ = ' + fmt(data.P_sat_in, 4) + ' kPa</div>' +
    '<div class="physical-meaning">含义：在 ' + data.tempIn + '℃ 时，空气中最多能容纳 ' + fmt(data.P_sat_in, 4) + ' kPa 的水蒸气分压力</div>' +
    '<div class="step-formula">水蒸气分压力 P_v₁ = ' + data.rhIn + '% × ' + fmt(data.P_sat_in, 4) + ' = ' + fmt(data.P_v_in, 4) + ' kPa</div>' +
    '<div class="step-formula">含湿量 W₁ = 0.622 × ' + fmt(data.P_v_in, 4) + ' / (' + fmt(data.P_atm, 3) + ' - ' + fmt(data.P_v_in, 4) + ')</div>' +
    '<div class="step-result">W₁ = ' + fmt(data.W_in, 6) + ' kg/kg = ' + fmt(data.W_in * 1000, 3) + ' g/kg</div>' +
    '<div class="physical-meaning">含义：每千克干空气中含有 ' + fmt(data.W_in * 1000, 2) + ' 克水蒸气</div>' +
    '<div class="step-formula">比焓 h₁ = 1.006 × ' + data.tempIn + ' + ' + fmt(data.W_in, 6) + ' × (2501 + 1.86 × ' + data.tempIn + ')</div>' +
    '<div class="step-result">h₁ = ' + fmt(data.h_in, 4) + ' kJ/kg</div>' +
    '<div class="physical-meaning">含义：每千克干空气含有的总热量（显热+潜热）为 ' + fmt(data.h_in, 2) + ' kJ</div>' +
    '</div>'
  );

  // 步骤2: 出口空气参数
  steps.push(
    '<div class="step-item">' +
    '<div class="step-title">步骤 2：计算出口空气参数</div>' +
    '<div class="step-formula">已知：T₂ = ' + data.tempOut + ' ℃, RH₂ = ' + data.rhOut + '%, P_atm = ' + fmt(data.P_atm, 3) + ' kPa</div>' +
    '<div class="step-formula">饱和水汽压 P_sat₂ = 0.61078 × exp(17.27 × ' + data.tempOut + ' / (' + data.tempOut + ' + 237.3))</div>' +
    '<div class="step-result">P_sat₂ = ' + fmt(data.P_sat_out, 4) + ' kPa</div>' +
    '<div class="step-formula">水蒸气分压力 P_v₂ = ' + data.rhOut + '% × ' + fmt(data.P_sat_out, 4) + ' = ' + fmt(data.P_v_out, 4) + ' kPa</div>' +
    '<div class="step-formula">含湿量 W₂ = 0.622 × ' + fmt(data.P_v_out, 4) + ' / (' + fmt(data.P_atm, 3) + ' - ' + fmt(data.P_v_out, 4) + ')</div>' +
    '<div class="step-result">W₂ = ' + fmt(data.W_out, 6) + ' kg/kg = ' + fmt(data.W_out * 1000, 3) + ' g/kg</div>' +
    '<div class="step-formula">比焓 h₂ = 1.006 × ' + data.tempOut + ' + ' + fmt(data.W_out, 6) + ' × (2501 + 1.86 × ' + data.tempOut + ')</div>' +
    '<div class="step-result">h₂ = ' + fmt(data.h_out, 4) + ' kJ/kg</div>' +
    '</div>'
  );

  // 步骤3: 除湿量
  var deltaW = data.W_in - data.W_out;
  var dehumidNote = deltaW > 0 ? "需要除湿：入口含湿量 > 出口含湿量" : "无需除湿（或需要加湿）";
  steps.push(
    '<div class="step-item">' +
    '<div class="step-title">步骤 3：除湿量计算</div>' +
    '<div class="step-formula">含湿量差 ΔW = W₁ - W₂ = ' + fmt(data.W_in * 1000, 3) + ' - ' + fmt(data.W_out * 1000, 3) + ' = ' + fmt(deltaW * 1000, 3) + ' g/kg</div>' +
    '<div class="step-result">' + dehumidNote + '</div>' +
    '<div class="step-formula">除湿量 ṁ_deh = ṁ × ΔW × 1000 = ' + data.massFlow + ' × ' + fmt(Math.max(0, deltaW), 6) + ' × 1000</div>' +
    '<div class="step-result">除湿量 = ' + fmt(data.m_dehumid, 4) + ' g/s</div>' +
    '<div class="physical-meaning">含义：每秒需要从空气中凝结分离出 ' + fmt(data.m_dehumid, 2) + ' 克水，一小时约 ' + fmt(data.m_dehumid * 3.6, 1) + ' 升冷凝水</div>' +
    '</div>'
  );

  // 步骤4: 制冷量
  var deltaH = data.h_in - data.h_out;
  var coolNote = deltaH > 0 ? "需要制冷：入口焓值 > 出口焓值" : "无需制冷（或需要加热）";
  steps.push(
    '<div class="step-item">' +
    '<div class="step-title">步骤 4：制冷量计算（焓差法）</div>' +
    '<div class="step-formula">焓差 Δh = h₁ - h₂ = ' + fmt(data.h_in, 4) + ' - ' + fmt(data.h_out, 4) + ' = ' + fmt(deltaH, 4) + ' kJ/kg</div>' +
    '<div class="step-result">' + coolNote + '</div>' +
    '<div class="step-formula">制冷量 Q_c = ṁ × Δh = ' + data.massFlow + ' × ' + fmt(Math.max(0, deltaH), 4) + '</div>' +
    '<div class="step-result">制冷量 Q_c = ' + fmt(data.Q_cooling, 4) + ' kW</div>' +
    '<div class="physical-meaning">含义：表冷器需要从空气中移除 ' + fmt(data.Q_cooling, 2) + ' kW 的热量（含显热+潜热）。注：不能用温差法，因为忽略了除湿的潜热负荷</div>' +
    '</div>'
  );

  // 步骤5: 加热量
  var deltaT = data.tempOut - data.tempIn;
  var heatNote = deltaT > 0 ? "需要加热：出口温度 > 入口温度" : "无需加热（出口温度 ≤ 入口温度）";
  steps.push(
    '<div class="step-item">' +
    '<div class="step-title">步骤 5：加热量计算（显热法）</div>' +
    '<div class="step-formula">温差 ΔT = T₂ - T₁ = ' + data.tempOut + ' - ' + data.tempIn + ' = ' + fmt(deltaT, 2) + ' ℃</div>' +
    '<div class="step-result">' + heatNote + '</div>' +
    '<div class="step-formula">加热量 Q_h = ṁ × c_p × ΔT = ' + data.massFlow + ' × 1.006 × ' + fmt(Math.max(0, deltaT), 2) + '</div>' +
    '<div class="step-result">加热量 Q_h = ' + fmt(data.Q_heating, 4) + ' kW</div>' +
    '<div class="physical-meaning">含义：加热器需要向空气提供 ' + fmt(data.Q_heating, 2) + ' kW 的热量。c_p = 1.006 kJ/(kg·K) 为空气定压比热</div>' +
    '</div>'
  );

  // 步骤6: 冷冻水流量与电加热功率
  var V_c = data.m_chilled / 1000 * 3600;
  steps.push(
    '<div class="step-item">' +
    '<div class="step-title">步骤 6：冷冻水流量与电加热功率计算</div>' +
    '<div class="step-formula">冷冻水（供回水温差 ΔT=5℃）：ṁ_ch = Q_c / (c_pw × ΔT_ch) = ' + fmt(data.Q_cooling, 4) + ' / (4.187 × 5)</div>' +
    '<div class="step-result">冷冻水流量 = ' + fmt(data.m_chilled, 4) + ' kg/s ≈ ' + fmt(V_c, 2) + ' m³/h</div>' +
    '<div class="physical-meaning">含义：冷冻水以 5℃ 温差带走 ' + fmt(data.Q_cooling, 2) + ' kW 热量，需要流量 ' + fmt(V_c, 2) + ' m³/h</div>' +
    '<div class="step-formula">电加热功率（效率 η=0.98）：P_elec = Q_h / η = ' + fmt(data.Q_heating, 4) + ' / 0.98</div>' +
    '<div class="step-result">电加热功率 = ' + fmt(data.Q_heating / 0.98, 4) + ' kW</div>' +
    '<div class="physical-meaning">含义：电加热器需要消耗 ' + fmt(data.Q_heating / 0.98, 2) + ' kW 电能，提供 ' + fmt(data.Q_heating, 2) + ' kW 热量（电热转换效率 98%）</div>' +
    '</div>'
  );

  // 标准引用
  steps.push(
    '<div class="standards-ref">' +
    '<strong>📋 引用标准：</strong>' +
    '<ul>' +
    '<li>GB/T 35226-2017《湿空气性质计算公式》（Magnus 饱和水汽压公式）</li>' +
    '<li>GB 50736-2012《民用建筑供暖通风与空气调节设计规范》（焓差法负荷计算）</li>' +
    '<li>GB/T 14294-2008《组合式空调机组》（设备选型参考）</li>' +
    '</ul>' +
    '</div>'
  );

  return steps.join("");
}

// ==========================================
// 七、主计算函数
// ==========================================

function calculate() {
  // ---- 1. 读取输入 ----
  var massFlow = parseFloat(document.getElementById("massFlow").value);
  var tempIn = parseFloat(document.getElementById("tempIn").value);
  var rhIn = parseFloat(document.getElementById("rhIn").value);
  var tempOut = parseFloat(document.getElementById("tempOut").value);
  var rhOut = parseFloat(document.getElementById("rhOut").value);
  var P_atm = parseFloat(document.getElementById("atmPressure").value);

  // ---- 2. 输入验证 ----
  if (isNaN(massFlow) || massFlow < 0.1 || massFlow > 1.1) {
    alert("质量流量超出范围！请设置在 0.1 ~ 1.1 kg/s 之间。");
    return;
  }
  if (isNaN(tempIn) || tempIn < -5 || tempIn > 40) {
    alert("入口温度超出范围！请设置在 -5 ~ 40 ℃ 之间。");
    return;
  }
  if (isNaN(tempOut) || tempOut < 15 || tempOut > 25) {
    alert("出口温度超出范围！请设置在 15 ~ 25 ℃ 之间。");
    return;
  }
  if (isNaN(P_atm) || P_atm < 80 || P_atm > 110) {
    alert("大气压力超出范围！请设置在 80 ~ 110 kPa 之间。");
    return;
  }

  // ---- 3. 物理常数 ----
  var Cp_water = 4.187;  // kJ/(kg·K) 水的定压比热

  // ---- 4. 入口参数 ----
  var P_sat_in = satPressure(tempIn);
  var P_v_in = (rhIn / 100) * P_sat_in;
  var W_in = humidityRatio(P_sat_in, rhIn, P_atm);
  var h_in = enthalpy(tempIn, W_in);

  // ---- 5. 出口参数 ----
  var P_sat_out = satPressure(tempOut);
  var P_v_out = (rhOut / 100) * P_sat_out;
  var W_out = humidityRatio(P_sat_out, rhOut, P_atm);
  var h_out = enthalpy(tempOut, W_out);

  // ---- 6. 负荷计算 ----
  var Q_cooling = Math.max(0, massFlow * (h_in - h_out));
  var Q_heating = Math.max(0, massFlow * 1.006 * (tempOut - tempIn));
  var m_dehumid = Math.max(0, massFlow * (W_in - W_out) * 1000);

  // ---- 7. 冷冻水流量与电加热功率 ----
  var m_chilled = Q_cooling > 0 ? Q_cooling / (Cp_water * 5) : 0;
  var elec_power = Q_heating > 0 ? Q_heating / 0.98 : 0;

  // ---- 8. 收集数据 ----
  var data = {
    massFlow: massFlow,
    tempIn: tempIn, rhIn: rhIn,
    tempOut: tempOut, rhOut: rhOut,
    P_atm: P_atm,
    P_sat_in: P_sat_in, P_v_in: P_v_in, W_in: W_in, h_in: h_in,
    P_sat_out: P_sat_out, P_v_out: P_v_out, W_out: W_out, h_out: h_out,
    Q_cooling: Q_cooling, Q_heating: Q_heating, m_dehumid: m_dehumid,
    m_chilled: m_chilled, elec_power: elec_power
  };

  // ---- 9. 显示结果摘要 ----
  var V_c = m_chilled / 1000 * 3600;
  document.getElementById("results").innerHTML =
    '<div class="result-item"><span class="result-label">❄ 制冷量</span><span class="result-value cooling">' + fmt(Q_cooling, 2) + ' kW</span></div>' +
    '<div class="result-item"><span class="result-label">🔥 加热量</span><span class="result-value heating">' + fmt(Q_heating, 2) + ' kW</span></div>' +
    '<div class="result-item"><span class="result-label">💧 除湿量</span><span class="result-value dehumidify">' + fmt(m_dehumid, 2) + ' g/s</span></div>' +
    '<div class="result-item"><span class="result-label">🌡 冷冻水流量</span><span class="result-value">' + fmt(m_chilled, 3) + ' kg/s (' + fmt(V_c, 1) + ' m³/h)</span></div>' +
    '<div class="result-item"><span class="result-label">🔥 电加热功率</span><span class="result-value">' + fmt(Q_heating / 0.98, 2) + ' kW</span></div>';

  // ---- 10. 空气状态参数汇总表 ----
  var summaryDiv = document.getElementById("airStateSummary");
  document.getElementById("airStateContent").innerHTML = buildAirStateSummary(data);
  summaryDiv.style.display = "block";

  // ---- 10.5. 物理意义解释与工程设计经验 ----
  var physicsDiv = document.getElementById("physicsExplanation");
  if (!physicsDiv) {
    physicsDiv = document.createElement("div");
    physicsDiv.id = "physicsExplanation";
    physicsDiv.className = "physics-explanation";
    summaryDiv.parentNode.insertBefore(physicsDiv, summaryDiv.nextSibling);
  }
  physicsDiv.innerHTML = buildPhysicsExplanation(data);
  physicsDiv.style.display = "block";

  // ---- 11. 显示计算过程 ----
  var processDiv = document.getElementById("calcProcess");
  var stepsDiv = document.getElementById("processSteps");
  stepsDiv.innerHTML = buildProcessSteps(data);
  processDiv.style.display = "block";

  // ---- 12. 显示输出工具栏 ----
  document.getElementById("outputToolbar").style.display = "flex";

  // ---- 13. 绘制焓湿图 ----
  drawPsychroChart(data);

  // ---- 14. 生成设备选型建议 ----
  generateSelection(data);

  // ---- 13. 更新状态 ----
  document.getElementById("statusText").textContent =
    "计算完成 ✓  工况: " + tempIn + "℃/" + rhIn + "% → " + tempOut + "℃/" + rhOut + "%  流量: " + massFlow + "kg/s";
}

/**
 * 恢复默认参数
 */
function resetDefaults() {
  document.getElementById("massFlow").value = "0.5";
  document.getElementById("tempIn").value = "35";
  document.getElementById("rhIn").value = "80";
  document.getElementById("tempOut").value = "20";
  document.getElementById("rhOut").value = "50";
  document.getElementById("atmPressure").value = "101.325";
  document.getElementById("results").innerHTML = '<p class="placeholder">请输入参数并点击"开始计算"</p>';
  document.getElementById("airStateSummary").style.display = "none";
  var physicsDiv = document.getElementById("physicsExplanation");
  if (physicsDiv) physicsDiv.style.display = "none";
  document.getElementById("calcProcess").style.display = "none";
  document.getElementById("outputToolbar").style.display = "none";
  document.getElementById("psychroChartContainer").style.display = "none";
  document.getElementById("selectionResults").innerHTML = '<p class="placeholder">请先在"参数计算"页面进行计算</p>';
  document.getElementById("statusText").textContent = "已恢复夏季典型工况 (35℃/80% → 20℃/50% @ 101.325kPa)";
}

// ==========================================
// 八、设备选型建议生成
// ==========================================

function generateSelection(data) {
  // 安全系数（参考 GB/T 14294-2008）
  var K_cooling = 1.10;
  var K_heating = 1.15;
  var K_flow = 1.10;

  var sel_cooling = data.Q_cooling * K_cooling;
  var sel_elec_power = data.elec_power * K_heating;
  var air_flow_m3s = data.massFlow / 1.2;
  var air_flow_m3h = air_flow_m3s * 3600;

  var face_area = air_flow_m3s / 2.5;
  var face_width = Math.ceil(Math.sqrt(face_area * 1.5) * 100) / 100;
  var face_height = face_area / face_width;

  var V_ch = data.m_chilled / 1000 * 3600;

  // 风机选型参数
  var fan_flow = air_flow_m3h * K_flow;
  var fan_pressure = 1000; // Pa 估算

  // 根据风量估算风机功率
  var fan_power_kw = (fan_flow / 3600 * fan_pressure) / (1000 * 0.7 * 0.85);

  // 根据制冷量估算表冷器排数
  var coil_rows = sel_cooling > 50 ? 8 : sel_cooling > 20 ? 6 : 4;

  // 电加热功率（效率 98%）
  var elec_power = data.Q_heating / 0.98;
  var sel_elec_power = elec_power * K_heating;

  var html =
    '<div class="selection-grid">' +
    '<div class="selection-card">' +
    '<h4>❄ 表冷器（降温除湿段）</h4>' +
    '<p><strong>选型制冷量：</strong><span class="spec-value">' + fmt(sel_cooling, 1) + ' kW</span></p>' +
    '<p><strong>处理风量：</strong><span class="spec-value">' + fmt(air_flow_m3h, 0) + ' m³/h</span></p>' +
    '<p><strong>建议排数：</strong>' + coil_rows + ' ~ ' + (coil_rows + 2) + ' 排</p>' +
    '<p><strong>迎面尺寸：</strong>约 ' + fmt(face_width, 2) + 'm × ' + fmt(face_height, 2) + 'm</p>' +
    '<p><strong>冷冻水流量：</strong><span class="spec-value">' + fmt(V_ch, 2) + ' m³/h</span></p>' +
    '<p><strong>供回水温差：</strong>5℃（标准工况）</p>' +
    '<p><strong>翅片间距：</strong>2.0~2.5mm（除湿工况取小值）</p>' +
    '<p><strong>管材规格：</strong>φ16×0.5mm 紫铜管 + 铝翅片</p>' +
    '<p style="color:#718096;font-size:0.8rem;">应配置不锈钢接水盘和排水口</p>' +
    '</div>' +
    '<div class="selection-card">' +
    '<h4>🔥 电加热器（升温调温段）</h4>' +
    '<p><strong>选型功率：</strong><span class="spec-value">' + fmt(sel_elec_power, 1) + ' kW</span></p>' +
    '<p><strong>加热量：</strong><span class="spec-value">' + fmt(data.Q_heating, 2) + ' kW</span></p>' +
    '<p><strong>电热效率：</strong>98%</p>' +
    '<p><strong>控制方式：</strong>PID 可控硅调功（SSR）</p>' +
    '<p><strong>建议分级：</strong>多级或无级调节</p>' +
    '<p><strong>表面负荷：</strong>≤ 3 W/cm²（安全值）</p>' +
    '<p style="color:#718096;font-size:0.8rem;">建议配置超温保护装置</p>' +
    '</div>' +
    '<div class="selection-card">' +
    '<h4>💨 送风机</h4>' +
    '<p><strong>设计风量：</strong><span class="spec-value">' + fmt(fan_flow, 0) + ' m³/h</span></p>' +
    '<p><strong>建议形式：</strong>离心风机（前向/后向多翼）</p>' +
    '<p><strong>驱动方式：</strong>变频调速电机</p>' +
    '<p><strong>全压估算：</strong>800~1200 Pa</p>' +
    '<p><strong>电机功率：</strong>约 ' + fmt(fan_power_kw, 1) + ' kW</p>' +
    '<p style="color:#718096;font-size:0.8rem;">变频器：ABB / Siemens / Schneider</p>' +
    '</div>' +
    '<div class="selection-card">' +
    '<h4>🧹 其他配套设备</h4>' +
    '<p><strong>过滤器：</strong>初效 G4 过滤袋</p>' +
    '<p><strong>加湿器：</strong>电极加湿 / 湿膜加湿</p>' +
    '<p><strong>箱体材质：</strong>304 不锈钢</p>' +
    '<p><strong>保温层：</strong>50mm 聚氨酯发泡</p>' +
    '<p><strong>控制系统：</strong>PLC + 触摸屏</p>' +
    '<p><strong>控制精度：</strong>温度 ±0.5℃，湿度 ±3%</p>' +
    '<p><strong>传感器：</strong>温湿度传感器（进/出口）</p>' +
    '</div>' +
    '</div>' +

    // ===== 品牌推荐与型号样本 =====
    '<div class="brand-selection-section">' +
    '<h3>🏭 主要元器件品牌推荐与型号样本</h3>' +

    // 1. 表冷器
    '<div class="brand-item">' +
    '<h4>❄ 表冷器品牌推荐</h4>' +
    '<table class="brand-table">' +
    '<thead><tr><th>品牌</th><th>推荐系列</th><th>型号示例</th><th>特点</th><th>适用场景</th></tr></thead>' +
    '<tbody>' +
    '<tr><td><strong>开利 Carrier</strong></td><td>39MN 系列</td><td>39MN-06-6R</td><td>6排管，铜管铝翅片，换热效率高</td><td>中大型 AHU（制冷量 30~200 kW）</td></tr>' +
    '<tr><td><strong>特灵 Trane</strong></td><td>Climate Changer</td><td>CC-08-8R-HE</td><td>8排管高效型，亲水铝箔翅片</td><td>高湿工况除湿</td></tr>' +
    '<tr><td><strong>约克 York</strong></td><td>YMAU 系列</td><td>YMAU-05-6R</td><td>6排管标准型，模块化设计</td><td>中小型 AHU（制冷量 10~80 kW）</td></tr>' +
    '<tr><td><strong>麦克维尔 McQuay</strong></td><td>MAC 系列</td><td>MAC-04-4R</td><td>4排管经济型，性价比高</td><td>标准工况，预算有限</td></tr>' +
    '<tr><td><strong>国产品牌（盾安/同飞）</strong></td><td>定制型</td><td>DA-6R-定制</td><td>按工况定制，价格优势明显</td><td>各类工况，性价比高</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<div class="selection-tip"><strong>💡 选型技巧：</strong>' +
    '<ul>' +
    '<li>除湿工况优先选 6~8 排管，翅片间距 ≤ 2.0mm，确保表冷器表面温度低于露点</li>' +
    '<li>铜管壁厚 ≥ 0.5mm，工作压力 ≥ 1.6 MPa，水压试验 ≥ 2.4 MPa</li>' +
    '<li>翅片表面应做亲水处理，增强冷凝水排出效果</li>' +
    '<li>迎面风速建议 2.0~2.5 m/s，过高则阻力大，过低则换热效率低</li>' +
    '<li>订货时需提供：制冷量、风量、进出风参数、进出水温度、工作压力</li>' +
    '</ul></div>' +
    '</div>' +

    // 2. 加热器
    '<div class="brand-item">' +
    '<h4>🔥 加热器品牌推荐</h4>' +
    '<table class="brand-table">' +
    '<thead><tr><th>品牌</th><th>推荐系列</th><th>型号示例</th><th>特点</th><th>适用场景</th></tr></thead>' +
    '<tbody>' +
    '<tr><td><strong>瓦特 Watt</strong></td><td>WHS 电加热系列</td><td>WHS-15KW-PID</td><td>15kW，PID 可控硅调功，精度 ±0.5℃</td><td>精确温控场合</td></tr>' +
    '<tr><td><strong>安邦特 Anbond</strong></td><td>ABH 系列</td><td>ABH-10KW-3P</td><td>10kW，三级调节，不锈钢发热管</td><td>常规加热段</td></tr>' +
    '<tr><td><strong>瓦特 Watt</strong></td><td>WHD 大功率系列</td><td>WHD-30KW-SSR</td><td>30kW，SSR 无级调节，精度 ±0.3℃</td><td>大功率加热工况</td></tr>' +
    '<tr><td><strong>国产（艾默生/美的）</strong></td><td>定制型</td><td>EH-定制</td><td>按功率定制，价格优势</td><td>各类加热需求</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<div class="selection-tip"><strong>💡 选型技巧：</strong>' +
    '<ul>' +
    '<li>电加热器表面负荷 ≤ 3 W/cm²，确保发热管寿命</li>' +
    '<li>必须配置超温保护（通常设定 80℃），防止干烧</li>' +
    '<li>PID 可控硅调功优于分级调节，控温精度可达 ±0.3℃</li>' +
    '<li>电热转换效率约 98%，选型功率 = 加热量 / 0.98 × 安全系数 1.15</li>' +
    '<li>加热段前后应设均流板，确保温度均匀</li>' +
    '<li>电加热器需独立供电回路，注意电缆截面积和断路器选型</li>' +
    '</ul></div>' +
    '</div>' +

    // 3. 风机
    '<div class="brand-item">' +
    '<h4>💨 风机品牌推荐</h4>' +
    '<table class="brand-table">' +
    '<thead><tr><th>品牌</th><th>推荐系列</th><th>型号示例</th><th>特点</th><th>适用场景</th></tr></thead>' +
    '<tbody>' +
    '<tr><td><strong>EBM-Papst</strong></td><td>RadiCal 系列</td><td>R3G250-AR07-01</td><td>后向离心，高效节能，噪音低</td><td>高端 AHU，风量 500~3000 m³/h</td></tr>' +
    '<tr><td><strong>施乐百 Ziehl-Abegg</strong></td><td>RETR 系列</td><td>RETR-315-4D</td><td>前向多翼离心，风压高</td><td>中大型 AHU，风量 2000~10000 m³/h</td></tr>' +
    '<tr><td><strong>亿利达 Yilida</strong></td><td>4-72 系列</td><td>4-72-4A-2.2KW</td><td>国产经典系列，性价比高</td><td>中小型 AHU，风量 1000~5000 m³/h</td></tr>' +
    '<tr><td><strong>上风高科</strong></td><td>SWF 系列</td><td>SWF-5-1.5KW</td><td>混流风机，结构紧凑</td><td>空间受限场合</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<div class="selection-tip"><strong>💡 选型技巧：</strong>' +
    '<ul>' +
    '<li>风机风量 = 设计风量 × 1.1（安全系数），全压 = 系统阻力 × 1.15</li>' +
    '<li>优先选后向离心风机，效率可达 75%~85%，前向风机效率约 60%~70%</li>' +
    '<li>变频调速是标配，可实现 20%~100% 无级调节，节能效果显著</li>' +
    '<li>电机功率应留 10%~15% 余量，避免过载</li>' +
    '<li>风机安装应配减震器（弹簧或橡胶），降低振动传递</li>' +
    '<li>噪音要求严格时，选低噪音风机或加消音段</li>' +
    '</ul></div>' +
    '</div>' +

    // 4. 变频器
    '<div class="brand-item">' +
    '<h4>⚡ 变频器品牌推荐</h4>' +
    '<table class="brand-table">' +
    '<thead><tr><th>品牌</th><th>推荐系列</th><th>型号示例</th><th>特点</th><th>适用场景</th></tr></thead>' +
    '<tbody>' +
    '<tr><td><strong>ABB</strong></td><td>ACS580 系列</td><td>ACS580-01-04A-4</td><td>4kW，内置 EMC 滤波器，IP21</td><td>通用 HVAC 场合</td></tr>' +
    '<tr><td><strong>西门子 Siemens</strong></td><td>SINAMICS G120C</td><td>6SL3210-5BE22-2UV0</td><td>2.2kW，PROFINET 通讯，集成安全功能</td><td>需 PLC 通讯集成</td></tr>' +
    '<tr><td><strong>施耐德 Schneider</strong></td><td>Altivar ATV320</td><td>ATV320U22N4</td><td>2.2kW，内置 Modbus，紧凑设计</td><td>中小型 AHU</td></tr>' +
    '<tr><td><strong>丹佛斯 Danfoss</strong></td><td>VLT HVAC Drive</td><td>FC-102P4K0T4</td><td>4kW，专为 HVAC 设计，内置 PID</td><td>HVAC 专用场合</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<div class="selection-tip"><strong>💡 选型技巧：</strong>' +
    '<ul>' +
    '<li>变频器功率 ≥ 电机功率，建议大一档</li>' +
    '<li>HVAC 专用变频器（如 Danfoss FC-102）内置 PID 和节能模式，优先选用</li>' +
    '<li>需与 PLC 通讯时，选支持 Modbus RTU/TCP 或 PROFINET 的型号</li>' +
    '<li>安装环境注意散热，变频器柜内需配散热风扇</li>' +
    '</ul></div>' +
    '</div>' +

    // 5. 温湿度传感器
    '<div class="brand-item">' +
    '<h4>🌡 温湿度传感器品牌推荐</h4>' +
    '<table class="brand-table">' +
    '<thead><tr><th>品牌</th><th>推荐系列</th><th>型号示例</th><th>特点</th><th>适用场景</th></tr></thead>' +
    '<tbody>' +
    '<tr><td><strong>维萨拉 Vaisala</strong></td><td>HMD60 系列</td><td>HMD60Y</td><td>精度 ±0.1℃ / ±1%RH，长期稳定性好</td><td>高精度测试台</td></tr>' +
    '<tr><td><strong>西门子 Siemens</strong></td><td>QFM3160</td><td>QFM3160</td><td>精度 ±0.4℃ / ±2%RH，0~10V 输出</td><td>常规 HVAC 控制</td></tr>' +
    '<tr><td><strong>江森 Johnson</strong></td><td>TE-6300 系列</td><td>TE-6310-1002</td><td>精度 ±0.3℃ / ±2%RH，管道式安装</td><td>管道温湿度测量</td></tr>' +
    '<tr><td><strong>森萨塔 Sensirion</strong></td><td>STS 系列</td><td>STS40</td><td>数字输出，I²C 接口，体积小</td><td>嵌入式/集成式方案</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<div class="selection-tip"><strong>💡 选型技巧：</strong>' +
    '<ul>' +
    '<li>测试台进气控制精度要求 ±0.5℃ / ±3%RH，传感器精度至少 ±0.2℃ / ±1.5%RH</li>' +
    '<li>传感器应安装在空气混合均匀处，距表冷器/加热器出口 ≥ 1.5m</li>' +
    '<li>管道式传感器探头长度应覆盖管道直径的 2/3 以上</li>' +
    '<li>定期校准（建议每年一次），确保测量精度</li>' +
    '<li>高湿工况选带加热探头的型号，防止冷凝影响测量</li>' +
    '</ul></div>' +
    '</div>' +

    // 6. PLC 控制系统
    '<div class="brand-item">' +
    '<h4>🖥 PLC 控制系统品牌推荐</h4>' +
    '<table class="brand-table">' +
    '<thead><tr><th>品牌</th><th>推荐系列</th><th>型号示例</th><th>特点</th><th>适用场景</th></tr></thead>' +
    '<tbody>' +
    '<tr><td><strong>西门子 Siemens</strong></td><td>S7-1200</td><td>CPU 1214C DC/DC/DC</td><td>14DI/10DO/2AI/2AO，PROFINET，TIA Portal 编程</td><td>中小型 AHU 控制</td></tr>' +
    '<tr><td><strong>三菱 Mitsubishi</strong></td><td>FX5U</td><td>FX5U-32MR/ES</td><td>16DI/16DO，内置以太网，GX Works3 编程</td><td>日系方案偏好</td></tr>' +
    '<tr><td><strong>欧姆龙 Omron</strong></td><td>NJ 系列</td><td>NJ301-1200</td><td>高性能，支持 Motion，Sysmac Studio 编程</td><td>高精度复杂控制</td></tr>' +
    '<tr><td><strong>国产（信捷/汇川）</strong></td><td>XD5 系列</td><td>XD5-32T-E</td><td>性价比高，中文编程支持</td><td>预算有限场合</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<div class="selection-tip"><strong>💡 选型技巧：</strong>' +
    '<ul>' +
    '<li>AHU 控制至少需要：4AI（进/出口温湿度）、1AO（冷水阀）、2DO（风机/加湿）、1AO（变频器）、1AO（电加热）</li>' +
    '<li>触摸屏建议 ≥ 7 寸，支持趋势曲线、报警记录、参数设置</li>' +
    '<li>控制算法：温度 PID + 湿度 PID + 前馈补偿（根据室外温湿度预判）</li>' +
    '<li>需支持远程监控时，选带以太网或 4G 模块的 PLC</li>' +
    '<li>安全联锁：风机启动后才能开加热/加湿，风机停止后延时关闭冷水阀和电加热器</li>' +
    '</ul></div>' +
    '</div>' +

    // 7. 电动调节阀
    '<div class="brand-item">' +
    '<h4>🔧 电动调节阀品牌推荐</h4>' +
    '<table class="brand-table">' +
    '<thead><tr><th>品牌</th><th>推荐系列</th><th>型号示例</th><th>特点</th><th>适用场景</th></tr></thead>' +
    '<tbody>' +
    '<tr><td><strong>西门子 Siemens</strong></td><td>VXF47 系列</td><td>VXF47.40-25</td><td>DN40，Kvs=25 m³/h，0~10V 控制</td><td>冷冻水流量调节</td></tr>' +
    '<tr><td><strong>江森 Johnson</strong></td><td>VG4000 系列</td><td>VG4410PC+VA-7010</td><td>DN25，三通阀，弹簧复位</td><td>需要故障安全保护的场合</td></tr>' +
    '<tr><td><strong>丹佛斯 Danfoss</strong></td><td>VRB 系列</td><td>VRB-15-DN32</td><td>DN32，三通混水阀，黄铜阀体</td><td>小型 AHU</td></tr>' +
    '<tr><td><strong>博力谋 Belimo</strong></td><td>NF 系列</td><td>NF24A-SR</td><td>20Nm 执行器，0~10V 控制，弹簧复位</td><td>风阀/水阀通用</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<div class="selection-tip"><strong>💡 选型技巧：</strong>' +
    '<ul>' +
    '<li>阀门 Kvs 值 = 设计流量 × 1.3（安全系数），确保调节范围覆盖</li>' +
    '<li>冷冻水阀选等百分比特性</li>' +
    '<li>执行器控制信号 0~10V 或 4~20mA，与 PLC AO 模块匹配</li>' +
    '<li>重要场合选弹簧复位型（故障时自动关闭或全开）</li>' +
    '<li>阀门口径通常比管径小一档，确保调节精度</li>' +
    '</ul></div>' +
    '</div>' +

    // 8. 过滤器
    '<div class="brand-item">' +
    '<h4>🧹 过滤器品牌推荐</h4>' +
    '<table class="brand-table">' +
    '<thead><tr><th>品牌</th><th>推荐系列</th><th>型号示例</th><th>特点</th><th>适用场景</th></tr></thead>' +
    '<tbody>' +
    '<tr><td><strong>康斐尔 Camfil</strong></td><td>Hi-Flo 系列</td><td>Hi-Flo XG G4</td><td>袋式初效，过滤效率 G4（EN779），容尘量大</td><td>AHU 进风段</td></tr>' +
    '<tr><td><strong>AAF</strong></td><td>MetaGard 系列</td><td>MetaGard G4</td><td>袋式结构，铝框/纸框可选</td><td>常规初效过滤</td></tr>' +
    '<tr><td><strong>曼胡默尔 Mann+Hummel</strong></td><td>CF 系列</td><td>CF-500-G4</td><td>紧凑型，安装空间小</td><td>空间受限场合</td></tr>' +
    '<tr><td><strong>国产（中纺/再升）</strong></td><td>定制型</td><td>G4-定制</td><td>价格优势，可定制尺寸</td><td>预算有限场合</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<div class="selection-tip"><strong>💡 选型技巧：</strong>' +
    '<ul>' +
    '<li>初效过滤器 G4 可过滤 ≥ 5μm 颗粒，保护表冷器和加热器</li>' +
    '<li>过滤器前后应设压差开关，压差 > 250Pa 时报警提示更换</li>' +
    '<li>更换周期：初效 1~3 个月，中效 3~6 个月（视环境而定）</li>' +
    '<li>过滤器迎面风速 ≤ 2.5 m/s，过高则阻力大、效率低</li>' +
    '<li>高洁净要求场合可在初效后加中效 F7/F8 过滤</li>' +
    '</ul></div>' +
    '</div>' +

    // 9. 加湿器
    '<div class="brand-item">' +
    '<h4>💦 加湿器品牌推荐</h4>' +
    '<table class="brand-table">' +
    '<thead><tr><th>品牌</th><th>推荐系列</th><th>型号示例</th><th>特点</th><th>适用场景</th></tr></thead>' +
    '<tbody>' +
    '<tr><td><strong>卡乐 Carel</strong></td><td>UE 电极系列</td><td>UE100-230V-10kg/h</td><td>10kg/h，电极式，精度 ±5%</td><td>中大型 AHU</td></tr>' +
    '<tr><td><strong>蒙特 Munters</strong></td><td>ACE 系列</td><td>ACE-20-230V</td><td>20kg/h，电极式，自动排污</td><td>高湿需求场合</td></tr>' +
    '<tr><td><strong>诺德曼 Nordmann</strong></td><td>湿膜系列</td><td>NWM-15</td><td>15kg/h，湿膜等焓加湿，节能</td><td>节能型 AHU</td></tr>' +
    '<tr><td><strong>国产（利达/亚都）</strong></td><td>定制型</td><td>LD-10-定制</td><td>10kg/h，性价比高</td><td>预算有限场合</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<div class="selection-tip"><strong>💡 选型技巧：</strong>' +
    '<ul>' +
    '<li>加湿量 = 质量流量 × (出口含湿量 - 入口含湿量) × 3600 / 1000 kg/h</li>' +
    '<li>电极式加湿：响应快（3~5min），但耗电大（1kW 电产 1.3kg 蒸汽）</li>' +
    '<li>湿膜加湿：等焓过程，不耗电，但需要定期清洗湿膜</li>' +
    '<li>加湿器应安装在加热器之后，避免蒸汽在加热器表面冷凝</li>' +
    '<li>蒸汽分配管应均匀分布在风道截面上，确保湿度均匀</li>' +
    '<li>加湿器段底部需设排水口，排除冷凝水</li>' +
    '</ul></div>' +
    '</div>' +

    // 10. 消音器
    '<div class="brand-item">' +
    '<h4>🔇 消音器品牌推荐</h4>' +
    '<table class="brand-table">' +
    '<thead><tr><th>品牌</th><th>推荐系列</th><th>型号示例</th><th>特点</th><th>适用场景</th></tr></thead>' +
    '<tbody>' +
    '<tr><td><strong>绿声 Lvsound</strong></td><td>ZX 阻性系列</td><td>ZX-600×600-1200</td><td>600×600mm，长 1200mm，消声量 25dB</td><td>风机出口降噪</td></tr>' +
    '<tr><td><strong>声博士 Soundbox</strong></td><td>微穿孔系列</td><td>MPA-500-1000</td><td>微穿孔板结构，无纤维脱落</td><td>洁净室 AHU</td></tr>' +
    '<tr><td><strong>国产（中雅/天华）</strong></td><td>定制型</td><td>XF-定制</td><td>按工况定制，性价比高</td><td>各类降噪需求</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<div class="selection-tip"><strong>💡 选型技巧：</strong>' +
    '<ul>' +
    '<li>消音器长度：标准型 1000mm，高效型 1500~2000mm</li>' +
    '<li>消声量要求：根据测试台噪音标准确定，一般 15~30dB</li>' +
    '<li>迎面风速 ≤ 8 m/s，过高则产生再生噪音</li>' +
    '<li>消音片间距 50~100mm，间距越小消声效果越好但阻力越大</li>' +
    '<li>消音器应安装在风机出口，避免风机噪音传入测试台</li>' +
    '<li>洁净室场合选微穿孔板型，避免玻璃纤维脱落</li>' +
    '</ul></div>' +
    '</div>' +

    // 11. 风阀
    '<div class="brand-item">' +
    '<h4>🌀 风阀品牌推荐</h4>' +
    '<table class="brand-table">' +
    '<thead><tr><th>品牌</th><th>推荐系列</th><th>型号示例</th><th>特点</th><th>适用场景</th></tr></thead>' +
    '<tbody>' +
    '<tr><td><strong>博力谋 Belimo</strong></td><td>NF/AF 系列</td><td>NF24A-SR</td><td>20Nm 执行器，0~10V 控制，弹簧复位</td><td>风量调节/切断</td></tr>' +
    '<tr><td><strong>江森 Johnson</strong></td><td>FD 系列</td><td>FD-600-24V</td><td>600mm 风阀，24V 执行器</td><td>大风量调节</td></tr>' +
    '<tr><td><strong>国产（风神/上风）</strong></td><td>定制型</td><td>DF-定制</td><td>按尺寸定制，性价比高</td><td>常规风阀需求</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<div class="selection-tip"><strong>💡 选型技巧：</strong>' +
    '<ul>' +
    '<li>进风口设电动风阀（调节新风量），出风口设手动风阀（调试用）</li>' +
    '<li>执行器扭矩根据风阀面积选择：≤ 0.5m² 选 10Nm，0.5~1m² 选 20Nm，> 1m² 选 40Nm</li>' +
    '<li>安全联锁场合选弹簧复位型（断电自动关闭）</li>' +
    '<li>风阀叶片选对开多叶型，调节线性好</li>' +
    '<li>风阀轴端需密封，防止漏风</li>' +
    '</ul></div>' +
    '</div>' +

    // 12. 水泵
    '<div class="brand-item">' +
    '<h4>💧 水泵品牌推荐</h4>' +
    '<table class="brand-table">' +
    '<thead><tr><th>品牌</th><th>推荐系列</th><th>型号示例</th><th>特点</th><th>适用场景</th></tr></thead>' +
    '<tbody>' +
    '<tr><td><strong>格兰富 Grundfos</strong></td><td>NB 系列</td><td>NB 50-200/112</td><td>端吸离心泵，效率 75%，低噪音</td><td>冷冻水循环</td></tr>' +
    '<tr><td><strong>威乐 Wilo</strong></td><td>Stratos 系列</td><td>Stratos 50/1-12</td><td>变频泵，内置控制器，节能</td><td>变频水系统</td></tr>' +
    '<tr><td><strong>南方泵业</strong></td><td>CDL 系列</td><td>CDL4-8</td><td>立式多级离心泵，国产性价比</td><td>预算有限场合</td></tr>' +
    '<tr><td><strong>凯泉</strong></td><td>KQL 系列</td><td>KQL 50-160</td><td>卧式单级离心泵，运行稳定</td><td>常规水系统</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<div class="selection-tip"><strong>💡 选型技巧：</strong>' +
    '<ul>' +
    '<li>水泵流量 = 设计水流量 × 1.1（安全系数）</li>' +
    '<li>水泵扬程 = 系统阻力（管路 + 阀门 + 换热器）× 1.15</li>' +
    '<li>优先选变频泵，可根据负荷自动调节流量，节能 30%~50%</li>' +
    '<li>水泵进出口设橡胶软接头（减振）和 Y 型过滤器（保护叶轮）</li>' +
    '<li>水泵基础设减震器（弹簧或橡胶），降低振动传递</li>' +
    '<li>一用一备配置，确保系统可靠性</li>' +
    '</ul></div>' +
    '</div>' +

    // 13. 膨胀水箱
    '<div class="brand-item">' +
    '<h4>📦 膨胀水箱品牌推荐</h4>' +
    '<table class="brand-table">' +
    '<thead><tr><th>品牌</th><th>推荐系列</th><th>型号示例</th><th>特点</th><th>适用场景</th></tr></thead>' +
    '<tbody>' +
    '<tr><td><strong>格兰富 Grundfos</strong></td><td>膨胀罐系列</td><td>GPV-50</td><td>50L 隔膜式，预充压力 1.5 bar</td><td>小型水系统</td></tr>' +
    '<tr><td><strong>Reflex</strong></td><td>Reflex N 系列</td><td>Reflex N 80</td><td>80L，德国品质，隔膜可更换</td><td>中大型水系统</td></tr>' +
    '<tr><td><strong>国产（定压/恒压）</strong></td><td>定制型</td><td>XP-100</td><td>100L，性价比高</td><td>预算有限场合</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<div class="selection-tip"><strong>💡 选型技巧：</strong>' +
    '<ul>' +
    '<li>膨胀水箱容积 = 系统水容量 × 水温变化 × 膨胀系数（0.0006/℃）</li>' +
    '<li>一般小型 AHU 系统选 24~50L，中型选 80~100L</li>' +
    '<li>预充压力 = 系统静压 - 0.2 bar</li>' +
    '<li>安装在系统回水管上，靠近水泵入口</li>' +
    '<li>隔膜式优于气囊式，维护方便</li>' +
    '</ul></div>' +
    '</div>' +

    // 14. 电线电缆
    '<div class="brand-item">' +
    '<h4>🔌 电线电缆品牌推荐</h4>' +
    '<table class="brand-table">' +
    '<thead><tr><th>品牌</th><th>推荐系列</th><th>型号示例</th><th>特点</th><th>适用场景</th></tr></thead>' +
    '<tbody>' +
    '<tr><td><strong>远东电缆</strong></td><td>YJV 系列</td><td>YJV-3×4+1×2.5</td><td>铜芯交联聚乙烯绝缘，4kW 电机用</td><td>动力电缆</td></tr>' +
    '<tr><td><strong>宝胜电缆</strong></td><td>RVVP 系列</td><td>RVVP-2×1.0</td><td>屏蔽信号线，抗干扰</td><td>传感器信号线</td></tr>' +
    '<tr><td><strong>起帆电缆</strong></td><td>BV 系列</td><td>BV-2.5</td><td>单芯硬线，柜内配线</td><td>控制柜内配线</td></tr>' +
    '<tr><td><strong>熊猫电线</strong></td><td>BVR 系列</td><td>BVR-1.5</td><td>多股软线，弯曲方便</td><td>控制柜内配线</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<div class="selection-tip"><strong>💡 选型技巧：</strong>' +
    '<ul>' +
    '<li>动力电缆截面：≤ 4kW 选 3×2.5+1×1.5mm²，4~7.5kW 选 3×4+1×2.5mm²，7.5~15kW 选 3×6+1×4mm²</li>' +
    '<li>信号线必须用屏蔽线（RVVP），屏蔽层单端接地</li>' +
    '<li>控制线截面 ≥ 1.0mm²，确保机械强度</li>' +
    '<li>电缆敷设：动力线与信号线分开走线，间距 ≥ 200mm</li>' +
    '<li>穿管敷设时，电缆总截面 ≤ 管内截面的 40%</li>' +
    '</ul></div>' +
    '</div>' +

    // 15. 桥架/线管
    '<div class="brand-item">' +
    '<h4>📐 桥架/线管品牌推荐</h4>' +
    '<table class="brand-table">' +
    '<thead><tr><th>品牌</th><th>推荐系列</th><th>型号示例</th><th>特点</th><th>适用场景</th></tr></thead>' +
    '<tbody>' +
    '<tr><td><strong>华鹏桥架</strong></td><td>槽式桥架</td><td>200×100 热镀锌</td><td>200×100mm，热镀锌防腐</td><td>动力电缆敷设</td></tr>' +
    '<tr><td><strong>联塑</strong></td><td>JDG 管</td><td>JDG-25</td><td>φ25 紧定式镀锌钢管</td><td>信号线穿管</td></tr>' +
    '<tr><td><strong>伟星</strong></td><td>PVC 管</td><td>PVC-20</td><td>φ20 PVC 电工管</td><td>室内明敷线管</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<div class="selection-tip"><strong>💡 选型技巧：</strong>' +
    '<ul>' +
    '<li>桥架规格：根据电缆数量和截面选择，填充率 ≤ 40%</li>' +
    '<li>动力电缆用槽式桥架，信号线用托盘式桥架或穿管</li>' +
    '<li>桥架间距：水平敷设支架间距 1.5~3m，垂直敷设 ≤ 2m</li>' +
    '<li>桥架跨接接地线（≥ 4mm² 铜线），确保电气连续性</li>' +
    '<li>穿管敷设：动力线用钢管，信号线用 PVC 管或 JDG 管</li>' +
    '</ul></div>' +
    '</div>' +

    // 16. 保温材料
    '<div class="brand-item">' +
    '<h4>🧊 保温材料品牌推荐</h4>' +
    '<table class="brand-table">' +
    '<thead><tr><th>品牌</th><th>推荐系列</th><th>型号示例</th><th>特点</th><th>适用场景</th></tr></thead>' +
    '<tbody>' +
    '<tr><td><strong>阿乐斯 Armaflex</strong></td><td>福乐斯</td><td>Armaflex HT-19</td><td>19mm 橡塑保温，导热系数 0.034 W/(m·K)</td><td>冷冻水管保温</td></tr>' +
    '<tr><td><strong>华美</strong></td><td>橡塑保温</td><td>HT-25</td><td>25mm 橡塑保温，国产性价比</td><td>常规保温需求</td></tr>' +
    '<tr><td><strong>欧文斯科宁</strong></td><td>玻璃棉</td><td>50mm 铝箔贴面</td><td>50mm 玻璃棉，A 级防火</td><td>AHU 箱体保温</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<div class="selection-tip"><strong>💡 选型技巧：</strong>' +
    '<ul>' +
    '<li>冷冻水管保温厚度：DN≤50 选 19mm，DN>50 选 25mm</li>' +
    '<li>AHU 箱体保温：50mm 聚氨酯发泡或玻璃棉，密度 ≥ 40 kg/m³</li>' +
    '<li>保温材料接缝处用专用胶水粘接，确保密封</li>' +
    '<li>室外管道保温外需加铝皮或镀锌钢板保护层</li>' +
    '</ul></div>' +
    '</div>' +

    // 17. 减震器
    '<div class="brand-item">' +
    '<h4>🔩 减震器品牌推荐</h4>' +
    '<table class="brand-table">' +
    '<thead><tr><th>品牌</th><th>推荐系列</th><th>型号示例</th><th>特点</th><th>适用场景</th></tr></thead>' +
    '<tbody>' +
    '<tr><td><strong>派力派利</strong></td><td>弹簧减震器</td><td>ZA-100</td><td>载荷 100kg，挠度 25mm</td><td>风机/水泵减震</td></tr>' +
    '<tr><td><strong>德国 ACE</strong></td><td>橡胶减震垫</td><td>MC-225</td><td>橡胶材质，安装方便</td><td>小型设备减震</td></tr>' +
    '<tr><td><strong>国产（震安/隔而固）</strong></td><td>定制型</td><td>JA-定制</td><td>按载荷定制，性价比高</td><td>各类设备减震</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<div class="selection-tip"><strong>💡 选型技巧：</strong>' +
    '<ul>' +
    '<li>弹簧减震器：适用于风机、水泵等大型设备，减震率 90%~95%</li>' +
    '<li>橡胶减震垫：适用于小型设备，减震率 70%~80%</li>' +
    '<li>减震器载荷 = 设备重量 / 减震器数量 × 1.2（安全系数）</li>' +
    '<li>风机段底部设 4 个弹簧减震器，均匀分布</li>' +
    '<li>水泵基础设减震台座（混凝土块 + 减震器），降低振动传递</li>' +
    '</ul></div>' +
    '</div>' +

    // 18. 软连接
    '<div class="brand-item">' +
    '<h4>🔗 软连接品牌推荐</h4>' +
    '<table class="brand-table">' +
    '<thead><tr><th>品牌</th><th>推荐系列</th><th>型号示例</th><th>特点</th><th>适用场景</th></tr></thead>' +
    '<tbody>' +
    '<tr><td><strong>国产（中鼎/双箭）</strong></td><td>帆布软接</td><td>600×400-200</td><td>600×400mm，长 200mm，帆布材质</td><td>风机出口软连接</td></tr>' +
    '<tr><td><strong>国产（橡胶/金属）</strong></td><td>橡胶软接头</td><td>KXT-DN50</td><td>DN50，橡胶材质，减振</td><td>水管软连接</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<div class="selection-tip"><strong>💡 选型技巧：</strong>' +
    '<ul>' +
    '<li>风机出口帆布软接：长度 ≥ 200mm，防止振动传递到风管</li>' +
    '<li>水管橡胶软接头：长度 150~200mm，防止振动传递到管路</li>' +
    '<li>软连接不得作为补偿器使用，管道热胀冷缩需另设补偿器</li>' +
    '<li>帆布软接应定期更换（2~3 年），防止老化漏风</li>' +
    '</ul></div>' +
    '</div>' +

    // 19. 接水盘/排水系统
    '<div class="brand-item">' +
    '<h4>🪣 接水盘/排水系统</h4>' +
    '<table class="brand-table">' +
    '<thead><tr><th>部件</th><th>规格</th><th>型号示例</th><th>特点</th><th>适用场景</th></tr></thead>' +
    '<tbody>' +
    '<tr><td>接水盘</td><td>304 不锈钢，厚度 1.2mm</td><td>定制尺寸</td><td>坡度 ≥ 1%，不积水</td><td>表冷器段底部</td></tr>' +
    '<tr><td>排水管</td><td>PVC-U DN32</td><td>联塑 DN32</td><td>存水弯高度 ≥ 50mm</td><td>接水盘排水</td></tr>' +
    '<tr><td>存水弯</td><td>P 型，DN32</td><td>定制</td><td>防止负压倒吸和异味</td><td>排水管出口</td></tr>' +
    '<tr><td>电动排水阀</td><td>24V DC，DN15</td><td>定制</td><td>定时排水，防止水封干涸</td><td>自动排水系统</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<div class="selection-tip"><strong>💡 选型技巧：</strong>' +
    '<ul>' +
    '<li>接水盘材质：304 不锈钢（防腐），厚度 ≥ 1.2mm</li>' +
    '<li>接水盘坡度 ≥ 1%，排水口设在最低点</li>' +
    '<li>存水弯高度 ≥ 50mm，防止风机负压将水倒吸</li>' +
    '<li>排水管管径 ≥ DN32，防止堵塞</li>' +
    '<li>寒冷地区排水管需加伴热带，防止冻结</li>' +
    '</ul></div>' +
    '</div>' +

    // 20. 配电系统
    '<div class="brand-item">' +
    '<h4>⚡ 配电系统品牌推荐</h4>' +
    '<table class="brand-table">' +
    '<thead><tr><th>品牌</th><th>推荐系列</th><th>型号示例</th><th>特点</th><th>适用场景</th></tr></thead>' +
    '<tbody>' +
    '<tr><td><strong>施耐德 Schneider</strong></td><td>Acti9 系列</td><td>iC65N-3P-C16</td><td>16A 三极断路器，C 型脱扣曲线</td><td>主回路保护</td></tr>' +
    '<tr><td><strong>ABB</strong></td><td>S200 系列</td><td>S203-C10</td><td>10A 三极断路器</td><td>分支回路保护</td></tr>' +
    '<tr><td><strong>正泰 CHINT</strong></td><td>NXB 系列</td><td>NXB-63-C20</td><td>20A 断路器，国产性价比</td><td>预算有限场合</td></tr>' +
    '<tr><td><strong>德力西 DELIXI</strong></td><td>CDB6 系列</td><td>CDB6-32-C10</td><td>10A 断路器，质量稳定</td><td>常规配电</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<div class="selection-tip"><strong>💡 选型技巧：</strong>' +
    '<ul>' +
    '<li>总断路器额定电流 = 总负荷电流 × 1.25（安全系数）</li>' +
    '<li>各分支回路独立断路器，便于维护和故障隔离</li>' +
    '<li>电机回路选 D 型脱扣曲线（躲过启动电流），照明/控制选 C 型</li>' +
    '<li>所有回路配漏电保护器（30mA），确保人身安全</li>' +
    '<li>配电柜防护等级 ≥ IP54，防止灰尘和水溅入</li>' +
    '</ul></div>' +
    '</div>' +

    // 21. 接地系统
    '<div class="brand-item">' +
    '<h4>🔗 接地系统</h4>' +
    '<table class="brand-table">' +
    '<thead><tr><th>部件</th><th>规格</th><th>型号示例</th><th>特点</th><th>适用场景</th></tr></thead>' +
    '<tbody>' +
    '<tr><td>接地线</td><td>BVR-6mm² 黄绿线</td><td>熊猫 BVR-6</td><td>设备外壳接地</td><td>所有电气设备</td></tr>' +
    '<tr><td>接地排</td><td>铜排 25×4mm</td><td>定制</td><td>等电位连接</td><td>控制柜内</td></tr>' +
    '<tr><td>接地极</td><td>角钢 50×50×5 L=2500</td><td>定制</td><td>接地电阻 ≤ 4Ω</td><td>独立接地系统</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<div class="selection-tip"><strong>💡 选型技巧：</strong>' +
    '<ul>' +
    '<li>所有电气设备外壳必须接地（PE），接地线截面 ≥ 4mm²</li>' +
    '<li>控制柜内设接地排（铜排 25×4mm），所有接地线汇接于此</li>' +
    '<li>接地电阻 ≤ 4Ω，定期测量</li>' +
    '<li>信号屏蔽层单端接地（PLC 侧），避免地环路干扰</li>' +
    '<li>等电位连接：AHU 箱体、风管、水管、电缆桥架均需接地</li>' +
    '</ul></div>' +
    '</div>' +

    // 22. 检修门
    '<div class="brand-item">' +
    '<h4>🚪 检修门/观察窗</h4>' +
    '<table class="brand-table">' +
    '<thead><tr><th>部件</th><th>规格</th><th>型号示例</th><th>特点</th><th>适用场景</th></tr></thead>' +
    '<tbody>' +
    '<tr><td>检修门</td><td>600×600mm 不锈钢</td><td>定制</td><td>带锁扣，密封条</td><td>过滤器/表冷器段</td></tr>' +
    '<tr><td>观察窗</td><td>200×200mm 双层玻璃</td><td>定制</td><td>带照明，LED 灯</td><td>风机段/加湿段</td></tr>' +
    '<tr><td>检修门</td><td>400×400mm 不锈钢</td><td>定制</td><td>小型检修门</td><td>电气检查口</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<div class="selection-tip"><strong>💡 选型技巧：</strong>' +
    '<ul>' +
    '<li>检修门尺寸：过滤器段 ≥ 600×600mm（方便更换过滤器），表冷器段 ≥ 600×600mm（方便清洗）</li>' +
    '<li>检修门密封：橡胶密封条，确保不漏风</li>' +
    '<li>观察窗：双层钢化玻璃（防结露），内侧带 LED 照明</li>' +
    '<li>检修门锁扣：不锈钢搭扣，带锁孔（防止误开）</li>' +
    '<li>每个功能段至少设一个检修门</li>' +
    '</ul></div>' +
    '</div>' +

    // 23. 压差开关/流量计
    '<div class="brand-item">' +
    '<h4>📊 压差开关/流量计/压力表</h4>' +
    '<table class="brand-table">' +
    '<thead><tr><th>品牌</th><th>推荐系列</th><th>型号示例</th><th>特点</th><th>适用场景</th></tr></thead>' +
    '<tbody>' +
    '<tr><td><strong>德威尔 Dwyer</strong></td><td>616 系列</td><td>616-9</td><td>压差开关，设定值 50~500Pa</td><td>过滤器压差报警</td></tr>' +
    '<tr><td><strong>西门子 Siemens</strong></td><td>QBM3025</td><td>QBM3025-10</td><td>压差变送器，0~1000Pa，0~10V</td><td>风机压差监测</td></tr>' +
    '<tr><td><strong>科隆 Krohne</strong></td><td>OPTIFLUX 系列</td><td>OPTIFLUX 2050 DN50</td><td>电磁流量计，DN50，精度 ±0.5%</td><td>水流量测量</td></tr>' +
    '<tr><td><strong>国产（红旗/上仪）</strong></td><td>压力表</td><td>Y-100 0~1.6MPa</td><td>φ100 表盘，1.6 级精度</td><td>水管压力监测</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<div class="selection-tip"><strong>💡 选型技巧：</strong>' +
    '<ul>' +
    '<li>过滤器压差开关：设定值 250Pa，超过时报警提示更换</li>' +
    '<li>风机压差变送器：量程 0~1500Pa，监测风机运行状态</li>' +
    '<li>水流量计：电磁流量计精度高（±0.5%），但需满管条件</li>' +
    '<li>压力表：量程为工作压力的 1.5~2 倍，精度 1.6 级</li>' +
    '<li>温度计：双金属温度计（-20~60℃），精度 ±1℃</li>' +
    '</ul></div>' +
    '</div>' +

    // 24. 箱体/框架
    '<div class="brand-item">' +
    '<h4>🏗 AHU 箱体/框架</h4>' +
    '<table class="brand-table">' +
    '<thead><tr><th>部件</th><th>规格</th><th>型号示例</th><th>特点</th><th>适用场景</th></tr></thead>' +
    '<tbody>' +
    '<tr><td>箱体面板</td><td>304 不锈钢 1.5mm + 50mm 聚氨酯 + 1.0mm 内板</td><td>定制</td><td>保温、防腐、漏风率 ≤ 1%</td><td>AHU 箱体</td></tr>' +
    '<tr><td>框架</td><td>铝合金型材 40×40mm</td><td>定制</td><td>强度高，重量轻，防腐</td><td>AHU 骨架</td></tr>' +
    '<tr><td>底座</td><td>槽钢 10# + 防锈漆</td><td>定制</td><td>承重，防锈</td><td>AHU 底座</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<div class="selection-tip"><strong>💡 选型技巧：</strong>' +
    '<ul>' +
    '<li>箱体面板：外层 304 不锈钢 1.5mm（防腐），保温层 50mm 聚氨酯（密度 ≥ 40 kg/m³），内层 1.0mm 镀锌板</li>' +
    '<li>框架：铝合金型材 40×40mm（轻型）或 50×50mm（重型），角件连接</li>' +
    '<li>底座：槽钢 10# 或 12#，焊接后涂防锈漆，高度 ≥ 150mm（方便接管）</li>' +
    '<li>箱体漏风率 ≤ 1%（GB/T 14294 要求），接缝处用硅酮密封胶密封</li>' +
    '<li>箱体强度：承受 2000Pa 正压不变形</li>' +
    '</ul></div>' +
    '</div>' +

    '</div>' +

    // ===== 安装集成与布局指南 =====
    '<div class="installation-section">' +
    '<h3>🔧 元器件安装集成与布局连接指南</h3>' +

    // 总体布局
    '<div class="install-item">' +
    '<h4>📐 AHU 整体布局顺序（沿气流方向）</h4>' +
    '<div class="layout-flow">' +
    '<div class="flow-step"><span class="flow-num">1</span><span class="flow-name">进风口</span></div>' +
    '<div class="flow-arrow">→</div>' +
    '<div class="flow-step"><span class="flow-num">2</span><span class="flow-name">初效过滤器<br><small>G4 袋式</small></span></div>' +
    '<div class="flow-arrow">→</div>' +
    '<div class="flow-step"><span class="flow-num">3</span><span class="flow-name">表冷器<br><small>6~8排管</small></span></div>' +
    '<div class="flow-arrow">→</div>' +
    '<div class="flow-step"><span class="flow-num">4</span><span class="flow-name">电加热器<br><small>不锈钢发热管</small></span></div>' +
    '<div class="flow-arrow">→</div>' +
    '<div class="flow-step"><span class="flow-num">5</span><span class="flow-name">加湿器<br><small>电极/湿膜</small></span></div>' +
    '<div class="flow-arrow">→</div>' +
    '<div class="flow-step"><span class="flow-num">6</span><span class="flow-name">送风机<br><small>离心变频</small></span></div>' +
    '<div class="flow-arrow">→</div>' +
    '<div class="flow-step"><span class="flow-num">7</span><span class="flow-name">出风口<br><small>接测试台</small></span></div>' +
    '</div>' +
    '<div class="install-tip"><strong>� 布局原则：</strong>' +
    '<ul>' +
    '<li>各功能段之间用隔板分隔，隔板接缝处用硅酮密封胶密封，确保不漏风</li>' +
    '<li>每段前后预留 ≥ 300mm 检修空间，方便更换过滤器、清洗表冷器</li>' +
    '<li>表冷器段底部设不锈钢接水盘，接水盘坡度 ≥ 1%，排水管接至地漏</li>' +
    '<li>风机段底部设减震基础（弹簧减震器或橡胶垫），减少振动传递到箱体</li>' +
    '<li>电气控制柜独立安装在 AHU 侧面或就近墙面，防护等级 IP54</li>' +
    '</ul></div>' +
    '</div>' +

    // 表冷器安装
    '<div class="install-item">' +
    '<h4>❄ 表冷器安装与集成</h4>' +
    '<div class="install-detail">' +
    '<p><strong>安装位置：</strong>AHU 中段，过滤器之后、加热器之前</p>' +
    '<p><strong>安装步骤：</strong></p>' +
    '<ol>' +
    '<li>将表冷器吊装入 AHU 箱体，用 M8 螺栓固定在箱体支架上</li>' +
    '<li>表冷器与箱体隔板之间的缝隙用 3mm 橡胶密封条密封</li>' +
    '<li>冷冻水进/出水管从箱体底部穿入，用橡胶软接头连接（减振）</li>' +
    '<li>进水口安装 Y 型过滤器（目数 ≥ 20），防止杂质堵塞铜管</li>' +
    '<li>进水口安装电动二通调节阀（0~10V 控制），由 PLC 控制开度</li>' +
    '<li>出水口安装温度计和压力表，便于调试和维护</li>' +
    '<li>接水盘排水管接至地漏，存水弯高度 ≥ 50mm（防止负压倒吸）</li>' +
    '</ol>' +
    '<p><strong>管路连接：</strong></p>' +
    '<div class="pipe-diagram">冷冻水供水管 → Y型过滤器 → 电动调节阀 → 表冷器进水口 → 表冷器出水口 → 温度计 → 冷冻水回水管</div>' +
    '<p><strong>电气连接：</strong></p>' +
    '<div class="wire-diagram">出口温度传感器 → PLC AI 模块 → PID 运算 → PLC AO 模块 → 电动调节阀执行器（0~10V）</div>' +
    '</div>' +
    '</div>' +

    // 加热器安装
    '<div class="install-item">' +
    '<h4>🔥 加热器安装与集成</h4>' +
    '<div class="install-detail">' +
    '<p><strong>安装位置：</strong>表冷器之后、加湿器之前</p>' +
    '<p><strong>安装步骤：</strong></p>' +
    '<ol>' +
    '<li>电加热器从箱体侧面装入，用 M8 螺栓固定在专用支架上</li>' +
    '<li>加热器与箱体隔板之间用耐高温石棉密封条密封</li>' +
    '<li>电源线从箱体底部穿入，接至可控硅调功器（SSR）</li>' +
    '<li>可控硅调功器安装在电气控制柜内，通过 0~10V 信号由 PLC 控制</li>' +
    '<li>加热器出口安装超温保护开关（设定 80℃），串联到控制回路</li>' +
    '</ol>' +
    '<p><strong>电气连接：</strong></p>' +
    '<div class="wire-diagram">出口温度传感器 → PLC AI 模块 → PID 运算 → PLC AO 模块 → 可控硅调功器 → 电加热管</div>' +
    '<div class="wire-diagram">超温保护开关（常闭）→ 串联到接触器线圈回路 → 超温时切断加热电源</div>' +
    '<p><strong>安全要求：</strong></p>' +
    '<ul>' +
    '<li>电加热器必须接地（PE），绝缘电阻 ≥ 10 MΩ</li>' +
    '<li>加热段前后各 500mm 范围内不得有易燃材料</li>' +
    '<li>加热器段箱体需设温度报警探头，超温时声光报警</li>' +
    '</ul>' +
    '</div>' +
    '</div>' +

    // 风机安装
    '<div class="install-item">' +
    '<h4>💨 风机安装与集成</h4>' +
    '<div class="install-detail">' +
    '<p><strong>安装位置：</strong>AHU 末段（靠近出风口）</p>' +
    '<p><strong>安装步骤：</strong></p>' +
    '<ol>' +
    '<li>在风机段底部安装弹簧减震器（4 个，均匀分布）</li>' +
    '<li>将风机机组吊装到减震器上，用 M10 螺栓固定</li>' +
    '<li>风机出口与出风口之间用帆布软连接（长度 ≥ 200mm，减振）</li>' +
    '<li>电机接线接至变频器输出端（U/V/W），注意相序</li>' +
    '<li>变频器安装在电气控制柜内，通过 Modbus 或 0~10V 由 PLC 控制频率</li>' +
    '<li>风机段设检修门（尺寸 ≥ 600×600mm），方便维护</li>' +
    '</ol>' +
    '<p><strong>电气连接：</strong></p>' +
    '<div class="wire-diagram">PLC AO/通讯模块 → 变频器控制端子 → 变频器输出 → 风机电机</div>' +
    '<div class="wire-diagram">风机段压差开关 → PLC DI 模块 → 风机运行状态监测</div>' +
    '<p><strong>调试要点：</strong></p>' +
    '<ul>' +
    '<li>首次启动前手动盘车，确认无卡阻</li>' +
    '<li>点动确认风机转向正确（从进风侧看应为顺时针）</li>' +
    '<li>用风速仪测量出风口风速，调节变频器频率至设计风量</li>' +
    '<li>记录不同频率下的风量-风压曲线，作为运行参考</li>' +
    '</ul>' +
    '</div>' +
    '</div>' +

    // 传感器安装
    '<div class="install-item">' +
    '<h4>🌡 温湿度传感器安装与集成</h4>' +
    '<div class="install-detail">' +
    '<p><strong>安装位置：</strong></p>' +
    '<ul>' +
    '<li>入口传感器：AHU 进风口后 300mm 处（过滤器之前）</li>' +
    '<li>出口传感器：AHU 出风口前 500mm 处（风机之前）</li>' +
    '</ul>' +
    '<p><strong>安装步骤：</strong></p>' +
    '<ol>' +
    '<li>在箱体侧壁开孔（孔径根据传感器探头直径，通常 φ12~φ16）</li>' +
    '<li>传感器探头插入箱体内，探头长度应覆盖管道截面的 2/3</li>' +
    '<li>探头末端用螺母和密封垫固定，确保不漏风</li>' +
    '<li>传感器变送器安装在箱体外侧，用防水接头连接探头</li>' +
    '<li>信号线（0~10V 或 4~20mA）穿管引至电气控制柜</li>' +
    '<li>信号线接入 PLC AI 模块，设置对应的工程量范围</li>' +
    '</ol>' +
    '<p><strong>电气连接：</strong></p>' +
    '<div class="wire-diagram">传感器探头 → 变送器 → 信号线（屏蔽线）→ PLC AI 模块 → PLC 内部换算为温度/湿度值</div>' +
    '<p><strong>注意事项：</strong></p>' +
    '<ul>' +
    '<li>信号线必须用屏蔽线，屏蔽层单端接地（PLC 侧）</li>' +
    '<li>传感器探头不得直接接触表冷器翅片或加热器发热管</li>' +
    '<li>高湿工况选带加热探头的型号，防止冷凝影响测量</li>' +
    '<li>每年校准一次，用标准温湿度计比对</li>' +
    '</ul>' +
    '</div>' +
    '</div>' +

    // 电动阀安装
    '<div class="install-item">' +
    '<h4>🔧 电动调节阀安装与集成</h4>' +
    '<div class="install-detail">' +
    '<p><strong>安装位置：</strong>表冷器/加热器进水管道上</p>' +
    '<p><strong>安装步骤：</strong></p>' +
    '<ol>' +
    '<li>阀门安装在水平管道上，执行器朝上（不得朝下）</li>' +
    '<li>阀门前后各保留 ≥ 5 倍管径的直管段，确保流量特性</li>' +
    '<li>阀门与管道用法兰或螺纹连接，注意介质流向箭头</li>' +
    '<li>执行器电源线接至电气控制柜 24V AC/DC 电源</li>' +
    '<li>控制信号线（0~10V）接至 PLC AO 模块输出端</li>' +
    '<li>调试时手动全开/全关阀门，确认行程到位</li>' +
    '</ol>' +
    '<p><strong>管路连接：</strong></p>' +
    '<div class="pipe-diagram">冷冻水供水总管 → 截止阀（检修用）→ Y型过滤器 → 电动调节阀 → 橡胶软接头 → 表冷器进水口</div>' +
    '<p><strong>电气连接：</strong></p>' +
    '<div class="wire-diagram">PLC AO 模块（0~10V）→ 电动阀执行器控制端子 → 执行器驱动阀芯 → 阀门开度变化 → 水流量变化</div>' +
    '<p><strong>调试要点：</strong></p>' +
    '<ul>' +
    '<li>阀门全关时泄漏量 ≤ 0.5% Kvs</li>' +
    '<li>阀门全开时压降 ≤ 0.5 bar</li>' +
    '<li>PLC 输出 0V 时阀门全关，10V 时阀门全开（或反之，根据阀门特性）</li>' +
    '</ul>' +
    '</div>' +
    '</div>' +

    // PLC 控制系统集成
    '<div class="install-item">' +
    '<h4>🖥 PLC 控制系统集成</h4>' +
    '<div class="install-detail">' +
    '<p><strong>安装位置：</strong>AHU 侧面或就近墙面（电气控制柜内）</p>' +
    '<p><strong>控制柜布局：</strong></p>' +
    '<div class="cabinet-layout">' +
    '<div class="cabinet-row"><span class="cabinet-label">上层</span><span class="cabinet-content">PLC CPU 模块 + 通讯模块 + 触摸屏</span></div>' +
    '<div class="cabinet-row"><span class="cabinet-label">中层</span><span class="cabinet-content">AI 模块（温度/湿度）+ AO 模块（阀门/变频器）+ DI/DO 模块</span></div>' +
    '<div class="cabinet-row"><span class="cabinet-label">下层</span><span class="cabinet-content">24V 开关电源 + 断路器 + 接触器 + 可控硅调功器</span></div>' +
    '<div class="cabinet-row"><span class="cabinet-label">底部</span><span class="cabinet-content">变频器 + 散热风扇 + 接线端子排</span></div>' +
    '</div>' +
    '<p><strong>接线步骤：</strong></p>' +
    '<ol>' +
    '<li>电源线：380V AC → 总断路器 → 分路断路器 → 各设备</li>' +
    '<li>控制电源：220V AC → 24V DC 开关电源 → PLC CPU + I/O 模块</li>' +
    '<li>AI 信号线：传感器 → 屏蔽线 → AI 模块端子（注意极性）</li>' +
    '<li>AO 信号线：AO 模块端子 → 屏蔽线 → 执行器/变频器控制端</li>' +
    '<li>DI 信号线：压差开关/超温开关 → 导线 → DI 模块端子</li>' +
    '<li>DO 信号线：DO 模块端子 → 中间继电器 → 接触器线圈</li>' +
    '<li>通讯线：PLC → 以太网线/RS485 → 触摸屏/变频器</li>' +
    '</ol>' +
    '<p><strong>I/O 分配表：</strong></p>' +
    '<table class="io-table">' +
    '<thead><tr><th>类型</th><th>地址</th><th>信号</th><th>连接设备</th><th>量程</th></tr></thead>' +
    '<tbody>' +
    '<tr><td>AI1</td><td>%IW0</td><td>0~10V</td><td>入口温度传感器</td><td>-20~60℃</td></tr>' +
    '<tr><td>AI2</td><td>%IW1</td><td>0~10V</td><td>入口湿度传感器</td><td>0~100%RH</td></tr>' +
    '<tr><td>AI3</td><td>%IW2</td><td>0~10V</td><td>出口温度传感器</td><td>-20~60℃</td></tr>' +
    '<tr><td>AI4</td><td>%IW3</td><td>0~10V</td><td>出口湿度传感器</td><td>0~100%RH</td></tr>' +
    '<tr><td>AO1</td><td>%QW0</td><td>0~10V</td><td>冷水电动阀</td><td>0~100%开度</td></tr>' +
    '<tr><td>AO2</td><td>%QW1</td><td>0~10V</td><td>电加热可控硅</td><td>0~100%功率</td></tr>' +
    '<tr><td>AO3</td><td>%QW2</td><td>0~10V/Modbus</td><td>变频器频率</td><td>0~50Hz</td></tr>' +
    '<tr><td>DI1</td><td>%IX0</td><td>24V DC</td><td>风机运行反馈</td><td>ON/OFF</td></tr>' +
    '<tr><td>DI2</td><td>%IX1</td><td>24V DC</td><td>过滤器压差报警</td><td>ON/OFF</td></tr>' +
    '<tr><td>DI3</td><td>%IX2</td><td>24V DC</td><td>超温保护开关</td><td>ON/OFF</td></tr>' +
    '<tr><td>DO1</td><td>%QX0</td><td>24V DC</td><td>风机启停控制</td><td>ON/OFF</td></tr>' +
    '<tr><td>DO2</td><td>%QX1</td><td>24V DC</td><td>加湿器启停</td><td>ON/OFF</td></tr>' +
    '</tbody>' +
    '</table>' +
    '<p><strong>控制逻辑：</strong></p>' +
    '<div class="control-logic">' +
    '<p><strong>温度控制：</strong>出口温度传感器 → PID 运算 → 调节冷水阀/加热器 → 维持设定温度</p>' +
    '<p><strong>湿度控制：</strong>出口湿度传感器 → PID 运算 → 调节表冷器除湿量/加湿器 → 维持设定湿度</p>' +
    '<p><strong>安全联锁：</strong></p>' +
    '<ul>' +
    '<li>风机启动 → 延时 30s → 允许开加热/加湿</li>' +
    '<li>风机停止 → 立即关闭加热/加湿 → 延时 60s → 关闭冷水阀</li>' +
    '<li>超温报警 → 立即切断加热电源 → 声光报警</li>' +
    '<li>过滤器压差报警 → 提示更换过滤器</li>' +
    '</ul>' +
    '</div>' +
    '</div>' +
    '</div>' +

    // 过滤器安装
    '<div class="install-item">' +
    '<h4>🧹 过滤器安装与集成</h4>' +
    '<div class="install-detail">' +
    '<p><strong>安装位置：</strong>AHU 进风段（最前端）</p>' +
    '<p><strong>安装步骤：</strong></p>' +
    '<ol>' +
    '<li>将过滤器框架从箱体侧面装入，用 M6 螺栓固定在导轨上</li>' +
    '<li>过滤器与框架之间用橡胶密封条密封，确保不漏风</li>' +
    '<li>过滤器前后安装压差开关（取压管接至过滤器前后）</li>' +
    '<li>压差开关信号线接至 PLC DI 模块</li>' +
    '<li>过滤器段设检修门（尺寸 ≥ 600×600mm），方便更换</li>' +
    '</ol>' +
    '<p><strong>维护要点：</strong></p>' +
    '<ul>' +
    '<li>初效过滤器每 1~3 个月更换一次（视环境而定）</li>' +
    '<li>压差 > 250Pa 时必须更换，否则阻力过大影响风量</li>' +
    '<li>更换时注意气流方向箭头，装反会降低过滤效率</li>' +
    '</ul>' +
    '</div>' +
    '</div>' +

    // 加湿器安装
    '<div class="install-item">' +
    '<h4>💦 加湿器安装与集成</h4>' +
    '<div class="install-detail">' +
    '<p><strong>安装位置：</strong>AHU 后段，加热器之后、风机之前</p>' +
    '<p><strong>安装步骤：</strong></p>' +
    '<ol>' +
    '<li>将加湿器吊装入 AHU 箱体，用 M8 螺栓固定在箱体支架上</li>' +
    '<li>电极式加湿器：连接进水管（DN15），排水管（DN20）接至地漏</li>' +
    '<li>湿膜加湿器：连接供水管（DN15），回水管（DN20）形成循环</li>' +
    '<li>蒸汽分配管均匀分布在风道截面上，距上游元件 ≥ 500mm</li>' +
    '<li>电气连接：加湿器电源线接至配电柜独立回路（电极式功率较大）</li>' +
    '<li>控制信号：PLC AO 输出 0~10V 控制加湿量</li>' +
    '</ol>' +
    '<p><strong>管路连接：</strong></p>' +
    '<div class="pipe-diagram">自来水 → 进水阀 → 加湿器 → 排水管 → 地漏（电极式）</div>' +
    '<div class="pipe-diagram">循环水 → 供水泵 → 湿膜 → 回水管 → 循环水箱（湿膜式）</div>' +
    '<p><strong>电气连接：</strong></p>' +
    '<div class="wire-diagram">出口湿度传感器 → PLC AI → PID 运算 → PLC AO → 加湿器（0~10V）</div>' +
    '<div class="install-tip"><strong>⚠ 注意事项：</strong>' +
    '<ul>' +
    '<li>加湿器必须安装在加热器之后，避免蒸汽在加热器表面冷凝造成腐蚀</li>' +
    '<li>蒸汽分配管与风机之间需有 ≥ 1000mm 的直管段，确保蒸汽均匀混合</li>' +
    '<li>电极式加湿器需定期清洗电极（1~3 个月），防止水垢影响导电</li>' +
    '<li>湿膜加湿器需定期清洗湿膜（3~6 个月），防止微生物滋生</li>' +
    '<li>加湿器段底部需设排水口，排除冷凝水</li>' +
    '<li>电极式加湿器功率较大（10kg/h 约 7.5kW），需独立回路供电</li>' +
    '</ul></div>' +
    '</div>' +
    '</div>' +

    // 消音器安装
    '<div class="install-item">' +
    '<h4>🔇 消音器安装与集成</h4>' +
    '<div class="install-detail">' +
    '<p><strong>安装位置：</strong>风机出口与出风口之间</p>' +
    '<p><strong>安装步骤：</strong></p>' +
    '<ol>' +
    '<li>将消音器吊装入 AHU 箱体或安装在风管内</li>' +
    '<li>消音器与风管之间用法兰连接（螺栓 + 橡胶密封垫）</li>' +
    '<li>消音器底部设支撑支架，防止重量压在风管上</li>' +
    '<li>消音器进/出口设帆布软接（长 200mm），隔离振动</li>' +
    '<li>检查消音片是否牢固，防止高速气流吹落</li>' +
    '<li>消音器外壳接地（BVR-4mm² 黄绿线）</li>' +
    '</ol>' +
    '<p><strong>管路连接：</strong></p>' +
    '<div class="pipe-diagram">风机出口 → 帆布软接 → 消音器 → 帆布软接 → 出风口</div>' +
    '<div class="install-tip"><strong>⚠ 注意事项：</strong>' +
    '<ul>' +
    '<li>消音器迎面风速 ≤ 8 m/s，过高会产生再生噪音</li>' +
    '<li>消音器会增加系统阻力（约 50~100Pa），选型时需计入风机压头</li>' +
    '<li>洁净室场合选微穿孔板型，避免玻璃纤维脱落污染空气</li>' +
    '<li>定期清理消音片表面灰尘（6~12 个月），防止堵塞影响风量</li>' +
    '<li>消音器不宜安装在湿度高的区域，防止吸声材料受潮失效</li>' +
    '</ul></div>' +
    '</div>' +
    '</div>' +

    // 风阀安装
    '<div class="install-item">' +
    '<h4>🌀 风阀安装与集成</h4>' +
    '<div class="install-detail">' +
    '<p><strong>安装位置：</strong>进风口（电动风阀）、出风口（手动风阀）</p>' +
    '<p><strong>安装步骤：</strong></p>' +
    '<ol>' +
    '<li>将风阀装入风管或 AHU 箱体开口处</li>' +
    '<li>风阀法兰与风管法兰用螺栓连接，中间加橡胶密封垫</li>' +
    '<li>电动风阀执行器安装在风阀轴端，用连接杆固定</li>' +
    '<li>执行器电气连接：24V AC 电源 + 0~10V 控制信号</li>' +
    '<li>手动风阀装手轮或手柄，便于调试时手动调节</li>' +
    '<li>调试时标定风阀开度与风量的关系曲线</li>' +
    '</ol>' +
    '<p><strong>电气连接：</strong></p>' +
    '<div class="wire-diagram">PLC AO → 0~10V → 风阀执行器（24V AC 供电）</div>' +
    '<div class="install-tip"><strong>⚠ 注意事项：</strong>' +
    '<ul>' +
    '<li>风阀轴端需密封（填料密封或 O 型圈），防止漏风</li>' +
    '<li>执行器扭矩需匹配风阀面积，过小会导致阀门打不开</li>' +
    '<li>安全联锁场合选弹簧复位型（断电自动关闭）</li>' +
    '<li>风阀叶片选对开多叶型，调节线性好</li>' +
    '<li>调试时需标定风阀 0%、25%、50%、75%、100% 开度对应的风量</li>' +
    '</ul></div>' +
    '</div>' +
    '</div>' +

    // 水泵安装
    '<div class="install-item">' +
    '<h4>💧 水泵安装与集成</h4>' +
    '<div class="install-detail">' +
    '<p><strong>安装位置：</strong>AHU 外部机房或设备间，靠近 AHU 底部</p>' +
    '<p><strong>安装步骤：</strong></p>' +
    '<ol>' +
    '<li>浇筑混凝土基础（厚度 ≥ 150mm），预埋地脚螺栓</li>' +
    '<li>将水泵吊装至基础上，用水平仪找平（水平度 ≤ 0.1mm/m）</li>' +
    '<li>安装减震器（弹簧或橡胶），水泵与基础之间设减震台座</li>' +
    '<li>进出口安装橡胶软接头（减振）和 Y 型过滤器（保护叶轮）</li>' +
    '<li>进出口安装压力表和温度计，便于调试</li>' +
    '<li>电机接线：三相 380V，注意相序（反转会导致流量不足）</li>' +
    '<li>灌泵排气：打开排气阀，直到有水流出后关闭</li>' +
    '</ol>' +
    '<p><strong>管路连接：</strong></p>' +
    '<div class="pipe-diagram">冷冻水供水管 → Y型过滤器 → 橡胶软接头 → 水泵进口 → 水泵出口 → 橡胶软接头 → 止回阀 → 电动阀 → AHU 表冷器</div>' +
    '<p><strong>电气连接：</strong></p>' +
    '<div class="wire-diagram">380V 三相电源 → 断路器 → 接触器 → 热继电器 → 水泵电机</div>' +
    '<div class="wire-diagram">PLC DO → 接触器线圈（启停控制）</div>' +
    '<div class="install-tip"><strong>⚠ 注意事项：</strong>' +
    '<ul>' +
    '<li>水泵进口管径 ≥ 出口管径，防止汽蚀</li>' +
    '<li>进口管路尽量短、弯头少，降低阻力</li>' +
    '<li>一用一备配置，进出口设旁通管，便于切换</li>' +
    '<li>首次启动前必须灌泵排气，否则会导致干转损坏机械密封</li>' +
    '<li>变频泵需设最小频率限制（≥ 20Hz），防止电机过热</li>' +
    '<li>定期检查机械密封是否漏水（允许微量滴水，≤ 5 滴/min）</li>' +
    '</ul></div>' +
    '</div>' +
    '</div>' +

    // 膨胀水箱安装
    '<div class="install-item">' +
    '<h4>📦 膨胀水箱安装与集成</h4>' +
    '<div class="install-detail">' +
    '<p><strong>安装位置：</strong>系统回水管上，靠近水泵入口</p>' +
    '<p><strong>安装步骤：</strong></p>' +
    '<ol>' +
    '<li>将膨胀水箱固定在墙面或支架上（立式安装）</li>' +
    '<li>连接管接至系统回水管（三通连接），管径 ≥ DN20</li>' +
    '<li>连接管上设截止阀，便于维护时隔离</li>' +
    '<li>检查预充压力（用气压表测量），应为系统静压 - 0.2 bar</li>' +
    '<li>系统注水后检查膨胀水箱是否正常膨胀</li>' +
    '</ol>' +
    '<p><strong>管路连接：</strong></p>' +
    '<div class="pipe-diagram">系统回水管 → 三通 → 截止阀 → 膨胀水箱接口</div>' +
    '<div class="install-tip"><strong>⚠ 注意事项：</strong>' +
    '<ul>' +
    '<li>膨胀水箱必须安装在水泵入口侧（系统压力最低点）</li>' +
    '<li>预充压力过高会导致系统压力波动大，过低会导致水箱过早充满</li>' +
    '<li>定期检查预充压力（每年一次），不足时补充氮气</li>' +
    '<li>隔膜破裂会导致水箱充满水，失去膨胀功能，需及时更换</li>' +
    '</ul></div>' +
    '</div>' +
    '</div>' +

    // 配电系统安装
    '<div class="install-item">' +
    '<h4>⚡ 配电系统安装与集成</h4>' +
    '<div class="install-detail">' +
    '<p><strong>安装位置：</strong>AHU 侧面或就近墙面（控制柜内）</p>' +
    '<p><strong>安装步骤：</strong></p>' +
    '<ol>' +
    '<li>将配电柜固定在墙面或地面上（膨胀螺栓或地脚螺栓）</li>' +
    '<li>主电源电缆从总配电箱引入配电柜（YJV 电缆，截面按负荷计算）</li>' +
    '<li>各分支回路从总断路器下口引出，经各自断路器到负载</li>' +
    '<li>所有回路配漏电保护器（30mA），确保人身安全</li>' +
    '<li>柜内设接地排（铜排 25×4mm），所有接地线汇接于此</li>' +
    '<li>柜内布线：动力线走上部，控制线走下部，间距 ≥ 200mm</li>' +
    '<li>线号管标识每根线，便于维护</li>' +
    '</ol>' +
    '<p><strong>电气连接：</strong></p>' +
    '<div class="wire-diagram">总电源 380V → 总断路器 → 各分支断路器 → 负载（电机/加热器/加湿器/PLC 等）</div>' +
    '<div class="wire-diagram">PE 线 → 接地排 → 各设备外壳</div>' +
    '<div class="install-tip"><strong>⚠ 注意事项：</strong>' +
    '<ul>' +
    '<li>配电柜防护等级 ≥ IP54，防止灰尘和水溅入</li>' +
    '<li>电机回路选 D 型脱扣曲线（躲过启动电流），照明/控制选 C 型</li>' +
    '<li>断路器额定电流 = 负荷电流 × 1.25（安全系数）</li>' +
    '<li>电缆截面按载流量选择，并校验电压降（≤ 5%）</li>' +
    '<li>配电柜内需设照明灯和插座（220V），便于维护</li>' +
    '<li>配电柜门设行程开关，开门时自动断电（安全联锁）</li>' +
    '</ul></div>' +
    '</div>' +
    '</div>' +

    // 接地系统安装
    '<div class="install-item">' +
    '<h4>🔗 接地系统安装与集成</h4>' +
    '<div class="install-detail">' +
    '<p><strong>安装位置：</strong>AHU 箱体、控制柜、所有电气设备</p>' +
    '<p><strong>安装步骤：</strong></p>' +
    '<ol>' +
    '<li>AHU 箱体底部设接地螺栓（M8），用 BVR-6mm² 黄绿线接至接地排</li>' +
    '<li>控制柜内设接地排（铜排 25×4mm），所有接地线汇接于此</li>' +
    '<li>所有电气设备外壳用 BVR-4mm² 黄绿线接至接地排</li>' +
    '<li>电缆桥架跨接接地线（≥ 4mm² 铜线），确保电气连续性</li>' +
    '<li>信号屏蔽层单端接地（PLC 侧），避免地环路干扰</li>' +
    '<li>测量接地电阻（接地电阻测试仪），应 ≤ 4Ω</li>' +
    '</ol>' +
    '<div class="install-tip"><strong>⚠ 注意事项：</strong>' +
    '<ul>' +
    '<li>所有电气设备外壳必须接地（PE），这是安全底线</li>' +
    '<li>信号屏蔽层只能单端接地，两端接地会形成地环路引入干扰</li>' +
    '<li>接地线不得串联（每个设备单独接至接地排）</li>' +
    '<li>接地电阻定期测量（每年一次），超标时检查接地连接</li>' +
    '<li>等电位连接：AHU 箱体、风管、水管、电缆桥架均需接地</li>' +
    '</ul></div>' +
    '</div>' +
    '</div>' +

    // 桥架/线管安装
    '<div class="install-item">' +
    '<h4>📐 桥架/线管安装与集成</h4>' +
    '<div class="install-detail">' +
    '<p><strong>安装位置：</strong>AHU 至控制柜、控制柜至各传感器/执行器</p>' +
    '<p><strong>安装步骤：</strong></p>' +
    '<ol>' +
    '<li>根据电缆走向确定桥架/线管路径</li>' +
    '<li>安装桥架支架（间距：水平 1.5~3m，垂直 ≤ 2m）</li>' +
    '<li>将桥架固定在支架上（螺栓连接）</li>' +
    '<li>桥架跨接接地线（≥ 4mm² 铜线），确保电气连续性</li>' +
    '<li>电缆敷设：先动力线后信号线，分层敷设</li>' +
    '<li>穿管敷设：用穿线器将电缆穿入管内，不得强行拉拽</li>' +
    '<li>电缆两端留有余量（≥ 500mm），便于接线和维护</li>' +
    '</ol>' +
    '<div class="install-tip"><strong>⚠ 注意事项：</strong>' +
    '<ul>' +
    '<li>动力电缆与信号电缆分开敷设，间距 ≥ 200mm</li>' +
    '<li>桥架填充率 ≤ 40%，留有散热和扩容空间</li>' +
    '<li>穿管敷设时，电缆总截面 ≤ 管内截面的 40%</li>' +
    '<li>桥架转弯处弯曲半径 ≥ 电缆最小弯曲半径（一般 ≥ 10 倍电缆外径）</li>' +
    '<li>室外桥架选热镀锌或喷塑防腐型</li>' +
    '</ul></div>' +
    '</div>' +
    '</div>' +

    // 保温材料施工
    '<div class="install-item">' +
    '<h4>🧊 保温材料施工</h4>' +
    '<div class="install-detail">' +
    '<p><strong>施工位置：</strong>冷冻水管、AHU 箱体</p>' +
    '<p><strong>施工步骤：</strong></p>' +
    '<ol>' +
    '<li>管道保温：将保温管套在管道上，接缝处用专用胶水粘接</li>' +
    '<li>阀门/法兰保温：用保温棉包裹，外用铝箔胶带固定</li>' +
    '<li>AHU 箱体保温：在箱体内壁贴 50mm 聚氨酯或玻璃棉</li>' +
    '<li>保温层外表面用铝箔胶带密封接缝</li>' +
    '<li>室外管道保温外加铝皮或镀锌钢板保护层</li>' +
    '<li>检查保温层是否完整，无裸露管道</li>' +
    '</ol>' +
    '<div class="install-tip"><strong>⚠ 注意事项：</strong>' +
    '<ul>' +
    '<li>保温前管道表面需清洁、干燥、无锈蚀</li>' +
    '<li>保温层厚度按防结露要求计算，冷冻水管一般 ≥ 19mm</li>' +
    '<li>保温层接缝必须密封，防止水汽进入导致结露</li>' +
    '<li>室外保温层外需加保护层（铝皮或镀锌钢板），防止雨水侵入</li>' +
    '<li>定期检查保温层是否破损，及时修补</li>' +
    '</ul></div>' +
    '</div>' +
    '</div>' +

    // 减震器安装
    '<div class="install-item">' +
    '<h4>🔩 减震器安装与集成</h4>' +
    '<div class="install-detail">' +
    '<p><strong>安装位置：</strong>风机底部、水泵基础、AHU 底座</p>' +
    '<p><strong>安装步骤：</strong></p>' +
    '<ol>' +
    '<li>根据设备重量和减震器数量计算每个减震器的载荷</li>' +
    '<li>将减震器固定在设备底部或基础上（螺栓连接）</li>' +
    '<li>风机段底部设 4 个弹簧减震器，均匀分布在四角</li>' +
    '<li>水泵基础设减震台座（混凝土块 + 减震器），降低振动传递</li>' +
    '<li>AHU 底座设橡胶减震垫，降低振动传递到地面</li>' +
    '<li>安装后检查减震器压缩量是否均匀</li>' +
    '</ol>' +
    '<div class="install-tip"><strong>⚠ 注意事项：</strong>' +
    '<ul>' +
    '<li>减震器载荷 = 设备重量 / 减震器数量 × 1.2（安全系数）</li>' +
    '<li>弹簧减震器需设限位螺栓，防止设备启动时跳动</li>' +
    '<li>减震器安装后，设备水平度 ≤ 0.5mm/m</li>' +
    '<li>定期检查减震器是否老化（橡胶）或疲劳（弹簧），及时更换</li>' +
    '<li>风机和水管软连接不能替代减震器</li>' +
    '</ul></div>' +
    '</div>' +
    '</div>' +

    // 软连接安装
    '<div class="install-item">' +
    '<h4>🔗 软连接安装与集成</h4>' +
    '<div class="install-detail">' +
    '<p><strong>安装位置：</strong>风机出口（帆布软接）、水管进出口（橡胶软接头）</p>' +
    '<p><strong>安装步骤：</strong></p>' +
    '<ol>' +
    '<li>风机出口帆布软接：用法兰连接，螺栓紧固，中间加橡胶密封垫</li>' +
    '<li>水管橡胶软接头：用法兰连接，螺栓对角均匀紧固</li>' +
    '<li>软连接不得扭曲，保持自然状态</li>' +
    '<li>软连接长度 ≥ 200mm（风管）或 150mm（水管）</li>' +
    '<li>安装后检查是否漏风/漏水</li>' +
    '</ol>' +
    '<div class="install-tip"><strong>⚠ 注意事项：</strong>' +
    '<ul>' +
    '<li>软连接不得作为补偿器使用，管道热胀冷缩需另设补偿器</li>' +
    '<li>帆布软接应定期更换（2~3 年），防止老化漏风</li>' +
    '<li>橡胶软接头不得接触油类物质，防止老化</li>' +
    '<li>软连接两侧需设支架，防止重量压在软连接上</li>' +
    '</ul></div>' +
    '</div>' +
    '</div>' +

    // 接水盘/排水系统安装
    '<div class="install-item">' +
    '<h4>🪣 接水盘/排水系统安装与集成</h4>' +
    '<div class="install-detail">' +
    '<p><strong>安装位置：</strong>表冷器段底部、加湿器段底部</p>' +
    '<p><strong>安装步骤：</strong></p>' +
    '<ol>' +
    '<li>将接水盘放置在表冷器段底部，用螺栓固定在箱体上</li>' +
    '<li>检查接水盘坡度（≥ 1%），排水口在最低点</li>' +
    '<li>排水管（PVC-U DN32）从接水盘排水口接出</li>' +
    '<li>排水管设存水弯（P 型，高度 ≥ 50mm），防止负压倒吸</li>' +
    '<li>排水管接至地漏或排水沟</li>' +
    '<li>寒冷地区排水管加伴热带，防止冻结</li>' +
    '</ol>' +
    '<p><strong>管路连接：</strong></p>' +
    '<div class="pipe-diagram">接水盘排水口 → 存水弯（P 型，≥ 50mm）→ PVC-U DN32 排水管 → 地漏</div>' +
    '<div class="install-tip"><strong>⚠ 注意事项：</strong>' +
    '<ul>' +
    '<li>接水盘材质必须为 304 不锈钢（防腐），厚度 ≥ 1.2mm</li>' +
    '<li>存水弯高度必须 ≥ 50mm，否则风机负压会将水倒吸回接水盘</li>' +
    '<li>排水管管径 ≥ DN32，防止堵塞</li>' +
    '<li>接水盘需定期清洗（1~3 个月），防止藻类滋生</li>' +
    '<li>调试时向接水盘注水，检查排水是否畅通、有无积水</li>' +
    '</ul></div>' +
    '</div>' +
    '</div>' +

    // 检修门/观察窗安装
    '<div class="install-item">' +
    '<h4>🚪 检修门/观察窗安装与集成</h4>' +
    '<div class="install-detail">' +
    '<p><strong>安装位置：</strong>每个功能段侧面（过滤器段、表冷器段、风机段、加湿段等）</p>' +
    '<p><strong>安装步骤：</strong></p>' +
    '<ol>' +
    '<li>在 AHU 箱体侧面开孔（尺寸按检修门规格）</li>' +
    '<li>将检修门框固定在箱体开口处（螺栓连接）</li>' +
    '<li>检修门铰链安装在门框上，确保开关灵活</li>' +
    '<li>门框与箱体之间用硅酮密封胶密封</li>' +
    '<li>观察窗安装在需要观察的段（风机段、加湿段等）</li>' +
    '<li>观察窗内侧安装 LED 照明灯（24V DC）</li>' +
    '</ol>' +
    '<div class="install-tip"><strong>⚠ 注意事项：</strong>' +
    '<ul>' +
    '<li>检修门尺寸：过滤器段 ≥ 600×600mm，表冷器段 ≥ 600×600mm</li>' +
    '<li>检修门密封条必须完好，确保不漏风</li>' +
    '<li>观察窗用双层钢化玻璃（防结露），不得用单层玻璃</li>' +
    '<li>检修门锁扣带锁孔，防止运行时误开</li>' +
    '<li>每个功能段至少设一个检修门，方便维护</li>' +
    '</ul></div>' +
    '</div>' +
    '</div>' +

    // 压差开关/流量计/压力表安装
    '<div class="install-item">' +
    '<h4>📊 压差开关/流量计/压力表安装与集成</h4>' +
    '<div class="install-detail">' +
    '<p><strong>安装位置：</strong>过滤器前后（压差开关）、水管上（流量计/压力表）</p>' +
    '<p><strong>安装步骤：</strong></p>' +
    '<ol>' +
    '<li>压差开关：在过滤器前后风管上各开一个取压孔（φ6mm）</li>' +
    '<li>用硅胶管将取压孔连接到压差开关的高/低压端</li>' +
    '<li>设定压差开关报警值（250Pa），超过时报警提示更换过滤器</li>' +
    '<li>流量计：在水管上切割安装（电磁流量计需满管条件）</li>' +
    '<li>压力表：在水管上开孔，安装压力表接头（G1/4 螺纹）</li>' +
    '<li>温度计：在水管上开孔，安装温度传感器套管</li>' +
    '</ol>' +
    '<p><strong>电气连接：</strong></p>' +
    '<div class="wire-diagram">压差开关 → PLC DI（报警信号）</div>' +
    '<div class="wire-diagram">压差变送器 → PLC AI（0~10V，0~1000Pa）</div>' +
    '<div class="wire-diagram">流量计 → PLC AI（4~20mA 或 Modbus）</div>' +
    '<div class="install-tip"><strong>⚠ 注意事项：</strong>' +
    '<ul>' +
    '<li>取压孔应垂直于气流方向，孔口平整无毛刺</li>' +
    '<li>硅胶管不得折弯或压扁，否则影响测量精度</li>' +
    '<li>电磁流量计前后需有直管段（前 10D 后 5D，D 为管径）</li>' +
    '<li>压力表量程为工作压力的 1.5~2 倍，精度 1.6 级</li>' +
    '<li>定期校验仪表（每年一次），确保测量准确</li>' +
    '</ul></div>' +
    '</div>' +
    '</div>' +

    // 箱体/框架安装
    '<div class="install-item">' +
    '<h4>🏗 AHU 箱体/框架安装与集成</h4>' +
    '<div class="install-detail">' +
    '<p><strong>安装位置：</strong>AHU 整体组装</p>' +
    '<p><strong>安装步骤：</strong></p>' +
    '<ol>' +
    '<li>将底座（槽钢 10#）放置在地面上，用水平仪找平</li>' +
    '<li>在底座上组装框架（铝合金型材 40×40mm），用角件连接</li>' +
    '<li>安装箱体面板（304 不锈钢 1.5mm + 50mm 聚氨酯 + 1.0mm 内板）</li>' +
    '<li>面板之间用铝合金型材连接，接缝处用硅酮密封胶密封</li>' +
    '<li>安装检修门、观察窗、进/出风口法兰</li>' +
    '<li>安装各功能段内部元件（过滤器、表冷器、加热器、加湿器、风机等）</li>' +
    '<li>整体检漏：风机运行，用烟雾法检查接缝处是否漏风</li>' +
    '</ol>' +
    '<div class="install-tip"><strong>⚠ 注意事项：</strong>' +
    '<ul>' +
    '<li>箱体漏风率 ≤ 1%（GB/T 14294 要求），接缝处必须密封</li>' +
    '<li>箱体强度：承受 2000Pa 正压不变形</li>' +
    '<li>底座高度 ≥ 150mm，方便接管和排水</li>' +
    '<li>框架连接角件必须紧固，防止箱体变形</li>' +
    '<li>面板保温层密度 ≥ 40 kg/m³，确保保温效果</li>' +
    '<li>组装完成后进行漏风测试，不合格处重新密封</li>' +
    '</ul></div>' +
    '</div>' +
    '</div>' +

    // 整体接线图
    '<div class="install-item">' +
    '<h4>📊 系统整体连接关系图</h4>' +
    '<div class="system-diagram">' +
    '<div class="diagram-block">' +
    '<h5>气流路径</h5>' +
    '<p>室外空气 → 进风口 → G4 过滤器 → 表冷器（降温除湿）→ 加热器（升温调温）→ 加湿器（调湿）→ 送风机 → 出风口 → 测试台</p>' +
    '</div>' +
    '<div class="diagram-block">' +
    '<h5>水路系统</h5>' +
    '<p>冷冻水供水 → 电动阀 → 表冷器 → 冷冻水回水</p>' +
    '</div>' +
    '<div class="diagram-block">' +
    '<h5>电气控制系统</h5>' +
    '<p>传感器（温度/湿度/压差）→ PLC → 执行器（电动阀/变频器/加热器/加湿器）</p>' +
    '<p>触摸屏 → PLC（设定参数/显示状态/报警记录）</p>' +
    '</div>' +
    '</div>' +
    '</div>' +

    // ===== 详细工艺流程图 =====
    '<div class="install-item">' +
    '<h4>\ud83d\udd04 AHU 空气处理工艺流程图（PFD）</h4>' +
    '<div class="process-flow-container">' +
    '<svg class="process-flow-svg" viewBox="0 0 1200 600" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
    '<marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#3182ce"/></marker>' +
    '<linearGradient id="boxGrad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#ebf8ff"/><stop offset="100%" stop-color="#bee3f8"/></linearGradient>' +
    '<linearGradient id="boxGradGreen" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#f0fff4"/><stop offset="100%" stop-color="#c6f6d5"/></linearGradient>' +
    '<linearGradient id="boxGradOrange" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#fffaf0"/><stop offset="100%" stop-color="#feebc8"/></linearGradient>' +
    '</defs>' +
    '<text x="600" y="30" text-anchor="middle" font-size="16" font-weight="bold" fill="#2d3748">AHU 空气处理工艺流程图（Process Flow Diagram）</text>' +
    '<rect x="30" y="80" width="120" height="60" rx="8" fill="url(#boxGrad)" stroke="#3182ce" stroke-width="2"/>' +
    '<text x="90" y="105" text-anchor="middle" font-size="12" font-weight="bold" fill="#2d3748">1. 进风口</text>' +
    '<text x="90" y="122" text-anchor="middle" font-size="9" fill="#4a5568">室外新风</text>' +
    '<text x="90" y="155" text-anchor="middle" font-size="8" fill="#718096">T1/RH1 测量点</text>' +
    '<line x1="150" y1="110" x2="190" y2="110" stroke="#3182ce" stroke-width="2" marker-end="url(#arrowhead)"/>' +
    '<rect x="190" y="80" width="120" height="60" rx="8" fill="url(#boxGrad)" stroke="#3182ce" stroke-width="2"/>' +
    '<text x="250" y="105" text-anchor="middle" font-size="12" font-weight="bold" fill="#2d3748">2. 初效过滤器</text>' +
    '<text x="250" y="122" text-anchor="middle" font-size="9" fill="#4a5568">G4 袋式</text>' +
    '<text x="250" y="155" text-anchor="middle" font-size="8" fill="#718096">DP 压差监测</text>' +
    '<line x1="310" y1="110" x2="350" y2="110" stroke="#3182ce" stroke-width="2" marker-end="url(#arrowhead)"/>' +
    '<rect x="350" y="80" width="120" height="60" rx="8" fill="url(#boxGrad)" stroke="#3182ce" stroke-width="2"/>' +
    '<text x="410" y="105" text-anchor="middle" font-size="12" font-weight="bold" fill="#2d3748">3. 表冷器</text>' +
    '<text x="410" y="122" text-anchor="middle" font-size="9" fill="#4a5568">6~8排管</text>' +
    '<text x="410" y="155" text-anchor="middle" font-size="8" fill="#718096">降温除湿</text>' +
    '<line x1="410" y1="140" x2="410" y2="200" stroke="#3182ce" stroke-width="1.5" stroke-dasharray="4,3"/>' +
    '<rect x="350" y="200" width="120" height="50" rx="6" fill="#e6fffa" stroke="#38b2ac" stroke-width="1.5"/>' +
    '<text x="410" y="220" text-anchor="middle" font-size="10" font-weight="bold" fill="#234e52">冷冻水系统</text>' +
    '<text x="410" y="235" text-anchor="middle" font-size="8" fill="#2c7a7a">供水 7C - 回水 12C</text>' +
    '<line x1="470" y1="110" x2="510" y2="110" stroke="#3182ce" stroke-width="2" marker-end="url(#arrowhead)"/>' +
    '<rect x="510" y="80" width="120" height="60" rx="8" fill="url(#boxGradOrange)" stroke="#dd6b20" stroke-width="2"/>' +
    '<text x="570" y="105" text-anchor="middle" font-size="12" font-weight="bold" fill="#2d3748">4. 电加热器</text>' +
    '<text x="570" y="122" text-anchor="middle" font-size="9" fill="#4a5568">不锈钢发热管</text>' +
    '<text x="570" y="155" text-anchor="middle" font-size="8" fill="#718096">升温调温</text>' +
    '<line x1="570" y1="140" x2="570" y2="200" stroke="#dd6b20" stroke-width="1.5" stroke-dasharray="4,3"/>' +
    '<rect x="510" y="200" width="120" height="50" rx="6" fill="#fff5eb" stroke="#dd6b20" stroke-width="1.5"/>' +
    '<text x="570" y="220" text-anchor="middle" font-size="10" font-weight="bold" fill="#744210">电加热系统</text>' +
    '<text x="570" y="235" text-anchor="middle" font-size="8" fill="#975a16">SSR 可控硅调功</text>' +
    '<line x1="630" y1="110" x2="670" y2="110" stroke="#3182ce" stroke-width="2" marker-end="url(#arrowhead)"/>' +
    '<rect x="670" y="80" width="120" height="60" rx="8" fill="url(#boxGradGreen)" stroke="#38a169" stroke-width="2"/>' +
    '<text x="730" y="105" text-anchor="middle" font-size="12" font-weight="bold" fill="#2d3748">5. 加湿器</text>' +
    '<text x="730" y="122" text-anchor="middle" font-size="9" fill="#4a5568">电极式/湿膜</text>' +
    '<text x="730" y="155" text-anchor="middle" font-size="8" fill="#718096">调湿</text>' +
    '<line x1="730" y1="140" x2="730" y2="200" stroke="#38a169" stroke-width="1.5" stroke-dasharray="4,3"/>' +
    '<rect x="670" y="200" width="120" height="50" rx="6" fill="#f0fff4" stroke="#38a169" stroke-width="1.5"/>' +
    '<text x="730" y="220" text-anchor="middle" font-size="10" font-weight="bold" fill="#276749">加湿水系统</text>' +
    '<text x="730" y="235" text-anchor="middle" font-size="8" fill="#2f855a">自来水/循环水</text>' +
    '<line x1="790" y1="110" x2="830" y2="110" stroke="#3182ce" stroke-width="2" marker-end="url(#arrowhead)"/>' +
    '<rect x="830" y="80" width="120" height="60" rx="8" fill="url(#boxGrad)" stroke="#3182ce" stroke-width="2"/>' +
    '<text x="890" y="105" text-anchor="middle" font-size="12" font-weight="bold" fill="#2d3748">6. 送风机</text>' +
    '<text x="890" y="122" text-anchor="middle" font-size="9" fill="#4a5568">离心变频</text>' +
    '<text x="890" y="155" text-anchor="middle" font-size="8" fill="#718096">风量调节</text>' +
    '<line x1="890" y1="140" x2="890" y2="200" stroke="#805ad5" stroke-width="1.5" stroke-dasharray="4,3"/>' +
    '<rect x="830" y="200" width="120" height="50" rx="6" fill="#faf5ff" stroke="#805ad5" stroke-width="1.5"/>' +
    '<text x="890" y="220" text-anchor="middle" font-size="10" font-weight="bold" fill="#553c9a">变频器控制</text>' +
    '<text x="890" y="235" text-anchor="middle" font-size="8" fill="#6b46c1">0~50Hz 调节</text>' +
    '<line x1="950" y1="110" x2="990" y2="110" stroke="#3182ce" stroke-width="2" marker-end="url(#arrowhead)"/>' +
    '<rect x="990" y="80" width="120" height="60" rx="8" fill="url(#boxGradGreen)" stroke="#38a169" stroke-width="2"/>' +
    '<text x="1050" y="105" text-anchor="middle" font-size="12" font-weight="bold" fill="#2d3748">7. 出风口</text>' +
    '<text x="1050" y="122" text-anchor="middle" font-size="9" fill="#4a5568">接测试台</text>' +
    '<text x="1050" y="155" text-anchor="middle" font-size="8" fill="#718096">T2/RH2 测量点</text>' +
    '<rect x="30" y="280" width="1140" height="120" rx="10" fill="#f7fafc" stroke="#cbd5e0" stroke-width="2" stroke-dasharray="6,4"/>' +
    '<text x="600" y="305" text-anchor="middle" font-size="14" font-weight="bold" fill="#2d3748">PLC 闭环控制回路</text>' +
    '<rect x="60" y="320" width="180" height="60" rx="8" fill="#ebf8ff" stroke="#3182ce" stroke-width="1.5"/>' +
    '<text x="150" y="345" text-anchor="middle" font-size="11" font-weight="bold" fill="#2d3748">传感器采集</text>' +
    '<text x="150" y="362" text-anchor="middle" font-size="9" fill="#4a5568">T1/RH1/T2/RH2/DP</text>' +
    '<line x1="240" y1="350" x2="320" y2="350" stroke="#3182ce" stroke-width="2" marker-end="url(#arrowhead)"/>' +
    '<rect x="320" y="320" width="180" height="60" rx="8" fill="#e9d8fd" stroke="#805ad5" stroke-width="1.5"/>' +
    '<text x="410" y="345" text-anchor="middle" font-size="11" font-weight="bold" fill="#2d3748">PLC 控制器</text>' +
    '<text x="410" y="362" text-anchor="middle" font-size="9" fill="#4a5568">PID 运算/逻辑控制</text>' +
    '<line x1="500" y1="350" x2="580" y2="350" stroke="#805ad5" stroke-width="2" marker-end="url(#arrowhead)"/>' +
    '<rect x="580" y="320" width="180" height="60" rx="8" fill="#c6f6d5" stroke="#38a169" stroke-width="1.5"/>' +
    '<text x="670" y="345" text-anchor="middle" font-size="11" font-weight="bold" fill="#2d3748">执行器动作</text>' +
    '<text x="670" y="362" text-anchor="middle" font-size="9" fill="#4a5568">电动阀/变频器/加热器</text>' +
    '<line x1="760" y1="350" x2="840" y2="350" stroke="#38a169" stroke-width="2" marker-end="url(#arrowhead)"/>' +
    '<rect x="840" y="320" width="180" height="60" rx="8" fill="#feebc8" stroke="#dd6b20" stroke-width="1.5"/>' +
    '<text x="930" y="345" text-anchor="middle" font-size="11" font-weight="bold" fill="#2d3748">触摸屏 HMI</text>' +
    '<text x="930" y="362" text-anchor="middle" font-size="9" fill="#4a5568">参数设定/状态显示</text>' +
    '<path d="M 670 380 L 670 420 L 150 420 L 150 380" fill="none" stroke="#718096" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#arrowhead)"/>' +
    '<text x="410" y="435" text-anchor="middle" font-size="9" fill="#718096">反馈回路：执行器动作 - 空气参数变化 - 传感器重新采集</text>' +
    '<rect x="30" y="460" width="1140" height="120" rx="10" fill="#fff5f5" stroke="#fc8181" stroke-width="2" stroke-dasharray="6,4"/>' +
    '<text x="600" y="485" text-anchor="middle" font-size="14" font-weight="bold" fill="#c53030">安全联锁保护回路</text>' +
    '<rect x="60" y="500" width="220" height="60" rx="6" fill="#fed7d7" stroke="#fc8181" stroke-width="1"/>' +
    '<text x="170" y="520" text-anchor="middle" font-size="10" font-weight="bold" fill="#742a2a">过滤器压差报警</text>' +
    '<text x="170" y="535" text-anchor="middle" font-size="8" fill="#9b2c2c">DP &gt; 250Pa - 报警</text>' +
    '<text x="170" y="548" text-anchor="middle" font-size="8" fill="#9b2c2c">提示更换过滤器</text>' +
    '<rect x="310" y="500" width="220" height="60" rx="6" fill="#fed7d7" stroke="#fc8181" stroke-width="1"/>' +
    '<text x="420" y="520" text-anchor="middle" font-size="10" font-weight="bold" fill="#742a2a">防冻保护</text>' +
    '<text x="420" y="535" text-anchor="middle" font-size="8" fill="#9b2c2c">表冷器出口 T &lt; 5C</text>' +
    '<text x="420" y="548" text-anchor="middle" font-size="8" fill="#9b2c2c">- 关闭冷水阀</text>' +
    '<rect x="560" y="500" width="220" height="60" rx="6" fill="#fed7d7" stroke="#fc8181" stroke-width="1"/>' +
    '<text x="670" y="520" text-anchor="middle" font-size="10" font-weight="bold" fill="#742a2a">超温保护</text>' +
    '<text x="670" y="535" text-anchor="middle" font-size="8" fill="#9b2c2c">加热器出口 T &gt; 设定值</text>' +
    '<text x="670" y="548" text-anchor="middle" font-size="8" fill="#9b2c2c">- 切断加热电源</text>' +
    '<rect x="810" y="500" width="220" height="60" rx="6" fill="#fed7d7" stroke="#fc8181" stroke-width="1"/>' +
    '<text x="920" y="520" text-anchor="middle" font-size="10" font-weight="bold" fill="#742a2a">风机过载保护</text>' +
    '<text x="920" y="535" text-anchor="middle" font-size="8" fill="#9b2c2c">风机电流 &gt; 额定值</text>' +
    '<text x="920" y="548" text-anchor="middle" font-size="8" fill="#9b2c2c">- 热继电器跳闸停机</text>' +
    '</svg>' +
    '</div>' +
    '<div class="install-tip"><strong>📖 工艺流程说明：</strong>' +
    '<ul>' +
    '<li><strong>空气处理流程：</strong>室外新风经过进风口进入 AHU，依次经过初效过滤（去除大颗粒灰尘）、表冷器（降温除湿）、加热器（升温调温）、加湿器（调节湿度），最后由送风机送入测试台</li>' +
    '<li><strong>控制逻辑：</strong>入口温湿度传感器（T1/RH1）和出口温湿度传感器（T2/RH2）实时采集空气参数，PLC 根据设定值与实测值的偏差进行 PID 运算，输出控制信号调节电动阀开度、变频器频率、加热器功率和加湿量</li>' +
    '<li><strong>安全联锁：</strong>系统设有多重安全保护，包括过滤器压差报警、防冻保护、超温保护和风机过载保护，确保设备安全运行</li>' +
    '</ul></div>' +
    '</div>' +

    // 水系统工艺流程图
    '<div class="install-item">' +
    '<h4>💧 水系统工艺流程图（P&ID）</h4>' +
    '<div class="process-flow-container">' +
    '<svg class="process-flow-svg" viewBox="0 0 1200 500" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
    '<marker id="arrow-blue" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#3182ce"/></marker>' +
    '<marker id="arrow-red" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#e53e3e"/></marker>' +
    '</defs>' +
    '<text x="600" y="30" text-anchor="middle" font-size="16" font-weight="bold" fill="#2d3748">水系统工艺流程图（Piping & Instrumentation Diagram）</text>' +
    '<text x="300" y="70" text-anchor="middle" font-size="14" font-weight="bold" fill="#2b6cb0">冷冻水系统（供水 7℃ / 回水 12℃）</text>' +
    '<rect x="30" y="90" width="100" height="50" rx="6" fill="#ebf8ff" stroke="#3182ce" stroke-width="2"/>' +
    '<text x="80" y="110" text-anchor="middle" font-size="11" font-weight="bold" fill="#2d3748">冷源</text>' +
    '<text x="80" y="125" text-anchor="middle" font-size="9" fill="#4a5568">7℃ 供水</text>' +
    '<line x1="130" y1="115" x2="200" y2="115" stroke="#3182ce" stroke-width="3" marker-end="url(#arrow-blue)"/>' +
    '<text x="165" y="108" text-anchor="middle" font-size="8" fill="#3182ce">供水管</text>' +
    '<rect x="200" y="90" width="80" height="50" rx="6" fill="#ebf8ff" stroke="#3182ce" stroke-width="1.5"/>' +
    '<text x="240" y="110" text-anchor="middle" font-size="10" font-weight="bold" fill="#2d3748">Y型过滤器</text>' +
    '<text x="240" y="125" text-anchor="middle" font-size="8" fill="#4a5568">20目</text>' +
    '<line x1="280" y1="115" x2="350" y2="115" stroke="#3182ce" stroke-width="3" marker-end="url(#arrow-blue)"/>' +
    '<rect x="350" y="90" width="80" height="50" rx="6" fill="#ebf8ff" stroke="#3182ce" stroke-width="1.5"/>' +
    '<text x="390" y="110" text-anchor="middle" font-size="10" font-weight="bold" fill="#2d3748">电动调节阀</text>' +
    '<text x="390" y="125" text-anchor="middle" font-size="8" fill="#4a5568">0~10V</text>' +
    '<line x1="430" y1="115" x2="500" y2="115" stroke="#3182ce" stroke-width="3" marker-end="url(#arrow-blue)"/>' +
    '<circle cx="465" cy="95" r="12" fill="#fff" stroke="#3182ce" stroke-width="1.5"/>' +
    '<text x="465" y="99" text-anchor="middle" font-size="8" fill="#3182ce">PI</text>' +
    '<circle cx="465" cy="135" r="12" fill="#fff" stroke="#3182ce" stroke-width="1.5"/>' +
    '<text x="465" y="139" text-anchor="middle" font-size="8" fill="#3182ce">TI</text>' +
    '<rect x="500" y="80" width="120" height="70" rx="8" fill="#bee3f8" stroke="#2b6cb0" stroke-width="2"/>' +
    '<text x="560" y="105" text-anchor="middle" font-size="12" font-weight="bold" fill="#2d3748">表冷器</text>' +
    '<text x="560" y="122" text-anchor="middle" font-size="9" fill="#2b6cb0">6~8排管</text>' +
    '<text x="560" y="137" text-anchor="middle" font-size="8" fill="#4a5568">降温除湿</text>' +
    '<line x1="620" y1="115" x2="690" y2="115" stroke="#63b3ed" stroke-width="3" marker-end="url(#arrow-blue)"/>' +
    '<text x="655" y="108" text-anchor="middle" font-size="8" fill="#63b3ed">回水管</text>' +
    '<circle cx="655" cy="135" r="12" fill="#fff" stroke="#63b3ed" stroke-width="1.5"/>' +
    '<text x="655" y="139" text-anchor="middle" font-size="8" fill="#63b3ed">TI</text>' +
    '<line x1="690" y1="115" x2="760" y2="115" stroke="#63b3ed" stroke-width="3" marker-end="url(#arrow-blue)"/>' +
    '<rect x="760" y="90" width="100" height="50" rx="6" fill="#ebf8ff" stroke="#3182ce" stroke-width="1.5"/>' +
    '<text x="810" y="110" text-anchor="middle" font-size="10" font-weight="bold" fill="#2d3748">回水总管</text>' +
    '<text x="810" y="125" text-anchor="middle" font-size="9" fill="#4a5568">12℃ 回水</text>' +
    '<line x1="860" y1="115" x2="950" y2="115" stroke="#63b3ed" stroke-width="2" stroke-dasharray="4,3"/>' +
    '<line x1="950" y1="115" x2="950" y2="200" stroke="#63b3ed" stroke-width="2" stroke-dasharray="4,3"/>' +
    '<line x1="950" y1="200" x2="130" y2="200" stroke="#63b3ed" stroke-width="2" stroke-dasharray="4,3"/>' +
    '<line x1="130" y1="200" x2="130" y2="140" stroke="#63b3ed" stroke-width="2" stroke-dasharray="4,3" marker-end="url(#arrow-blue)"/>' +
    '<text x="540" y="215" text-anchor="middle" font-size="9" fill="#63b3ed">回水至冷源（冷却塔/冷水机组）</text>' +
    '<text x="300" y="260" text-anchor="middle" font-size="14" font-weight="bold" fill="#dd6b20">电加热系统（SSR 可控硅调功）</text>' +
    '<rect x="30" y="280" width="120" height="70" rx="8" fill="#fffaf0" stroke="#dd6b20" stroke-width="2"/>' +
    '<text x="90" y="305" text-anchor="middle" font-size="12" font-weight="bold" fill="#2d3748">配电柜</text>' +
    '<text x="90" y="322" text-anchor="middle" font-size="9" fill="#dd6b20">380V/50Hz</text>' +
    '<text x="90" y="337" text-anchor="middle" font-size="8" fill="#4a5568">独立回路</text>' +
    '<line x1="150" y1="315" x2="220" y2="315" stroke="#dd6b20" stroke-width="3" marker-end="url(#arrow-red)"/>' +
    '<text x="185" y="308" text-anchor="middle" font-size="8" fill="#dd6b20">电源线</text>' +
    '<rect x="220" y="280" width="120" height="70" rx="8" fill="#fffaf0" stroke="#dd6b20" stroke-width="2"/>' +
    '<text x="280" y="305" text-anchor="middle" font-size="12" font-weight="bold" fill="#2d3748">可控硅调功器</text>' +
    '<text x="280" y="322" text-anchor="middle" font-size="9" fill="#dd6b20">SSR</text>' +
    '<text x="280" y="337" text-anchor="middle" font-size="8" fill="#4a5568">0~10V 控制</text>' +
    '<line x1="340" y1="315" x2="410" y2="315" stroke="#dd6b20" stroke-width="3" marker-end="url(#arrow-red)"/>' +
    '<rect x="410" y="270" width="140" height="90" rx="8" fill="#feebc8" stroke="#dd6b20" stroke-width="2"/>' +
    '<text x="480" y="295" text-anchor="middle" font-size="12" font-weight="bold" fill="#2d3748">电加热器</text>' +
    '<text x="480" y="312" text-anchor="middle" font-size="9" fill="#dd6b20">不锈钢发热管</text>' +
    '<text x="480" y="327" text-anchor="middle" font-size="9" fill="#dd6b20">表面负荷 ≤3W/cm²</text>' +
    '<text x="480" y="342" text-anchor="middle" font-size="8" fill="#4a5568">升温调温</text>' +
    '<line x1="480" y1="360" x2="480" y2="400" stroke="#dd6b20" stroke-width="1.5" stroke-dasharray="4,3"/>' +
    '<rect x="420" y="400" width="120" height="50" rx="6" fill="#fed7d7" stroke="#e53e3e" stroke-width="1.5"/>' +
    '<text x="480" y="420" text-anchor="middle" font-size="10" font-weight="bold" fill="#c53030">超温保护</text>' +
    '<text x="480" y="435" text-anchor="middle" font-size="8" fill="#9b2c2c">80℃ 切断电源</text>' +
    '<rect x="600" y="280" width="120" height="70" rx="8" fill="#e9d8fd" stroke="#805ad5" stroke-width="2"/>' +
    '<text x="660" y="305" text-anchor="middle" font-size="12" font-weight="bold" fill="#2d3748">PLC 控制</text>' +
    '<text x="660" y="322" text-anchor="middle" font-size="9" fill="#805ad5">PID 运算</text>' +
    '<text x="660" y="337" text-anchor="middle" font-size="8" fill="#4a5568">0~10V 输出</text>' +
    '<line x1="600" y1="315" x2="550" y2="315" stroke="#805ad5" stroke-width="1.5" stroke-dasharray="4,3"/>' +
    '<text x="575" y="308" text-anchor="middle" font-size="8" fill="#805ad5">控制信号</text>' +
    '<rect x="780" y="280" width="120" height="70" rx="8" fill="#ebf8ff" stroke="#3182ce" stroke-width="2"/>' +
    '<text x="840" y="305" text-anchor="middle" font-size="12" font-weight="bold" fill="#2d3748">出口温度传感器</text>' +
    '<text x="840" y="322" text-anchor="middle" font-size="9" fill="#3182ce">PT100</text>' +
    '<text x="840" y="337" text-anchor="middle" font-size="8" fill="#4a5568">反馈至 PLC</text>' +
    '<line x1="780" y1="315" x2="720" y2="315" stroke="#3182ce" stroke-width="1.5" stroke-dasharray="4,3"/>' +
    '<text x="750" y="308" text-anchor="middle" font-size="8" fill="#3182ce">温度反馈</text>' +
    '<rect x="950" y="280" width="120" height="70" rx="8" fill="#faf5ff" stroke="#805ad5" stroke-width="2"/>' +
    '<text x="1010" y="305" text-anchor="middle" font-size="12" font-weight="bold" fill="#2d3748">触摸屏 HMI</text>' +
    '<text x="1010" y="322" text-anchor="middle" font-size="9" fill="#805ad5">参数设定</text>' +
    '<text x="1010" y="337" text-anchor="middle" font-size="8" fill="#4a5568">状态显示</text>' +
    '<line x1="950" y1="315" x2="900" y2="315" stroke="#805ad5" stroke-width="1.5" stroke-dasharray="4,3"/>' +
    '<rect x="950" y="400" width="220" height="80" rx="6" fill="#f7fafc" stroke="#cbd5e0" stroke-width="1"/>' +
    '<text x="1060" y="420" text-anchor="middle" font-size="11" font-weight="bold" fill="#2d3748">图例</text>' +
    '<line x1="960" y1="435" x2="1000" y2="435" stroke="#3182ce" stroke-width="3"/>' +
    '<text x="1010" y="439" font-size="8" fill="#4a5568">冷冻水管（蓝色）</text>' +
    '<line x1="960" y1="450" x2="1000" y2="450" stroke="#dd6b20" stroke-width="3"/>' +
    '<text x="1010" y="454" font-size="8" fill="#4a5568">电加热电源线（橙色）</text>' +
    '<circle cx="975" cy="468" r="8" fill="#fff" stroke="#3182ce" stroke-width="1.5"/>' +
    '<text x="975" y="471" text-anchor="middle" font-size="7" fill="#3182ce">TI</text>' +
    '<text x="1010" y="471" font-size="8" fill="#4a5568">温度计/压力表</text>' +
    '</svg>' +
    '</div>' +
    '<div class="install-tip"><strong>📖 水系统说明：</strong>' +
    '<ul>' +
    '<li><strong>冷冻水系统：</strong>冷水机组提供 7℃ 冷冻水，经 Y 型过滤器（防止杂质堵塞铜管）、电动调节阀（PLC 控制开度）进入表冷器，吸收空气热量后升温至 12℃ 回水，返回冷水机组重新冷却</li>' +
    '<li><strong>电加热系统：</strong>配电柜提供 380V/50Hz 电源，经可控硅调功器（SSR）调节功率后供给电加热器，PLC 根据出口温度 PID 运算输出 0~10V 控制信号，实现精确调温</li>' +
    '<li><strong>超温保护：</strong>加热器出口设超温保护开关（设定 80℃），超温时自动切断加热电源，确保安全</li>' +
    '</ul></div>' +
    '</div>' +

    // 电气控制流程图
    '<div class="install-item">' +
    '<h4>⚡ 电气控制流程图</h4>' +
    '<div class="process-flow-container">' +
    '<svg class="process-flow-svg" viewBox="0 0 1200 550" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
    '<marker id="arrow-purple" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#805ad5"/></marker>' +
    '</defs>' +
    '<text x="600" y="30" text-anchor="middle" font-size="16" font-weight="bold" fill="#2d3748">电气控制流程图（Control Logic Diagram）</text>' +
    '<rect x="500" y="50" width="200" height="50" rx="8" fill="#fff5f5" stroke="#e53e3e" stroke-width="2"/>' +
    '<text x="600" y="70" text-anchor="middle" font-size="12" font-weight="bold" fill="#2d3748">主电源 380V/50Hz</text>' +
    '<text x="600" y="87" text-anchor="middle" font-size="9" fill="#4a5568">三相五线制（L1/L2/L3/N/PE）</text>' +
    '<line x1="600" y1="100" x2="600" y2="140" stroke="#e53e3e" stroke-width="2" marker-end="url(#arrow-purple)"/>' +
    '<rect x="500" y="140" width="200" height="40" rx="6" fill="#fed7d7" stroke="#e53e3e" stroke-width="1.5"/>' +
    '<text x="600" y="165" text-anchor="middle" font-size="11" font-weight="bold" fill="#2d3748">总断路器 QF0</text>' +
    '<line x1="600" y1="180" x2="600" y2="210" stroke="#e53e3e" stroke-width="2"/>' +
    '<line x1="100" y1="210" x2="1100" y2="210" stroke="#e53e3e" stroke-width="2"/>' +
    '<line x1="200" y1="210" x2="200" y2="240" stroke="#e53e3e" stroke-width="2" marker-end="url(#arrow-purple)"/>' +
    '<rect x="100" y="240" width="200" height="40" rx="6" fill="#e9d8fd" stroke="#805ad5" stroke-width="1.5"/>' +
    '<text x="200" y="265" text-anchor="middle" font-size="11" font-weight="bold" fill="#2d3748">风机回路 QF1</text>' +
    '<line x1="200" y1="280" x2="200" y2="310" stroke="#805ad5" stroke-width="1.5" marker-end="url(#arrow-purple)"/>' +
    '<rect x="100" y="310" width="200" height="40" rx="6" fill="#e9d8fd" stroke="#805ad5" stroke-width="1.5"/>' +
    '<text x="200" y="335" text-anchor="middle" font-size="10" font-weight="bold" fill="#2d3748">接触器 KM1 + 变频器</text>' +
    '<line x1="200" y1="350" x2="200" y2="380" stroke="#805ad5" stroke-width="1.5" marker-end="url(#arrow-purple)"/>' +
    '<rect x="100" y="380" width="200" height="40" rx="6" fill="#e9d8fd" stroke="#805ad5" stroke-width="1.5"/>' +
    '<text x="200" y="405" text-anchor="middle" font-size="11" font-weight="bold" fill="#2d3748">送风机电机</text>' +
    '<line x1="400" y1="210" x2="400" y2="240" stroke="#e53e3e" stroke-width="2" marker-end="url(#arrow-purple)"/>' +
    '<rect x="300" y="240" width="200" height="40" rx="6" fill="#ebf8ff" stroke="#3182ce" stroke-width="1.5"/>' +
    '<text x="400" y="265" text-anchor="middle" font-size="11" font-weight="bold" fill="#2d3748">表冷器回路 QF2</text>' +
    '<line x1="400" y1="280" x2="400" y2="310" stroke="#3182ce" stroke-width="1.5" marker-end="url(#arrow-purple)"/>' +
    '<rect x="300" y="310" width="200" height="40" rx="6" fill="#ebf8ff" stroke="#3182ce" stroke-width="1.5"/>' +
    '<text x="400" y="335" text-anchor="middle" font-size="10" font-weight="bold" fill="#2d3748">电动调节阀 + 水泵</text>' +
    '<line x1="600" y1="210" x2="600" y2="240" stroke="#e53e3e" stroke-width="2" marker-end="url(#arrow-purple)"/>' +
    '<rect x="500" y="240" width="200" height="40" rx="6" fill="#fffaf0" stroke="#dd6b20" stroke-width="1.5"/>' +
    '<text x="600" y="265" text-anchor="middle" font-size="11" font-weight="bold" fill="#2d3748">加热器回路 QF3</text>' +
    '<line x1="600" y1="280" x2="600" y2="310" stroke="#dd6b20" stroke-width="1.5" marker-end="url(#arrow-purple)"/>' +
    '<rect x="500" y="310" width="200" height="40" rx="6" fill="#fffaf0" stroke="#dd6b20" stroke-width="1.5"/>' +
    '<text x="600" y="335" text-anchor="middle" font-size="10" font-weight="bold" fill="#2d3748">可控硅调功器 SSR</text>' +
    '<line x1="600" y1="350" x2="600" y2="380" stroke="#dd6b20" stroke-width="1.5" marker-end="url(#arrow-purple)"/>' +
    '<rect x="500" y="380" width="200" height="40" rx="6" fill="#fffaf0" stroke="#dd6b20" stroke-width="1.5"/>' +
    '<text x="600" y="405" text-anchor="middle" font-size="11" font-weight="bold" fill="#2d3748">电加热管</text>' +
    '<line x1="800" y1="210" x2="800" y2="240" stroke="#e53e3e" stroke-width="2" marker-end="url(#arrow-purple)"/>' +
    '<rect x="700" y="240" width="200" height="40" rx="6" fill="#f0fff4" stroke="#38a169" stroke-width="1.5"/>' +
    '<text x="800" y="265" text-anchor="middle" font-size="11" font-weight="bold" fill="#2d3748">加湿器回路 QF4</text>' +
    '<line x1="800" y1="280" x2="800" y2="310" stroke="#38a169" stroke-width="1.5" marker-end="url(#arrow-purple)"/>' +
    '<rect x="700" y="310" width="200" height="40" rx="6" fill="#f0fff4" stroke="#38a169" stroke-width="1.5"/>' +
    '<text x="800" y="335" text-anchor="middle" font-size="10" font-weight="bold" fill="#2d3748">加湿器电极/水泵</text>' +
    '<line x1="1000" y1="210" x2="1000" y2="240" stroke="#e53e3e" stroke-width="2" marker-end="url(#arrow-purple)"/>' +
    '<rect x="900" y="240" width="200" height="40" rx="6" fill="#faf5ff" stroke="#805ad5" stroke-width="1.5"/>' +
    '<text x="1000" y="265" text-anchor="middle" font-size="11" font-weight="bold" fill="#2d3748">控制回路 QF5</text>' +
    '<line x1="1000" y1="280" x2="1000" y2="310" stroke="#805ad5" stroke-width="1.5" marker-end="url(#arrow-purple)"/>' +
    '<rect x="900" y="310" width="200" height="40" rx="6" fill="#faf5ff" stroke="#805ad5" stroke-width="1.5"/>' +
    '<text x="1000" y="335" text-anchor="middle" font-size="10" font-weight="bold" fill="#2d3748">PLC + 触摸屏 HMI</text>' +
    '<line x1="1000" y1="350" x2="1000" y2="380" stroke="#805ad5" stroke-width="1.5" marker-end="url(#arrow-purple)"/>' +
    '<rect x="900" y="380" width="200" height="40" rx="6" fill="#faf5ff" stroke="#805ad5" stroke-width="1.5"/>' +
    '<text x="1000" y="405" text-anchor="middle" font-size="10" font-weight="bold" fill="#2d3748">传感器 + 执行器</text>' +
    '<line x1="900" y1="330" x2="800" y2="330" stroke="#805ad5" stroke-width="1" stroke-dasharray="4,3"/>' +
    '<text x="850" y="325" text-anchor="middle" font-size="7" fill="#805ad5">控制信号</text>' +
    '<line x1="900" y1="330" x2="700" y2="330" stroke="#805ad5" stroke-width="1" stroke-dasharray="4,3"/>' +
    '<line x1="900" y1="330" x2="600" y2="330" stroke="#805ad5" stroke-width="1" stroke-dasharray="4,3"/>' +
    '<line x1="900" y1="330" x2="400" y2="330" stroke="#805ad5" stroke-width="1" stroke-dasharray="4,3"/>' +
    '<line x1="900" y1="330" x2="300" y2="330" stroke="#805ad5" stroke-width="1" stroke-dasharray="4,3"/>' +
    '<line x1="900" y1="330" x2="200" y2="330" stroke="#805ad5" stroke-width="1" stroke-dasharray="4,3"/>' +
    '<rect x="50" y="450" width="1100" height="80" rx="8" fill="#f7fafc" stroke="#cbd5e0" stroke-width="1.5"/>' +
    '<text x="600" y="475" text-anchor="middle" font-size="13" font-weight="bold" fill="#2d3748">控制逻辑说明</text>' +
    '<text x="100" y="500" font-size="9" fill="#4a5568">① 温度控制：出口温度传感器 T2 → PLC AI → PID 运算 → PLC AO → 电动阀开度 / 变频器频率 / 加热功率</text>' +
    '<text x="100" y="515" font-size="9" fill="#4a5568">② 湿度控制：出口湿度传感器 RH2 → PLC AI → PID 运算 → PLC AO → 加湿器功率</text>' +
    '<text x="100" y="530" font-size="9" fill="#4a5568">③ 安全联锁：过滤器压差 &gt; 250Pa → 报警 | 表冷器出口 T &lt; 5℃ → 防冻保护 | 加热器出口 T &gt; 设定值 → 超温切断</text>' +
    '</svg>' +
    '</div>' +
    '<div class="install-tip"><strong>📖 电气控制说明：</strong>' +
    '<ul>' +
    '<li><strong>主电源：</strong>三相五线制 380V/50Hz（L1/L2/L3/N/PE），总断路器 QF0 提供过载和短路保护</li>' +
    '<li><strong>风机回路：</strong>接触器 KM1 控制启停，变频器调节电机转速（0~50Hz），实现风量无级调节</li>' +
    '<li><strong>表冷器回路：</strong>电动调节阀（0~10V 控制）调节冷冻水流量，循环水泵提供水动力</li>' +
    '<li><strong>加热器回路：</strong>可控硅调功器（SSR）调节电加热管功率（0~100%），实现精确温度控制</li>' +
    '<li><strong>控制回路：</strong>PLC 接收传感器信号，执行 PID 运算，输出控制信号到各执行器；触摸屏 HMI 用于参数设定和状态显示</li>' +
    '</ul></div>' +
    '</div>' +

    // 调试工艺流程图
    '<div class="install-item">' +
    '<h4>🔧 系统调试工艺流程图</h4>' +
    '<div class="process-flow-container">' +
    '<svg class="process-flow-svg" viewBox="0 0 1200 450" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
    '<marker id="arrow-debug" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#38a169"/></marker>' +
    '</defs>' +
    '<text x="600" y="30" text-anchor="middle" font-size="16" font-weight="bold" fill="#2d3748">系统调试工艺流程图（Commissioning Procedure）</text>' +
    '<rect x="30" y="60" width="160" height="80" rx="10" fill="#f0fff4" stroke="#38a169" stroke-width="2"/>' +
    '<circle cx="110" cy="80" r="15" fill="#38a169"/>' +
    '<text x="110" y="85" text-anchor="middle" font-size="12" font-weight="bold" fill="#fff">1</text>' +
    '<text x="110" y="110" text-anchor="middle" font-size="11" font-weight="bold" fill="#2d3748">电气检查</text>' +
    '<text x="110" y="127" text-anchor="middle" font-size="8" fill="#4a5568">接线检查/绝缘测试</text>' +
    '<line x1="190" y1="100" x2="240" y2="100" stroke="#38a169" stroke-width="2" marker-end="url(#arrow-debug)"/>' +
    '<rect x="240" y="60" width="160" height="80" rx="10" fill="#f0fff4" stroke="#38a169" stroke-width="2"/>' +
    '<circle cx="320" cy="80" r="15" fill="#38a169"/>' +
    '<text x="320" y="85" text-anchor="middle" font-size="12" font-weight="bold" fill="#fff">2</text>' +
    '<text x="320" y="110" text-anchor="middle" font-size="11" font-weight="bold" fill="#2d3748">水路冲洗</text>' +
    '<text x="320" y="127" text-anchor="middle" font-size="8" fill="#4a5568">管路冲洗/排污</text>' +
    '<line x1="400" y1="100" x2="450" y2="100" stroke="#38a169" stroke-width="2" marker-end="url(#arrow-debug)"/>' +
    '<rect x="450" y="60" width="160" height="80" rx="10" fill="#f0fff4" stroke="#38a169" stroke-width="2"/>' +
    '<circle cx="530" cy="80" r="15" fill="#38a169"/>' +
    '<text x="530" y="85" text-anchor="middle" font-size="12" font-weight="bold" fill="#fff">3</text>' +
    '<text x="530" y="110" text-anchor="middle" font-size="11" font-weight="bold" fill="#2d3748">单机试运转</text>' +
    '<text x="530" y="127" text-anchor="middle" font-size="8" fill="#4a5568">风机/水泵/阀门</text>' +
    '<line x1="610" y1="100" x2="660" y2="100" stroke="#38a169" stroke-width="2" marker-end="url(#arrow-debug)"/>' +
    '<rect x="660" y="60" width="160" height="80" rx="10" fill="#f0fff4" stroke="#38a169" stroke-width="2"/>' +
    '<circle cx="740" cy="80" r="15" fill="#38a169"/>' +
    '<text x="740" y="85" text-anchor="middle" font-size="12" font-weight="bold" fill="#fff">4</text>' +
    '<text x="740" y="110" text-anchor="middle" font-size="11" font-weight="bold" fill="#2d3748">系统联动</text>' +
    '<text x="740" y="127" text-anchor="middle" font-size="8" fill="#4a5568">全系统联合运行</text>' +
    '<line x1="820" y1="100" x2="870" y2="100" stroke="#38a169" stroke-width="2" marker-end="url(#arrow-debug)"/>' +
    '<rect x="870" y="60" width="160" height="80" rx="10" fill="#f0fff4" stroke="#38a169" stroke-width="2"/>' +
    '<circle cx="950" cy="80" r="15" fill="#38a169"/>' +
    '<text x="950" y="85" text-anchor="middle" font-size="12" font-weight="bold" fill="#fff">5</text>' +
    '<text x="950" y="110" text-anchor="middle" font-size="11" font-weight="bold" fill="#2d3748">参数整定</text>' +
    '<text x="950" y="127" text-anchor="middle" font-size="8" fill="#4a5568">PID 参数调整</text>' +
    '<line x1="1030" y1="100" x2="1080" y2="100" stroke="#38a169" stroke-width="2" marker-end="url(#arrow-debug)"/>' +
    '<rect x="1080" y="60" width="90" height="80" rx="10" fill="#c6f6d5" stroke="#38a169" stroke-width="2"/>' +
    '<circle cx="1125" cy="80" r="15" fill="#38a169"/>' +
    '<text x="1125" y="85" text-anchor="middle" font-size="12" font-weight="bold" fill="#fff">6</text>' +
    '<text x="1125" y="110" text-anchor="middle" font-size="11" font-weight="bold" fill="#2d3748">验收</text>' +
    '<text x="1125" y="127" text-anchor="middle" font-size="8" fill="#4a5568">性能测试</text>' +
    '<rect x="30" y="170" width="360" height="260" rx="8" fill="#ebf8ff" stroke="#3182ce" stroke-width="1.5"/>' +
    '<text x="210" y="195" text-anchor="middle" font-size="12" font-weight="bold" fill="#2d3748">步骤 1~2：电气检查 &amp; 水路冲洗</text>' +
    '<text x="50" y="215" font-size="9" fill="#4a5568">• 检查所有电气接线是否正确、牢固</text>' +
    '<text x="50" y="232" font-size="9" fill="#4a5568">• 用兆欧表测量电机绝缘电阻（≥ 0.5MΩ）</text>' +
    '<text x="50" y="249" font-size="9" fill="#4a5568">• 检查接地电阻（≤ 4Ω）</text>' +
    '<text x="50" y="266" font-size="9" fill="#4a5568">• 水系统管路冲洗，排出焊渣/杂质</text>' +
    '<text x="50" y="283" font-size="9" fill="#4a5568">• 检查管路有无泄漏</text>' +
    '<text x="50" y="300" font-size="9" fill="#4a5568">• 膨胀水箱预充压力检查</text>' +
    '<text x="50" y="317" font-size="9" fill="#4a5568">• 系统注水排气</text>' +
    '<rect x="420" y="170" width="360" height="260" rx="8" fill="#f0fff4" stroke="#38a169" stroke-width="1.5"/>' +
    '<text x="600" y="195" text-anchor="middle" font-size="12" font-weight="bold" fill="#2d3748">步骤 3~4：单机试运转 &amp; 系统联动</text>' +
    '<text x="440" y="215" font-size="9" fill="#4a5568">• 点动风机，确认转向正确</text>' +
    '<text x="440" y="232" font-size="9" fill="#4a5568">• 风机连续运转 2h，监测振动/温度/电流</text>' +
    '<text x="440" y="249" font-size="9" fill="#4a5568">• 水泵连续运转 2h，监测压力/流量</text>' +
    '<text x="440" y="266" font-size="9" fill="#4a5568">• 电动阀门全开/全关测试，确认行程</text>' +
    '<text x="440" y="283" font-size="9" fill="#4a5568">• 加热器逐段通电测试</text>' +
    '<text x="440" y="300" font-size="9" fill="#4a5568">• 加湿器注水测试，确认无泄漏</text>' +
    '<text x="440" y="317" font-size="9" fill="#4a5568">• 全系统联合运行，检查各设备协调性</text>' +
    '<text x="440" y="334" font-size="9" fill="#4a5568">• 模拟各种工况，验证控制逻辑</text>' +
    '<text x="440" y="351" font-size="9" fill="#4a5568">• 模拟故障，验证安全联锁</text>' +
    '<text x="440" y="368" font-size="9" fill="#4a5568">• 连续运行 24h，记录运行参数</text>' +
    '<rect x="810" y="170" width="360" height="260" rx="8" fill="#fffaf0" stroke="#dd6b20" stroke-width="1.5"/>' +
    '<text x="990" y="195" text-anchor="middle" font-size="12" font-weight="bold" fill="#2d3748">步骤 5~6：参数整定 &amp; 验收</text>' +
    '<text x="830" y="215" font-size="9" fill="#4a5568">• 温度 PID 参数整定：先 P 后 I 再 D</text>' +
    '<text x="830" y="232" font-size="9" fill="#4a5568">• 湿度 PID 参数整定：加湿响应较慢，I 为主</text>' +
    '<text x="830" y="249" font-size="9" fill="#4a5568">• 风量 PID 参数整定：风机惯性大，P 不宜过大</text>' +
    '<text x="830" y="266" font-size="9" fill="#4a5568">• 设定典型工况（如 25℃/50%RH），观察稳定性</text>' +
    '<text x="830" y="283" font-size="9" fill="#4a5568">• 温度控制精度：±0.5℃</text>' +
    '<text x="830" y="300" font-size="9" fill="#4a5568">• 湿度控制精度：±3%RH</text>' +
    '<text x="830" y="317" font-size="9" fill="#4a5568">• 风量控制精度：±5%</text>' +
    '<text x="830" y="334" font-size="9" fill="#4a5568">• 编制调试报告，记录所有参数</text>' +
    '<text x="830" y="351" font-size="9" fill="#4a5568">• 编制操作维护手册</text>' +
    '<text x="830" y="368" font-size="9" fill="#4a5568">• 培训操作人员</text>' +
    '<text x="830" y="385" font-size="9" fill="#4a5568">• 甲方验收签字</text>' +
    '</svg>' +
    '</div>' +
    '<div class="install-tip"><strong>📖 调试流程说明：</strong>' +
    '<ul>' +
    '<li><strong>步骤 1~2（电气检查 & 水路冲洗）：</strong>确保电气接线正确、绝缘合格、接地可靠；水系统管路冲洗干净，无焊渣杂质，管路无泄漏，膨胀水箱预充压力正常</li>' +
    '<li><strong>步骤 3~4（单机试运转 & 系统联动）：</strong>逐台设备点动测试，确认转向正确后连续运转 2h 监测各项参数；全系统联合运行 24h，模拟各种工况和故障，验证控制逻辑和安全联锁</li>' +
    '<li><strong>步骤 5~6（参数整定 & 验收）：</strong>按照先 P 后 I 再 D 的顺序整定 PID 参数，确保温度控制精度 ±0.5℃、湿度控制精度 ±3%RH、风量控制精度 ±5%；编制调试报告和操作维护手册，培训操作人员，甲方验收签字</li>' +
    '</ul></div>' +
    '</div>' +

    '</div>';

  document.getElementById("selectionResults").innerHTML = html;
  injectDrawingFrames();
  refreshSvgExportButtons();
}

// ==========================================
// 八-二、注入工程制图图框到SVG（DOM操作）
// ==========================================

function injectDrawingFrames() {
  var svgs = document.querySelectorAll('.process-flow-container svg');
  var frameData = [
    { title: 'AHU 空气处理工艺流程图', drawingNo: 'AHU-PFD-001', scale: 'NTS' },
    { title: '水系统工艺流程图（P&ID）', drawingNo: 'AHU-PID-001', scale: 'NTS' },
    { title: '电气控制流程图', drawingNo: 'AHU-ELC-001', scale: 'NTS' },
    { title: '系统调试工艺流程图', drawingNo: 'AHU-COM-001', scale: 'NTS' }
  ];

  for (var i = 0; i < svgs.length; i++) {
    if (i >= frameData.length) break;
    var svg = svgs[i];
    var vb = svg.getAttribute('viewBox').split(/\s+/);
    var w = parseFloat(vb[2]);
    var h = parseFloat(vb[3]);
    var newH = h + 80;
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + newH);

    var frameHtml = buildDrawingFrame(w, newH, frameData[i]);
    svg.insertAdjacentHTML('beforeend', frameHtml);
  }
}

// ==========================================
// 九、焓湿图绘制 (Canvas)
// ==========================================

function drawPsychroChart(data) {
  var container = document.getElementById("psychroChartContainer");
  container.style.display = "block";
  var canvas = document.getElementById("psychroCanvas");
  var ctx = canvas.getContext("2d");
  var W = canvas.width;
  var H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // 边距（左侧加大给Y轴标签，底部加大给说明文字）
  var ml = 70, mr = 40, mt = 40, mb = 130;
  var pw = W - ml - mr;
  var ph = H - mt - mb;

  // 温度范围: -10 ~ 50°C
  var T_min = -10, T_max = 50;
  // 含湿量范围: 0 ~ 0.035 kg/kg (35 g/kg)
  var W_min = 0, W_max = 0.035;

  function tx(T) { return ml + (T - T_min) / (T_max - T_min) * pw; }
  function ty(w) { return mt + ph - (w - W_min) / (W_max - W_min) * ph; }

  // 背景
  ctx.fillStyle = "#fafcfc";
  ctx.fillRect(0, 0, W, H);

  // 网格
  ctx.strokeStyle = "#e8ecf0";
  ctx.lineWidth = 0.5;
  for (var gT = -10; gT <= 50; gT += 5) {
    var x = tx(gT);
    ctx.beginPath(); ctx.moveTo(x, mt); ctx.lineTo(x, mt + ph); ctx.stroke();
  }
  for (var gW = 0; gW <= 0.035; gW += 0.005) {
    var y = ty(gW);
    ctx.beginPath(); ctx.moveTo(ml, y); ctx.lineTo(ml + pw, y); ctx.stroke();
  }

  // 轴标签
  ctx.fillStyle = "#718096";
  ctx.font = "11px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = "center";
  for (var gT2 = -10; gT2 <= 50; gT2 += 10) {
    ctx.fillText(gT2 + "°C", tx(gT2), mt + ph + 18);
  }
  ctx.fillText("干球温度 T (℃)", ml + pw / 2, mt + ph + 34);

  ctx.save();
  ctx.textAlign = "right";
  ctx.translate(ml - 14, mt + ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("含湿量 w (g/kg干空气)", 0, 0);
  ctx.restore();

  for (var gW2 = 0; gW2 <= 0.035; gW2 += 0.005) {
    ctx.textAlign = "right";
    ctx.fillText((gW2 * 1000).toFixed(0), ml - 8, ty(gW2) + 4);
  }

  // 饱和线 (RH=100%)
  ctx.beginPath();
  ctx.strokeStyle = "#a0aec0";
  ctx.lineWidth = 2;
  var first = true;
  for (var T = T_min; T <= T_max; T += 0.5) {
    var w_sat = calcHumidityRatio(T, 100, data.P_atm);
    if (w_sat > W_max) w_sat = W_max;
    var xs = tx(T), ys = ty(w_sat);
    if (first) { ctx.moveTo(xs, ys); first = false; }
    else { ctx.lineTo(xs, ys); }
  }
  ctx.stroke();
  ctx.fillStyle = "#a0aec0";
  ctx.font = "10px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = "left";
  var satW42 = calcHumidityRatio(42, 100, data.P_atm);
  if (satW42 < W_max) ctx.fillText("RH=100%", tx(42), ty(satW42) - 8);

  // 等RH线 (20%, 40%, 60%, 80%)
  var rhLevels = [20, 40, 60, 80];
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 0.8;
  for (var ri = 0; ri < rhLevels.length; ri++) {
    var rh = rhLevels[ri];
    ctx.strokeStyle = "#cbd5e0";
    ctx.beginPath();
    var fr = true;
    for (var T = T_min; T <= T_max; T += 1) {
      var w_rh = calcHumidityRatio(T, rh, data.P_atm);
      if (w_rh > W_max) w_rh = W_max;
      var xr = tx(T), yr = ty(w_rh);
      if (fr) { ctx.moveTo(xr, yr); fr = false; }
      else { ctx.lineTo(xr, yr); }
    }
    ctx.stroke();
    ctx.fillStyle = "#a0aec0";
    var rhW43 = calcHumidityRatio(43, rh, data.P_atm);
    if (rhW43 < W_max) ctx.fillText("RH=" + rh + "%", tx(43), ty(rhW43) + 3);
  }
  ctx.setLineDash([]);

  // 计算入口和出口的含湿量（修复：使用正确的变量名）
  var w_in = data.W_in;
  var w_out = data.W_out;

  // 处理过程线 (入口→出口)
  var x1 = tx(data.tempIn), y1 = ty(w_in);
  var x2 = tx(data.tempOut), y2 = ty(w_out);
  ctx.beginPath();
  ctx.strokeStyle = "#e53e3e";
  ctx.lineWidth = 2.5;
  ctx.setLineDash([6, 3]);
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);

  // 入口状态点 (蓝色)
  drawPoint(ctx, x1, y1, "#3182ce", "#2b6cb0");
  ctx.fillStyle = "#2b6cb0";
  ctx.font = "bold 12px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("入口 " + data.tempIn + "℃ / " + data.rhIn + "%RH", x1 + 10, y1 - 10);
  ctx.font = "10px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = "#4a5568";
  ctx.fillText("h₁=" + fmt(data.h_in, 1) + " kJ/kg, w₁=" + fmt(w_in * 1000, 1) + " g/kg", x1 + 10, y1 + 4);

  // 出口状态点 (绿色)
  drawPoint(ctx, x2, y2, "#48bb78", "#38a169");
  ctx.fillStyle = "#38a169";
  ctx.font = "bold 12px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("出口 " + data.tempOut + "℃ / " + data.rhOut + "%RH", x2 + 10, y2 - 10);
  ctx.font = "10px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = "#4a5568";
  ctx.fillText("h₂=" + fmt(data.h_out, 1) + " kJ/kg, w₂=" + fmt(w_out * 1000, 1) + " g/kg", x2 + 10, y2 + 4);

  // 图框
  ctx.strokeStyle = "#cbd5e0";
  ctx.lineWidth = 1;
  ctx.strokeRect(ml, mt, pw, ph);

  // ===== 底部详细说明区域 =====
  var detailY = mt + ph + 50;
  ctx.fillStyle = "#2d3748";
  ctx.font = "bold 12px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("📋 空气处理过程说明", ml, detailY);

  ctx.font = "10px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = "#4a5568";
  var lineY = detailY + 18;
  var lineH = 14;

  // 工况信息
  ctx.fillText("工况: " + data.tempIn + "℃/" + data.rhIn + "%RH → " + data.tempOut + "℃/" + data.rhOut + "%RH  |  质量流量: " + data.massFlow + " kg/s  |  大气压: " + fmt(data.P_atm, 1) + " kPa", ml, lineY);
  lineY += lineH;

  // 焓值变化
  var deltaH = data.h_in - data.h_out;
  var deltaW = (w_in - w_out) * 1000;
  ctx.fillText("焓值变化: h₁=" + fmt(data.h_in, 1) + " → h₂=" + fmt(data.h_out, 1) + " kJ/kg  |  Δh=" + fmt(deltaH, 1) + " kJ/kg  |  制冷量 Qc=" + fmt(data.Q_cooling, 1) + " kW", ml, lineY);
  lineY += lineH;

  // 含湿量变化
  ctx.fillText("含湿量变化: w₁=" + fmt(w_in * 1000, 1) + " → w₂=" + fmt(w_out * 1000, 1) + " g/kg  |  Δw=" + fmt(deltaW, 1) + " g/kg  |  除湿量=" + fmt(data.m_dehumid, 2) + " g/s", ml, lineY);
  lineY += lineH;

  // 露点温度
  var dewIn = calcDewPoint((data.rhIn / 100) * satPressure(data.tempIn));
  var dewOut = calcDewPoint((data.rhOut / 100) * satPressure(data.tempOut));
  ctx.fillText("露点温度: 入口 " + fmt(dewIn, 1) + "℃  |  出口 " + fmt(dewOut, 1) + "℃", ml, lineY);
  lineY += lineH;

  // 处理类型判断
  lineY += 4;
  ctx.fillStyle = "#2b6cb0";
  ctx.font = "bold 10px 'Segoe UI', system-ui, sans-serif";
  var processType = "";
  if (data.tempIn > data.tempOut && w_in > w_out) {
    processType = "降温除湿过程（夏季典型工况）：空气先经表冷器冷却除湿，再经再热器加热到目标温度";
  } else if (data.tempIn < data.tempOut && w_in < w_out) {
    processType = "加热加湿过程（冬季典型工况）：空气先经加热器升温，再经加湿器增加湿度";
  } else if (data.tempIn > data.tempOut && w_in <= w_out) {
    processType = "单纯降温过程（干燥地区夏季）：空气经表冷器降温，含湿量不变或略有增加";
  } else if (data.tempIn < data.tempOut && w_in >= w_out) {
    processType = "单纯加热过程（冬季干燥工况）：空气经加热器升温，含湿量不变";
  } else {
    processType = "混合处理过程";
  }
  ctx.fillText("处理类型: " + processType, ml, lineY);
  lineY += lineH;

  // 图例说明
  lineY += 8;
  ctx.fillStyle = "#2d3748";
  ctx.font = "bold 10px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("图例说明:", ml, lineY);
  lineY += 14;

  ctx.font = "10px 'Segoe UI', system-ui, sans-serif";
  // 蓝色点
  ctx.beginPath(); ctx.arc(ml + 8, lineY - 3, 5, 0, 2 * Math.PI);
  ctx.fillStyle = "#3182ce"; ctx.fill();
  ctx.fillStyle = "#4a5568";
  ctx.fillText("= 入口空气状态点", ml + 18, lineY);

  // 绿色点
  ctx.beginPath(); ctx.arc(ml + 120, lineY - 3, 5, 0, 2 * Math.PI);
  ctx.fillStyle = "#48bb78"; ctx.fill();
  ctx.fillStyle = "#4a5568";
  ctx.fillText("= 出口空气状态点", ml + 130, lineY);

  // 红色线
  ctx.beginPath(); ctx.moveTo(ml + 240, lineY - 3); ctx.lineTo(ml + 260, lineY - 3);
  ctx.strokeStyle = "#e53e3e"; ctx.lineWidth = 2; ctx.setLineDash([4, 2]); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = "#4a5568";
  ctx.fillText("= 空气处理过程线", ml + 265, lineY);

  // 灰色饱和线
  ctx.beginPath(); ctx.moveTo(ml + 370, lineY - 3); ctx.lineTo(ml + 390, lineY - 3);
  ctx.strokeStyle = "#a0aec0"; ctx.lineWidth = 2; ctx.setLineDash([]); ctx.stroke();
  ctx.fillStyle = "#4a5568";
  ctx.fillText("= 饱和线 (RH=100%)", ml + 395, lineY);

  lineY += 16;
  ctx.fillStyle = "#718096";
  ctx.font = "9px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("注：焓湿图基于 GB/T 35226-2017《湿空气性质计算公式》绘制，大气压 P=" + fmt(data.P_atm, 1) + " kPa", ml, lineY);
}

function drawPoint(ctx, x, y, fill, stroke) {
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, 2 * Math.PI);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, 2 * Math.PI);
  ctx.fillStyle = "#fff";
  ctx.fill();
}

function togglePsychroChart() {
  var c = document.getElementById("psychroChartContainer");
  c.style.display = (c.style.display === "none") ? "block" : "none";
}

// ==========================================
// 十二、导出Excel报告
// ==========================================

function exportReport() {
  var statusEl = document.getElementById("statusText");
  statusEl.textContent = "正在生成Excel报告...";

  // 获取当前输入参数
  var massFlow = parseFloat(document.getElementById("massFlow").value);
  var tempIn = parseFloat(document.getElementById("tempIn").value);
  var rhIn = parseFloat(document.getElementById("rhIn").value);
  var tempOut = parseFloat(document.getElementById("tempOut").value);
  var rhOut = parseFloat(document.getElementById("rhOut").value);
  var P_atm = parseFloat(document.getElementById("atmPressure").value);

  // 重新计算所有参数
  var P_sat_in = satPressure(tempIn);
  var P_v_in = (rhIn / 100) * P_sat_in;
  var W_in = humidityRatio(P_sat_in, rhIn, P_atm);
  var h_in = enthalpy(tempIn, W_in);

  var P_sat_out = satPressure(tempOut);
  var P_v_out = (rhOut / 100) * P_sat_out;
  var W_out = humidityRatio(P_sat_out, rhOut, P_atm);
  var h_out = enthalpy(tempOut, W_out);

  var deltaH = h_in - h_out;
  var deltaW = W_in - W_out;
  var deltaT = tempOut - tempIn;
  var Q_cooling = Math.max(0, massFlow * deltaH);
  var Q_heating = Math.max(0, massFlow * 1.006 * deltaT);
  var m_dehumid = Math.max(0, massFlow * deltaW * 1000);
  var m_chilled = Q_cooling > 0 ? Q_cooling / (4.187 * 5) : 0;
  var V_chilled = m_chilled / 1000 * 3600;
  var elec_power = Q_heating > 0 ? Q_heating / 0.98 : 0;

  // 设备选型参数
  var K_cooling = 1.10;
  var K_heating = 1.15;
  var K_flow = 1.10;
  var sel_cooling = Q_cooling * K_cooling;
  var sel_elec_power = elec_power * K_heating;
  var air_flow_m3s = massFlow / 1.2;
  var air_flow_m3h = air_flow_m3s * 3600;
  var sel_air_flow = air_flow_m3h * K_flow;
  var face_area = air_flow_m3s / 2.5;
  var face_width = Math.ceil(Math.sqrt(face_area * 1.5) * 100) / 100;
  var face_height = face_area / face_width;

  // 当前日期时间
  var now = new Date();
  var dateStr = now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate());
  var timeStr = pad2(now.getHours()) + ":" + pad2(now.getMinutes()) + ":" + pad2(now.getSeconds());
  var dateTimeStr = dateStr + " " + timeStr;

  // 构建Excel兼容的HTML表格
  var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
  html += '<head><meta charset="UTF-8">';
  html += '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>';
  html += '<x:Name>计算报告</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>';
  html += '</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->';
  html += '<style>';
  html += 'table { border-collapse: collapse; }';
  html += 'th, td { border: 1px solid #999; padding: 4px 8px; }';
  html += 'th { background-color: #4472C4; color: white; font-weight: bold; }';
  html += '.title { font-size: 16px; font-weight: bold; background-color: #D6DCE4; }';
  html += '.section { font-size: 12px; font-weight: bold; background-color: #E2EFDA; }';
  html += '.label { font-weight: bold; background-color: #F2F2F2; }';
  html += '.value { text-align: right; }';
  html += '.note { font-style: italic; color: #666; }';
  html += '</style></head><body>';

  // 报告标题
  html += '<table>';
  html += '<tr><td colspan="4" class="title">进气空调 (AHU) 设计计算报告</td></tr>';
  html += '<tr><td class="label">报告日期</td><td>' + dateStr + '</td><td class="label">报告时间</td><td>' + timeStr + '</td></tr>';
  html += '<tr><td class="label">生成时间</td><td colspan="3">' + dateTimeStr + '</td></tr>';
  html += '</table><br>';

  // 一、设计边界条件
  html += '<table>';
  html += '<tr><td colspan="4" class="section">一、设计边界条件（输入参数）</td></tr>';
  html += '<tr><th>参数名称</th><th>符号</th><th>数值</th><th>单位</th></tr>';
  html += '<tr><td class="label">质量流量</td><td>ṁ</td><td class="value">' + massFlow + '</td><td>kg/s</td></tr>';
  html += '<tr><td class="label">入口温度</td><td>T₁</td><td class="value">' + tempIn + '</td><td>℃</td></tr>';
  html += '<tr><td class="label">入口相对湿度</td><td>RH₁</td><td class="value">' + rhIn + '</td><td>%</td></tr>';
  html += '<tr><td class="label">出口温度</td><td>T₂</td><td class="value">' + tempOut + '</td><td>℃</td></tr>';
  html += '<tr><td class="label">出口相对湿度</td><td>RH₂</td><td class="value">' + rhOut + '</td><td>%</td></tr>';
  html += '<tr><td class="label">大气压力</td><td>P_atm</td><td class="value">' + P_atm.toFixed(3) + '</td><td>kPa</td></tr>';
  html += '</table><br>';

  // 二、入口空气参数计算
  html += '<table>';
  html += '<tr><td colspan="4" class="section">二、入口空气参数计算</td></tr>';
  html += '<tr><th>参数名称</th><th>符号</th><th>数值</th><th>单位</th></tr>';
  html += '<tr><td class="label">饱和水汽压</td><td>P_sat₁</td><td class="value">' + P_sat_in.toFixed(4) + '</td><td>kPa</td></tr>';
  html += '<tr><td class="label">水蒸气分压力</td><td>P_v₁</td><td class="value">' + P_v_in.toFixed(4) + '</td><td>kPa</td></tr>';
  html += '<tr><td class="label">含湿量</td><td>W₁</td><td class="value">' + (W_in * 1000).toFixed(3) + '</td><td>g/kg</td></tr>';
  html += '<tr><td class="label">比焓</td><td>h₁</td><td class="value">' + h_in.toFixed(4) + '</td><td>kJ/kg</td></tr>';
  html += '</table><br>';

  // 三、出口空气参数计算
  html += '<table>';
  html += '<tr><td colspan="4" class="section">三、出口空气参数计算</td></tr>';
  html += '<tr><th>参数名称</th><th>符号</th><th>数值</th><th>单位</th></tr>';
  html += '<tr><td class="label">饱和水汽压</td><td>P_sat₂</td><td class="value">' + P_sat_out.toFixed(4) + '</td><td>kPa</td></tr>';
  html += '<tr><td class="label">水蒸气分压力</td><td>P_v₂</td><td class="value">' + P_v_out.toFixed(4) + '</td><td>kPa</td></tr>';
  html += '<tr><td class="label">含湿量</td><td>W₂</td><td class="value">' + (W_out * 1000).toFixed(3) + '</td><td>g/kg</td></tr>';
  html += '<tr><td class="label">比焓</td><td>h₂</td><td class="value">' + h_out.toFixed(4) + '</td><td>kJ/kg</td></tr>';
  html += '</table><br>';

  // 四、负荷计算
  html += '<table>';
  html += '<tr><td colspan="4" class="section">四、负荷计算</td></tr>';
  html += '<tr><th>参数名称</th><th>符号</th><th>数值</th><th>单位</th></tr>';
  html += '<tr><td class="label">焓差</td><td>Δh</td><td class="value">' + deltaH.toFixed(4) + '</td><td>kJ/kg</td></tr>';
  html += '<tr><td class="label">含湿量差</td><td>ΔW</td><td class="value">' + (deltaW * 1000).toFixed(3) + '</td><td>g/kg</td></tr>';
  html += '<tr><td class="label">温差</td><td>ΔT</td><td class="value">' + deltaT.toFixed(2) + '</td><td>℃</td></tr>';
  html += '<tr><td class="label">制冷量</td><td>Q_c</td><td class="value">' + Q_cooling.toFixed(4) + '</td><td>kW</td></tr>';
  html += '<tr><td class="label">加热量</td><td>Q_h</td><td class="value">' + Q_heating.toFixed(4) + '</td><td>kW</td></tr>';
  html += '<tr><td class="label">除湿量</td><td>ṁ_deh</td><td class="value">' + m_dehumid.toFixed(4) + '</td><td>g/s</td></tr>';
  html += '<tr><td class="label">冷凝水量</td><td>-</td><td class="value">' + (m_dehumid * 3.6).toFixed(1) + '</td><td>L/h</td></tr>';
  html += '</table><br>';

  // 五、冷冻水流量与电加热功率计算
  html += '<table>';
  html += '<tr><td colspan="4" class="section">五、冷冻水流量与电加热功率计算</td></tr>';
  html += '<tr><th>参数名称</th><th>符号</th><th>数值</th><th>单位</th></tr>';
  html += '<tr><td class="label">冷冻水质量流量</td><td>ṁ_ch</td><td class="value">' + m_chilled.toFixed(4) + '</td><td>kg/s</td></tr>';
  html += '<tr><td class="label">冷冻水体积流量</td><td>V_ch</td><td class="value">' + V_chilled.toFixed(2) + '</td><td>m³/h</td></tr>';
  html += '<tr><td class="label">冷冻水供回水温差</td><td>ΔT_ch</td><td class="value">5</td><td>℃</td></tr>';
  html += '<tr><td class="label">电加热功率</td><td>P_elec</td><td class="value">' + elec_power.toFixed(4) + '</td><td>kW</td></tr>';
  html += '<tr><td class="label">电热效率</td><td>η</td><td class="value">98</td><td>%</td></tr>';
  html += '</table><br>';

  // 六、设备选型建议
  html += '<table>';
  html += '<tr><td colspan="4" class="section">六、设备选型建议（含安全系数）</td></tr>';
  html += '<tr><th>设备名称</th><th>参数</th><th>数值</th><th>单位</th></tr>';
  html += '<tr><td class="label" rowspan="5">表冷器</td><td>选型制冷量 (K=1.10)</td><td class="value">' + sel_cooling.toFixed(1) + '</td><td>kW</td></tr>';
  html += '<tr><td>处理风量</td><td class="value">' + air_flow_m3h.toFixed(0) + '</td><td>m³/h</td></tr>';
  html += '<tr><td>建议排数</td><td>6 ~ 8</td><td>排</td></tr>';
  html += '<tr><td>迎面尺寸</td><td>' + face_width.toFixed(2) + ' × ' + face_height.toFixed(2) + '</td><td>m</td></tr>';
  html += '<tr><td>冷冻水流量</td><td class="value">' + V_chilled.toFixed(2) + '</td><td>m³/h</td></tr>';
  html += '<tr><td class="label" rowspan="5">电加热器</td><td>选型功率 (K=1.15)</td><td class="value">' + sel_elec_power.toFixed(1) + '</td><td>kW</td></tr>';
  html += '<tr><td>加热量</td><td class="value">' + Q_heating.toFixed(2) + '</td><td>kW</td></tr>';
  html += '<tr><td>电热效率</td><td class="value">98</td><td>%</td></tr>';
  html += '<tr><td>控制方式</td><td>PID 可控硅调功（SSR）</td><td>-</td></tr>';
  html += '<tr><td>建议分级</td><td>多级或无级调节</td><td>-</td></tr>';
  html += '<tr><td class="label" rowspan="3">送风机</td><td>设计风量 (K=1.10)</td><td class="value">' + sel_air_flow.toFixed(0) + '</td><td>m³/h</td></tr>';
  html += '<tr><td>建议形式</td><td>离心风机（前向/后向多翼）</td><td>-</td></tr>';
  html += '<tr><td>全压估算</td><td>800 ~ 1200</td><td>Pa</td></tr>';
  html += '<tr><td class="label" rowspan="5">配套设备</td><td>过滤器</td><td>初效 G4 过滤袋</td><td>-</td></tr>';
  html += '<tr><td>箱体材质</td><td>304 不锈钢</td><td>-</td></tr>';
  html += '<tr><td>保温层</td><td>50mm 聚氨酯发泡</td><td>-</td></tr>';
  html += '<tr><td>控制系统</td><td>PLC + 触摸屏</td><td>-</td></tr>';
  html += '<tr><td>控制精度</td><td>温度 ±0.5℃ / 湿度 ±3%</td><td>-</td></tr>';
  html += '</table><br>';

  // 七、计算公式说明
  html += '<table>';
  html += '<tr><td colspan="2" class="section">七、计算公式及原理说明</td></tr>';
  html += '<tr><th>公式名称</th><th>公式及说明</th></tr>';
  html += '<tr><td class="label">饱和水汽压 (Magnus公式)</td><td>P_sat = 0.61078 × exp(17.27 × T / (T + 237.3))  [kPa]<br>依据 GB/T 35226-2017《湿空气性质计算公式》</td></tr>';
  html += '<tr><td class="label">水蒸气分压力</td><td>P_v = RH × P_sat  [kPa]<br>RH 为相对湿度（小数形式）</td></tr>';
  html += '<tr><td class="label">含湿量</td><td>W = 0.622 × P_v / (P_atm - P_v)  [kg/kg]<br>0.622 为水蒸气与干空气气体常数之比</td></tr>';
  html += '<tr><td class="label">比焓</td><td>h = 1.006 × T + W × (2501 + 1.86 × T)  [kJ/kg]<br>1.006: 干空气比热, 2501: 0℃水蒸发潜热, 1.86: 水蒸气比热</td></tr>';
  html += '<tr><td class="label">制冷量 (焓差法)</td><td>Q_c = ṁ × (h₁ - h₂)  [kW]<br>依据 GB 50736-2012 第7章，焓差法同时考虑显热和潜热负荷</td></tr>';
  html += '<tr><td class="label">加热量 (显热法)</td><td>Q_h = ṁ × c_p × (T₂ - T₁)  [kW]<br>c_p = 1.006 kJ/(kg·K) 为空气定压比热</td></tr>';
  html += '<tr><td class="label">除湿量</td><td>ṁ_deh = ṁ × (W₁ - W₂) × 1000  [g/s]<br>每秒从空气中凝结分离的水分量</td></tr>';
  html += '<tr><td class="label">水流量</td><td>ṁ_w = Q / (c_pw × ΔT)  [kg/s]<br>c_pw = 4.187 kJ/(kg·K) 为水的定压比热</td></tr>';
  html += '</table><br>';

  // 八、引用标准
  html += '<table>';
  html += '<tr><td colspan="2" class="section">八、引用国标及行业标准</td></tr>';
  html += '<tr><th>标准编号</th><th>标准名称及引用内容</th></tr>';
  html += '<tr><td>GB/T 35226-2017</td><td>《湿空气性质计算公式》- Magnus 饱和水汽压公式</td></tr>';
  html += '<tr><td>GB 50736-2012</td><td>《民用建筑供暖通风与空气调节设计规范》- 焓差法负荷计算、空调系统设计</td></tr>';
  html += '<tr><td>GB/T 14294-2008</td><td>《组合式空调机组》- 设备选型、性能要求</td></tr>';
  html += '<tr><td>GB/T 19232-2003</td><td>《风机盘管机组》- 风机选型参考</td></tr>';
  html += '<tr><td>GB/T 4797.2-2017</td><td>《环境条件分类 自然环境条件 气压》- 大气压力修正</td></tr>';
  html += '<tr><td>GB 50019-2015</td><td>《工业建筑供暖通风与空气调节设计规范》- 工业空调设计</td></tr>';
  html += '</table><br>';

  // 页脚
  html += '<table>';
  html += '<tr><td class="note">本报告由"进气空调设计计算器"自动生成 | 生成时间：' + dateTimeStr + '</td></tr>';
  html += '<tr><td class="note">注：设备选型已考虑安全系数（制冷×1.10，制热×1.15，风量×1.10），实际选型请结合具体工况调整。</td></tr>';
  html += '</table>';

  html += '</body></html>';

  // 创建Blob并下载
  var blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  var fileName = 'AHU_设计计算报告_' + dateStr + '_' + timeStr.replace(/:/g, '') + '.xls';
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  statusEl.textContent = 'Excel报告已导出：' + fileName;
}

// Electron环境检测：使用IPC保存文件（解决.exe中Blob下载不生效的问题）
function exportReportElectron() {
  var statusEl = document.getElementById("statusText");
  statusEl.textContent = "正在生成Excel报告...";

  // 获取当前输入参数
  var massFlow = parseFloat(document.getElementById("massFlow").value);
  var tempIn = parseFloat(document.getElementById("tempIn").value);
  var rhIn = parseFloat(document.getElementById("rhIn").value);
  var tempOut = parseFloat(document.getElementById("tempOut").value);
  var rhOut = parseFloat(document.getElementById("rhOut").value);
  var P_atm = parseFloat(document.getElementById("atmPressure").value);

  // 重新计算所有参数
  var P_sat_in = satPressure(tempIn);
  var P_v_in = (rhIn / 100) * P_sat_in;
  var W_in = humidityRatio(P_sat_in, rhIn, P_atm);
  var h_in = enthalpy(tempIn, W_in);

  var P_sat_out = satPressure(tempOut);
  var P_v_out = (rhOut / 100) * P_sat_out;
  var W_out = humidityRatio(P_sat_out, rhOut, P_atm);
  var h_out = enthalpy(tempOut, W_out);

  var deltaH = h_in - h_out;
  var deltaW = W_in - W_out;
  var deltaT = tempOut - tempIn;
  var Q_cooling = Math.max(0, massFlow * deltaH);
  var Q_heating = Math.max(0, massFlow * 1.006 * deltaT);
  var m_dehumid = Math.max(0, massFlow * deltaW * 1000);
  var m_chilled = Q_cooling > 0 ? Q_cooling / (4.187 * 5) : 0;
  var V_chilled = m_chilled / 1000 * 3600;
  var elec_power = Q_heating > 0 ? Q_heating / 0.98 : 0;

  // 设备选型参数
  var K_cooling = 1.10;
  var K_heating = 1.15;
  var K_flow = 1.10;
  var sel_cooling = Q_cooling * K_cooling;
  var sel_elec_power = elec_power * K_heating;
  var air_flow_m3s = massFlow / 1.2;
  var air_flow_m3h = air_flow_m3s * 3600;
  var sel_air_flow = air_flow_m3h * K_flow;
  var face_area = air_flow_m3s / 2.5;
  var face_width = Math.ceil(Math.sqrt(face_area * 1.5) * 100) / 100;
  var face_height = face_area / face_width;

  // 当前日期时间
  var now = new Date();
  var dateStr = now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate());
  var timeStr = pad2(now.getHours()) + ":" + pad2(now.getMinutes()) + ":" + pad2(now.getSeconds());
  var dateTimeStr = dateStr + " " + timeStr;
  var fileName = 'AHU_设计计算报告_' + dateStr + '_' + timeStr.replace(/:/g, '') + '.xls';

  // 构建Excel兼容的HTML表格
  var html = buildExcelHTML({
    dateStr: dateStr, timeStr: timeStr, dateTimeStr: dateTimeStr,
    massFlow: massFlow, tempIn: tempIn, rhIn: rhIn, tempOut: tempOut, rhOut: rhOut, P_atm: P_atm,
    P_sat_in: P_sat_in, P_v_in: P_v_in, W_in: W_in, h_in: h_in,
    P_sat_out: P_sat_out, P_v_out: P_v_out, W_out: W_out, h_out: h_out,
    deltaH: deltaH, deltaW: deltaW, deltaT: deltaT,
    Q_cooling: Q_cooling, Q_heating: Q_heating, m_dehumid: m_dehumid,
    m_chilled: m_chilled, elec_power: elec_power, V_chilled: V_chilled,
    sel_cooling: sel_cooling, sel_elec_power: sel_elec_power,
    air_flow_m3h: air_flow_m3h, sel_air_flow: sel_air_flow,
    face_width: face_width, face_height: face_height
  });

  // 通过IPC发送到主进程保存
  var { ipcRenderer } = require("electron");
  ipcRenderer.send("save-excel-file", { content: html, fileName: fileName });
  ipcRenderer.once("save-excel-reply", function(event, reply) {
    if (reply.success) {
      statusEl.textContent = "Excel报告已保存至：" + reply.path;
    } else {
      statusEl.textContent = "保存失败：" + reply.error;
    }
  });
}

// 构建Excel HTML内容（提取为公共函数）
function buildExcelHTML(d) {
  var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
  html += '<head><meta charset="UTF-8">';
  html += '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>';
  html += '<x:Name>计算报告</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>';
  html += '</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->';
  html += '<style>';
  html += 'table { border-collapse: collapse; }';
  html += 'th, td { border: 1px solid #999; padding: 4px 8px; }';
  html += 'th { background-color: #4472C4; color: white; font-weight: bold; }';
  html += '.title { font-size: 16px; font-weight: bold; background-color: #D6DCE4; }';
  html += '.section { font-size: 12px; font-weight: bold; background-color: #E2EFDA; }';
  html += '.label { font-weight: bold; background-color: #F2F2F2; }';
  html += '.value { text-align: right; }';
  html += '.note { font-style: italic; color: #666; }';
  html += '</style></head><body>';

  // 报告标题
  html += '<table>';
  html += '<tr><td colspan="4" class="title">进气空调 (AHU) 设计计算报告</td></tr>';
  html += '<tr><td class="label">报告日期</td><td>' + d.dateStr + '</td><td class="label">报告时间</td><td>' + d.timeStr + '</td></tr>';
  html += '<tr><td class="label">生成时间</td><td colspan="3">' + d.dateTimeStr + '</td></tr>';
  html += '</table><br>';

  // 一、设计边界条件
  html += '<table>';
  html += '<tr><td colspan="4" class="section">一、设计边界条件（输入参数）</td></tr>';
  html += '<tr><th>参数名称</th><th>符号</th><th>数值</th><th>单位</th></tr>';
  html += '<tr><td class="label">质量流量</td><td>ṁ</td><td class="value">' + d.massFlow + '</td><td>kg/s</td></tr>';
  html += '<tr><td class="label">入口温度</td><td>T₁</td><td class="value">' + d.tempIn + '</td><td>℃</td></tr>';
  html += '<tr><td class="label">入口相对湿度</td><td>RH₁</td><td class="value">' + d.rhIn + '</td><td>%</td></tr>';
  html += '<tr><td class="label">出口温度</td><td>T₂</td><td class="value">' + d.tempOut + '</td><td>℃</td></tr>';
  html += '<tr><td class="label">出口相对湿度</td><td>RH₂</td><td class="value">' + d.rhOut + '</td><td>%</td></tr>';
  html += '<tr><td class="label">大气压力</td><td>P_atm</td><td class="value">' + d.P_atm.toFixed(3) + '</td><td>kPa</td></tr>';
  html += '</table><br>';

  // 二、入口空气参数计算
  html += '<table>';
  html += '<tr><td colspan="4" class="section">二、入口空气参数计算</td></tr>';
  html += '<tr><th>参数名称</th><th>符号</th><th>数值</th><th>单位</th></tr>';
  html += '<tr><td class="label">饱和水汽压</td><td>P_sat₁</td><td class="value">' + d.P_sat_in.toFixed(4) + '</td><td>kPa</td></tr>';
  html += '<tr><td class="label">水蒸气分压力</td><td>P_v₁</td><td class="value">' + d.P_v_in.toFixed(4) + '</td><td>kPa</td></tr>';
  html += '<tr><td class="label">含湿量</td><td>W₁</td><td class="value">' + (d.W_in * 1000).toFixed(3) + '</td><td>g/kg</td></tr>';
  html += '<tr><td class="label">比焓</td><td>h₁</td><td class="value">' + d.h_in.toFixed(4) + '</td><td>kJ/kg</td></tr>';
  html += '</table><br>';

  // 三、出口空气参数计算
  html += '<table>';
  html += '<tr><td colspan="4" class="section">三、出口空气参数计算</td></tr>';
  html += '<tr><th>参数名称</th><th>符号</th><th>数值</th><th>单位</th></tr>';
  html += '<tr><td class="label">饱和水汽压</td><td>P_sat₂</td><td class="value">' + d.P_sat_out.toFixed(4) + '</td><td>kPa</td></tr>';
  html += '<tr><td class="label">水蒸气分压力</td><td>P_v₂</td><td class="value">' + d.P_v_out.toFixed(4) + '</td><td>kPa</td></tr>';
  html += '<tr><td class="label">含湿量</td><td>W₂</td><td class="value">' + (d.W_out * 1000).toFixed(3) + '</td><td>g/kg</td></tr>';
  html += '<tr><td class="label">比焓</td><td>h₂</td><td class="value">' + d.h_out.toFixed(4) + '</td><td>kJ/kg</td></tr>';
  html += '</table><br>';

  // 四、负荷计算
  html += '<table>';
  html += '<tr><td colspan="4" class="section">四、负荷计算</td></tr>';
  html += '<tr><th>参数名称</th><th>符号</th><th>数值</th><th>单位</th></tr>';
  html += '<tr><td class="label">焓差</td><td>Δh</td><td class="value">' + d.deltaH.toFixed(4) + '</td><td>kJ/kg</td></tr>';
  html += '<tr><td class="label">含湿量差</td><td>ΔW</td><td class="value">' + (d.deltaW * 1000).toFixed(3) + '</td><td>g/kg</td></tr>';
  html += '<tr><td class="label">温差</td><td>ΔT</td><td class="value">' + d.deltaT.toFixed(2) + '</td><td>℃</td></tr>';
  html += '<tr><td class="label">制冷量</td><td>Q_c</td><td class="value">' + d.Q_cooling.toFixed(4) + '</td><td>kW</td></tr>';
  html += '<tr><td class="label">加热量</td><td>Q_h</td><td class="value">' + d.Q_heating.toFixed(4) + '</td><td>kW</td></tr>';
  html += '<tr><td class="label">除湿量</td><td>ṁ_deh</td><td class="value">' + d.m_dehumid.toFixed(4) + '</td><td>g/s</td></tr>';
  html += '<tr><td class="label">冷凝水量</td><td>-</td><td class="value">' + (d.m_dehumid * 3.6).toFixed(1) + '</td><td>L/h</td></tr>';
  html += '</table><br>';

  // 五、冷冻水流量与电加热功率计算
  html += '<table>';
  html += '<tr><td colspan="4" class="section">五、冷冻水流量与电加热功率计算</td></tr>';
  html += '<tr><th>参数名称</th><th>符号</th><th>数值</th><th>单位</th></tr>';
  html += '<tr><td class="label">冷冻水质量流量</td><td>ṁ_ch</td><td class="value">' + d.m_chilled.toFixed(4) + '</td><td>kg/s</td></tr>';
  html += '<tr><td class="label">冷冻水体积流量</td><td>V_ch</td><td class="value">' + d.V_chilled.toFixed(2) + '</td><td>m³/h</td></tr>';
  html += '<tr><td class="label">冷冻水供回水温差</td><td>ΔT_ch</td><td class="value">5</td><td>℃</td></tr>';
  html += '<tr><td class="label">电加热功率</td><td>P_elec</td><td class="value">' + d.elec_power.toFixed(4) + '</td><td>kW</td></tr>';
  html += '<tr><td class="label">电热效率</td><td>η</td><td class="value">98</td><td>%</td></tr>';
  html += '</table><br>';

  // 六、设备选型建议
  html += '<table>';
  html += '<tr><td colspan="4" class="section">六、设备选型建议（含安全系数）</td></tr>';
  html += '<tr><th>设备名称</th><th>参数</th><th>数值</th><th>单位</th></tr>';
  html += '<tr><td class="label" rowspan="5">表冷器</td><td>选型制冷量 (K=1.10)</td><td class="value">' + d.sel_cooling.toFixed(1) + '</td><td>kW</td></tr>';
  html += '<tr><td>处理风量</td><td class="value">' + d.air_flow_m3h.toFixed(0) + '</td><td>m³/h</td></tr>';
  html += '<tr><td>建议排数</td><td>6 ~ 8</td><td>排</td></tr>';
  html += '<tr><td>迎面尺寸</td><td>' + d.face_width.toFixed(2) + ' × ' + d.face_height.toFixed(2) + '</td><td>m</td></tr>';
  html += '<tr><td>冷冻水流量</td><td class="value">' + d.V_chilled.toFixed(2) + '</td><td>m³/h</td></tr>';
  html += '<tr><td class="label" rowspan="5">电加热器</td><td>选型功率 (K=1.15)</td><td class="value">' + d.sel_elec_power.toFixed(1) + '</td><td>kW</td></tr>';
  html += '<tr><td>加热量</td><td class="value">' + d.Q_heating.toFixed(2) + '</td><td>kW</td></tr>';
  html += '<tr><td>电热效率</td><td class="value">98</td><td>%</td></tr>';
  html += '<tr><td>控制方式</td><td>PID 可控硅调功（SSR）</td><td>-</td></tr>';
  html += '<tr><td>建议分级</td><td>多级或无级调节</td><td>-</td></tr>';
  html += '<tr><td class="label" rowspan="3">送风机</td><td>设计风量 (K=1.10)</td><td class="value">' + d.sel_air_flow.toFixed(0) + '</td><td>m³/h</td></tr>';
  html += '<tr><td>建议形式</td><td>离心风机（前向/后向多翼）</td><td>-</td></tr>';
  html += '<tr><td>全压估算</td><td>800 ~ 1200</td><td>Pa</td></tr>';
  html += '<tr><td class="label" rowspan="5">配套设备</td><td>过滤器</td><td>初效 G4 过滤袋</td><td>-</td></tr>';
  html += '<tr><td>箱体材质</td><td>304 不锈钢</td><td>-</td></tr>';
  html += '<tr><td>保温层</td><td>50mm 聚氨酯发泡</td><td>-</td></tr>';
  html += '<tr><td>控制系统</td><td>PLC + 触摸屏</td><td>-</td></tr>';
  html += '<tr><td>控制精度</td><td>温度 ±0.5℃ / 湿度 ±3%</td><td>-</td></tr>';
  html += '</table><br>';

  // 七、计算公式说明
  html += '<table>';
  html += '<tr><td colspan="2" class="section">七、计算公式及原理说明</td></tr>';
  html += '<tr><th>公式名称</th><th>公式及说明</th></tr>';
  html += '<tr><td class="label">饱和水汽压 (Magnus公式)</td><td>P_sat = 0.61078 × exp(17.27 × T / (T + 237.3))  [kPa]<br>依据 GB/T 35226-2017《湿空气性质计算公式》</td></tr>';
  html += '<tr><td class="label">水蒸气分压力</td><td>P_v = RH × P_sat  [kPa]<br>RH 为相对湿度（小数形式）</td></tr>';
  html += '<tr><td class="label">含湿量</td><td>W = 0.622 × P_v / (P_atm - P_v)  [kg/kg]<br>0.622 为水蒸气与干空气气体常数之比</td></tr>';
  html += '<tr><td class="label">比焓</td><td>h = 1.006 × T + W × (2501 + 1.86 × T)  [kJ/kg]<br>1.006: 干空气比热, 2501: 0℃水蒸发潜热, 1.86: 水蒸气比热</td></tr>';
  html += '<tr><td class="label">制冷量 (焓差法)</td><td>Q_c = ṁ × (h₁ - h₂)  [kW]<br>依据 GB 50736-2012 第7章，焓差法同时考虑显热和潜热负荷</td></tr>';
  html += '<tr><td class="label">加热量 (显热法)</td><td>Q_h = ṁ × c_p × (T₂ - T₁)  [kW]<br>c_p = 1.006 kJ/(kg·K) 为空气定压比热</td></tr>';
  html += '<tr><td class="label">除湿量</td><td>ṁ_deh = ṁ × (W₁ - W₂) × 1000  [g/s]<br>每秒从空气中凝结分离的水分量</td></tr>';
  html += '<tr><td class="label">水流量</td><td>ṁ_w = Q / (c_pw × ΔT)  [kg/s]<br>c_pw = 4.187 kJ/(kg·K) 为水的定压比热</td></tr>';
  html += '</table><br>';

  // 八、引用标准
  html += '<table>';
  html += '<tr><td colspan="2" class="section">八、引用国标及行业标准</td></tr>';
  html += '<tr><th>标准编号</th><th>标准名称及引用内容</th></tr>';
  html += '<tr><td>GB/T 35226-2017</td><td>《湿空气性质计算公式》- Magnus 饱和水汽压公式</td></tr>';
  html += '<tr><td>GB 50736-2012</td><td>《民用建筑供暖通风与空气调节设计规范》- 焓差法负荷计算、空调系统设计</td></tr>';
  html += '<tr><td>GB/T 14294-2008</td><td>《组合式空调机组》- 设备选型、性能要求</td></tr>';
  html += '<tr><td>GB/T 19232-2003</td><td>《风机盘管机组》- 风机选型参考</td></tr>';
  html += '<tr><td>GB/T 4797.2-2017</td><td>《环境条件分类 自然环境条件 气压》- 大气压力修正</td></tr>';
  html += '<tr><td>GB 50019-2015</td><td>《工业建筑供暖通风与空气调节设计规范》- 工业空调设计</td></tr>';
  html += '</table><br>';

  // 页脚
  html += '<table>';
  html += '<tr><td class="note">本报告由"进气空调设计计算器"自动生成 | 生成时间：' + d.dateTimeStr + '</td></tr>';
  html += '<tr><td class="note">注：设备选型已考虑安全系数（制冷×1.10，制热×1.15，风量×1.10），实际选型请结合具体工况调整。</td></tr>';
  html += '</table>';

  html += '</body></html>';
  return html;
}

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

// ==========================================
// 十、工程制图标准图框与标题栏 (GB/T 14689-2008)
// ==========================================

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildDrawingFrame(w, h, opts) {
  var o = Object.assign({
    title: '',
    drawingNo: 'AHU-XXX-001',
    scale: 'NTS',
    designer: 'Engineer',
    checker: 'Reviewer',
    revision: 'A0',
    company: 'Turbocharger Test Facility',
    date: new Date().getFullYear() + '-' + pad2(new Date().getMonth() + 1) + '-' + pad2(new Date().getDate())
  }, opts);

  var ml = 25, mr = 10, mt = 15, mb = 10;
  var tbW = 220, tbH = 64;
  var tbX = w - tbW - mr;
  var tbY = h - tbH - mb;
  var c1 = tbX + 70;
  var c2 = c1 + 70;
  var r1 = tbY + 16, r2 = r1 + 16, r3 = r2 + 16;

  var s = '';
  // Outer border (粗实线)
  s += '<rect x="' + ml + '" y="' + mt + '" width="' + (w - ml - mr) + '" height="' + (h - mt - mb) + '" fill="none" stroke="#000" stroke-width="2"/>';
  // Inner border (细实线)
  s += '<rect x="' + (ml + 3) + '" y="' + (mt + 3) + '" width="' + (w - ml - mr - 6) + '" height="' + (h - mt - mb - 6) + '" fill="none" stroke="#000" stroke-width="0.5"/>';

  // Title block
  s += '<rect x="' + tbX + '" y="' + tbY + '" width="' + tbW + '" height="' + tbH + '" fill="#fff" stroke="#000" stroke-width="1.5"/>';
  s += '<line x1="' + c1 + '" y1="' + tbY + '" x2="' + c1 + '" y2="' + (tbY + tbH) + '" stroke="#000" stroke-width="0.8"/>';
  s += '<line x1="' + c2 + '" y1="' + tbY + '" x2="' + c2 + '" y2="' + (tbY + tbH) + '" stroke="#000" stroke-width="0.8"/>';
  s += '<line x1="' + tbX + '" y1="' + r1 + '" x2="' + (tbX + tbW) + '" y2="' + r1 + '" stroke="#000" stroke-width="0.8"/>';
  s += '<line x1="' + tbX + '" y1="' + r2 + '" x2="' + (tbX + tbW) + '" y2="' + r2 + '" stroke="#000" stroke-width="0.8"/>';
  s += '<line x1="' + tbX + '" y1="' + r3 + '" x2="' + (tbX + tbW) + '" y2="' + r3 + '" stroke="#000" stroke-width="0.8"/>';

  s += '<text x="' + (tbX + 5) + '" y="' + (tbY + 11) + '" font-size="7" fill="#333">设计: ' + escapeXml(o.designer) + '</text>';
  s += '<text x="' + (c1 + 5) + '" y="' + (tbY + 11) + '" font-size="7" fill="#333">比例: ' + escapeXml(o.scale) + '</text>';
  s += '<text x="' + (c2 + 5) + '" y="' + (tbY + 11) + '" font-size="7" fill="#333">图号: ' + escapeXml(o.drawingNo) + '</text>';

  s += '<text x="' + (tbX + 5) + '" y="' + (r1 + 11) + '" font-size="7" fill="#333">审核: ' + escapeXml(o.checker) + '</text>';
  s += '<text x="' + (c1 + 5) + '" y="' + (r1 + 11) + '" font-size="7" fill="#333">日期: ' + escapeXml(o.date) + '</text>';
  s += '<text x="' + (c2 + 5) + '" y="' + (r1 + 11) + '" font-size="7" fill="#333">版本: ' + escapeXml(o.revision) + '</text>';

  s += '<text x="' + (tbX + 5) + '" y="' + (r2 + 11) + '" font-size="8" fill="#000" font-weight="bold">' + escapeXml(o.title) + '</text>';
  s += '<text x="' + (tbX + 5) + '" y="' + (r3 + 11) + '" font-size="6" fill="#666">' + escapeXml(o.company) + '</text>';

  return s;
}

// ==========================================
// 十一、SVG 导出功能
// ==========================================

function exportSvgElement(svgEl, fileName) {
  try {
    require('electron');
    exportSvgElectron(svgEl, fileName);
  } catch (e) {
    exportSvgBrowser(svgEl, fileName);
  }
}

function exportSvgBrowser(svgEl, fileName) {
  var serializer = new XMLSerializer();
  var svgContent = serializer.serializeToString(svgEl);
  var blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  document.getElementById('statusText').textContent = 'SVG 已导出: ' + fileName;
}

function exportSvgElectron(svgEl, fileName) {
  try {
    var serializer = new XMLSerializer();
    var svgContent = serializer.serializeToString(svgEl);
    var { ipcRenderer } = require('electron');
    ipcRenderer.send('save-svg-file', { content: svgContent, fileName: fileName });
    ipcRenderer.once('save-svg-reply', function(event, reply) {
      if (reply.success) {
        document.getElementById('statusText').textContent = 'SVG 已保存至: ' + reply.path;
      } else {
        document.getElementById('statusText').textContent = '保存失败: ' + reply.error;
      }
    });
  } catch (e) {
    // fallback
    exportSvgBrowser(svgEl, fileName);
  }
}

function refreshSvgExportButtons() {
  var containers = document.querySelectorAll('.process-flow-container');
  for (var i = 0; i < containers.length; i++) {
    var container = containers[i];
    var btnGroup = container.parentNode.querySelector('.svg-export-group');
    if (btnGroup) continue;
    var svgEl = container.querySelector('svg');
    if (!svgEl) continue;
    var titleEl = container.parentNode.querySelector('h4');
    var title = titleEl ? titleEl.textContent.replace(/[^\w\u4e00-\u9fff]/g, '_') : 'diagram_' + i;
    var btnDiv = document.createElement('div');
    btnDiv.className = 'svg-export-group';
    btnDiv.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
    var exportBtn = document.createElement('button');
    exportBtn.className = 'toolbar-btn';
    exportBtn.textContent = '📄 导出 SVG';
    exportBtn.onclick = (function(svg, fn) {
      return function() { exportSvgElement(svg, fn); };
    })(svgEl, title + '.svg');
    var pngBtn = document.createElement('button');
    pngBtn.className = 'toolbar-btn';
    pngBtn.textContent = '🖼 导出 PNG';
    pngBtn.onclick = (function(svg, fn) {
      return function() { exportSvgAsPng(svg, fn); };
    })(svgEl, title + '.png');
    btnDiv.appendChild(exportBtn);
    btnDiv.appendChild(pngBtn);
    container.parentNode.insertBefore(btnDiv, container.nextSibling);
  }
}

function exportSvgAsPng(svgEl, fileName) {
  var serializer = new XMLSerializer();
  var svgContent = serializer.serializeToString(svgEl);
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d');
  var img = new Image();
  var svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
  var url = URL.createObjectURL(svgBlob);
  img.onload = function() {
    canvas.width = img.width * 2;
    canvas.height = img.height * 2;
    ctx.scale(2, 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob(function(blob) {
      var dlUrl = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = dlUrl;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(dlUrl);
    });
  };
  img.src = url;
}