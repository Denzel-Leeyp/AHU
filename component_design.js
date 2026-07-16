// ============================================
// component_design.js - 零部件详细设计模块
// 涡轮增压器测试台进气空调 (AHU) 计算器 v2.0
// 包含：表冷器、加热器、加湿器、纯水制水系统的详细设计计算
// ============================================

var currentDesignTab = "coil";

// 盘管排列示意图用：10 种回路颜色
var CIRCUIT_COLORS = [
  '#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6',
  '#1abc9c','#e67e22','#34495e','#e91e63','#00bcd4'
];
function getCircuitColor(idx) { return CIRCUIT_COLORS[idx % CIRCUIT_COLORS.length]; }

// 零部件页面→主页面输入同步
function syncFromDesign() {
  var pairs = ['tempIn','rhIn','tempOut','rhOut','massFlow','coilRH','chwDeltaT','chwSupply'];
  for (var i = 0; i < pairs.length; i++) {
    var id = pairs[i];
    var src = document.getElementById('cd-' + id);
    var dst = document.getElementById(id);
    if (src && dst) dst.value = src.value;
  }
  // 触发主页面重算（确保 onParamChange 存在且不重复触发 syncToDesign）
  if (typeof onParamChange === 'function') onParamChange();
  // 推送派生值到零部件页（T_coil, Q_coil, volFlow 等）
  if (typeof importFromCalc === 'function') importFromCalc();
  // 重新运行当前设计标签
  if (currentDesignTab === 'coil') runCoilDesign();
  else if (currentDesignTab === 'heater') runHeaterDesign();
  else if (currentDesignTab === 'humidifier') runHumidifierDesign();
  else if (currentDesignTab === 'fan') runFanDesign();
}

// 标准管束规格表（完整导入，依据用户提供的图片规格表）
// 返回 { tubeSpacing, rowSpacing } 单位 mm
// variant = 0(主选), 1(备选1), 2(备选2)
// 翅片信息仅作参考
function getTubeGeometry(tubeOD, variant) {
  variant = variant || 0;
  var map = {
    // Φ7: 百叶窗/正弦波/平翅, 翅距 1.2-3.0/1.2-2.5/1.2-2.5
    7: [
      { tubeSpacing: 21,    rowSpacing: 18.2 },
      { tubeSpacing: 21,    rowSpacing: 12.7 },
      { tubeSpacing: 19.05, rowSpacing: 16.5 }
    ],
    // Φ7.94: 百叶窗/正弦波/平翅, 翅距 1.5-3.0
    7.94: [
      { tubeSpacing: 25.4, rowSpacing: 22 },
      { tubeSpacing: 22,   rowSpacing: 19.05 }
    ],
    // Φ9.52: 百叶窗/正弦波/平翅, 翅距 1.5-5.5
    9.52: [
      { tubeSpacing: 25.4, rowSpacing: 22 },
      { tubeSpacing: 25,   rowSpacing: 21.65 }
    ],
    // Φ12.7: 正弦波/平翅, 翅距 1.5-6.0/1.5-9.0
    12.7: [
      { tubeSpacing: 31.75, rowSpacing: 27.5 },
      { tubeSpacing: 38.1,  rowSpacing: 33 }
    ],
    // Φ15.88: 正弦波/平翅, 翅距 1.5-6.0/1.5-10.0
    15.88: [
      { tubeSpacing: 38.1, rowSpacing: 33 },
      { tubeSpacing: 50,   rowSpacing: 50 }
    ],
    // Φ16 (=Φ15.88同规格)
    16: [
      { tubeSpacing: 38.1, rowSpacing: 33 },
      { tubeSpacing: 50,   rowSpacing: 50 }
    ]
  };
  var arr = map[+tubeOD];
  if (!arr) return { tubeSpacing: 38.1, rowSpacing: 33 };
  if (variant >= arr.length) variant = arr.length - 1;
  return arr[variant];
}

// 管径选择联动：自动填充管间距和排距
function fillTubeGeometry() {
  var od = parseFloat(document.getElementById("cd-tubeOD").value);
  var v = parseInt(document.getElementById("cd-spacingVar").value) || 0;
  var g = getTubeGeometry(od, v);
  document.getElementById("cd-tubeSpacing").value = g.tubeSpacing;
  document.getElementById("cd-rowSpacing").value = g.rowSpacing;
}

// ============================================
// 表冷器计算方法二:接触系数法(ε 法)
// 依据《空气调节设计手册》第三版 第四节 第一部分
// 冷水式表面冷却器作冷却干燥(减焓降湿)
// 与 LMTD 法相互印证
// ============================================

/**
 * 接触系数法(ε 法)计算表冷器
 * 依据《空气调节设计手册》第三版: ε = 1 − (tg₂−ts₂)/(tg₁−ts₁)
 * @param {object} inp - {
 *   massFlow, T_in, rhIn,           — 进口状态
 *   T_out, rhOut,                    — 最终出口(AHU出口,用于Q计算)
 *   T_coil, rh_coil,                 — 盘管出口(再热前,用于ε计算,默认=AHU出口)
 *   T_w1(冷水初温), P_atm
 * }
 * @returns {object} {eps, BF, ts1, ts2, T1, T2, T3, i1, i2, d_i, Q, W_chw, ...}
 */
function calcCoilByContactFactor(inp) {
  var mf = inp.massFlow;
  var T1 = inp.T_in, rh1 = inp.rhIn;
  var T2 = inp.T_out, rh2 = inp.rhOut;
  // 盘管出口(再热前) — 用于 ε 计算,默认 = AHU 出口(兼容旧调用)
  var T_coil_out = inp.T_coil !== undefined ? inp.T_coil : T2;
  var rh_coil_out = inp.rh_coil !== undefined ? inp.rh_coil : rh2;
  var T_w1 = inp.T_w1 !== undefined ? inp.T_w1 : 7;
  var P_atm = inp.P_atm || 101.325;

  // 状态点焓值
  var W1 = humidityRatio(satPressure(T1), rh1, P_atm);
  var W2 = humidityRatio(satPressure(T2), rh2, P_atm);
  var i1 = enthalpy(T1, W1);
  var i2 = enthalpy(T2, W2);
  var d_i = i1 - i2;                 // 焓降 kJ/kg (含再热回温)
  var Q = Math.max(0, mf * d_i);     // 冷量 kW

  // 入口露点(校核用)
  var dewIn = calcDewPoint((rh1 / 100) * satPressure(T1));

  var msgs = [];
  var valid = true;

  // 冷却干燥(减焓降湿)必须满足:W1 > W2(除湿)、d_i > 0(减焓)、T2 < T1(降温)
  if (W1 <= W2) { msgs.push("⚠ 出口含湿量 ≥ 入口,非除湿工况,接触系数法不适用"); valid = false; }
  if (d_i <= 0) { msgs.push("⚠ 焓降 ≤ 0,非减焓工况"); valid = false; }
  if (T2 >= T1) { msgs.push("⚠ 出口温度 ≥ 入口,非降温工况"); valid = false; }

  // 接触系数 ε(手册定义,《空气调节设计手册》第三版 第四节):
  //   ε = 1 − (tg₂ − ts₂) / (tg₁ − ts₁)
  //   其中 tg₂/ts₂ 为盘管出口(再热前)状态,非最终 AHU 出口
  //   盘管出口空气接近饱和(≈95%RH),故 tg₂−ts₂ 很小→BF小→ε大
  //
  // 湿球温度采用干湿球公式迭代求解
  var P_v_1 = (rh1 / 100) * satPressure(T1);
  var P_v_coil = (rh_coil_out / 100) * satPressure(T_coil_out);
  var wb1 = calcWetBulb(P_v_1, T1, P_atm);
  var wb2 = calcWetBulb(P_v_coil, T_coil_out, P_atm);
  var ts1 = (wb1 && wb1.ts != null) ? wb1.ts : NaN;
  var ts2 = (wb2 && wb2.ts != null) ? wb2.ts : NaN;

  var eps = 0, BF = 1;
  var dT_wb_in = T1 - ts1;             // tg₁ − ts₁ (进口干湿球温差)
  var dT_wb_out = T_coil_out - ts2;    // tg₂ − ts₂ (盘管出口干湿球温差)
  if (isNaN(ts1) || isNaN(ts2)) {
    valid = false; msgs.push("⚠ 湿球温度计算失败,无法计算接触系数");
  } else if (dT_wb_in <= 0.01) {
    valid = false; msgs.push("⚠ 进口干湿球温差过小(" + fmt(dT_wb_in,2) + "℃),空气接近饱和,接触系数法不适用");
  } else {
    BF = dT_wb_out / dT_wb_in;
    eps = Math.max(0, Math.min(1, 1 - BF));
  }


  // 盘管出口焓值（用于析湿系数和焓值法 ε）
  var W_coil = calcHumidityRatio(T_coil_out, rh_coil_out, P_atm);
  var i_coil = enthalpy(T_coil_out, W_coil);

  // 析湿系数 ξ（《实用供热空调设计手册》湿工况传热计算）
  var xi = calcXi(i1, i_coil, T1, T_coil_out);

  // 盘管表面温度 T3 — 使用传热迭代计算取代固定 +2.5℃
  var chwDT = inp.chwDT !== undefined ? inp.chwDT : 5;
  var W_chw_est = Q > 0 ? Q / (4.187 * chwDT) : 0;
  var T_w2_est = T_w1 + chwDT;
  var T_w_avg = (T_w1 + T_w2_est) / 2;
  // T3 迭代：盘管表面温度由传热方程逼近
  var T3 = T_w_avg + 2.5;  // 初始猜测
  var tubeOD_iter = inp.tubeOD || 16;
  var tubeWT_iter = tubeOD_iter >= 14 ? 0.5 : tubeOD_iter >= 11 ? 0.4 : tubeOD_iter >= 7.5 ? 0.35 : 0.3;
  var di_iter = (tubeOD_iter - 2 * tubeWT_iter) / 1000;
  var circuits_t3 = inp.circuits || 4;
  var w_iter = (W_chw_est > 0 && di_iter > 0) ? W_chw_est / 1000 / (Math.PI * di_iter * di_iter / 4 * circuits_t3) : 0.8;
  w_iter = Math.max(0.5, Math.min(3.0, w_iter));
  for (var iterT3 = 0; iterT3 < 5; iterT3++) {
    var i3_iter = enthalpy(T3, calcHumidityRatio(T3, 100, P_atm));
    var xi_local = calcXi(i1, i3_iter, T1, T3);
    var vy_iter = inp.vy || 2.3;
    var K_iter = calcCoilK(vy_iter, w_iter, xi_local, 4, di_iter, 0.0035, (T1+T_coil_out)/2, T_w_avg);
    var xi_approx = (i1 - i_coil) / (1.006 * (T1 - T_coil_out));
    var T3_new = T_w_avg + (K_iter / (calcAlphaAir(vy_iter, 0.0035, 1.0, (T1+T_coil_out)/2) * Math.max(1.0, xi_approx))) * ((T1+T_coil_out)/2 - T_w_avg);
    if (isNaN(T3_new)) break;
    T3_new = Math.max(T_w1, Math.min(T1, T3_new));
    if (Math.abs(T3_new - T3) < 0.05) { T3 = T3_new; break; }
    T3 = T3_new;
  }
  var i3 = enthalpy(T3, calcHumidityRatio(T3, 100, P_atm));

  // 焓值法 ε 计算（用于进口近饱和时的修正）
  // 注：本修正为工程启发式方法，非标准手册方法
  // 当进口干湿球温差 < 2℃ 时，湿球温差法的分母 tg₁−ts₁ 过小（<2℃），
  // 湿球温度计算的微小误差（Newton 迭代约 ±0.01℃）会导致 ε 结果严重不稳定。
  // 焓值法用焓差计算 ε = (i₁−i_coil)/(i₁−i₃)，焓差值大（数十 kJ/kg），数值稳定，
  // 但该方法未在《空气调节设计手册》或《实用供热空调设计手册》中明确定义。
  // 阈值 2℃ 为工程经验值，取两种方法的较大值作为保守设计。
  var W_coil = calcHumidityRatio(T_coil_out, rh_coil_out, P_atm);
  var i_coil = enthalpy(T_coil_out, W_coil);
  var eps_enthalpy = NaN;
  if (i1 - i3 > 0.01) {
    eps_enthalpy = Math.max(0, Math.min(1, (i1 - i_coil) / (i1 - i3)));
  }

  // 进口近饱和（Δwb < 2°C）时，取湿球温差法和焓值法的较大值
  if (valid && !isNaN(dT_wb_in) && dT_wb_in < 2 && dT_wb_in > 0.01 && !isNaN(eps_enthalpy)) {
    if (eps_enthalpy > eps) {
      var old_eps = eps;
      eps = eps_enthalpy;
      BF = Math.max(0, Math.min(1, 1 - eps));
      msgs.push("ℹ 进口近饱和（干湿球差 " + fmt(dT_wb_in,2) + "℃），湿球温差法 ε=" + fmt(old_eps,3) + "，焓值法 ε=" + fmt(eps_enthalpy,3) + "，采用较大值 ε=" + fmt(eps,3));
    }
  }

  // 由 ε 查排数 — 使用手册标准查表（带迎面风速修正）
  var vy_rows = inp.vy || 2.3;
  var tubeOD_eps = inp.tubeOD || 9.52;
  var finType_eps = inp.finType || 0;
  // 尝试不同排数找到能覆盖计算ε的最小排数
  var rows = 8, rowsSource = "外推(≥8排)";
  var rowCandidates = [2, 4, 6, 8];
  for (var k = 0; k < rowCandidates.length; k++) {
    var epsTable = getContactCoeff(vy_rows, rowCandidates[k], tubeOD_eps, finType_eps);
    if (eps <= epsTable) {
      rows = rowCandidates[k];
      rowsSource = "查表(" + rows + "排, ε表" + fmt(epsTable,3) + ", v_y=" + fmt(vy_rows,1) + "m/s)";
      break;
    }
  }

  // 校核：接近温差约束（盘管出口空气不能低于冷冻水供水温度+接近温差）
  var T_approach = 1.0;  // 最小接近温差 1.0℃（盘管出口空气 vs 冷冻水供水）
  var T_coil_min = T_w1 + T_approach;
  if (valid && T_coil_out < T_coil_min) {
    msgs.push("⚠ 盘管出口温度 " + fmt(T_coil_out,1) + "℃ < 冷冻水供水 " + fmt(T_w1,1) + "℃ + 接近温差 " + fmt(T_approach,1) + "℃(=" + fmt(T_coil_min,1) + "℃)，物理不可达。建议降低冷冻水温度或采用两级冷却。");
  }
  if (valid && !isNaN(dewIn) && T3 >= dewIn) {
    msgs.push("⚠ 盘管表面温度 T3=" + fmt(T3,1) + "℃ ≥ 入口露点 " + fmt(dewIn,1) + "℃,除湿能力不足,需增加排数或降低冷水温度");
  }
  if (valid && T3 <= T_w1 + 1) {
    msgs.push("⚠ 盘管表面温度 T3=" + fmt(T3,1) + "℃ 接近冷水初温 " + fmt(T_w1,1) + "℃,传热温差过小,建议增大盘管或降低冷水温度");
  }
  if (valid && !isNaN(T_w2_est) && T_w2_est >= dewIn - 1) {
    msgs.push("⚠ 冷水终温 " + fmt(T_w2_est,1) + "℃ 接近入口露点 " + fmt(dewIn,1) + "℃,冷水温升偏大,建议增大水流量");
  }

  return {
    eps: eps, BF: BF, T3: T3, i3: i3,
    i1: i1, i2: i2, d_i: d_i, Q: Q,
    xi: xi,
    W1: W1, W2: W2, dewIn: dewIn,
    ts1: ts1, ts2: ts2, T1: T1, T2: T2,
    T_coil: T_coil_out, rh_coil: rh_coil_out,
    T_coil_min: T_coil_min,
    W_chw: W_chw_est, T_w1: T_w1, T_w2: T_w2_est, chwDT: chwDT,
    T_w_avg: T_w_avg,
    rows: rows, rowsSource: rowsSource,
    valid: valid, msgs: msgs
  };
}

