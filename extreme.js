// ============================================
// extreme.js - 元器件边界分析函数库
// ============================================

// ============================================
// 一、表冷器极值分析
// ============================================

/** 角点扫描：在 2^6=64 个参数角点上求最不利工况。
 *  onEval(corners) 返回数值（越大越不利）；返回 {value, corner}。
 *  Corners 格式：{mf, tIn, rhIn, tOut, rhOut, pa}
 */
function findWorstCorner(r, onEval) {
  var worst = { value: -Infinity, corner: null };
  var axes = [
    ["mf", r.massFlow], ["tIn", r.tempIn], ["rhIn", r.rhIn],
    ["tOut", r.tempOut], ["rhOut", r.rhOut]
  ];
  function recurse(idx, cur) {
    if (idx === axes.length) {
      var v = onEval(cur);
      if (v > worst.value) worst = { value: v, corner: Object.assign({}, cur) };
      return;
    }
    var name = axes[idx][0], range = axes[idx][1];
    for (var k = 0; k < 2; k++) {
      cur[name] = range[k];
      recurse(idx + 1, cur);
    }
  }
  recurse(0, {});
  return worst;
}

function analyzeCoil(r, ep) {
  var mf = r.massFlow[1];
  var pa = 101.325;
  var coilRH = ep ? ep.coilRH : 95;
  var Kc = ep ? ep.KCooling : 1.10;
  var W_in = humidityRatio(satPressure(r.tempIn[1]), r.rhIn[1], pa);
  var W_out_target = humidityRatio(satPressure(r.tempOut[0]), r.rhOut[0], pa);

  // 角点扫描：在 64 个工况角点中找最不利 Q_coil（使用 calcCoilLoad 统一计算）
  function evalCoilQ(c) {
    var wIn = humidityRatio(satPressure(c.tIn), c.rhIn, c.pa);
    var wOutT = humidityRatio(satPressure(c.tOut), c.rhOut, c.pa);
    if (wIn <= wOutT) return 0;
    var h_in = enthalpy(c.tIn, wIn);
    var cl = calcCoilLoad(c.mf, h_in, wOutT, c.tOut, c.pa, coilRH);
    return cl.Q_coil_actual;
  }
  var worst = findWorstCorner(r, evalCoilQ);
  var worstCorner = worst.corner || { mf: mf, tIn: r.tempIn[1], rhIn: r.rhIn[1], tOut: r.tempOut[0], rhOut: r.rhOut[0], pa: pa };

  var Q_max, T_coil, h_coil, curves;
  if (W_in > W_out_target) {
    var h_in = enthalpy(r.tempIn[1], W_in);
    var cl = calcCoilLoad(mf, h_in, W_out_target, r.tempOut[0], pa, coilRH);
    T_coil = cl.T_coil; h_coil = cl.h_coil;
    Q_max = cl.Q_coil_actual;
    if (worst.value > Q_max) Q_max = worst.value;

    var rhLevels = [r.rhIn[0], (r.rhIn[0] + r.rhIn[1]) / 2, r.rhIn[1]];
    if (rhLevels[1] === rhLevels[0] || rhLevels[1] === rhLevels[2]) rhLevels = [r.rhIn[0], r.rhIn[1]];
    curves = [];
    for (var ri = 0; ri < rhLevels.length; ri++) {
      var pts = [];
      for (var t = r.tempIn[0]; t <= r.tempIn[1]; t += 1) {
        var hi = enthalpy(t, humidityRatio(satPressure(t), rhLevels[ri], pa));
        pts.push({ x: t, y: Math.max(0, mf * (hi - enthalpy(r.tempOut[0], humidityRatio(satPressure(r.tempOut[0]), r.rhOut[0], pa)))) });
      }
      curves.push({ label: "RH=" + Math.round(rhLevels[ri]) + "%", points: pts });
    }
  } else {
    T_coil = r.tempOut[0];
    h_coil = 0;
    Q_max = 0;
    curves = [];
  }

  var detail = [];
  if (W_in > W_out_target) {
    var h_in = enthalpy(r.tempIn[1], W_in);
    var P_sat_in_val = satPressure(r.tempIn[1]);
    var P_sat_out_val = satPressure(r.tempOut[0]);
    detail = [
      { s: "① 入口焓值 h₁", v: fmt(h_in, 2) + " kJ/kg @ " + r.tempIn[1] + "℃/" + r.rhIn[1] + "%RH" },
      { s: "② 目标出口含湿量 W₂", v: fmt(W_out_target * 1000, 3) + " g/kg @ " + r.tempOut[0] + "℃/" + r.rhOut[0] + "%RH" },
      { s: "③ 表冷器出口温度 T_coil", v: fmt(T_coil, 1) + " ℃（ADP-RH=" + coilRH + "% 反推）" },
      { s: "④ 表冷器出口焓 h_coil", v: fmt(h_coil, 2) + " kJ/kg" },
      { s: "⑤ 盘管负荷 Q_coil", v: fmt(Q_max, 2) + " kW" },
      { s: "⑥ 选型 Q_sel = Q_max × " + fmt(Kc, 2), v: fmt(Q_max * Kc, 2) + " kW" }
    ];
  } else {
    detail = [{ s: "工况判断", v: "冬季/加湿工况，无需制冷" }];
  }

  return {
    name: "❄ 表冷器（降温除湿段）",
    param: "实际制冷负荷",
    unit: "kW",
    sel: Q_max,
    sel_safe: Q_max * Kc,
    worstCorner: worstCorner,
    condition: "最不利角点 " + worstCorner.tIn + "℃/" + Math.round(worstCorner.rhIn) + "%RH → "
      + worstCorner.tOut + "℃/" + Math.round(worstCorner.rhOut) + "%RH @ " + worstCorner.mf + "kg/s (64角点扫描)",
    desc: "负荷按能量平衡 Q=ṁ(h_in−h_coil) 计算（含再热）。选型安全系数 ×" + fmt(Kc, 2) + "。",
    curves: curves, xLabel: "入口温度 (℃)", yLabel: "制冷负荷 (kW)",
    detail: detail
  };
}