/** 从主计算结果导入参数 */
function importFromCalc() {
  var fields = [
    ["cd-massFlow", "massFlow"], ["cd-tempIn", "tempIn"], ["cd-rhIn", "rhIn"],
    ["cd-tempOut", "tempOut"], ["cd-rhOut", "rhOut"],
    ["cd-coilRH", "coilRH"], ["cd-chwDeltaT", "chwDeltaT"], ["cd-chwSupply", "chwSupply"]
  ];
  for (var i = 0; i < fields.length; i++) {
    var src = document.getElementById(fields[i][1]);
    var dst = document.getElementById(fields[i][0]);
    if (src && dst) dst.value = src.value;
  }
  // 从计算结果推算设计参数
  var mf = parseFloat(document.getElementById("massFlow").value) || 0.5;
  var ti = parseFloat(document.getElementById("tempIn").value) || 35;
  var ri = parseFloat(document.getElementById("rhIn").value) || 80;
  var to = parseFloat(document.getElementById("tempOut").value) || 20;
  var ro = parseFloat(document.getElementById("rhOut").value) || 50;
  var pa = parseFloat(document.getElementById("cd-atmPressure").value) || parseFloat(document.getElementById("atmPressure").value) || 101.325;

  var W_in = calcHumidityRatio(ti, ri, pa);
  var W_out = calcHumidityRatio(to, ro, pa);
  var h_in = enthalpy(ti, W_in);
  var h_out = enthalpy(to, W_out);
  var mainCoilRH = parseFloat(document.getElementById("coilRH").value) || 95;
  var T_coil, Q_reheat, Q_coil;
  if (W_in > W_out) {
    var cl = calcCoilLoad(mf, h_in, W_out, to, pa, mainCoilRH, 7, 5);
    T_coil = cl.T_coil; Q_reheat = cl.Q_reheat; Q_coil = cl.Q_coil_actual;
  } else if (W_out > W_in && to > ti) {
    // 升温加湿：预热到出口，再加湿
    T_coil = ti;
    Q_reheat = mf * 1.006 * (to - ti);
    Q_coil = 0;
  } else if (W_out >= W_in && to < ti) {
    // 降温加湿：等湿冷却到出口，再加湿
    T_coil = to;
    var h_coil_import = enthalpy(to, W_in);
    Q_coil = Math.max(0, mf * (h_in - h_coil_import));
    Q_reheat = 0;
  } else {
    T_coil = to;
    Q_reheat = 0;
    Q_coil = 0;
  }
  var m_humid = Math.max(0, mf * (W_out - W_in) * 1000 * 3.6);

  document.getElementById("cd-Q_coil").value = fmt(Q_coil, 2);
  document.getElementById("cd-Q_reheat").value = fmt(Q_reheat, 2);
  document.getElementById("cd-m_humid").value = fmt(m_humid, 2);
  document.getElementById("cd-T_coil").value = fmt(T_coil, 1);
  var W_in_cd = calcHumidityRatio(ti, ri, pa);
  document.getElementById("cd-volFlow").value = fmt(mf / rhoMoistAir(pa, ti, W_in_cd) * 3600, 0);

  document.getElementById("statusText").textContent = "已从计算结果导入参数 ✓";
}

/** 切换设计标签 */
function switchDesignTab(tab) {
  currentDesignTab = tab;
  var tabs = document.querySelectorAll(".design-tab-btn");
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove("active");
  var contents = document.querySelectorAll(".design-content");
  for (var i = 0; i < contents.length; i++) contents[i].style.display = "none";
  document.getElementById("design-tab-" + tab).classList.add("active");
  // 进入零部件页面时自动同步参数
  if (typeof syncToDesign === 'function') syncToDesign();
  // 显示/隐藏风机设计参数区
  var fanSec = document.querySelector(".design-fan-section");
  if (fanSec) fanSec.style.display = (tab === 'fan') ? 'block' : 'none';
  if (tab === "coil") { document.getElementById("design-coil").style.display = "block"; runCoilDesign(); }
  else if (tab === "heater") { document.getElementById("design-heater").style.display = "block"; runHeaterDesign(); }
  else if (tab === "humidifier") { document.getElementById("design-humidifier").style.display = "block"; runHumidifierDesign(); }
  else if (tab === "purewater") {
    document.getElementById("design-purewater").style.display = "block";
    // 若纯水产量未填，尝试从加湿器加湿量导入
    var pwDemand = document.getElementById("cd-pw-demand");
    if (pwDemand && (pwDemand.value === "" || parseFloat(pwDemand.value) === 0)) {
      var mh = parseFloat(document.getElementById("cd-m_humid") ? document.getElementById("cd-m_humid").value : 0) || 0;
      if (mh > 0) pwDemand.value = fmt(mh, 1);
      // 若加湿器选纯水，联动用途
      var wt = document.getElementById("cd-waterType") ? document.getElementById("cd-waterType").value : "pure";
      var hm = document.getElementById("cd-humidMethod") ? document.getElementById("cd-humidMethod").value : "auto";
      var uc = document.getElementById("cd-pw-usecase");
      if (wt === "pure" && uc) {
        if (hm === "spray") uc.value = "spray";
        else if (hm === "wetfilm") uc.value = "wetfilm";
        else uc.value = "steam";
      }
    }
    runPureWaterDesign();
  }
  else if (tab === "fan") {
    document.getElementById("design-fan").style.display = "block";
    // 同步风量和排数
    var volFlow = parseFloat(document.getElementById("cd-volFlow").value);
    if (volFlow) document.getElementById("cd-fan-volFlow").value = fmt(volFlow, 0);
    var coilRowsEl = document.getElementById("cd-fan-coilRows");
    if (coilRowsEl) coilRowsEl.textContent = document.getElementById("cd-tempOut") ? '4' : '4';
    runFanDesign();
  }
}

/** 运行表冷器设计计算 */
function runCoilDesign() {
  var Q_coil = parseFloat(document.getElementById("cd-Q_coil").value) || 0;
  var volFlow = parseFloat(document.getElementById("cd-volFlow").value) || 0;
  var T_in = parseFloat(document.getElementById("cd-tempIn").value) || 35;
  var rhIn = parseFloat(document.getElementById("cd-rhIn").value) || 80;
  var T_out = parseFloat(document.getElementById("cd-tempOut").value) || 20;
  var T_coil = parseFloat(document.getElementById("cd-T_coil").value) || 10;
  var massFlow = parseFloat(document.getElementById("cd-massFlow").value) || 0.5;
  var pa = parseFloat(document.getElementById("cd-atmPressure").value) || 101.325;

  var ep = getEngineeringParams();
  var v_face = ep.v_coil;
  // 读取迎面风速：优先用用户设置的，也允许 calcCoilByContactFactor 传入
  var vy_design = v_face;
  var ar = ep.ar;
  var vol_m3s = volFlow / 3600;
  var A_face = vol_m3s / v_face;
  // W = 迎面宽度（m）= 铜管长度方向（管程方向），水在管内沿 W 方向流动
  // H = 迎面高度（m）= 铜管垂直堆叠方向，孔数 = H / 管间距
  var W = Math.sqrt(A_face * ar);
  var H = A_face / W;

  var chwDT = parseFloat(document.getElementById("cd-chwDeltaT").value) || 5;
  var T_chw_in = parseFloat(document.getElementById("cd-chwSupply").value) || 7;
  var T_chw_out = T_chw_in + chwDT;

  // === P1: 校核模式 ===
  // 校核模式：根据已有盘管几何参数，反算实际能达到的冷量
  var isCheckMode = (parseInt(document.getElementById("cd-mode").value) || 0) === 1;
  if (isCheckMode && W > 0 && H > 0 && coil_rows > 0) {
    // 校核模式下直接使用当前几何参数
    var tubeSpacing_cm = parseFloat(document.getElementById("cd-tubeSpacing").value) || 38.1;
    var rowSpacing_cm = parseFloat(document.getElementById("cd-rowSpacing").value) || 33;
    var circuits_cm = parseInt(document.getElementById("cd-circuits").value) || 4;
    var tubeOD_cm = parseFloat(document.getElementById("cd-tubeOD").value) || 16;
    var tubeWT_cm = tubeOD_cm >= 14 ? 0.5 : tubeOD_cm >= 11 ? 0.4 : tubeOD_cm >= 7.5 ? 0.35 : 0.3;
    var tubeID_cm = (tubeOD_cm - 2 * tubeWT_cm) / 1000;
    var tubesPerRow_cm = H > 0 ? Math.floor(H * 1000 / tubeSpacing_cm) : 0;
    var totalTubes_cm = tubesPerRow_cm * coil_rows;
    if (totalTubes_cm > 0 && tubeID_cm > 0) {
      var totalTubeLen_cm = totalTubes_cm * W;  // 总管长 m
      var areaInner_cm = totalTubes_cm * Math.PI * tubeID_cm * W;  // 内表面积 m²
      var areaOuter_cm = totalTubes_cm * Math.PI * (tubeOD_cm / 1000) * W;  // 外表面积 m²
      var A_face_cm = W * H;  // 迎风面积 m²
      var v_actual_cm = vol_m3s > 0 ? vol_m3s / A_face_cm : v_face;
      // 管内流速（按回路数分流）
      var V_ch_cm = chwDT > 0 ? Q_coil / (4.187 * chwDT) / 1000 * 3600 : 0;
      var w_cm = (V_ch_cm > 0 && tubeID_cm > 0 && circuits_cm > 0) ?
        V_ch_cm / 3600 / (Math.PI * tubeID_cm * tubeID_cm / 4 * circuits_cm) : 1.0;
      w_cm = Math.max(0.5, Math.min(3.0, w_cm));
      // 计算传热系数 α_air (用当前几何)
      var alphaAir_cm = v_actual_cm > 0 ? calcAlphaAir(v_actual_cm, 0.0035, 1.0, (T_in + T_out) / 2) : 0;
      var alphaWater_cm = tubeID_cm > 0 && w_cm > 0 ? calcAlphaWater(w_cm, tubeID_cm, (T_chw_in + T_chw_out) / 2) : 0;
      // 翅片效率
      var finEff_cm = calcFinEfficiency(alphaAir_cm, 237, 0.00013,
        tubeOD_cm / 1000, tubeSpacing_cm / 1000, rowSpacing_cm / 1000, 0.0025, 1);
      var K_cm = 1 / (1/(alphaAir_cm * finEff_cm.etaSurface) + (tubeOD_cm/1000 - tubeID_cm) / (2 * 393) + 0.0002 + 1/alphaWater_cm);
      // NTU 法估算实际换热量
      var cp_air = 1.006;
      var cp_water = 4.187;
      var m_air = massFlow || 0.5;
      var m_water = chwDT > 0 ? Q_coil / (cp_water * chwDT) : 1.0;
      m_water = Math.max(m_water, 0.1);
      var C_min = Math.min(m_air * cp_air, m_water * cp_water);
      var C_max = Math.max(m_air * cp_air, m_water * cp_water);
      var NTU = K_cm * areaOuter_cm * 1.1 / C_min;  // 1.1 = 污垢系数
      var CR = C_min / C_max;
      // 混合流 ε-NTU
      var eps_ntu;
      if (Math.abs(CR - 1) < 0.001) {
        eps_ntu = NTU / (1 + NTU);
      } else {
        eps_ntu = (1 - Math.exp(-NTU * (1 - CR))) / (1 - CR * Math.exp(-NTU * (1 - CR)));
      }
      var Q_actual = eps_ntu * C_min * ((T_in + T_out) / 2 - (T_chw_in + T_chw_out) / 2);
      // 出口温度估算
      var T_out_actual = T_in - Q_actual / (m_air * cp_air);
      // 出口含湿量（假设沿饱和线）
      var xi_check = calcXi(enthalpy(T_in, calcHumidityRatio(T_in, rhIn, pa)),
        enthalpy(T_out_actual, calcHumidityRatio(T_out_actual, 100, pa)), T_in, T_out_actual);
      // 校核结果：替换 Q_coil 为实际值，后续 LMTD 用实际值
      Q_coil = Math.max(0, Q_actual);
      // 输出校核信息到临时变量（后续被报告使用）
      var checkInfo = "✅ 校核完成：实际冷量 " + fmt(Q_actual, 2) + " kW（目标 " + fmt(parseFloat(document.getElementById("cd-Q_coil").value)||0, 2) + " kW），出口温度" + fmt(T_out_actual, 1) + "℃";
      document.getElementById("cd-Q_coil").value = fmt(Q_coil, 2);
      document.getElementById("cd-T_coil").value = fmt(T_out_actual, 1);
      setStatusBar("校核模式：已计算实际冷量 " + fmt(Q_actual, 2) + " kW", "");
    }
  }

  // --- 盘管面积热力学计算（LMTD 法 + 焓差法，依据 GB/T 14294-2026 / 《实用供热空调设计手册》）---
  // 计算空气状态
  var rhIn_coil = rhIn;
  var W_in_cd = calcHumidityRatio(T_in, rhIn_coil, pa);
  var h_in_cd = enthalpy(T_in, W_in_cd);
  var rhOut_cd = parseFloat(document.getElementById("cd-rhOut").value) || 50;
  var W_out_cd = calcHumidityRatio(T_out, rhOut_cd, pa);
  var h_out_cd = enthalpy(T_out, W_out_cd);
  var massFlow_cd = massFlow || 0.5;

  // 析湿系数
  var xi_lmtd = calcXi(h_in_cd, h_out_cd, T_in, T_out);

  // LMTD
  var dT1 = T_in - T_chw_out;
  var dT2 = T_out - T_chw_in;
  var LMTD, A_coil, K_coil, rows_calc, dh_m;

  if (Q_coil > 0 && dT1 > 0.5 && dT2 > 0.5) {
    LMTD = (dT1 - dT2) / Math.log(dT1 / dT2);

    // 湿工况焓差法（手册推荐）
    var h_wall_in = enthalpy(T_chw_out, calcHumidityRatio(T_chw_out, 100, pa));
    var h_wall_out = enthalpy(T_chw_in, calcHumidityRatio(T_chw_in, 100, pa));
    dh_m = calcLogMeanEnthalpy(h_in_cd, h_out_cd, h_wall_in, h_wall_out);

    // 迭代计算 K 和面积
    var tubeOD_lmtd = parseFloat(document.getElementById("cd-tubeOD").value) || 16;
    var tubeWT_lmtd = tubeOD_lmtd >= 14 ? 0.5 : tubeOD_lmtd >= 11 ? 0.4 : tubeOD_lmtd >= 7.5 ? 0.35 : 0.3;
    var di_lmtd = (tubeOD_lmtd - 2 * tubeWT_lmtd) / 1000;

    var F_foul = 1.1;
    var A_per_row_per_face = 11;
    // 经验值 11 m²/m²迎风面：每 1 m² 迎面面积每排可布置约 11 m² 换热管面积
    // 该系数隐含了管径、管间距、翅片密度的综合影响，用于 LMTD 迭代初估排数
    var Ta_avg = (T_in + T_out) / 2;
    var Tw_avg = (T_chw_in + T_chw_out) / 2;

    // 迭代校核循环（手册标准：面积匹配 ≤5%）
    var iter_rows = 4, prev_ratio = 0;
    var circuits_iter = parseInt(document.getElementById("cd-circuits").value) || 4;
    for (var iter = 0; iter < 10; iter++) {
      // 管内流速（从实际回路数计算）
      var V_ch_iter = Q_coil / (4.187 * chwDT) / 1000 * 3600;
      var w_iter = (V_ch_iter > 0 && di_lmtd > 0) ?
        V_ch_iter / 3600 / (Math.PI * di_lmtd * di_lmtd / 4 * circuits_iter) : 0.8;
      w_iter = Math.max(0.5, Math.min(3.0, w_iter));

      K_coil = calcCoilK(v_face, w_iter, xi_lmtd, iter_rows, di_lmtd, 0.0035, Ta_avg, Tw_avg);

      // 湿工况下用焓差法校核面积
      if (xi_lmtd > 1.05 && dh_m > 0) {
        // Q = (K·xi) × A × (Δhm / cp_water...)
        // 焓差法：A_coil = G_a × (h_in - h_out) / (K·ah) 其中 ah 与焓差相关
        var Kh = K_coil * 1.0; // 简化的焓基传热系数
        A_coil = Q_coil * 1000 / (Kh * LMTD) * F_foul;
      } else {
        A_coil = Q_coil * 1000 / (K_coil * LMTD) * F_foul;
      }

      var A_needed_per_row = A_face * A_per_row_per_face;
      var rows_new = Math.max(2, Math.ceil(A_coil / A_needed_per_row));
      var ratio = A_coil / A_needed_per_row;

      if (Math.abs(ratio - iter_rows) / Math.max(iter_rows, 1) < 0.05 || iter >= 5) {
        rows_calc = iter_rows;
        break;
      }
      iter_rows = Math.min(8, Math.max(2, rows_new));
    }
  } else {
    LMTD = 0; A_coil = 0; K_coil = 45; rows_calc = 0; dh_m = 0;
  }

  // 接触系数法(ε 法)计算 — 作为排数选择的主要依据（传入迎面风速）
  var T_coil_cd = parseFloat(document.getElementById("cd-T_coil").value) || T_out;
  var coilRH_cd = parseFloat(document.getElementById("cd-coilRH").value) || 95;
  var tubeOD_cf = parseFloat(document.getElementById("cd-tubeOD").value) || 9.52;
  var finType_cf = parseInt(document.getElementById("cd-finType").value) || 0;
  var cf = calcCoilByContactFactor({
    massFlow: massFlow, T_in: T_in, rhIn: rhIn,
    T_out: T_out, rhOut: rhOut_cd,
    T_coil: T_coil_cd, rh_coil: coilRH_cd,
    T_w1: T_chw_in, chwDT: chwDT, P_atm: pa,
    vy: v_face,
    tubeOD: tubeOD_cf, finType: finType_cf,
    circuits: parseInt(document.getElementById("cd-circuits").value) || 4
  });

  // 排数确定：以接触系数法为主，回退LMTD法，再回退经验值
  var coil_rows = cf.valid ? cf.rows : (rows_calc > 0 ? rows_calc : (Q_coil > 50 ? 8 : Q_coil > 30 ? 6 : Q_coil > 10 ? 4 : 2));
  var fin_spacing = Q_coil > 0 ? 2.0 : 2.5;
  var V_ch = Q_coil > 0 ? Q_coil / (4.187 * chwDT) / 1000 * 3600 : 0;
  var v_actual = vol_m3s / (W * H);

  // 显热冷量及占比（用于 LMTD 对照说明）
  var Q_sensible = massFlow * 1.006 * (T_in - T_out);         // kW，显热冷量
  var sen_ratio = Q_coil > 0 ? Q_sensible / Q_coil * 100 : 0;

  // 读取盘管结构参数
  var tubeSpacing = parseFloat(document.getElementById("cd-tubeSpacing").value) || 38.1;
  var rowSpacing = parseFloat(document.getElementById("cd-rowSpacing").value) || 33;
  var circuits = parseInt(document.getElementById("cd-circuits").value) || 4;
  var tubeOD = parseFloat(document.getElementById("cd-tubeOD").value) || 16;
  // 壁厚：φ16=0.5, φ12.7=0.4, φ9.52=0.35
  var tubeWT = tubeOD >= 14 ? 0.5 : tubeOD >= 11 ? 0.4 : tubeOD >= 7.5 ? 0.35 : 0.3;
  var tubeID = tubeOD - 2 * tubeWT;
  // 每排孔数 = H / 管间距（注意：用高度 H，不是宽度 W）
  // 铜管沿 W 方向布置全长，沿 H 方向垂直堆叠
  // 孔数 = 垂直方向可布置的铜管根数/排
  var tubesPerRow = H > 0 ? Math.floor(H * 1000 / tubeSpacing) : 0;
  var totalTubes = tubesPerRow * coil_rows;
  var tubesPerCircuit = circuits > 0 ? Math.ceil(totalTubes / circuits) : totalTubes;
  var tubeLenPerRow = tubesPerRow * W;           // 每排管总长 (m)
  var totalTubeLength = totalTubes * W;          // 总管路长度 (m)，修正：管长=宽度W，不是高度H
  var bundleHeight = tubesPerRow * tubeSpacing / 1000;  // 管束高度 (m)，由管间距决定
  var outerWidth = W * 1000 + 200;               // 外形宽度 (mm) = 管束净宽 + U弯侧(70mm) + 集水管侧(130mm)
                                                 // 集水管(联箱)沿 H 方向布置在 W 一侧，底部进水、顶部出水（下进上出）
  var outerHeight = H * 1000 + 100;              // 外形高度 (mm) = 管束净高 + 上下框架(50×2)
  var outerDepth = coil_rows * rowSpacing + 40;   // 外形深度 (mm) = 管束深度 + 前后端板(20×2)
  // === 接水盘尺寸计算（P5：补充深度/盘高）===
  var eliminatorDepthEst = 100;  // 挡水板深度 mm（2~3 折标准型，含框架）
  var drainPan = calcDrainPan(W, outerDepth, eliminatorDepthEst, 0.01, 30, 30, 50);
  var dripPanWidth = drainPan.width;               // 接水盘宽度 mm
  var areaPerRow = A_face * 11;
  // 经验值 11 m²/m²迎风面：每 1 m² 迎风面可布置约 11 m² 换热面积/排
  // 该系数是管径、管间距、翅片密度的综合结果，用于方案估算
  // 精确计算由 ε 法和 LMTD 法迭代确定

  // === 换热面积校核 ===
  // 实际可用总面积 = 每排换热面积 × 实际排数（含翅片，基于经验值）
  var areaAvailable = areaPerRow * coil_rows;
  // 铜管外表面积（不含翅片，用于参考对比）
  var areaTubeOnly = totalTubes * Math.PI * (tubeOD / 1000) * W;
  // LMTD 法所需面积（来自热力学迭代）
  var areaRequired = A_coil;
  // 面积裕度
  var areaMargin = areaRequired > 0 ? (areaAvailable / areaRequired - 1) * 100 : 0;
  // 面积校核结论
  var areaCheck = areaRequired > 0
    ? (areaMargin >= 0
        ? "✅ 可用面积 " + fmt(areaAvailable,1) + " m² ≥ 所需 " + fmt(areaRequired,1) + " m²，裕度 " + fmt(areaMargin,1) + "%"
        : "⚠️ 可用面积 " + fmt(areaAvailable,1) + " m² < 所需 " + fmt(areaRequired,1) + " m²，不足 " + fmt(Math.abs(areaMargin),1) + "%")
    : "—（LMTD 未计算）";

  // === 盘管供给能力校核 ===
  var supplyMsg = "";
  var supplyShortfall = 0;
  var maxSupplyCOOLING = 0;
  if (Q_coil > 0 && K_coil > 0 && LMTD > 0 && areaAvailable > 0) {
    maxSupplyCOOLING = K_coil * areaAvailable * LMTD / F_foul;
    var supplyMargin = (maxSupplyCOOLING / Q_coil - 1) * 100;
    if (supplyMargin < -5) {
      supplyShortfall = Q_coil - maxSupplyCOOLING;
      supplyMsg = "⚠️ 需求冷量 " + fmt(Q_coil,1) + " kW > 盘管最大供给 " + fmt(maxSupplyCOOLING,1) + " kW，短缺 " + fmt(supplyShortfall,1) + " kW。当前 " + fmt(W*1000,0) + "×" + fmt(H*1000,0) + "mm(" + fmt(A_face,3) + "m²) + " + coil_rows + "排结构无法满足负荷需求，建议增大迎风面或增加排数。";
    } else if (Math.abs(supplyMargin) <= 5) {
      supplyMsg = "✅ 盘管供给能力与需求基本匹配（裕度 " + fmt(supplyMargin,1) + "%）";
    } else {
      supplyMsg = "✅ 盘管供给能力充足，裕度 " + fmt(supplyMargin,1) + "%";
    }
  } else {
    supplyMsg = "—（缺少 K 或 LMTD 数据，无法校核）";
  }
  var V_ch_effective = (supplyShortfall > 0 && maxSupplyCOOLING > 0) ? maxSupplyCOOLING / (4.187 * chwDT) / 1000 * 3600 : V_ch;
  var coil_ok = supplyShortfall <= 0;

  // 管内流速（N 个回路并联，流量按 circuits 分流）
  var waterVel = (V_ch_effective > 0 && tubeID > 0 && circuits > 0) ?
    V_ch_effective / 3600 / (Math.PI * (tubeID/1000) * (tubeID/1000) / 4 * circuits) : 0;
  // GB 50736 推荐 1.0~2.0 m/s；低于 0.5 时空气无法排出，高于 3.0 会冲蚀铜管
  var waterVelMsg = "";
  if (waterVel <= 0) waterVelMsg = "—（无流量）";
  else if (waterVel < 0.5) waterVelMsg = "⚠️ 流速 " + fmt(waterVel,2) + " m/s 过低（<0.5），空气无法排出，建议减至 " + circuits_rec + " 回路";
  else if (waterVel < 1.0) waterVelMsg = "⚠️ 流速 " + fmt(waterVel,2) + " m/s 偏低，建议调至 " + circuits_rec + " 回路达 1.5m/s";
  else if (waterVel <= 2.0) waterVelMsg = "✅ 流速 " + fmt(waterVel,2) + " m/s 符合 GB 50736 (1.0~2.0 m/s)";
  else if (waterVel <= 3.0) waterVelMsg = "⚠️ 流速 " + fmt(waterVel,2) + " m/s 偏高（>2.0），建议增至 " + circuits_rec + " 回路";
  else waterVelMsg = "⚠️ 流速 " + fmt(waterVel,2) + " m/s 过高（>3.0），会冲蚀铜管，建议增至 " + circuits_rec + " 回路";
  var waterVelOk = waterVel >= 1.0 && waterVel <= 2.0;

  // 推荐回路数（目标流速 1.5 m/s）
  var circuits_rec = (V_ch_effective > 0 && tubeID > 0) ?
    Math.ceil(V_ch_effective / 3600 / (Math.PI * (tubeID/1000) * (tubeID/1000) / 4 * 1.5)) : 4;

  // === P0: 翅片效率计算（Schmidt 公式）===
  var alphaAir_coil = v_face > 0 ? calcAlphaAir(v_face, 0.0035, xi_lmtd, (T_in + T_out) / 2) : 0;
  var lambdaFin_coil = 237;  // 铝翅片 237 W/(m·K)
  var deltaFin_coil = 0.00013;  // 0.13mm（典型值）
  var finPitch_coil = fin_spacing / 1000;  // mm→m
  var finEff = calcFinEfficiency(alphaAir_coil, lambdaFin_coil, deltaFin_coil,
    tubeOD / 1000, tubeSpacing / 1000, rowSpacing / 1000, finPitch_coil, 1);
  var etaFin = finEff.etaFin;
  var etaSurface = finEff.etaSurface;
  var etaFinMsg = (etaFin > 0 && etaFin < 0.99) ? "" : "（翅片效率接近1，翅片有效性高）";

  // === P0: 空气侧压降计算 ===
  var rho_air_coil = vol_m3s > 0 && A_face > 0 ? vol_m3s / v_face / A_face : 1.2;
  // 用进口密度近似
  var W_in_rho = calcHumidityRatio(T_in, rhIn, pa);
  rho_air_coil = rhoMoistAir(pa, T_in, W_in_rho);
  var finType_calc = parseInt(document.getElementById("cd-finType").value) || 0;
  var deltaP_air = calcAirSideDrop(v_actual, rho_air_coil, coil_rows, xi_lmtd, finType_calc, 0.5);
  var deltaP_air_dry = calcAirSideDrop(v_actual, rho_air_coil, coil_rows, 1.0, finType_calc, 0.5);

  // === P0: 水侧压降计算 ===
  var L_circuit = W * 2;  // 近似：单回路管长 = 宽度 × 来回
  if (circuits > 0) L_circuit = totalTubes / circuits * W * 2;  // 更准确
  var waterDrop = waterVel > 0 ? calcWaterSideDrop(waterVel, tubeID / 1000, L_circuit, (T_chw_in + T_chw_out) / 2) : { deltaP: 0, deltaP_mPa: 0, f: 0, Re: 0 };
  var deltaP_water = waterDrop.deltaP;
  var deltaP_water_kPa = waterDrop.deltaP_mPa;

  var dewPoint = calcDewPoint((rhIn / 100) * satPressure(T_in));
  var dewPointValid = !isNaN(dewPoint);

  // === P2: 分项合成 K 值法 ===
  var alphaAir_precise = v_face > 0 ? calcAlphaAir(v_face, 0.0035, xi_lmtd, (T_in + T_out) / 2) : 0;
  var alphaWater_precise = tubeID > 0 && waterVel > 0 ? calcAlphaWater(waterVel, tubeID / 1000, (T_chw_in + T_chw_out) / 2) : 0;
  var K_precise = (alphaAir_precise > 0 && alphaWater_precise > 0)
    ? calcCoilKPrecise(alphaAir_precise, alphaWater_precise, etaSurface,
        tubeOD / 1000, tubeID / 1000, 393, 0.0002, xi_lmtd)
    : 0;
  var K_diff = K_coil > 0 && K_precise > 0 ? Math.abs(K_precise - K_coil) / K_coil * 100 : 0;
  var K_agree = K_diff <= 15 ? "✅ 一致性良好（差异 " + fmt(K_diff, 1) + "%）" : "⚠️ 差异较大（" + fmt(K_diff, 1) + "%），建议使用分项合成法作为参考";

  // 两法排数差异
  var rowsAgree = (rows_calc > 0 && cf.valid) ? Math.abs(rows_calc - cf.rows) <= 2 : null;

  var modeLabel = isCheckMode ? "🔍 校核模式" : "❄ 设计模式";
  var modeDesc = isCheckMode ? "（根据已有盘管几何校核实际冷量：W×H=" + fmt(W*1000,0) + "×" + fmt(H*1000,0) + "mm，排数=" + coil_rows + "，回路=" + circuits + "）" : "";
  document.getElementById("cd-coil-result").innerHTML = buildDesignReport(modeLabel + " 表冷器" + modeDesc, [
    { title: "一、设计输入参数", lines: [
      { label: "设计制冷负荷 Q_coil", value: fmt(Q_coil, 2) + " kW" },
      { label: "处理风量", value: fmt(volFlow, 0) + " m³/h (" + fmt(vol_m3s, 3) + " m³/s)" },
      { label: "入口空气温度", value: fmt(T_in, 1) + " ℃" },
      { label: "出口空气温度", value: fmt(T_out, 1) + " ℃" },
      { label: "表冷器出口温度 T_coil", value: fmt(T_coil, 1) + " ℃" }
    ]},
    { title: "二、迎面尺寸计算", lines: [
      { label: "推荐迎面风速", value: fmt(v_face, 1) + " m/s（GB/T 14294-2026 推荐 2.0~2.5）" },
      { label: "迎面面积 A_face = Q_v / v", value: fmt(A_face, 3) + " m²" },
      { label: "宽度 W = √(A×λ)（管长方向）", value: fmt(W * 1000, 0) + " mm（宽高比 λ=" + fmt(ar, 1) + "，管内水流沿 W 方向）" },
      { label: "高度 H = A/W（堆叠方向）", value: fmt(H * 1000, 0) + " mm（铜管沿 H 方向垂直堆叠，孔数=H/管间距）" },
      { label: "实际迎面风速", value: fmt(v_actual, 2) + " m/s" + (v_actual >= 2.0 && v_actual <= 2.5 ? " ✅ 符合要求" : " ⚠️ 超出推荐范围 2.0~2.5") }
    ]},
    { title: "三、盘管结构参数", lines: [
      { label: "建议排数", value: coil_rows + " 排" + (coil_rows === 2 ? "（低负荷）" : coil_rows <= 4 ? "（中等负荷）" : coil_rows <= 6 ? "（高负荷）" : "（超高负荷）") },
      { label: "翅片间距", value: fmt(fin_spacing, 1) + " mm（除湿工况取小值）" },
      { label: "翅片类型", value: "亲水铝箔翅片，波纹型" },
      { label: "翅片厚度", value: "0.12~0.15 mm" },
      { label: "换热管规格", value: "φ" + tubeOD + "×" + fmt(tubeWT, 1) + "mm 紫铜管 TP2M" },
      { label: "管排方式", value: "等边三角形排列，管间距 " + tubeSpacing + "mm" },
      { label: "每排孔数", value: tubesPerRow > 0 ? tubesPerRow + " 孔（= H ÷ 管间距）" : "—" }
    ]},
    { title: "三-1、盘管面积热力学计算（LMTD 法 + 焓差法）", lines: [
      { label: "冷冻水供/回水温度", value: T_chw_in + " / " + fmt(T_chw_out, 1) + " ℃（ΔT=" + chwDT + "℃）" },
      { label: "ΔT₁（空气入−水出）", value: fmt(dT1, 2) + " ℃" },
      { label: "ΔT₂（空气出−水入）", value: fmt(dT2, 2) + " ℃" },
      { label: "对数平均温差 LMTD", value: LMTD > 0 ? fmt(LMTD, 2) + " ℃" : "—（温差不足，无法计算）" },
      { label: "析湿系数 ξ", value: xi_lmtd > 1.01 ? fmt(xi_lmtd, 3) + "（湿工况）" : "1.000（干工况）" },
      { label: "传热系数 K（经验公式）", value: K_coil > 0 ? fmt(K_coil, 1) + " W/(m²·K)（迎面风速" + fmt(v_face,1) + " m/s, ξ=" + fmt(xi_lmtd,2) + "）" : "45 W/(m²·K)（默认）" },
      { label: "传热系数 K（分项合成法）", value: K_precise > 0 ? fmt(K_precise, 1) + " W/(m²·K)（α_air=" + fmt(alphaAir_precise, 1) + ", α_water=" + fmt(alphaWater_precise, 1) + ", η_s=" + fmt(etaSurface*100, 1) + "%）" : "—（数据不足，需α_air和α_water均>0）" },
      { label: "两法对照", value: (K_coil > 0 && K_precise > 0) ? K_agree : "—" },
      { label: "对数平均焓差 Δhm（湿工况）", value: dh_m > 0 ? fmt(dh_m, 2) + " kJ/kg" : "—" },
      { label: "污垢系数 F_foul", value: "1.10" },
      { label: "表冷器负荷(输入) Q_coil", value: fmt(Q_coil, 2) + " kW（含潜热）" },
      { label: "显热冷量 Q_sen = ṁ·Cp·ΔT", value: fmt(Q_sensible, 2) + " kW" },
      { label: "显热占比", value: fmt(sen_ratio, 1) + "%" },
      { label: "所需换热面积 A = Q_coil×1000/(K·LMTD)·F", value: A_coil > 0 ? fmt(A_coil, 2) + " m²（基于总冷量）" : "—" },
      { label: "反推排数（迭代校核）", value: rows_calc > 0 ? rows_calc + " 排" : "—" },
      { label: "⚠ 注意", value: "LMTD 法仅适用于纯显热换热。除湿工况含大量潜热(约占 " + fmt(100 - sen_ratio, 1) + "%)，用总冷量反推排数会虚高。实际排数应以接触系数法为准。" }
    ]},
    { title: "三-2、接触系数法（ε 法，《空气调节设计手册》第三版）", lines: cf.valid ? [
      { label: "方法说明", value: "冷却干燥(减焓降湿)工况,用接触系数 ε 反推盘管排数" + ((cf.T1 - cf.ts1 < 2) ? "（进口近饱和，自动采用焓值法修正——工程近似，非标准方法）" : "") },
      { label: "迎面风速 v_y", value: fmt(v_face, 2) + " m/s（用于 ε 风速修正和 K 值计算）" },
      { label: "入口干球温度 tg₁", value: fmt(cf.T1, 1) + " ℃" },
      { label: "入口湿球温度 ts₁(= tg₁ 迭代)", value: fmt(cf.ts1, 2) + " ℃" },
      { label: "入口干湿球温差 tg₁−ts₁", value: fmt(cf.T1 - cf.ts1, 2) + " ℃" },
      { label: "盘管出口干球 tg₂(=T_coil)", value: fmt(cf.T_coil, 1) + " ℃（再热前）" },
      { label: "盘管出口湿球 ts₂(= tg₂ 迭代, RH≈" + fmt(cf.rh_coil, 0) + "%)", value: fmt(cf.ts2, 2) + " ℃" },
      { label: "盘管出口干湿球温差 tg₂−ts₂", value: fmt(cf.T_coil - cf.ts2, 2) + " ℃" },
      { label: "旁通系数 BF = (tg₂−ts₂)/(tg₁−ts₁)", value: fmt(cf.BF, 4) },
      { label: "接触系数 ε = 1 − BF", value: fmt(cf.eps, 4), bold: true },
      { label: "析湿系数 ξ（= Δh/Cp·Δt）", value: cf.xi != null ? fmt(cf.xi, 3) + "（" + (cf.xi > 1.05 ? "湿工况" : "干工况") + "）" : "—" },
      { label: "入口焓 i₁", value: fmt(cf.i1, 2) + " kJ/kg" },
      { label: "出口焓 i₂", value: fmt(cf.i2, 2) + " kJ/kg" },
      { label: "焓降 Δi = i₁ − i₂", value: fmt(cf.d_i, 2) + " kJ/kg" },
      { label: "冷量 Q = ṁ × Δi", value: fmt(cf.Q, 2) + " kW" },
      { label: "入口露点(校核用)", value: isNaN(cf.dewIn) ? "—" : fmt(cf.dewIn, 2) + " ℃" },
      { label: "盘管表面温度 T₃（传热迭代）", value: fmt(cf.T3, 2) + " ℃（冷水平均 " + fmt(cf.T_w_avg,2) + "℃ + 传热温差）" },
      { label: "反推排数(查 ε-排数表, 风速修正)", value: cf.rows + " 排 — " + cf.rowsSource },
      { label: "冷水流量 W = Q/(c_w·Δt_w)", value: fmt(cf.W_chw, 3) + " kg/s（Δt_w=" + cf.chwDT + "℃）" },
      { label: "冷水终温 t_w2 = t_w1 + Q/(c_w·W)", value: fmt(cf.T_w2, 2) + " ℃" },
      { label: "校核提示", value: cf.msgs.length > 0 ? cf.msgs.join("；") : "✅ 各项校核通过" }
      // 高湿工况排数提示:当接触系数法排数偏少但进口湿度高时,建议参考 LMTD 法
    ].concat((cf.valid && cf.rows <= 4 && cf.T1 - cf.ts1 < 3) ? [
      { label: "⚠ 高湿工况提示", value: "进口干湿球差仅 " + fmt(cf.T1 - cf.ts1, 2) + "℃(近饱和)，湿球温差法可能低估排数。建议参考 LMTD 法排数(" + (rows_calc > 0 ? rows_calc + " 排" : "无结果") + ")或取二者较大值。" }
    ] : [])
    : [
      { label: "方法说明", value: "接触系数法仅适用于冷却干燥(减焓降湿)工况" },
      { label: "结果", value: "⚠ " + (cf.msgs.join("；") || "当前工况不适用") }
    ]},
    { title: "三-3、两种方法对照印证", lines: (rows_calc > 0 && cf.valid) ? [
      { label: "LMTD 法排数（总冷量反推）", value: rows_calc + " 排（K=" + fmt(K_coil,1) + " W/m²K, ξ=" + fmt(xi_lmtd,2) + "）" },
      { label: "接触系数法排数（ε 法）", value: cf.rows + " 排（ε=" + fmt(cf.eps,3) + ", v_y=" + fmt(v_face,1) + "m/s）" },
      { label: "排数差异", value: Math.abs(rows_calc - cf.rows) + " 排" + (rowsAgree ? " ✅ 一致性良好(≤2排)" : " ⚠️ 差异较大") },
      { label: "差异说明", value: "LMTD 用总冷量(含潜热)反推→排数偏高;接触系数法用干湿球温差查表→更准确。差异 " + Math.abs(rows_calc - cf.rows) + " 排主要由潜热占比 " + fmt(100 - sen_ratio, 1) + "% 引起。" },
      { label: "印证结论", value: rowsAgree ? "两种方法排数一致,盘管选型可靠" : "LMTD 法仅作参考,以接触系数法结果为准。" }
    ] : [
      { label: "对照状态", value: "需两种方法均有有效结果才能对照(当前接触系数法不适用或 LMTD 无结果)" }
    ]},
    { title: "三-4、盘管结构详细参数", lines: [
      { label: "每排孔数 = H / 管间距", value: tubesPerRow > 0 ? tubesPerRow + " 孔（H=" + fmt(H*1000,0) + "mm ÷ " + tubeSpacing + "mm = " + fmt(H*1000/tubeSpacing,1) + "→取整" + tubesPerRow + "）" : "—" },
      { label: "总管数", value: totalTubes > 0 ? totalTubes + " 根" : "—" },
      { label: "水回路数", value: circuits + " 回路" },
      { label: "每回路管数", value: tubesPerCircuit > 0 ? tubesPerCircuit + " 根" : "—" },
      { label: "管内流速 v_w", value: waterVel > 0 ? fmt(waterVel, 2) + " m/s — " + waterVelMsg : "—" },
      { label: "管内径", value: fmt(tubeID, 1) + " mm" },
      { label: "总管路长度", value: totalTubeLength > 0 ? fmt(totalTubeLength, 1) + " m" : "—" },
      { label: "每排换热面积(估算)", value: fmt(areaPerRow, 1) + " m²/排（经验值 11 m²/m²迎风面）" },
      { label: "盘管深度（气流方向）", value: fmt(coil_rows * rowSpacing, 0) + " mm（" + (rowSpacing ? rowSpacing + "mm/排" : "") + "×" + coil_rows + "排）" },
      { label: "表冷器段总长（含端板）", value: fmt(calcCoilSectionLength(coil_rows, rowSpacing) * 1000, 0) + " mm（排距" + (rowSpacing ? fmt(rowSpacing, 1) : "80") + "mm×" + coil_rows + "排 + 前后端板 40mm）" }
    ]}
  ]);
  // === 换热面积校核（三-4.5）===
  document.getElementById("cd-coil-result").innerHTML += buildDesignReport("", [
    { title: "三-4.5、换热面积校核", lines: (A_coil > 0) ? [
      { label: "所需面积（LMTD 法）", value: fmt(areaRequired, 2) + " m²（基于冷量 Q=" + fmt(Q_coil, 2) + "kW, K=" + fmt(K_coil, 1) + "W/m²K, LMTD=" + fmt(LMTD, 2) + "℃）" },
      { label: "可用面积（结构布置）", value: fmt(areaAvailable, 2) + " m²（= " + fmt(areaPerRow, 2) + " m²/排 × " + coil_rows + "排，含翅片）" },
      { label: "铜管外表面积（参考）", value: fmt(areaTubeOnly, 2) + " m²（= " + totalTubes + "根 × π × φ" + tubeOD + " × " + fmt(W*1000,0) + "mm，仅管子不计翅片）" },
      { label: "面积裕度", value: fmt(areaMargin, 1) + "%", bold: true },
      { label: "校核结论", value: areaCheck },
      { label: "盘管最大供给冷量", value: maxSupplyCOOLING > 0 ? fmt(maxSupplyCOOLING, 1) + " kW（基于 K=" + fmt(K_coil,1) + " × A=" + fmt(areaAvailable,1) + " × LMTD=" + fmt(LMTD,1) + " / F=" + fmt(F_foul,2) + "）" : "—" },
      { label: "供给 vs 需求", value: supplyMsg, bold: !coil_ok }
    ] : [
      { label: "校核状态", value: "LMTD 法未计算出有效面积（冷量或温差不足），无法校核" }
    ]}
  ]);
  // === P0: 新增翅片效率与压降计算结果 ===
  document.getElementById("cd-coil-result").innerHTML += buildDesignReport("", [
    { title: "三-4.5、翅片效率与压降计算", lines: [
      { label: "空气侧换热系数 α_air", value: fmt(alphaAir_coil, 2) + " W/(m²·K)（迎面风速 " + fmt(v_actual, 2) + "m/s, 析湿系数 ξ=" + fmt(xi_lmtd, 3) + "）" },
      { label: "翅片效率 η_f（Schmidt 公式）", value: fmt(etaFin * 100, 1) + "% " + etaFinMsg },
      { label: "表面效率 η_s = 1−A_f/A_total·(1−η_f)", value: fmt(etaSurface * 100, 1) + "%" },
      { label: "翅片面积占比 A_f/A_total", value: finEff.Atotal > 0 ? fmt(finEff.Afin / finEff.Atotal * 100, 1) + "%" : "—" },
      { label: "空气侧压降 ΔP_air", value: fmt(deltaP_air, 0) + " Pa（干工况 " + fmt(deltaP_air_dry, 0) + " Pa，湿工况修正系数 " + fmt(Math.pow(xi_lmtd, 0.6), 3) + "）", bold: true },
      { label: "平均每排压降", value: coil_rows > 0 ? fmt(deltaP_air / coil_rows, 0) + " Pa/排" : "—" },
      { label: "管内流速 v_w", value: waterVel > 0 ? fmt(waterVel, 2) + " m/s" : "—" },
      { label: "水侧摩擦因子 f（Blasius）", value: fmt(waterDrop.f, 4) },
      { label: "水侧沿程阻力", value: deltaP_water > 0 ? fmt(waterDrop.deltaP_friction, 0) + " Pa（U弯 " + Math.floor(L_circuit / 0.5 / 2) + " 个）" : "—" },
      { label: "水侧局部阻力", value: deltaP_water > 0 ? fmt(waterDrop.deltaP_local, 0) + " Pa（集水管进出+U弯）" : "—" },
      { label: "水侧总压降 ΔP_water", value: deltaP_water > 0 ? fmt(deltaP_water, 0) + " Pa（" + fmt(deltaP_water_kPa, 2) + " kPa）" : "—", bold: true }
    ]}
  ]);
  // 插入表冷器外形尺寸
  document.getElementById("cd-coil-result").innerHTML += buildDesignReport("", [
    { title: "三-5、表冷器外形尺寸", lines: [
      { label: "迎风面宽度（净宽）", value: fmt(W * 1000, 0) + " mm" },
      { label: "迎风面高度（净高）", value: fmt(H * 1000, 0) + " mm" },
      { label: "管束深度（气流方向）", value: fmt(coil_rows * rowSpacing, 0) + " mm（" + (rowSpacing ? fmt(rowSpacing,1) : "") + "mm/排 × " + coil_rows + "排）" },
      { label: "每根换热管有效长度", value: fmt(W * 1000, 0) + " mm" },
      { label: "单排管总长度", value: tubeLenPerRow > 0 ? fmt(tubeLenPerRow, 1) + " m" : "—" },
      { label: "总管路长度（各排合计）", value: totalTubeLength > 0 ? fmt(totalTubeLength, 1) + " m" : "—" },
      { label: "管束高度（管间距×孔数）", value: fmt(bundleHeight * 1000, 0) + " mm（" + tubeSpacing + "mm × " + tubesPerRow + "孔）" + (Math.abs(bundleHeight - H) > 0.05 ? " ⚠ " + fmt(H * 1000, 0) + "mm(迎风高) vs " + fmt(bundleHeight * 1000, 0) + "mm(管束高)偏差" + fmt(Math.abs(bundleHeight - H) * 1000, 0) + "mm" : " ✅ 与迎风面高度一致") },
      { label: "表冷器外形尺寸（宽×高×深）", value: outerWidth + " × " + outerHeight + " × " + outerDepth + " mm（宽含框架及U弯(70mm)+集水管侧(130mm)，集水管沿H方向布置、下进上出）" },
      { label: "接水盘宽度", value: dripPanWidth + " mm（两侧各宽出 30mm，覆盖盘管+挡水板投影）" },
      { label: "接水盘深度", value: fmt(drainPan.depth, 0) + " mm（盘管深 " + outerDepth + " + 挡水板深 " + eliminatorDepthEst + " + 前后余量 60）" },
      { label: "接水盘侧高", value: fmt(drainPan.lowSideHeight, 0) + " ~ " + fmt(drainPan.highSideHeight, 0) + " mm（低侧≥50mm，坡度 1% 引起高侧升高 " + fmt(drainPan.highSideHeight - drainPan.lowSideHeight, 0) + "mm）" },
      { label: "接水盘材质/坡度", value: drainPan.material + "，坡度 ≥ 1%，排水口在最低点" },
      { label: "排水管", value: drainPan.drainPipe + " PVC-U + P 型存水弯 ≥ " + drainPan.trapHeight + "mm（防负压倒吸）" }
    ]}
  ]);
  // 插入盘管排列示意图 (在"三-5"之后, "四"之前)
  var scHtml = renderCoilSchematic(W, H, coil_rows, tubesPerRow, circuits, tubeSpacing, rowSpacing, tubeOD);
  document.getElementById("cd-coil-result").innerHTML +=
    '<div class="design-section"><h5>三-6、盘管排列示意图</h5>' + scHtml + '</div>';
  document.getElementById("cd-coil-result").innerHTML += buildDesignReport("", [
    { title: "四、冷冻水系统", lines: [
      { label: "冷冻水流量 V_ch", value: fmt(V_ch, 2) + " m³/h" },
      { label: "供回水温差", value: fmt(chwDT, 1) + " ℃" },
      { label: "管内流速", value: waterVel > 0 ? fmt(waterVel, 2) + " m/s" + (waterVelOk ? " ✅ GB 50736 1.0~2.0" : " ⚠️ " + circuits_rec + " 回路推荐") : "—" },
      { label: "当前回路数", value: circuits + " 路" },
      { label: "推荐回路数", value: circuits_rec + " 路（目标流速 1.5m/s）" },
      { label: "接管口径", value: V_ch > 10 ? "DN50" : V_ch > 4 ? "DN40" : "DN32" },
      { label: "接管方式", value: "下进上出（集水管沿 H 方向布置在 W 一侧，底部进水、顶部出水，顶部设自动排气阀）" },
      { label: "接水盘", value: "不锈钢，坡度 ≥ 1%，配 DN32 排水管 + 存水弯 ≥50mm" }
    ]},
    { title: "五、材料与标准", lines: [
      { label: "换热管（标准型）", value: "紫铜 TP2M，φ" + tubeOD + "×" + fmt(tubeWT,1) + "mm，GB/T 1527-2017" },
      { label: "换热管（防腐型）", value: "316L 不锈钢，φ" + tubeOD + "×" + fmt(tubeWT,1) + "mm，GB/T 14976" },
      { label: "翅片（标准型）", value: "铝箔 3003，亲水涂层，GB/T 3880-2012" },
      { label: "翅片（防腐型）", value: "环氧涂层铝箔或铜翅片（GB/T 23341.1-2018 进风洁净度 III 类以上）" },
      { label: "端板", value: "热镀锌钢板 2.0mm，GB/T 2518-2019" },
      { label: "集水管", value: "无缝钢管 20#，GB/T 8163-2018" },
      { label: "执行标准", value: "GB/T 14294-2026《组合式空调机组》、GB/T 19232-2003《风机盘管机组》" },
      { label: "设计压力", value: "1.6 MPa（水压试验 2.4 MPa）" }
    ]},
    { title: "六、设计校核", lines: [
      { label: "迎面风速", value: fmt(v_actual, 2) + " m/s → " + (v_actual >= 2.0 && v_actual <= 2.5 ? "✅ 合格" : "⚠️ 需调整") },
      { label: "排数选择", value: coil_rows + " 排 → " + (Q_coil > 0 ? "✅ 满足负荷要求" : "当前无制冷需求") },
      { label: "冷量供给校核", value: supplyMsg, bold: (!coil_ok && supplyShortfall > 0) },
      { label: "管内流速", value: waterVel > 0 ? fmt(waterVel, 2) + " m/s → " + waterVelMsg : "—" },
      { label: "露点温度校核", value: dewPointValid ? ("入口露点约 " + fmt(dewPoint, 1) + "℃，T_coil=" + fmt(T_coil, 1) + "℃ → " + (T_coil < dewPoint ? "✅ 低于露点，可有效除湿" : "⚠️ 高于露点，除湿效果有限")) : "露点计算失败（入口水汽压过低）" },
      { label: "接管口径", value: "推荐 " + (V_ch_effective > 10 ? "DN50" : V_ch_effective > 4 ? "DN40" : "DN32") + " → 满足流量要求" }
    ]}
  ]);
  // 接近温差校核失败时，追加冷冻水优化建议
  if (cf.valid && T_coil_cd < T_chw_in + 1.0) {
    document.getElementById("cd-coil-result").innerHTML += renderChwSuggestion(T_chw_in, T_coil_cd, T_out);
  }

  // === 挡水板（防水板）选型 ===
  var eliminatorHtml = buildDesignReport("", [
    { title: "七、挡水板（防水板）选型", lines: [
      { label: "迎面风速", value: fmt(v_actual, 2) + " m/s（同表冷器段）" + (v_actual > 3.0 ? " ⚠️ 偏高,建议 ≤2.5m/s 以防带水" : v_actual < 1.5 ? " ⚠️ 偏低,建议 ≥1.5m/s" : " ✅ 适宜") },
      { label: "截面尺寸（宽×高）", value: fmt(W * 1000, 0) + " × " + fmt(H * 1000, 0) + " mm（同表冷器迎风面）" },
      { label: "板片材质", value: "304 不锈钢 0.8mm 波纹板" },
      { label: "折弯数", value: v_actual > 2.8 ? "3 折（高速型）" : v_actual > 2.3 ? "2~3 折" : "2 折（标准型）" },
      { label: "板片间距", value: v_actual > 2.8 ? "20 mm（小间距）" : "25 mm（标准间距）" },
      { label: "气流偏转角", value: "30°（与气流方向）" },
      { label: "推荐板片数量", value: Math.max(4, Math.ceil(H * 1000 / (v_actual > 2.8 ? 20 : 25)) - 1) + " 片" },
      { label: "压降估算", value: fmt(25 + v_actual * 12, 0) + " Pa（≈ 25 + " + fmt(v_actual,2) + "×12 = " + fmt(25 + v_actual * 12, 0) + " Pa，含干湿工况）" },
      { label: "底部排水", value: "底部设排水槽（304SS），坡度 ≥1%，引至表冷器接水盘" },
      { label: "安装方式", value: "插装式，铝合金 C 型槽导轨固定，可从检修侧整体抽出清洗" }
    ]}
  ]);
  document.getElementById("cd-coil-result").innerHTML += eliminatorHtml;
}