// ==========================================
// 二、加热器极值分析
// ==========================================

function analyzeHeater(r, ep) {
  var mf = r.massFlow[1];
  var pa = 101.325;
  var Kh = ep ? ep.KHeating : 1.15;
  var W_out_min = humidityRatio(satPressure(r.tempOut[0]), r.rhOut[0], pa);
  var T_coil_min = calcTemperatureFromW(W_out_min, 95, pa);
  if (isNaN(T_coil_min)) T_coil_min = r.tempOut[0];
  var summer = mf * 1.006 * Math.max(0, r.tempOut[1] - T_coil_min);
  var winter = mf * 1.006 * Math.max(0, r.tempOut[1] - r.tempIn[0]);
  var Q_max = Math.max(summer, winter);

  function evalHeaterQ(c) {
    var wOutMin = humidityRatio(satPressure(c.tOut), c.rhOut, c.pa);
    var tCoilMin = calcTemperatureFromW(wOutMin, 95, c.pa);
    if (isNaN(tCoilMin)) tCoilMin = c.tOut;
    var sum = c.mf * 1.006 * Math.max(0, c.tOut - tCoilMin);
    var win = c.mf * 1.006 * Math.max(0, c.tOut - c.tIn);
    return Math.max(sum, win);
  }
  var worst = findWorstCorner(r, evalHeaterQ);
  var worstCorner = worst.corner || { mf: mf, tIn: r.tempIn[0], tOut: r.tempOut[1], pa: pa };
  if (worst.value > Q_max) Q_max = worst.value;

  return {
    name: "🔥 加热器（再热/预热段）",
    param: "最大加热量",
    unit: "kW",
    sel: Q_max,
    sel_safe: Q_max * Kh,
    worstCorner: worstCorner,
    condition: "最不利角点 " + worstCorner.tIn + "→" + worstCorner.tOut + "℃ @ " + worstCorner.mf + "kg/s",
    desc: "夏季再热从表冷器出口(" + T_coil_min.toFixed(1) + "℃)升至目标；冬季预热从入口(" + r.tempIn[0] + "℃)升至目标。选型安全系数 ×" + fmt(Kh, 2) + "。",
    bars: [{ label: "夏季再热", value: summer }, { label: "冬季预热", value: winter }],
    detail: [
      { s: "夏季再热", v: fmt(summer, 2) + " kW" },
      { s: "冬季预热", v: fmt(winter, 2) + " kW" },
      { s: "选型 Q_sel = Q_max × " + fmt(Kh, 2), v: fmt(Q_max * Kh, 2) + " kW" }
    ]
  };
}

// ==========================================
// 三、加湿器极值分析
// ==========================================

function analyzeHumidifier(r, ep) {
  var mf = r.massFlow[1];
  var pa = 101.325;
  var Kh = ep ? (ep.KHumid || ep.KHeating || 1.20) : 1.20;
  var P_sat_in_min = satPressure(r.tempIn[0]);
  var W_in_min = humidityRatio(P_sat_in_min, r.rhIn[0], pa);
  var P_sat_out_max = satPressure(r.tempOut[1]);
  var W_out_max = humidityRatio(P_sat_out_max, r.rhOut[1], pa);
  var m_humid = Math.max(0, mf * (W_out_max - W_in_min) * 1000 * 3.6);

  function evalHumid(c) {
    var wInMin = humidityRatio(satPressure(c.tIn), c.rhIn, c.pa);
    var wOutMax = humidityRatio(satPressure(c.tOut), c.rhOut, c.pa);
    return Math.max(0, c.mf * (wOutMax - wInMin) * 1000 * 3.6);
  }
  var worst = findWorstCorner(r, evalHumid);
  var worstCorner = worst.corner || { mf: mf, tIn: r.tempIn[0], rhIn: r.rhIn[0], tOut: r.tempOut[1], rhOut: r.rhOut[1], pa: pa };
  if (worst.value > m_humid) m_humid = worst.value;

  return {
    name: "💧 加湿器",
    param: "加湿量",
    unit: "kg/h",
    sel: m_humid,
    sel_safe: Math.ceil(m_humid * Kh),
    worstCorner: worstCorner,
    condition: "最不利角点 " + worstCorner.tIn + "℃/" + Math.round(worstCorner.rhIn) + "% → " + worstCorner.tOut + "℃/" + Math.round(worstCorner.rhOut) + "% @ " + worstCorner.mf + "kg/s",
    desc: "电极蒸汽加湿（等温），选型安全系数 ×" + fmt(Kh, 2) + "。",
    detail: [
      { s: "入口最小含湿量", v: fmt(W_in_min * 1000, 3) + " g/kg" },
      { s: "出口最大含湿量", v: fmt(W_out_max * 1000, 3) + " g/kg" },
      { s: "加湿量", v: fmt(m_humid, 2) + " kg/h" },
      { s: "选型 m_sel = m_humid × " + fmt(Kh, 2), v: Math.ceil(m_humid * Kh) + " kg/h" }
    ]
  };
}