// ============================================
// 盘管排列示意图生成 (SVG)
// 显示表冷器管子错排网格、回路颜色编码、U-bend 连接
// ============================================
/**
 * 渲染盘管排列示意图 (SVG)
 * 侧视图（沿气流方向看）：气流从左→右（深度方向），排数水平排列，每排孔数垂直排列
 * 管长方向 W 垂直于纸面（不在此视图中直接显示）
 * @param {number} W - 迎面宽度 m（管长方向，垂直于纸面）
 * @param {number} H - 迎面高度 m（铜管垂直堆叠方向）
 * @param {number} tubeSpacing - 管间距 mm（垂直方向管子间距=孔距）
 * @param {number} rowSpacing - 排距 mm（水平方向排间距）
 */
function renderCoilSchematic(W, H, coil_rows, tubesPerRow, circuits, tubeSpacing, rowSpacing, tubeOD) {
  if (!coil_rows || !tubesPerRow || coil_rows < 1 || tubesPerRow < 1) {
    return '<div class="physics-warnings"><p>盘管结构参数不足（排数或孔数为零），无法绘制排列示意图。</p></div>';
  }

  var VB_W = 1000, VB_H = 650;
  var mL = 80, mR = 60, mT = 70, mB = 130;
  var drawW = VB_W - mL - mR;   // 860
  var drawH = VB_H - mT - mB;   // 450
  var totalTubes = coil_rows * tubesPerRow;
  var cSafe = Math.max(circuits, 1);

  // 水平方向 = 排数 → 间距 = 排距 rowSpacing
  // 垂直方向 = 孔数 → 间距 = 管间距 tubeSpacing
  var colSpacing = Math.min(drawW / Math.max(coil_rows - 1, 1), Math.min(rowSpacing * 2.5, 55));
  var rowSpacing_svg = Math.min(drawH / Math.max(tubesPerRow - 1, 1), Math.min(tubeSpacing * 2.5, 50));

  var gridW = (coil_rows - 1) * colSpacing;
  var gridH = (tubesPerRow - 1) * rowSpacing_svg;
  var startX = mL + (drawW - gridW) / 2;
  var startY = mT + (drawH - gridH) / 2;

  var radius = Math.max(4, Math.min(Math.min(colSpacing, rowSpacing_svg) * 0.28, 18));
  var useUBends = totalTubes <= 30 && circuits > 1;
  var useLabels = totalTubes <= 50;
  var useFills = totalTubes < 60;

  var svg = '';
  svg += '<div class="process-flow-container">';
  svg += '<svg class="process-flow-svg" viewBox="0 0 ' + VB_W + ' ' + VB_H + '" xmlns="http://www.w3.org/2000/svg">';
  svg += '<defs>' +
    '<marker id="af-arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">' +
      '<polygon points="0 0,10 3.5,0 7" fill="#4a5568"/>' +
    '</marker>' +
  '</defs>';

  // 标题
  svg += '<text x="' + (VB_W / 2) + '" y="28" text-anchor="middle" font-size="15" font-weight="bold" fill="#2d3748">冷却盘管排列示意图（侧视图：沿气流方向看）</text>';
  svg += '<text x="' + (VB_W / 2) + '" y="46" text-anchor="middle" font-size="11" fill="#718096">水平=排数(深度方向) | 垂直=每排孔数(H方向) | 管间距 ' + tubeSpacing + 'mm × 排距 ' + rowSpacing + 'mm | 等边三角形错排</text>';
  svg += '<text x="' + (VB_W / 2) + '" y="60" text-anchor="middle" font-size="10" fill="#A0AEC0">管长方向 W 垂直于纸面（铜管沿 W 方向布置，水在管内沿 W 方向流动）</text>';
  svg += '<text x="' + (VB_W / 2) + '" y="73" text-anchor="middle" font-size="10" fill="#A0AEC0">集水管(联箱)沿 H 方向布置在 W 一侧，底部进水→顶部出水（下进上出）</text>';

  // 气流方向箭头（顶部水平）
  var arrowY = startY - 18;
  svg += '<line x1="' + startX + '" y1="' + arrowY + '" x2="' + (startX + gridW) + '" y2="' + arrowY + '" stroke="#4a5568" stroke-width="2" marker-end="url(#af-arrow)"/>';
  svg += '<text x="' + ((2 * startX + gridW) / 2) + '" y="' + (arrowY - 5) + '" text-anchor="middle" font-size="11" fill="#4a5568" font-weight="bold">气流方向 →</text>';

  // U-bend 连接线
  if (useUBends) {
    var circuitsByColor = {};
    for (var ti = 0; ti < tubesPerRow; ti++) {
      for (var ri = 0; ri < coil_rows; ri++) {
        var ci = (ti * coil_rows + ri) % cSafe;
        if (!circuitsByColor[ci]) circuitsByColor[ci] = [];
        var cx = startX + ri * colSpacing + (ti % 2 === 1 ? rowSpacing_svg * 0.5 : 0);
        var cy = startY + ti * rowSpacing_svg;
        circuitsByColor[ci].push({ x: cx, y: cy, ri: ri, ti: ti });
      }
    }
    for (var ci in circuitsByColor) {
      var tubes = circuitsByColor[ci];
      tubes.sort(function(a,b) { return a.ti - b.ti || a.ri - b.ri; });
      var colr = getCircuitColor(parseInt(ci));
      for (var k = 0; k < tubes.length - 1; k++) {
        var a = tubes[k], b = tubes[k + 1];
        var dist = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
        if (dist < Math.max(colSpacing, rowSpacing_svg) * 1.6) {
          svg += '<line x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) + '" stroke="' + colr + '" stroke-width="1.2" opacity="0.35" stroke-dasharray="3,2"/>';
        }
      }
    }
  }

  // 画管子：外层=孔数(垂直,Y), 内层=排数(水平,X, 错排)
  for (var ti = 0; ti < tubesPerRow; ti++) {
    for (var ri = 0; ri < coil_rows; ri++) {
      // 水平位置：排距 × 排序号；垂直位置：管间距 × 管序号 + 错排偏移
      var cx = startX + ri * colSpacing;
      var cy = startY + ti * rowSpacing_svg + (ri % 2 === 1 ? rowSpacing_svg * 0.5 : 0);
      var circuitIdx = (ti * coil_rows + ri) % cSafe;

      var fill = useFills ? getCircuitColor(circuitIdx) : '#ffffff';
      var stroke = useFills ? getCircuitColor(circuitIdx) : '#718096';
      var sw = useFills ? 1.5 : 2;

      svg += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + radius.toFixed(1) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>';

      if (useLabels && circuits > 1) {
        var fs = Math.max(6, Math.min(radius * 0.8, 9));
        svg += '<text x="' + cx.toFixed(1) + '" y="' + (cy.toFixed(1) + fs * 0.35) + '" text-anchor="middle" font-size="' + fs + '" fill="#ffffff" font-weight="bold">' + (circuitIdx + 1) + '</text>';
      }
    }
  }

  // 排数标记（底部标注第几排）
  for (var ri = 0; ri < coil_rows; ri++) {
    var lx = startX + ri * colSpacing;
    svg += '<text x="' + lx.toFixed(1) + '" y="' + (startY + gridH + 18) + '" text-anchor="middle" font-size="10" fill="#718096">排' + (ri + 1) + '</text>';
  }

  // 图例
  var legY = VB_H - 100;
  svg += '<text x="30" y="' + (legY - 5) + '" font-size="12" font-weight="bold" fill="#2d3748">回路颜色图例：</text>';
  var maxLeg = Math.min(cSafe, 10);
  for (var c = 0; c < maxLeg; c++) {
    var lx = 30 + c * 90;
    var lc = getCircuitColor(c);
    svg += '<circle cx="' + (lx + 8) + '" cy="' + (legY + 12) + '" r="7" fill="' + lc + '" stroke="#fff" stroke-width="1.5"/>';
    svg += '<text x="' + (lx + 20) + '" y="' + (legY + 16) + '" font-size="10" fill="#4a5568">回路 ' + (c + 1) + '</text>';
  }
  if (cSafe > 10) {
    svg += '<text x="' + (30 + 10 * 90 + 10) + '" y="' + (legY + 16) + '" font-size="10" fill="#718096">...共' + cSafe + '回路</text>';
  }

  // 底部标签
  var lblY = VB_H - 55;
  svg += '<text x="500" y="' + lblY + '" text-anchor="middle" font-size="13" font-weight="bold" fill="#2d3748">排数：' + coil_rows + '  |  每排孔数：' + tubesPerRow + '  |  回路数：' + circuits + '  |  管间距×排距：' + tubeSpacing + '×' + rowSpacing + 'mm</text>';
  svg += '<text x="500" y="' + (lblY + 18) + '" text-anchor="middle" font-size="11" fill="#718096">盘管 ' + (W * 1000).toFixed(0) + 'mm（宽） × ' + (H * 1000).toFixed(0) + 'mm（高）  |  管径 φ' + tubeOD + 'mm</text>';

  if (totalTubes >= 60) {
    svg += '<text x="500" y="' + (lblY + 36) + '" text-anchor="middle" font-size="10" fill="#e53e3e">⚠ 管数过多（' + totalTubes + '根），采用简化示意</text>';
  }

  svg += '</svg></div>';
  return svg;
}

/**
 * 冷冻水温度优化建议 — 当盘管出口温度低于供水温度限制时，给出可选方案
 */
function renderChwSuggestion(T_w_supply, T_coil, T_out) {
  // 方案配置：供水温度, 标签, 描述
  var options = [
    { Tw: 5, label: "5°C 标准",    desc: "调温控即可" },
    { Tw: 4, label: "4°C 加乙二醇", desc: "需加防冻液" },
    { Tw: 2, label: "2°C 乙二醇",  desc: "需低温系统" },
    { Tw: 0, label: "0°C 乙二醇",  desc: "需低温系统" },
    { Tw: -2,label: "−2°C 乙二醇", desc: "需专用机组" }
  ];

  var html = '<div class="design-section physics-warnings">';
  html += '<h5>❄ 冷冻水温度优化建议</h5>';
  html += '<table class="air-state-table">';
  html += '<tr><td colspan="5" class="highlight">当前设定：' + T_w_supply.toFixed(1) + '°C 供水</td></tr>';
  html += '<tr><td colspan="5" class="highlight">盘管出口 T_coil = ' + T_coil.toFixed(1) + '°C <span style="color:#e53e3e;">物理不可达</span>（低于供水+1.0°C 接近温差）</td></tr>';
  html += '<tr><td colspan="5" style="font-weight:bold;padding-top:6px;">要达到当前除湿效果，建议调整冷冻水方案：</td></tr>';
  html += '<tr><th style="text-align:left;padding:4px 8px;background:#edf2f7;">方案</th><th style="text-align:left;padding:4px 8px;background:#edf2f7;">供水温度</th><th style="text-align:left;padding:4px 8px;background:#edf2f7;">T_coil 可达</th><th style="text-align:left;padding:4px 8px;background:#edf2f7;">' + T_out.toFixed(0) + '°C 出口最低RH</th><th style="text-align:left;padding:4px 8px;background:#edf2f7;">说明</th></tr>';

  for (var i = 0; i < options.length; i++) {
    var opt = options[i];
    var t_coil = opt.Tw + 1.0;
    var W_coil = calcHumidityRatio(t_coil, 95, 101.325);
    var P_sat_T = satPressure(T_out);
    var RH = Math.min(99, W_coil * 101.325 / (0.622 + W_coil) / P_sat_T * 100);
    var rowClass = (opt.Tw >= T_coil - 0.5) ? ' style="background:#f0fff4;"' : '';
    html += '<tr' + rowClass + '>';
    html += '<td style="padding:3px 8px;">' + opt.label + '</td>';
    html += '<td style="padding:3px 8px;">' + opt.Tw.toFixed(0) + '°C</td>';
    html += '<td style="padding:3px 8px;">' + t_coil.toFixed(1) + '°C</td>';
    html += '<td style="padding:3px 8px;">' + RH.toFixed(0) + '%</td>';
    html += '<td style="padding:3px 8px;">' + opt.desc + '</td>';
    html += '</tr>';
  }

  html += '<tr><td colspan="5" style="padding-top:6px;font-size:11px;color:#718096;">或考虑：两级冷却（第一级标准7°C + 第二级深冷） / 转轮除湿方案</td></tr>';
  html += '</table></div>';
  return html;
}

/** 运行加热器设计计算 */
function runHeaterDesign() {
  var Q_reheat = parseFloat(document.getElementById("cd-Q_reheat").value) || 0;
  var volFlow = parseFloat(document.getElementById("cd-volFlow").value) || 0;
  var T_coil = parseFloat(document.getElementById("cd-T_coil").value) || 10;
  var T_out = parseFloat(document.getElementById("cd-tempOut").value) || 20;
  var massFlow = parseFloat(document.getElementById("cd-massFlow").value) || 0.5;

  var ep = getEngineeringParams();
  var v_face = 2.8;
  var vol_m3s = volFlow / 3600;
  var A_face = vol_m3s / v_face;
  var ar = ep.ar;
  var W = Math.sqrt(A_face * ar);
  var H = A_face / W;
  var v_actual = vol_m3s / (W * H);

  var P_elec = Q_reheat / 0.98;
  var surface_load = 3.0;

  var stages = P_elec <= 5 ? "无级调节（SSR）" : P_elec <= 15 ? "3级 + 无级微调" : "6级 + 无级微调";

  document.getElementById("cd-heater-result").innerHTML = buildDesignReport("🔥 电加热器详细设计", [
    { title: "一、设计输入参数", lines: [
      { label: "设计再热/预热负荷 Q_reheat", value: fmt(Q_reheat, 2) + " kW" },
      { label: "入口温度（表冷器出口/室外）", value: fmt(T_coil, 1) + " ℃" },
      { label: "目标出口温度", value: fmt(T_out, 1) + " ℃" },
      { label: "温升 ΔT", value: fmt(Math.max(0, T_out - T_coil), 1) + " ℃" },
      { label: "处理风量", value: fmt(volFlow, 0) + " m³/h" }
    ]},
    { title: "二、加热功率计算", lines: [
      { label: "加热量 Q_reheat", value: fmt(Q_reheat, 2) + " kW" },
      { label: "电热转换效率 η", value: "98%" },
      { label: "电加热功率 P_elec = Q / η", value: fmt(P_elec, 2) + " kW" }
    ]},
    { title: "三、迎面尺寸", lines: [
      { label: "推荐迎面风速", value: fmt(v_face, 1) + " m/s（GB 50019-2015 推荐 2.5~3.0 m/s）" },
      { label: "迎面面积", value: fmt(A_face, 3) + " m²" },
      { label: "宽度 × 高度", value: fmt(W * 1000, 0) + " × " + fmt(H * 1000, 0) + " mm" },
      { label: "实际迎面风速", value: fmt(v_actual, 2) + " m/s" + (v_actual >= 2.5 && v_actual <= 3.0 ? " ✅ 符合" : v_actual > 3.0 ? " ⚠️ 偏高" : " ⚠️ 偏低") }
    ]},
    { title: "四、电加热元件设计", lines: [
      { label: "表面负荷限量", value: fmt(surface_load, 1) + " W/cm²（安全值，≤3 W/cm²）" },
      { label: "发热管材质", value: "304 不锈钢，Incoloy 840" },
      { label: "发热管外径", value: "φ12.7 mm（翅片管）" },
      { label: "最高表面温度", value: "≤ 120℃（正常运行时）" }
    ]},
    { title: "五、控制方式", lines: [
      { label: "控制策略", value: stages },
      { label: "控制元件", value: "SSR（固态继电器）或 SCR（可控硅调功）" },
      { label: "温度传感器", value: "Pt100 或 NTC，出口管道安装" },
      { label: "控温精度", value: "±0.5℃（PID 闭环控制）" }
    ]},
    { title: "六、安全保护", lines: [
      { label: "超温保护", value: "80℃ 手动复位 + 105℃ 自动熔断" },
      { label: "缺风保护", value: "与风机联锁，风机停机自动切断加热器" },
      { label: "过流保护", value: "断路器 + 热继电器" },
      { label: "接地保护", value: "发热管外壳可靠接地" }
    ]},
    { title: "七、标准依据", lines: [
      { label: "设计标准", value: "GB/T 14294-2026《组合式空调机组》" },
      { label: "电气标准", value: "GB 5226.1-2008《机械电气安全》" },
      { label: "发热管标准", value: "JB/T 2379-2016《金属管状电热元件》" }
    ]}
  ]);
}

/** 加湿方式决策矩阵
 *  根据选择的方式、水质类型、出口温度，确定最终加湿方案。
 *  - 等温（蒸汽）：电极式需导电水（自来水）；纯水不导电→电极式失效，自动改电热式
 *  - 等焓（蒸发）：湿膜 / 高压喷雾，对水质要求为“过滤+低硬度”，纯水最佳
 */
function decideHumidMethod(methodSel, waterType, T_out) {
  var key;
  if (methodSel === "auto") {
    if (T_out >= 10) {
      // 蒸汽（等温）优先；纯水→电热式，自来水→电极式
      key = (waterType === "pure") ? "resistive" : "electrode";
    } else {
      // 低温环境默认湿膜（等焓），避免蒸汽在冷空气中冷凝
      key = "wetfilm";
    }
  } else {
    key = methodSel; // electrode / resistive / wetfilm / spray
  }

  var map = {
    electrode:  { name: "电极式蒸汽加湿", category: "等温（蒸汽）", heat: "蒸汽温度≈100℃，含湿量增加，温度基本不变" },
    resistive:  { name: "电热式（电阻式）蒸汽加湿", category: "等温（蒸汽）", heat: "加热元件沸腾产汽，含湿量增加，温度基本不变" },
    wetfilm:    { name: "湿膜加湿", category: "等焓（蒸发）", heat: "水沿湿膜蒸发吸热，含湿量增加，温度下降" },
    spray:      { name: "高压喷雾加湿", category: "等焓（蒸发）", heat: "高压微雾蒸发吸热，含湿量增加，温度下降" }
  };
  var info = map[key] || map.resistive;
  info.key = key;
  return info;
}

/** 运行加湿器设计计算（支持电极/电热/湿膜/高压喷雾，并修正纯水水质匹配） */
function runHumidifierDesign() {
  var m_humid = parseFloat(document.getElementById("cd-m_humid").value) || 0;
  var volFlow = parseFloat(document.getElementById("cd-volFlow").value) || 0;
  var T_out = parseFloat(document.getElementById("cd-tempOut").value) || 20;
  var massFlow = parseFloat(document.getElementById("cd-massFlow").value) || 0.5;
  var tempIn = parseFloat(document.getElementById("cd-tempIn").value) || 35;
  var rhIn = parseFloat(document.getElementById("cd-rhIn").value) || 80;
  var rhOut = parseFloat(document.getElementById("cd-rhOut").value) || 50;
  var pa = parseFloat(document.getElementById("cd-atmPressure") ? document.getElementById("cd-atmPressure").value : null) || 101.325;
  var waterType = (document.getElementById("cd-waterType") ? document.getElementById("cd-waterType").value : "pure") || "pure";
  var methodSel = (document.getElementById("cd-humidMethod") ? document.getElementById("cd-humidMethod").value : "auto") || "auto";

  if (m_humid <= 0) {
    document.getElementById("cd-humidifier-result").innerHTML =
      '<div class="physics-warnings"><p>💧 当前加湿量 = 0，无需加湿。若需设计加湿器，请在上方「加湿量 (kg/h)」输入正值，并选择水质与加湿方式。</p></div>';
    return;
  }

  var method = decideHumidMethod(methodSel, waterType, T_out);
  var isSteam = (method.category.indexOf("等温") >= 0);
  var isAdiabatic = !isSteam;

  var _epH = getEngineeringParams();
  var m_sel = Math.ceil(m_humid * _epH.KHumid);
  var vol_m3s = volFlow / 3600;
  var v_face = _epH.v_humid;
  var A_face = vol_m3s / v_face;
  var ar = _epH.ar;
  var W = Math.sqrt(A_face * ar);
  var H = A_face / W;

  var W_in = calcHumidityRatio(tempIn, rhIn, pa);
  var W_out = calcHumidityRatio(T_out, rhOut, pa);
  var deltaW = (W_out - W_in) * 1000;

  // 自来水进水流量（纯水由 RO 制取，回收率 65%）
  var roFlow = m_humid / 0.65;
  var roRated = Math.ceil(m_humid * 1.2 / 0.65);

  // ===== 兼容性校核（关键：电极式不能用纯水）=====
  var compat = [];
  if (method.key === "electrode" && waterType === "pure") {
    compat.push("❌ 严重不匹配：电极式加湿依赖水的导电性，纯水（≤5 μS/cm）近乎绝缘，无法产生蒸汽。已为您自动切换为「电热式蒸汽加湿」。");
    method = decideHumidMethod("resistive", waterType, T_out);
    isSteam = true; isAdiabatic = false;
  }
  if (method.key === "electrode" && waterType === "tap") {
    compat.push("✅ 匹配：电极式适用市政自来水（电导率宜 100~800 μS/cm）。");
  }
  if (method.key === "resistive") {
    compat.push(waterType === "pure"
      ? "✅ 匹配：电热式靠加热元件产汽，纯水可用且低结垢，推荐 RO 纯水。"
      : "✅ 匹配：电热式可用自来水，但长期运行易结垢，建议软化处理。");
  }
  if (method.key === "wetfilm") {
    compat.push(waterType === "pure"
      ? "✅ 匹配：湿膜用纯水最佳，无结垢堵塞风险。"
      : "⚠ 可用但需处理：湿膜用自来水须先软化+过滤，否则湿膜易结垢堵塞。");
  }
  if (method.key === "spray") {
    compat.push(waterType === "pure"
      ? "✅ 匹配：高压微雾喷嘴用纯水最佳，无堵塞风险。"
      : "⚠ 必须过滤：高压微雾喷嘴孔径仅 0.1~0.15mm，自来水须 ≤50μm 过滤并软化，否则严重堵塞。");
  }

  // ===== 功耗 =====
  var P_steam = m_humid * 0.75;            // 等温蒸汽：综合潜热+显热+热损失 ≈ 0.75 kW·h/kg
  var P_pump_spray = (m_humid / 1000 / 3600) * 70e5 / 0.55 / 1000; // 高压泵 70bar, η=0.55
  var P_wetfilm = 0.02;                    // 湿膜循环水泵，极小
  var powerStr, powerNote;
  if (method.key === "electrode" || method.key === "resistive") {
    powerStr = fmt(P_steam, 2) + " kW（电耗 " + fmt(m_humid * 0.75, 2) + " kW·h/kg 蒸汽，含潜热+显热+热损失）";
    powerNote = "等温加湿：电能全部转化为水蒸气潜热，送风温度基本不变。";
  } else if (method.key === "spray") {
    powerStr = fmt(P_pump_spray + 0.05, 2) + " kW（高压泵 " + fmt(P_pump_spray, 3) + " kW + 控制 " + fmt(0.05, 2) + " kW）";
    powerNote = "等焓加湿：仅消耗泵功，无电热耗，节能显著（约为蒸汽法的 1/50~1/100）。";
  } else { // wetfilm
    powerStr = fmt(P_wetfilm, 2) + " kW（仅循环水泵，可忽略）";
    powerNote = "等焓加湿：无电热耗，仅维持水循环，最节能。";
  }

  // ===== 温度影响分析（按加湿方式分别建模）=====
  var tempLines = [];
  var h_before = enthalpy(T_out, W_in);
  if (isSteam) {
    // 蒸汽加湿（近似等温）：饱和蒸汽焓 h_steam≈2676 kJ/kg，能量守恒求加湿后温度
    var h_steam = 2676;                                       // kJ/kg，饱和蒸汽≈100℃
    var h_after = h_before + (W_out - W_in) * h_steam;        // 湿空气能量平衡
    var T_after = tempFromEnthalpyAndW(h_after, W_out);
    var dT_steam = T_after - T_out;
    tempLines.push({ label: "对空气温度的影响", value: "基本无影响（近似等温，干球温度变化通常 ≤2℃）" });
    tempLines.push({ label: "原因", value: "饱和蒸汽(~100℃)焓≈2676 kJ/kg，加入空气后释放的显热≈把同量水汽化并升温至空气状态所需热量，干球温度几乎不变（仅因蒸汽温度高于空气而微升）" });
    tempLines.push({ label: "能量平衡式", value: "h₂ = h₁ + ΔW·h_steam = " + fmt(h_before, 2) + " + " + fmt((W_out - W_in) * 1000, 2) + " g/kg × 2676 = " + fmt(h_after, 2) + " kJ/kg" });
    tempLines.push({ label: "加湿后送风温度", value: fmt(T_after, 2) + "℃（变化 " + (dT_steam >= 0 ? "+" : "") + fmt(dT_steam, 2) + "℃）" });
  } else {
    // 等焓加湿（蒸发冷却）：焓不变，求加湿后温度；受湿球（饱和）极限约束
    var T_after = tempFromEnthalpyAndW(h_before, W_out);
    var dT_adiab = T_after - T_out;
    // 湿球极限：等焓过程终点为湿球温度，超过则空气已达饱和，多余水不蒸发
    var P_v1 = W_in * pa / (0.622 + W_in);
    var wb = calcWetBulb(P_v1, T_out, pa);
    var T_wb = wb ? wb.ts : T_after;
    var W_sat_wb = satPressure(T_wb) * 0.622 / (pa - satPressure(T_wb));
    var saturated = (W_out > W_sat_wb + 1e-6);
    tempLines.push({ label: "对空气温度的影响", value: "显著降低（等焓加湿，干球温度下降）" });
    tempLines.push({ label: "原因", value: "水蒸发吸收空气显热（蒸发冷却），过程焓值近似不变，含湿量增加的同时干球温度下降" });
    tempLines.push({ label: "等焓计算式", value: "h = const = " + fmt(h_before, 2) + " kJ/kg；求解 T₂ 使 h(T₂, W₂) = h" });
    if (saturated) {
      tempLines.push({ label: "加湿后送风温度", value: "理论等焓终点 " + fmt(T_after, 1) + "℃ 低于湿球极限 " + fmt(T_wb, 1) + "℃ → 实际达饱和极限 " + fmt(T_wb, 1) + "℃，仅可蒸发 ΔW≈" + fmt((W_sat_wb - W_in) * 1000, 2) + " g/kg" });
      tempLines.push({ label: "工艺提示", value: "请求 ΔW=" + fmt(deltaW, 2) + " g/kg 超过等焓可蒸发上限，空气在 " + fmt(T_wb, 1) + "℃ 饱和；若需更高含湿量须改用蒸汽(等温)加湿或分段处理。" });
    } else {
      tempLines.push({ label: "加湿后送风温度", value: fmt(T_after, 2) + "℃（下降 " + fmt(-dT_adiab, 2) + "℃）" });
      tempLines.push({ label: "工艺提示", value: "若要维持 " + fmt(T_out, 1) + "℃ 不变，需将加湿前空气再热提高 " + fmt(-dT_adiab, 1) + "℃。" });
    }
  }

  // ===== 部件设计（方法相关）=====
  var partLines = [];
  var distLines = [];
  if (method.key === "electrode" || method.key === "resistive") {
    partLines.push({ label: "加湿罐", value: method.key === "electrode" ? "电极罐（不锈钢/玻璃钢，内置电极）" : "不锈钢蒸汽罐 + 电热管（Incoloy 800 加热元件）" });
    partLines.push({ label: "产汽能力", value: fmt(m_sel, 0) + " kg/h（安全系数 " + _epH.KHumid + "）" });
    partLines.push({ label: "补水水质", value: waterType === "pure" ? "RO 纯水 ≤5 μS/cm（电热式）" : "市政自来水 100~800 μS/cm（电极式）" });
    // 蒸汽分配管
    var tubes = Math.ceil((W * 1000) / 150);
    var orificesPerTube = Math.ceil((H * 1000) / 120);
    distLines.push({ label: "迎面面积", value: fmt(A_face, 2) + " m²（宽 " + fmt(W * 1000, 0) + " × 高 " + fmt(H * 1000, 0) + " mm）" });
    distLines.push({ label: "蒸汽分配管数量", value: tubes + " 根（间距约150mm）" });
    distLines.push({ label: "每根管蒸汽孔", value: orificesPerTube + " 个（间距约120mm）" });
    distLines.push({ label: "喷管材质", value: "304 不锈钢，φ22×1.5mm" });
  } else if (method.key === "wetfilm") {
    partLines.push({ label: "湿膜模块", value: "纤维素/无机玻璃纤维湿膜，厚度 100mm（可选 50/150/200mm）" });
    partLines.push({ label: "迎面面积", value: fmt(A_face, 2) + " m²（宽 " + fmt(W * 1000, 0) + " × 高 " + fmt(H * 1000, 0) + " mm）" });
    partLines.push({ label: "迎面风速", value: fmt(v_face, 2) + " m/s（建议 1.5~2.5 m/s）" });
    partLines.push({ label: "循环水量", value: fmt(m_humid * 3, 1) + " kg/h（循环倍率约3，仅补水 " + fmt(m_humid, 2) + " kg/h 蒸发损耗）" });
    partLines.push({ label: "布水与挡水", value: "顶部布水盘（UPVC）+ 下部挡水板（304SS）+ 排水" });
    partLines.push({ label: "补水管径", value: "DN15，配浮球阀/电磁阀" });
  } else { // spray
    var qNozzle = 3; // L/h @ 70bar 单喷嘴
    var nozByFlow = Math.ceil(m_humid / qNozzle);
    var rows = Math.max(1, Math.ceil((H * 1000) / 400));
    var perRow = Math.max(1, Math.ceil((W * 1000) / 400));
    var nozByLayout = rows * perRow;
    var nozzles = Math.max(nozByFlow, nozByLayout);
    partLines.push({ label: "高压柱塞泵", value: "≈70 bar（推荐 40~100 bar），流量 " + fmt(m_humid, 1) + " L/h，304SS/陶瓷柱塞" });
    partLines.push({ label: "微雾喷嘴", value: "黄铜/316SS，" + nozzles + " 个（单喷嘴≈" + qNozzle + " L/h@70bar，孔径 0.1~0.15mm）" });
    partLines.push({ label: "喷嘴布置", value: rows + " 排 × " + perRow + " 个/排（间距约400mm），覆盖 " + fmt(W * 1000, 0) + "×" + fmt(H * 1000, 0) + " mm" });
    partLines.push({ label: "前置过滤", value: "保安过滤器 ≤50μm（建议+软化/RO），防止喷嘴堵塞" });
    partLines.push({ label: "高压管路", value: "304 不锈钢，φ12×1mm，配泄压阀与防震支架" });
    // 喷雾分配管
    distLines.push({ label: "喷雾分配管", value: Math.ceil((W * 1000) / 300) + " 根（间距约300mm，φ12 304SS）" });
    distLines.push({ label: "喷雾段长度", value: "≥ 600 mm（保证雾滴完全蒸发，避免带水）" });
  }

  // ===== 水系统（纯水时给出 RO 接口）=====
  var waterLines = [];
  if (waterType === "pure") {
    waterLines.push({ label: "纯水需求量", value: fmt(m_humid, 2) + " kg/h（蒸发消耗）" });
    waterLines.push({ label: "RO 进水（回收率65%）", value: fmt(roFlow, 2) + " kg/h" });
    waterLines.push({ label: "RO 膜选型流量", value: fmt(roRated, 0) + " kg/h" });
    waterLines.push({ label: "纯水箱容积", value: "按 1~2h 用量 = " + fmt(Math.ceil(m_humid), 0) + " ~ " + fmt(Math.ceil(m_humid * 2), 0) + " L" });
    waterLines.push({ label: "水质指标", value: "电导率 ≤5 μS/cm，pH 6.5~7.5（GB/T 17323）" });
    waterLines.push({ label: "纯水管道", value: "UPVC 或 304 不锈钢" });
  } else {
    waterLines.push({ label: "自来水需求量", value: fmt(m_humid, 2) + " kg/h（蒸发消耗）" });
    waterLines.push({ label: "水压/管径", value: "≥ 0.15 MPa，DN15 补水管" });
    if (method.key === "spray" || method.key === "wetfilm") {
      waterLines.push({ label: "水质处理", value: "须软化 + 过滤（喷雾≤50μm / 湿膜≤100μm），硬度<50mg/L" });
    } else {
      waterLines.push({ label: "水质指标", value: "电导率 100~800 μS/cm（电极式适用）" });
    }
  }

  // ===== 标准依据（方法相关）=====
  var stdLines = [
    { label: "加湿器标准", value: "GB/T 29736-2013《空调设备用加湿器》" },
    { label: "安装标准", value: "GB/T 14294-2026《组合式空调机组》" }
  ];
  if (waterType === "pure") {
    stdLines.push({ label: "水质标准", value: "GB/T 17323《瓶装饮用纯净水》（纯水≤5μS/cm）" });
  } else if (method.key === "electrode") {
    stdLines.push({ label: "水质标准", value: "市政自来水，电导率 100~800 μS/cm（电极式给水）" });
  } else {
    stdLines.push({ label: "水质标准", value: "GB/T 17219《生活饮用水输配水设备》/ 软化水要求" });
  }

  // ===== 组装报告 =====
  var sections = [
    { title: "一、设计输入参数", lines: [
      { label: "设计加湿量", value: fmt(m_humid, 2) + " kg/h = " + fmt(m_humid / 3.6, 2) + " g/s" },
      { label: "处理风量", value: fmt(volFlow, 0) + " m³/h" },
      { label: "含湿量差 ΔW", value: fmt(deltaW, 2) + " g/kg（" + fmt(W_in * 1000, 2) + "→" + fmt(W_out * 1000, 2) + " g/kg）" },
      { label: "目标送风温度", value: fmt(T_out, 1) + " ℃" },
      { label: "水质类型", value: waterType === "pure" ? "纯水（RO ≤5 μS/cm）" : "自来水（市政）" }
    ]},
    { title: "二、加湿方式选择", lines: compat.concat([
      { label: "确定方案", value: method.name + "（" + method.category + "）" },
      { label: "过程特征", value: method.heat }
    ])},
    { title: "三、温度影响分析（按加湿方式）", lines: tempLines },
    { title: "四、加湿量计算", lines: [
      { label: "加湿量（极限）", value: fmt(m_humid, 2) + " kg/h" },
      { label: "选型安全系数", value: _epH.KHumid + "（GB/T 14294-2026）" },
      { label: "选型加湿量", value: fmt(m_sel, 0) + " kg/h" }
    ]},
    { title: "五、设备选型与部件设计", lines: partLines }
  ];

  if (distLines.length > 0) {
    sections.push({ title: "六、分配管/管路设计", lines: distLines });
  }

  sections.push({ title: "功耗与水质", lines: [
    { label: "加湿功耗", value: powerStr },
    { label: "能耗说明", value: powerNote }
  ].concat(waterLines) });

  sections.push({ title: "控制与保护", lines: [
    { label: "控制方式", value: isSteam ? "PID 湿度闭环 + 蒸汽调节阀（0~10V）" : "PID 湿度闭环 + 水泵变频/电磁阀" },
    { label: "湿度传感器", value: "出口管道安装，精度 ±1.5%RH" },
    { label: "安全保护", value: isSteam ? "缺水保护、过流保护、超温熔断、蒸汽泄压" : "缺水保护、泵过载保护、喷嘴堵塞报警、泄压阀" }
  ]});

  sections.push({ title: "标准依据", lines: stdLines });

  document.getElementById("cd-humidifier-result").innerHTML = buildDesignReport("💧 加湿器详细设计 — " + method.name, sections);
}

// ============================================
// 纯水制水系统（RO）详细设计
// ============================================
/** 标准容器直径圆整（最小 φ150mm） */
function roundVesselDia(D) {
  var std = [150, 200, 250, 300, 350, 400, 500, 600, 800, 1000];
  for (var i = 0; i < std.length; i++) if (std[i] >= D) return std[i];
  return 1000;
}

/** 运行纯水制水系统（RO）设计计算
 *  涵盖：系统工艺配置、关键元器件选型、水量/水质/能耗计算过程。
 *  工艺链：原水 → 原水箱 → 原水泵 → 多介质过滤器 → 活性炭过滤器 →
 *          [软化器] → 保安过滤器(5μm) → RO高压泵 → RO膜堆 → 纯水箱 →
 *          纯水泵 → [UV杀菌] → 用水点（加湿器）
 */
function runPureWaterDesign() {
  var Q_pure = parseFloat(document.getElementById("cd-pw-demand").value) || 0;       // 纯水产量 kg/h ≈ L/h
  var C_feed = parseFloat(document.getElementById("cd-pw-feedCond").value) || 350;   // 原水电导率 μS/cm
  var recovery = parseFloat(document.getElementById("cd-pw-recovery").value) || 65;  // RO 回收率 %
  var C_target = parseFloat(document.getElementById("cd-pw-targetCond").value) || 5; // 目标纯水电导率 μS/cm
  var hardness = parseFloat(document.getElementById("cd-pw-hardness").value) || 150;  // 原水硬度 mg/L as CaCO3
  var usecase = document.getElementById("cd-pw-usecase") ? document.getElementById("cd-pw-usecase").value : "steam";

  if (Q_pure <= 0) {
    document.getElementById("cd-purewater-result").innerHTML =
      '<div class="physics-warnings"><p>🚰 纯水产量 = 0。请先输入纯水产量（可在「加湿器」页设好加湿量后切回本页自动导入），再点击运行。</p></div>';
    return;
  }

  var r = Math.min(Math.max(recovery, 30), 85) / 100;      // 回收率限制 30%~85%
  var Q_feed = Q_pure / r;                                  // 原水（RO进水）流量 kg/h
  var Q_conc = Q_feed - Q_pure;                             // 浓水（排放）流量 kg/h

  // ===== 水质计算与 RO 级数判定 =====
  var R1 = 0.99;                                            // 单级 RO 脱盐率（设计值，GB/T 19249 要求≥98%）
  var C1 = C_feed * (1 - R1);                               // 单级产品电导率 μS/cm
  var needDouble = (C1 > C_target);                        // 单级不达目标→需双级
  var R2 = 0.98, C2 = C1 * (1 - R2);                        // 双级二级产品电导率

  // ===== RO 膜元件选型 =====
  var elemType, qElem, perVessel;
  if (Q_pure <= 500) { elemType = "4040"; qElem = 250; perVessel = 4; }   // 4040 元件~250 L/h·支
  else { elemType = "8040"; qElem = 1000; perVessel = 6; }                // 8040 元件~1000 L/h·支
  var nElem = Math.max(1, Math.ceil(Q_pure / qElem));
  var nVessel = Math.max(1, Math.ceil(nElem / perVessel));

  // ===== RO 高压泵（单级供水）=====
  var dp1 = 1.2e6;                                          // 单级 RO 操作压力 ~1.2 MPa（苦咸水）
  var eta_p = 0.70;
  var P_pump1 = (Q_feed / 3600) * dp1 / eta_p / 1000;       // kW（水力功率）
  var Q_feed2 = 0, P_pump2 = 0;
  if (needDouble) {                                         // 双级二级泵
    var r2 = 0.85;
    Q_feed2 = Q_pure / r2;
    P_pump2 = (Q_feed2 / 3600) * 1.0e6 / eta_p / 1000;
  }
  var P_pump_hyd = P_pump1 + P_pump2;
  // 小流量系统铭牌功率通常为水力功率的 3~8 倍（电机余量+固定损耗）
  var P_pump_name = Math.max(0.03, P_pump_hyd * 5);

  // ===== 预处理容器尺寸（按 RO 进水流量，滤速 ~10 m/h）=====
  var v_f = 10;                                             // 滤速 m/h
  var Q_feed_m3h = Q_feed / 1000;
  var D_calc = Math.sqrt(4 * Q_feed_m3h / (Math.PI * v_f)) * 1000; // mm
  var D_mm = roundVesselDia(D_calc);
  var H_v = 1.2;                                            // 滤料装填高度 m（估算）
  var V_media = Math.PI * Math.pow(D_mm / 1000 / 2, 2) * H_v; // 单罐滤料体积 m³

  // ===== 软化器（硬度>50 建议，保护 RO 膜并满足喷雾/湿膜低硬度要求）=====
  var needSoften = hardness > 50;
  var softLines = [];
  if (needSoften) {
    var C_res = 50;                                         // 树脂工作交换容量 ~50 g CaCO3 / L 树脂
    var dailyLoad = Q_feed * hardness;                      // g/天（按 24h 连续）
    var regenTarget = 3;                                    // 目标再生周期 ≥3 天
    var V_res_req = dailyLoad * regenTarget / (1000 * C_res); // 所需树脂体积 m³
    var D_soft = roundVesselDia(Math.sqrt(4 * V_res_req / (Math.PI * H_v)) * 1000);
    var V_res = Math.PI * Math.pow(D_soft / 1000 / 2, 2) * H_v;
    var cap_g = V_res * 1000 * C_res;                       // 周期交换容量 g
    var regenDays = dailyLoad > 0 ? cap_g / dailyLoad : 99;
    softLines.push({ label: "软化器罐体", value: "φ" + D_soft + " 不锈钢/玻璃钢，树脂装填 " + fmt(V_res, 2) + " m³" });
    softLines.push({ label: "工作交换容量", value: fmt(cap_g / 1000, 1) + " kg CaCO3（树脂 " + fmt(C_res, 0) + " g/L）" });
    softLines.push({ label: "再生周期", value: "约 " + fmt(regenDays, 1) + " 天（盐耗约 " + fmt(cap_g / 1000 * 0.15, 1) + " kg NaCl/次）" + (regenDays < 1 ? " ⚠ 建议多罐并联或加大树脂量" : "") });
  }

  // ===== 纯水箱 + 纯水泵 =====
  var V_tank = Q_pure * 2;                                  // 1~2h 缓冲
  var dp_trans = 0.2e6;                                     // 纯水泵扬程 ~0.2 MPa
  var P_trans = (Q_pure / 3600) * dp_trans / 0.50 / 1000;

  // ===== 报告组装 =====
  var processLines = [
    { label: "工艺链", value: "原水 → 原水箱 → 原水泵 → 多介质过滤器 → 活性炭过滤器 → " + (needSoften ? "软化器 → " : "") + "保安过滤器(5μm) → RO高压泵 → RO膜堆 → 纯水箱 → 纯水泵" + (usecase === "spray" ? " → 终端微滤(≤1μm) → 高压喷雾" : " → 加湿器") }
  ];

  var configLines = [
    { label: "纯水产量", value: fmt(Q_pure, 2) + " kg/h（≈ " + fmt(Q_pure, 1) + " L/h）" },
    { label: "RO 回收率", value: fmt(r * 100, 0) + " %" },
    { label: "RO 进水（原水）流量", value: fmt(Q_feed, 2) + " kg/h" },
    { label: "浓水排放量", value: fmt(Q_conc, 2) + " kg/h（排放或回收冲洗）" },
    { label: "纯水用途", value: usecase === "spray" ? "高压喷雾加湿（要求过滤≤50μm、硬度<50mg/L）" : (usecase === "wetfilm" ? "湿膜加湿（要求低硬度防堵）" : "蒸汽加湿（电极/电热，要求导电性或低结垢）") }
  ];

  var qualityLines = [
    { label: "原水电导率", value: fmt(C_feed, 0) + " μS/cm" },
    { label: "单级 RO 脱盐率", value: fmt(R1 * 100, 0) + " %（GB/T 19249 要求≥98% ✅）" },
    { label: "单级产品电导率", value: fmt(C1, 2) + " μS/cm" },
    { label: "级数判定", value: needDouble ? ("单级 " + fmt(C1, 2) + " > 目标 " + fmt(C_target, 1) + " → 需双级 RO ⚠") : ("单级 " + fmt(C1, 2) + " ≤ 目标 " + fmt(C_target, 1) + " → 单级 RO 即可 ✅") },
    { label: "最终产品电导率", value: needDouble ? (fmt(C2, 3) + " μS/cm（双级二级脱盐率 " + fmt(R2 * 100, 0) + "%）") : (fmt(C1, 2) + " μS/cm") },
    { label: "达标判定", value: (needDouble ? C2 : C1) <= C_target ? ("✅ 满足目标 ≤ " + fmt(C_target, 1) + " μS/cm（对应电阻率 ≥ " + fmt(1000 / (needDouble ? C2 : C1), 1) + " kΩ·cm）") : "❌ 未达标，请降低原水电导率或提高回收率" }
  ];

  var compLines = [
    { label: "原水箱", value: "PE/不锈钢，容积 ≥ " + fmt(Q_feed * 1, 0) + " L（约1h原水缓冲）" },
    { label: "原水泵", value: "流量 " + fmt(Q_feed, 1) + " L/h，扬程 ~0.25 MPa，0.25~0.55 kW" },
    { label: "多介质过滤器", value: "φ" + D_mm + " 不锈钢/碳钢衬胶，滤速 " + fmt(v_f, 0) + " m/h，滤料石英砂+无烟煤（去悬浮物）" },
    { label: "活性炭过滤器", value: "φ" + D_mm + " 同径，去余氯/有机物（保护 RO 膜，余氯<0.1mg/L）" },
    { label: "保安过滤器", value: "5 μm 熔喷滤芯，20″ 单芯壳体（RO 膜前最后保护）" }
  ];
  if (needSoften) compLines = compLines.concat(softLines);
  compLines.push({ label: "RO 高压泵", value: "多级离心泵，流量 " + fmt(Q_feed, 1) + " L/h，扬程 " + fmt(dp1 / 1e6, 1) + " MPa，水力功率 " + fmt(P_pump1, 3) + " kW（铭牌≈" + fmt(P_pump_name, 2) + " kW）" });
  compLines.push({ label: "RO 膜元件", value: elemType + " 膜元件 " + nElem + " 支（单支~" + qElem + " L/h），装于 " + nVessel + " 支压力容器（每支" + perVessel + "支）" + (needDouble ? "，双级配置（二级 " + elemType + " 膜 " + Math.max(1, Math.ceil(Q_feed2 / qElem)) + " 支）" : "") });
  compLines.push({ label: "纯水箱", value: "PE/不锈钢，容积 " + fmt(V_tank, 0) + " L（按 2h 产量缓冲）" });
  compLines.push({ label: "纯水泵（输送）", value: "流量 " + fmt(Q_pure, 1) + " L/h，扬程 ~0.2 MPa，功率 " + fmt(P_trans, 3) + " kW" });
  if (usecase === "spray") compLines.push({ label: "终端微滤", value: "1~5 μm 保安滤芯（防高压喷嘴堵塞）" });
  compLines.push({ label: "UV/杀菌（可选）", value: "紫外线杀菌器（流量匹配），控制纯水菌落总数" });

  var energyLines = [
    { label: "RO 高压泵能耗", value: "水力 " + fmt(P_pump_hyd, 3) + " kW；设备铭牌 ≈ " + fmt(P_pump_name, 2) + " kW" },
    { label: "纯水泵能耗", value: fmt(P_trans, 3) + " kW" },
    { label: "单位纯水电耗", value: fmt((P_pump_name + P_trans) / Math.max(Q_pure / 1000, 1e-6), 2) + " kW·h/m³（含固定损耗）" },
    { label: "与自来水直接对比", value: "纯水制取单位水耗电：小流量系统约 1~5 kW·h/m³（流量越小比能耗越高），大系统可低至 0.5~1.5 kW·h/m³；换取无结垢/无堵塞运行" }
  ];

  var stdLines = [
    { label: "RO 设备标准", value: "GB/T 19249-2017《反渗透水处理设备》（脱盐率≥98%）" },
    { label: "原水标准", value: "GB 5749-2022《生活饮用水卫生标准》" },
    { label: "纯水水质", value: "GB/T 17323《瓶装饮用纯净水》（≤10 μS/cm）；目标 ≤" + fmt(C_target, 1) + " μS/cm 参照 GB/T 29736-2013" },
    { label: "装置标准", value: "GB/T 30307-2013《家用和类似用途饮用水处理装置》" }
  ];

  var sections = [
    { title: "一、系统工艺配置", lines: processLines },
    { title: "二、设计输入与水量平衡", lines: configLines },
    { title: "三、关键元器件及选型", lines: compLines },
    { title: "四、水质计算与校核", lines: qualityLines },
    { title: "五、运行能耗", lines: energyLines },
    { title: "六、标准依据", lines: stdLines }
  ];

  document.getElementById("cd-purewater-result").innerHTML = buildDesignReport("🚰 纯水制水系统（RO）详细设计", sections);
}

// ============================================
// 风机设计
// ============================================
/** 运行风机设计计算 */
function runFanDesign() {
  var volFlow = parseFloat(document.getElementById("cd-volFlow").value) || 0;
  var volFlow_m3h = parseFloat(document.getElementById("cd-fan-volFlow").value) || volFlow;
  // 从质量流量反算风量范围
  var massFlow = parseFloat(document.getElementById("massFlow").value) || parseFloat(document.getElementById("cd-massFlow").value) || 0.5;
  var T_in = parseFloat(document.getElementById("cd-tempIn").value) || 35;
  var rhIn = parseFloat(document.getElementById("cd-rhIn").value) || 80;
  var P_atm = 101.325;
  var rho = rhoMoistAir(P_atm, T_in, calcHumidityRatio(T_in, rhIn, P_atm));
  var volFlowFromMass = massFlow / rho * 3600;

  if (volFlow <= 0 && volFlow_m3h <= 0 && massFlow <= 0) {
    document.getElementById("cd-fan-result").innerHTML = '<div class="physics-warnings"><p>⚠ 请先在主页面输入参数或导入计算结果。</p></div>';
    return;
  }

  // 取有效风量
  if (volFlow > 0) document.getElementById("cd-fan-volFlow").value = fmt(volFlow, 0);
  var Qv = parseFloat(document.getElementById("cd-fan-volFlow").value) || volFlowFromMass;
  var Kflow = parseFloat(document.getElementById("cd-fan-Kflow").value) || 1.10;
  var rFilter = parseFloat(document.getElementById("cd-fan-res-filter").value) || 80;
  var rCoilPerRow = parseFloat(document.getElementById("cd-fan-res-coil").value) || 50;
  var coilRowsEl = document.getElementById("cd-fan-coilRows");
  if (!coilRowsEl) coilRowsEl = document.getElementById("cd-fan-coilRowsDisplay");
  var coilRows = parseInt(coilRowsEl ? coilRowsEl.textContent : 4) || 4;
  var rHeater = parseFloat(document.getElementById("cd-fan-res-heater").value) || 30;
  var rHumid = parseFloat(document.getElementById("cd-fan-res-humidifier").value) || 50;
  var rDuctPerM = parseFloat(document.getElementById("cd-fan-res-duct").value) || 3;
  var ductLen = parseFloat(document.getElementById("cd-fan-ductLength").value) || 20;
  var rOutlet = parseFloat(document.getElementById("cd-fan-res-outlet").value) || 80;
  var effFan = parseFloat(document.getElementById("cd-fan-efficiency").value) || 0.75;
  var effMotor = parseFloat(document.getElementById("cd-fan-motorEff").value) || 0.85;

  var fanFlow = Qv * Kflow;
  var sysRes = rFilter + rCoilPerRow * coilRows + rHeater + rHumid + rDuctPerM * ductLen + rOutlet;
  var fanPress = Math.round(sysRes * 1.15);
  var fanPower = (fanFlow / 3600 * fanPress) / (1000 * effFan * effMotor);

  // 标准电机功率上靠（扩展至 90kW，涵盖工业级风机）
  var stdPowers = [0.18,0.25,0.37,0.55,0.75,1.1,1.5,2.2,3.0,4.0,5.5,7.5,11,15,18.5,22,30,37,45,55,75,90];
  var selPower = 0.75;
  for (var p = 0; p < stdPowers.length; p++) {
    if (fanPower <= stdPowers[p]) { selPower = stdPowers[p]; break; }
  }
  // 超过最大标准功率时，上靠到最近的功率等级
  if (fanPower > selPower && stdPowers.length > 0) selPower = stdPowers[stdPowers.length - 1];

  // 全流量范围
  var massFlowMin = 0.1, massFlowMax = 1.1;
  var rhoNow = rho;
  var QvMin = Math.round(massFlowMin / rhoNow * 3600);
  var QvMax = Math.round(massFlowMax / rhoNow * 3600);
  var fanFlowMin = Math.round(QvMin * Kflow);
  var fanFlowMax = Math.round(QvMax * Kflow);

  // 风机的型号库，maxQ 即该型号能覆盖的最大风量
  var fanModels = [
    { maxQ: 800,  brand:'EBM-Papst', series:'R3G250-RR', desc:'后向离心, EC电机, 紧凑型', kW:'0.18~0.55', sound:'低噪音' },
    { maxQ: 2000, brand:'EBM-Papst', series:'R3G280-RR', desc:'后向离心, EC电机, 高效', kW:'0.37~1.1', sound:'低噪音' },
    { maxQ: 3500, brand:'EBM-Papst', series:'RadiCal R3G310', desc:'后向离心, RadiCal 系列', kW:'0.75~2.2', sound:'低噪音' },
    { maxQ: 6000, brand:'施乐百 Ziehl-Abegg', series:'RETR-315-4D', desc:'前向多翼离心, 风压高', kW:'1.5~4.0', sound:'中等' },
    { maxQ: 10000,brand:'施乐百 Ziehl-Abegg', series:'RETR-400-4D', desc:'前向多翼离心, 大风量', kW:'3.0~7.5', sound:'中等' },
    { maxQ: 3000, brand:'亿利达 Yilida', series:'4-72-3.2A', desc:'后向离心, 国产经典', kW:'0.75~1.5', sound:'中等' },
    { maxQ: 5000, brand:'亿利达 Yilida', series:'4-72-4A', desc:'后向离心, 国产经典', kW:'1.5~4.0', sound:'中等' },
    { maxQ: 8000, brand:'亿利达 Yilida', series:'4-72-4.5A', desc:'后向离心, 大风量', kW:'3.0~5.5', sound:'中等' },
    { maxQ: 2500, brand:'上风高科', series:'SWF-4-1.1', desc:'混流风机, 紧凑', kW:'0.55~1.5', sound:'中等' },
    { maxQ: 5000, brand:'上风高科', series:'SWF-5-2.2', desc:'混流风机, 紧凑', kW:'1.5~3.0', sound:'中等' }
  ];

  // 选择能覆盖全流量范围的最小机型（maxQ ≥ fanFlowMax）
  var selected = null;
  for (var i = 0; i < fanModels.length; i++) {
    if (fanModels[i].maxQ >= fanFlowMax) {
      if (!selected || fanModels[i].maxQ < selected.maxQ) selected = fanModels[i];
    }
  }
  if (!selected) selected = fanModels[fanModels.length - 1]; // 最大机型兜底

  // 全流量范围变频调速校核（风机相似定律：Q∝n, P∝n²）
  // 系统阻力：P_sys = P_static + P_dynamic × (Q/Q_max)²
  var dynamicRes = Math.max(fanPress / 1.15 - rFilter, 0);  // 动压部分（随流量平方变化）
  var staticRes = rFilter;                                   // 静压部分（过滤器阻力，近似恒定）

  // 求压力平衡频率：fanPress × (f/50)² = staticRes + dynamicRes × (f/50)²
  // → (fanPress - dynamicRes) × (f/50)² = staticRes
  // → f = 50 × sqrt(staticRes / (fanPress - dynamicRes))
  var pressCoeff = fanPress - dynamicRes;
  var fMinPressure = 50;
  if (pressCoeff > 0) fMinPressure = 50 * Math.sqrt(staticRes / pressCoeff);
  fMinPressure = Math.min(Math.max(fMinPressure, 5), 50);  // 约束在 [5, 50] Hz

  // 变频频率范围：取理论最小频率和流量最小频率的较大值
  var fMinQ = 50 * fanFlowMin / Math.max(fanFlowMax, selected.maxQ);
  var fMaxHz = 50;
  if (fanFlowMax > selected.maxQ) fMaxHz = 50 * fanFlowMax / selected.maxQ;
  var fMinHz = Math.max(Math.ceil(Math.max(fMinPressure, fMinQ)), 10);

  // 压力校核
  var QratioMin = Math.max(fanFlowMin / fanFlowMax, 0.05);
  var pFanMin = fanPress * Math.pow(fMinHz / 50, 2);
  var pSysMin = staticRes + dynamicRes * Math.pow(fMinHz / 50, 2);
  var pressureOk = pFanMin >= pSysMin;
  var pressureMargin = pSysMin > 0 ? (pFanMin - pSysMin) / pSysMin * 100 : 0;

  // 全流量功率范围
  var pMin = fanPower * Math.pow(QratioMin, 3);
  var pMax = fanPower;

  var fanType = fanPower <= 1.5 ? "后向离心风机" : fanPower <= 5 ? "后向多翼离心风机" : "前向多翼离心风机";
  var driveType = fanPower <= 2.2 ? "直联驱动" : "皮带驱动";

  var report = buildDesignReport("💨 送风机设计选型", [
    { title: "一、设计输入", lines: [
      { label: "质量流量范围", value: massFlowMin + " ~ " + massFlowMax + " kg/s" },
      { label: "空气密度（进口状态）", value: fmt(rho, 3) + " kg/m³" },
      { label: "体积流量范围", value: QvMin + " ~ " + QvMax + " m³/h" },
      { label: "当前设计风量 Q_v", value: fmt(Qv, 0) + " m³/h" },
      { label: "安全系数 K_flow", value: fmt(Kflow, 2) },
      { label: "设计风量 Q_fan = Q_v × K", value: fmt(fanFlow, 0) + " m³/h", bold: true }
    ]},
    { title: "二、系统阻力估算", lines: [
      { label: "初效过滤器", value: fmt(rFilter, 0) + " Pa" },
      { label: "表冷器 (" + coilRows + " 排)", value: fmt(rCoilPerRow * coilRows, 0) + " Pa" },
      { label: "加热器", value: fmt(rHeater, 0) + " Pa" },
      { label: "加湿器", value: fmt(rHumid, 0) + " Pa" },
      { label: "风管及管件 (" + ductLen + "m)", value: fmt(rDuctPerM * ductLen, 0) + " Pa" },
      { label: "出口动压", value: fmt(rOutlet, 0) + " Pa" },
      { label: "系统阻力合计", value: fmt(sysRes, 0) + " Pa" },
      { label: "风机全压 ΔP = 合计 × 1.15", value: fmt(fanPress, 0) + " Pa", bold: true }
    ]},
    { title: "三、功率计算", lines: [
      { label: "风机效率 η_fan", value: fmt(effFan, 2) + " (" + (effFan >= 0.75 ? "后向离心典型值" : "前向离心典型值") + ")" },
      { label: "电机效率 η_motor", value: fmt(effMotor, 0) + " (YE3 及以上能效)" },
      { label: "计算电机功率 P = Q×ΔP/(1000×η_fan×η_motor)", value: fmt(fanPower, 2) + " kW", bold: true },
      { label: "建议电机功率（上靠标准系列）", value: selPower + " kW" }
    ]},
    { title: "四、推荐风机型号（适配全流量范围）", lines: [
      { label: "推荐品牌", value: selected.brand, bold: true },
      { label: "推荐系列/型号", value: selected.series, bold: true },
      { label: "风机形式", value: selected.desc + " | " + fanType },
      { label: "额定功率范围", value: selected.kW + " kW" },
      { label: "建议电机功率", value: selPower + " kW" },
      { label: "适配风量范围", value: fanFlowMin + " ~ " + fanFlowMax + " m³/h" },
      { label: "变频调速范围", value: fMinHz + " ~ " + fmt(fMaxHz, 0) + " Hz" },
      { label: "最低频率压力校核（过滤器静压限制）", value: "风机 " + fmt(pFanMin, 0) + " Pa vs 系统 " + fmt(pSysMin, 0) + " Pa → " + (pressureOk ? "✅ 裕量 " + fmt(pressureMargin, 0) + "%" : "⚠️ 不足 " + fmt(-pressureMargin, 0) + "%" + (fMinHz <= 15 ? "，可通过降低过滤器初阻力改善" : "，建议最小流量不低于 " + fmt(Math.round(fanFlowMax * fMinHz / 50), 0) + " m³/h 或增设旁通阀")) },
      { label: "全范围功率估算", value: fmt(pMin, 2) + " ~ " + fmt(pMax, 2) + " kW" },
      { label: "传动方式", value: driveType },
      { label: "噪音等级", value: selected.sound },
      { label: "控制方式", value: "变频器 0~50Hz 无级调速，PID 恒压/恒风量控制" },
      { label: "安装方式", value: "弹簧减震器（4个），底部安装，出口帆布软接≥200mm" },
      { label: "执行标准", value: "GB/T 1236-2017《通风机空气动力性能试验方法》" }
    ]},
    { title: "五、其他可选品牌", lines: [
      { label: "EBM-Papst (德国)", value: "RadiCal R3G/R3K 系列，后向离心 EC 电机\n风量 500~6000 m³/h，效率最高 85%，噪音低" },
      { label: "施乐百 Ziehl-Abegg (德国)", value: "RETR/RH 系列，前向/后向多翼\n风量 2000~12000 m³/h，风压高，适合大风量大阻力" },
      { label: "亿利达 Yilida (国产)", value: "4-72/9-19 系列，后向离心\n风量 1000~8000 m³/h，国产经典，性价比高，售后便捷" },
      { label: "上风高科 (国产)", value: "SWF/HTF 系列，混流/轴流\n风量 800~5000 m³/h，结构紧凑，适合空间受限场合" }
    ]}
  ]);
  document.getElementById("cd-fan-result").innerHTML = report;
}

/** 构建设计报告 HTML */
function buildDesignReport(title, sections) {
  var html = '<div class="design-report"><h4>' + title + '</h4>';
  for (var si = 0; si < sections.length; si++) {
    var sec = sections[si];
    html += '<div class="design-section"><h5>' + sec.title + '</h5><table class="air-state-table">';
    for (var li = 0; li < sec.lines.length; li++) {
      html += '<tr><td class="param-name" style="width:45%;">' + sec.lines[li].label + '</td>' +
        '<td class="highlight">' + sec.lines[li].value + '</td></tr>';
    }
    html += '</table></div>';
  }
  html += '</div>';
  return html;
}

/** 读取工况范围参数 */
function readDesignRanges() {
  function v(id, def) { var el = document.getElementById(id); return el ? (parseFloat(el.value) || def) : def; }
  return {
    massFlow: [v("cd-r-massFlow-min", 0.1), v("cd-r-massFlow-max", 1.1)],
    tempIn: [v("cd-r-tempIn-min", -5), v("cd-r-tempIn-max", 40)],
    rhIn: [v("cd-r-rhIn-min", 10), v("cd-r-rhIn-max", 95)],
    tempOut: [v("cd-r-tempOut-min", 15), v("cd-r-tempOut-max", 25)],
    rhOut: [v("cd-r-rhOut-min", 30), v("cd-r-rhOut-max", 70)]
  };
}

/** 边界扫描主入口 */
function runDesignBoundary() {
  var r = readDesignRanges();
  var ep = getEngineeringParams();
  var coil = analyzeCoil(r, ep);
  var heater = analyzeHeater(r, ep);
  var humid = analyzeHumidifier(r, ep);

  function wcStr(wc) {
    return (wc ? wc.mf + "kg/s, " + wc.tIn + "℃/" + Math.round(wc.rhIn) + "% → " +
      wc.tOut + "℃/" + Math.round(wc.rhOut) + "% @" + wc.pa + "kPa" : "—");
  }

  var html = '<div class="boundary-report"><h4>边界扫描结果</h4>' +
    '<table class="air-state-table">' +
    '<tr><th>设备</th><th>最小值</th><th>最大值</th><th>选型值(×K)</th><th>最劣工况</th></tr>' +
    '<tr><td>❄ 表冷器</td><td>—</td><td>' + fmt(coil.sel, 1) + ' kW</td>' +
    '<td><strong>' + fmt(coil.sel_safe, 1) + ' kW</strong> (×' + fmt(coil.sel_safe / Math.max(coil.sel, 0.01), 2) + ')</td>' +
    '<td style="font-size:0.78rem;">' + wcStr(coil.worstCorner) + '</td></tr>' +
    '<tr><td>🔥 加热器</td><td>—</td><td>' + fmt(heater.sel, 1) + ' kW</td>' +
    '<td><strong>' + fmt(heater.sel_safe, 1) + ' kW</strong> (×' + fmt(heater.sel_safe / Math.max(heater.sel, 0.01), 2) + ')</td>' +
    '<td style="font-size:0.78rem;">' + heater.condition + '</td></tr>' +
    '<tr><td>💧 加湿器</td><td>—</td><td>' + fmt(humid.sel, 1) + ' kg/h</td>' +
    '<td><strong>' + fmt(humid.sel_safe, 1) + ' kg/h</strong> (×' + fmt(humid.sel_safe / Math.max(humid.sel, 0.01), 2) + ')</td>' +
    '<td style="font-size:0.78rem;">' + wcStr(humid.worstCorner) + '</td></tr>' +
    '</table></div>';
  document.getElementById("cd-boundary-result").innerHTML = html;
}
