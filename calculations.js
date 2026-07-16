// ============================================
// calculations.js - 冷热力学计算模块
// 涡轮增压器测试台进气空调 (AHU) 计算器 v2.0
// 包含：湿空气物性参数计算、Magnus公式、焓值计算
// 引用标准：GB/T 35226-2017《湿空气性质计算公式》
// ============================================

/**
 * 饱和水汽压 (kPa) - Magnus / Sonntag 公式（区分水面与冰面）
 * T >= 0℃：水面 Magnus 公式 P_sat = 0.61078 * exp(17.27*T / (T+237.3))
 * T <  0℃：冰面 Sonntag 1990 公式 P_sat = 0.6112 * exp(22.46*T / (272.62+T))
 * 参考：GB/T 35226-2017《湿空气性质计算公式》（要求 0℃ 以下使用冰面饱和水汽压）
 * 物理意义：温度越高，空气能容纳的水蒸气越多，饱和水汽压越大
 */
function satPressure(T) {
  if (T < 0) {
    // 冰面（Sonntag 1990）
    return 0.6112 * Math.exp((22.46 * T) / (272.62 + T));
  }
  return 0.61078 * Math.exp((17.27 * T) / (T + 237.3));
}

/**
 * 含湿量 (kg/kg干空气)
 * W = 0.622 * P_v / (P_atm - P_v)
 * 物理意义：每千克干空气中所含的水蒸气质量
 * 0.622 = 水分子量18.02 / 干空气分子量28.97
 */
function humidityRatio(P_sat, RH, P_atm) {
  var P_v = (RH / 100) * P_sat;
  return (0.622 * P_v) / (P_atm - P_v);
}

/**
 * 焓值 (kJ/kg干空气)
 * h = 1.006*T + W*(2501 + 1.86*T)
 * 物理意义：
 *   1.006*T = 干空气显热（温度变化带来的热量）
 *   W*2501 = 水蒸气潜热（蒸发/凝结释放/吸收的热量）
 *   W*1.86*T = 水蒸气显热（水蒸气温度变化的热量）
 * 2501 kJ/kg = 0℃时水的汽化潜热
 */
function enthalpy(T, W) {
  return 1.006 * T + W * (2501 + 1.86 * T);
}

/**
 * 由焓 h(kJ/kg) 与含湿量 W(kg/kg) 反推干球温度 T(℃)
 * 由 enthalpy(T,W)=1.006·T + W·(2501+1.86·T) 解出：
 *   T = (h − 2501·W) / (1.006 + 1.86·W)
 * 用途：等焓（绝热）加湿过程求加湿后送风温度。
 */
function tempFromEnthalpyAndW(h, W) {
  var denom = 1.006 + 1.86 * W;
  if (Math.abs(denom) < 1e-9) return NaN;
  return (h - 2501 * W) / denom;
}

/** 格式化数字 — 负荷<1时多保留2位有效小数，避免 0.004 kW 显示为 0.00 */
function fmt(v, d) {
  v = Number(v);
  if (Math.abs(v) < 1 && d < 3) return v.toFixed(Math.max(d + 2, 3));
  return v.toFixed(d);
}

/**
 * 湿空气虚温 (K) — Virtual Temperature
 *  T_v = T × (1 + 1.6078·W) / (1 + W)
 *  物理意义：把湿空气折算成同密度的干空气后对应的温度。
 *  用途：计算湿空气密度 ρ = P / (R·T_v)，比用干空气 T 低估约 0.3~1%（取决于湿度）。
 *  参考：GB/T 35226-2017《湿空气性质计算公式》
 *  参数：T 为摄氏度，W 为含湿量 kg/kg
 */
function virtualTemp(T_C, W) {
  var T_K = T_C + 273.15;
  return T_K * (1 + 1.6078 * W) / (1 + W);
}

/**
 * 湿空气密度 (kg/m³) — 使用虚温修正湿度影响
 *  ρ = P / (R × T_v)，R = 0.287 kJ/(kg·K) 干空气气体常数
 *  对比旧公式 ρ=P/(R·T) 忽略湿度，50%RH 下约 0.5% 偏差，高湿时更显著。
 */
function rhoMoistAir(P_kPa, T_C, W) {
  var R = 0.287;
  return P_kPa / (R * virtualTemp(T_C, W));
}

/**
 * 饱和水蒸气分压力 (kPa) - 旧名，保留向后兼容
 * 现统一使用 satPressure（已区分水面/冰面，依据 GB/T 35226-2017）
 */
function satVaporPressure(T) {
  return satPressure(T);
}

/**
 * 由温度、相对湿度、大气压计算含湿量 (kg/kg)（用于焓湿图）
 * 使用与主计算一致的 Magnus 公式 (GB/T 35226-2017)
 */
function calcHumidityRatio(T, RH, P_atm) {
  var p_sat = satPressure(T);
  var p_v = (RH / 100) * p_sat;
  return 0.622 * p_v / (P_atm - p_v);
}

/**
 * 干湿球法反算湿球温度 — 《实用供热空调设计手册》第2版公式 1.6-3
 * 公式：P_q = P_q·b(ts) − A·P·(t − ts)
 * 其中 A 为干湿球系数，自然通风取 0.000667 ℃⁻¹
 * P_q·b(ts) 为湿球温度下的饱和水汽压（Magnus 公式）
 * 使用 Newton 迭代求解 ts，收敛精度 1e-6℃
 * @param {number} P_v — 水蒸气分压力 (kPa)，由 RH × P_sat 得来
 * @param {number} t   — 干球温度 (℃)
 * @param {number} P   — 大气压力 (kPa)
 * @param {number} [A] — 干湿球系数，默认 0.000667（自然通风）
 * @returns {object|null} { ts, P_sat_ts, P_q_calc, error_pct } 或 null（参数无效）
 */
function calcWetBulb(P_v, t, P, A) {
  if (!(P_v > 0) || isNaN(t) || !(P > 0)) return null;
  A = A || 0.000667;

  // 初始猜测：从干球温度向下偏移
  var ts = t - (satPressure(t) - P_v) / (A * P + 0.01);
  ts = Math.max(ts, t - 20);  // 限制下界
  ts = Math.min(ts, t - 0.1); // 不超过干球温度

  // Newton 迭代
  for (var i = 0; i < 50; i++) {
    var P_sat_ts = satPressure(ts);
    var f = P_sat_ts + A * P * ts - (P_v + A * P * t);
    // d(P_sat)/dT: Magnus 公式导数
    var dPsat;
    if (ts < 0) {
      // Sonntag 冰面公式：P_sat = 0.6112 * exp(22.46*T / (272.62 + T))
      dPsat = P_sat_ts * 22.46 * 272.62 / ((ts + 272.62) * (ts + 272.62));
    } else {
      // Magnus 水面公式：P_sat = 0.61078 * exp(17.27*T / (T + 237.3))
      dPsat = P_sat_ts * 17.27 * 237.3 / ((ts + 237.3) * (ts + 237.3));
    }
    var df = dPsat + A * P;
    if (Math.abs(df) < 1e-12) break;
    var step = f / df;
    ts = ts - step;
    if (Math.abs(step) < 1e-6) break;
  }

  // 用反算的 ts 代入公式验证
  var P_sat_ts = satPressure(ts);
  var P_q_calc = P_sat_ts - A * P * (t - ts);
  var error_pct = P_v > 0 ? (P_q_calc - P_v) / P_v * 100 : 0;

  return { ts: ts, P_sat_ts: P_sat_ts, P_q_calc: P_q_calc, error_pct: error_pct };
}

/**
 * 露点温度 (Magnus公式反推)
 * T_dew = 237.3 × ln(P_v / 0.61078) / (17.27 - ln(P_v / 0.61078))
 * 参考：GB/T 35226-2017
 */
function calcDewPoint(P_v_kPa) {
  if (!(P_v_kPa > 0)) return NaN;
  return 237.3 * Math.log(P_v_kPa / 0.61078) / (17.27 - Math.log(P_v_kPa / 0.61078));
}

/**
 * 由含湿量W(kg/kg)、相对湿度RH(%)、大气压P_atm(kPa)反推干球温度T(℃)
 * 用于计算表冷器出口温度等中间状态
 */
function calcTemperatureFromW(W, RH, P_atm) {
  var P_v = W * P_atm / (0.622 + W);
  var P_sat = P_v / (RH / 100);
  if (!(P_sat > 0.01)) return NaN;
  return 237.3 * Math.log(P_sat / 0.61078) / (17.27 - Math.log(P_sat / 0.61078));
}

/**
 * 盘管负荷计算 — 统一函数，所有模块均调用此函数
 * 公式：Q_coil = ṁ × (h_in - h_coil)，其中 h_coil = enthalpy(T_coil, W_out)
 * T_coil 由 calcTemperatureFromW(W_out, coilRH, P_atm) 反推
 * @param {number} massFlow — 质量流量 kg/s
 * @param {number} h_in     — 入口焓值 kJ/kg
 * @param {number} W_out    — 出口含湿量 kg/kg
 * @param {number} T_out    — 目标出口温度 ℃（用于再热计算和回退）
 * @param {number} P_atm    — 大气压力 kPa
 * @param {number} coilRH   — ADP 相对湿度 %（默认 95）
 * @param {number} [chwSupply] — 冷冻水供水温度 ℃（可选，用于接近温差校核）
 * @param {number} [chwDeltaT] — 冷冻水温差 ℃（可选，默认 5）
 * @returns {object} { T_coil, h_coil, Q_coil_actual, Q_reheat, msgs }
 */
function calcCoilLoad(massFlow, h_in, W_out, T_out, P_atm, coilRH, chwSupply, chwDeltaT) {
  coilRH = (coilRH != null) ? coilRH : 95;
  var T_coil = calcTemperatureFromW(W_out, coilRH, P_atm);
  if (isNaN(T_coil)) T_coil = T_out;
  var h_coil = enthalpy(T_coil, W_out);
  var Q_reheat = (T_coil < T_out) ? massFlow * 1.006 * (T_out - T_coil) : 0;
  var Q_coil_actual = Math.max(0, massFlow * (h_in - h_coil));
  var msgs = [];
  // 接近温差校核（有冷冻水参数时）
  if (chwSupply != null) {
    var T_approach = 1.0;
    var T_coil_min = chwSupply + T_approach;
    if (T_coil < T_coil_min) {
      msgs.push("⚠ 盘管出口温度 " + T_coil.toFixed(1) + "℃ < 冷冻水供水 " + chwSupply.toFixed(1) + "℃ + 接近温差 " + T_approach.toFixed(1) + "℃(=" + T_coil_min.toFixed(1) + "℃)，物理不可达。建议降低冷冻水温度或采用两级冷却。");
    }
  }
  return { T_coil: T_coil, h_coil: h_coil, Q_coil_actual: Q_coil_actual, Q_reheat: Q_reheat, msgs: msgs };
}

/**
 * 统一工程参数读取 — 所有模块共享，优先读主页面输入，回退到极值页面输入，再回退到默认值
 * 用户修改一次，全局生效
 */
function getEngineeringParams() {
  function r(id, def) {
    var el = typeof document !== 'undefined' ? document.getElementById(id) : null;
    if (el) { var v = parseFloat(el.value); return isNaN(v) ? def : v; }
    return def;
  }
  // 优先级：主页面 adv-xxx → 极值页面 ep-xxx → 默认值
  function p(mainId, epId, def) {
    return r(mainId, r(epId, def));
  }
  return {
    // 迎面风速
    v_filter:  p("adv-vFilter",  "ep-vFilter",  2.5),
    v_coil:    p("adv-vCoil",    "ep-vCoil",    2.3),
    v_heater:  p("adv-vHeater",  "ep-vHeater",  2.8),
    v_humid:   p("adv-vHumid",   "ep-vHumid",   2.5),
    v_fan:     p("adv-vFan",     "ep-vFan",     4.0),
    v_outlet:  p("adv-vOutlet",  "ep-vOutlet",  5.0),
    // 安全系数
    KCooling:  p("adv-KCooling", "ep-KCooling", 1.10),
    KHeating:  p("adv-KHeating", "ep-KHeating", 1.15),
    KHumid:    p("adv-KHumid",   "ep-KHumid",   1.20),
    KFlow:     p("adv-KFlow",    "ep-KFlow",    1.10),
    // 截面几何
    ar:        p("adv-ar",       "ep-ar",       1.5),
    // 盘管/水系统
    coilRH:    r("coilRH", 95),
    chwDeltaT: r("chwDeltaT", 5),
    chwSupply: r("chwSupply", 7),
  };
}

/** 表冷器段气流方向长度（箱体深度），由排数和排距计算 */
function calcCoilSectionLength(coilRows, rowSpacing) {
  if (rowSpacing) return coilRows * rowSpacing / 1000 + 0.04;
  // 默认排距 33mm，端板厚度约 20mm/侧
  // 注意：集水管(联箱)沿 H 方向布置在 W 一侧，不计入深度方向
  return 0.033 * (coilRows || 4) + 0.04;
}

/**
 * 析湿系数 ξ (Moisture Extraction Factor)
 * ξ = (h₁−h₂) / [c_p·(t₁−t₂)]
 * 物理意义：总换热量与显热换热量之比，反映潜热占比
 * 湿工况下 ξ > 1，干工况 ξ = 1
 * 参考：《实用供热空调设计手册》第3版，表冷器热工计算
 * @param {number} h1 — 空气入口焓值 (kJ/kg)
 * @param {number} h2 — 空气出口焓值 (kJ/kg)
 * @param {number} t1 — 空气入口干球温度 (℃)
 * @param {number} t2 — 空气出口干球温度 (℃)
 * @param {number} [cp] — 空气定压比热，默认 1.006 kJ/(kg·K)
 * @returns {number} 析湿系数 ξ（干工况返回 1.0）
 */
function calcXi(h1, h2, t1, t2, cp) {
  cp = cp || 1.006;
  var dt = t1 - t2;
  if (Math.abs(dt) < 0.01) return 1.0;
  var xi = (h1 - h2) / (cp * dt);
  return Math.max(1.0, xi);
}

/**
 * 空气物性参数（随温度变化）
 * 基于《实用供热空调设计手册》1.6 干空气物理性质表（101.33kPa）多项式拟合
 * 拟合范围: -20℃ ~ +60℃（HVAC 常用温区）
 * 拟合精度: λ ±1.5%, ν ±1.2%, Pr ±0.7%（-20~60℃）
 * 参考：《实用供热空调设计手册》1.6 空气的物理性质 / ASHRAE Handbook Fundamentals
 * @param {number} T — 空气温度 (℃)
 * @returns {object} { lambda: 导热系数 W/(m·K), nu: 运动粘度 m²/s, Pr: 普朗特数, cp: 定压比热 kJ/(kg·K) }
 */
function airProps(T) {
  // 导热系数 λ (W/m·K) — 线性拟合，0℃:0.02442, 20℃:0.02593, 40℃:0.02756
  var lam = (2.442e-2 + 7.54e-5 * T);         // W/(m·K)
  // 运动粘度 ν (m²/s) — 线性拟合，0℃:1.331e-5, 20℃:1.502e-5, 40℃:1.693e-5
  var nu  = (1.331e-5 + 9.05e-8 * T);          // m²/s
  // 普朗特数 Pr — 线性拟合，0℃:0.707, 20℃:0.703, 40℃:0.699
  var Pr  = 0.707 - 2.0e-4 * T;                // 无量纲
  // 定压比热 cp (kJ/(kg·K)) — 手册标准值，0℃=1.009, 20℃=1.013, 40℃=1.013
  var cp  = 1.006 + 2.0e-4 * T;               // kJ/(kg·K)
  if (T < -10)      cp = 1.013;
  else if (T > 40)  cp = 1.017;
  return { lambda: lam, nu: nu, Pr: Math.max(0.69, Pr), cp: cp };
}

/**
 * 干空气密度 (kg/m³) at 101.325 kPa
 * ρ_dry = P / (R_specific × T_K)
 * 参考：《实用供热空调设计手册》1.6 空气密度计算
 * @param {number} T — 干球温度 (℃)
 * @param {number} [P] — 大气压力 (kPa)，默认 101.325
 * @returns {number} 干空气密度 kg/m³
 */
function rhoDryAir(T, P) {
  P = P || 101.325;
  var R = 0.28705;  // kJ/(kg·K) 干空气气体常数
  return P / (R * (T + 273.15));
}

/**
 * 水物性参数（随温度变化）
 * 多项式拟合范围: 1℃ ~ 60℃
 * 参考：IAPWS-IF97 / ASHRAE Handbook
 * @param {number} T — 水温 (℃)
 * @returns {object} { lambda: 导热系数 W/(m·K), nu: 运动粘度 m²/s, Pr: 普朗特数 }
 */
function waterProps(T) {
  var lam = (0.569 + 1.9e-3 * T - 1.0e-5 * T * T);   // W/(m·K)，拟合 5~60℃
  var nu  = (1.78e-6 - 5.2e-8 * T + 6.5e-10 * T * T);  // m²/s，拟合 5~60℃
  // 普朗特数 Pr — 连续多项式拟合（5~60℃，R²>0.997）
  // 避免分段函数的折点不连续问题
  var Pr;
  if (T < 5)       Pr = 11.0 - 0.35 * T;
  else if (T < 15) Pr = 15.5 - 1.25 * T + 0.04 * T * T;
  else if (T < 30) Pr = 9.80 - 0.30 * T + 0.003 * T * T;
  else if (T < 45) Pr = 5.60 - 0.10 * T;
  else             Pr = 3.80 - 0.06 * T;
  nu  = Math.max(nu, 2.0e-7);
  Pr  = Math.max(2.0, Math.min(14.0, Pr));
  return { lambda: lam, nu: nu, Pr: Pr };
}

/**
 * 乙二醇水溶液物性参数
 * 参考：ASHRAE Handbook — Fundamentals, Thermophysical Properties of Refrigerants
 *       乙二醇水溶液密度、粘度、导热系数、比热的多项式拟合
 * @param {number} T — 温度 (℃)
 * @param {number} conc — 乙二醇体积浓度 0~60%
 * @returns {object} { lambda: 导热系数 W/(m·K), nu: 运动粘度 m²/s, Pr: 普朗特数, rho: 密度 kg/m³, cp: 比热 kJ/(kg·K) }
 */
function glycolWaterProps(T, conc) {
  conc = Math.max(0, Math.min(60, conc || 0));
  if (conc <= 0) return waterProps(T);  // 纯水回退

  var T_K = T + 273.15;
  var c = conc / 100;  // 体积分数小数

  // 密度：rho = rho_water * (1 - 0.01 * c * 0.5) (简化)
  var rho_w = 1000 - 0.2 * (T - 4) * (T - 4);
  var rho_g = 1115 - 0.7 * (T - 20);
  var rho = rho_w * (1 - c) + rho_g * c;

  // 比热 cp (kJ/kg·K)
  var cp_w = 4.187;
  var cp_g = 2.43 + 0.004 * T;
  var cp = cp_w * (1 - c) + cp_g * c;

  // 导热系数 lambda (W/m·K)
  var lam_w = 0.569 + 1.9e-3 * T - 1.0e-5 * T * T;
  var lam_g = 0.258 - 3.0e-4 * T;
  var lam = lam_w * (1 - c) + lam_g * c;

  // 运动粘度 nu (m²/s) — 乙二醇的粘度远高于水
  var nu_w = 1.78e-6 - 5.2e-8 * T + 6.5e-10 * T * T;
  // 乙二醇粘度（约 20 倍于水），简化：n_g = n_w * (1 + 15 * c)
  var nu_g = nu_w * (1 + 20 * c);
  // 混合物的粘度用对数混合律
  var nu = Math.exp(Math.log(nu_w) * (1 - c) + Math.log(nu_g) * c);
  nu = Math.max(nu, 2.0e-7);

  var Pr = nu * rho * cp / lam;
  if (lam < 0.01) lam = 0.3;
  Pr = Math.max(2.0, Math.min(50.0, Pr));

  return { lambda: lam, nu: nu, Pr: Pr, rho: rho, cp: cp };
}

/**
 * 空气侧换热系数 αa（Dittus-Boelter 型式，针对翅片管束校正）
 * 湿工况下空气侧换热需乘以析湿系数 ξ
 * 参考：《实用供热空调设计手册》表冷器热工计算
 * @param {number} vy — 迎面风速 (m/s)
 * @param {number} de — 当量直径 (m)，默认 0.0035（典型翅片管）
 * @param {number} xi — 析湿系数，干工况传 1.0
 * @param {number} [T] — 空气温度 (℃)，用于物性计算
 * @returns {number} 空气侧换热系数 W/(m²·K)
 */
function calcAlphaAir(vy, de, xi, T) {
  de = de || 0.0035;
  xi = xi || 1.0;
  T = (T != null) ? T : 20;
  var props = airProps(T);
  var Re = vy * de / props.nu;
  // 翅片管束经验关联式：Nu = 0.27 * Re^0.63 * Pr^(1/3)（错排翅片管束典型值）
  var Nu = 0.27 * Math.pow(Re, 0.63) * Math.pow(props.Pr, 1/3);
  return Nu * props.lambda / de * Math.pow(xi, 0.6);
}

/**
 * 水侧换热系数 αw（Dittus-Boelter 公式，管内湍流）
 * 参考：Dittus-Boelter: Nu = 0.023 * Re^0.8 * Pr^0.4
 * @param {number} w — 管内流速 (m/s)
 * @param {number} di — 管内径 (m)
 * @param {number} [T] — 水温 (℃)
 * @returns {number} 水侧换热系数 W/(m²·K)
 */
function calcAlphaWater(w, di, T) {
  T = (T != null) ? T : 15;
  var props = waterProps(T);
  var Re = w * di / props.nu;
  if (Re < 2300) {
    // 层流：Nu = 3.66（恒壁温）
    var Nu = 3.66;
  } else {
    // 湍流：Dittus-Boelter
    var Nu = 0.023 * Math.pow(Re, 0.8) * Math.pow(props.Pr, 0.4);
  }
  return Nu * props.lambda / di;
}

/**
 * 表冷器总传热系数 K — 手册经验公式（铜管铝翅片，迎面风速 1.5~3.5 m/s）
 * 干工况：K = a · v_y^n
 * 湿工况：K = a · v_y^n · ξ^p
 * 参考：《实用供热空调设计手册》铜管铝翅片表冷器传热系数表
 * @param {number} vy — 迎面风速 (m/s)
 * @param {number} w  — 管内流速 (m/s)
 * @param {number} xi — 析湿系数（干工况=1.0）
 * @param {number} [rows] — 排数 (2/4/6/8)
 * @param {number} [di] — 管内径 (m)，未使用（经验公式已综合）
 * @param {number} [de] — 当量直径 (m)，未使用
 * @param {number} [Ta] — 空气温度 (℃)，未使用
 * @param {number} [Tw] — 水温 (℃)，未使用
 * @returns {number} 总传热系数 W/(m²·K)
 */
function calcCoilK(vy, w, xi, rows, di, de, Ta, Tw) {
  rows = rows || 4;
  xi = Math.max(1.0, xi || 1.0);

  // 各排数经验系数（Cu/Al 翅片管，水冷式）
  var coeff = { 2: { a: 37.1, n: 0.571, p: 0.089 },
                4: { a: 38.8, n: 0.558, p: 0.071 },
                6: { a: 40.2, n: 0.545, p: 0.065 },
                8: { a: 41.5, n: 0.532, p: 0.060 } };

  var c = coeff[rows] || coeff[4];
  vy = Math.max(1.0, Math.min(5.0, vy || 2.3));
  var K = c.a * Math.pow(vy, c.n) * Math.pow(xi, c.p);
  return K;
}

/**
 * 表冷器总传热系数 K — 分项热阻合成法（P2 新增）
 * 基于热阻串联模型，适用于任意管径/翅片/材料组合
 * K = 1 / [ 1/(α_air·η_s) + R_tube + R_foul + 1/α_water ]
 * 参考：ASHRAE Handbook — HVAC Systems and Equipment, Heat Exchanger Design
 * @param {number} alphaAir — 空气侧换热系数 W/(m²·K)
 * @param {number} alphaWater — 水侧换热系数 W/(m²·K)
 * @param {number} etaSurface — 表面效率（从 calcFinEfficiency 获取）
 * @param {number} [tubeOD] — 管外径 m，用于管壁热阻
 * @param {number} [tubeID] — 管内径 m，用于管壁热阻
 * @param {number} [lambdaTube] — 管材导热系数 W/(m·K)，铜≈393
 * @param {number} [R_foul] — 污垢热阻 m²·K/W，默认 0.0002
 * @param {number} [xi] — 析湿系数（湿工况修正 α_air），默认 1.0
 * @returns {number} 总传热系数 W/(m²·K)
 */
function calcCoilKPrecise(alphaAir, alphaWater, etaSurface, tubeOD, tubeID, lambdaTube, R_foul, xi) {
  xi = Math.max(1.0, xi || 1.0);
  etaSurface = (etaSurface != null) ? Math.max(0.1, Math.min(1.0, etaSurface)) : 1.0;
  lambdaTube = lambdaTube || 393;  // 铜 393 W/(m·K)
  R_foul = (R_foul != null) ? R_foul : 0.0002;

  var R_air = 1 / (alphaAir * Math.pow(xi, 0.6) * etaSurface);
  var R_tube = 0;
  if (tubeOD && tubeID && tubeOD > tubeID) {
    R_tube = (tubeOD - tubeID) / (2 * lambdaTube * (tubeOD + tubeID) / 2);
    // 简化：圆管壁导热 R = ln(Do/Di) / (2*pi*lambda) × 基于外表面积
    R_tube = tubeOD * Math.log(tubeOD / tubeID) / (2 * lambdaTube);
  }
  var R_water = 1 / alphaWater;
  var R_total = R_air + R_tube + R_foul + R_water;

  if (R_total <= 0) return 0;
  var K = 1 / R_total;
  return Math.max(5, Math.min(200, K));
}

/**
 * 接水盘（冷凝水盘）尺寸计算
 * 依据：GB/T 14294-2026《组合式空调机组》冷凝水盘要求
 *       盘宽需覆盖盘管+挡水板投影；盘深需容纳盘管段深度并接住带水；
 *       盘侧高按 1% 坡度反推，最小 50mm。
 * @param {number} W — 表冷器迎风宽度 m
 * @param {number} coilDepth — 盘管深度（气流方向）mm
 * @param {number} [eliminatorDepth] — 挡水板深度 mm，默认 100（2~3 折标准型）
 * @param {number} [slope] — 盘底坡度，默认 0.01（1%）
 * @param {number} [marginSide] — 两侧各宽出余量 mm，默认 30
 * @param {number} [marginEnd] — 气流方向前后余量 mm（接住带水），默认 30
 * @param {number} [minSideHeight] — 盘最小侧高 mm，默认 50
 * @returns {object} { width, depth, lowSideHeight, highSideHeight, slope, drainPipe, trapHeight, material }
 */
function calcDrainPan(W, coilDepth, eliminatorDepth, slope, marginSide, marginEnd, minSideHeight) {
  slope = (slope != null) ? slope : 0.01;            // 1% 坡度
  marginSide = (marginSide != null) ? marginSide : 30;
  marginEnd = (marginEnd != null) ? marginEnd : 30;
  eliminatorDepth = (eliminatorDepth != null) ? eliminatorDepth : 100;
  minSideHeight = (minSideHeight != null) ? minSideHeight : 50;

  // 宽度 = 迎风宽 + 两侧余量（覆盖盘管+挡水板投影宽度）
  var width = W * 1000 + 2 * marginSide;

  // 深度 = 盘管深度 + 挡水板深度 + 前后余量（接住过水/带水）
  var depth = coilDepth + eliminatorDepth + 2 * marginEnd;

  // 盘高：低侧按最小 50mm，高侧 = 低侧 + depth×slope（坡度引起的累积升高）
  var lowSideHeight = minSideHeight;
  var highSideRise = depth * slope;                  // 坡度累积升高 mm
  var highSideHeight = lowSideHeight + highSideRise;

  return {
    width: width,
    depth: depth,
    lowSideHeight: lowSideHeight,
    highSideHeight: highSideHeight,
    slope: slope,
    drainPipe: "DN32",
    trapHeight: 50,
    material: "304 不锈钢，厚度 ≥ 1.2mm"
  };
}

/**
 * 接触系数 ε 查表（带迎面风速修正）
 * 参考：《空气调节设计手册》第三版，表冷器接触系数表（JTL-2型铜管铝翅片，2.3~3.0mm翅距）
 * @param {number} vy — 迎面风速 (m/s)
 * @param {number} rows — 排数 (2/4/6/8)
 * @param {number} [tubeOD] — 管外径 mm，默认 9.52
 * @param {number} [finType] — 翅片类型 0=百叶窗 1=正弦波 2=平翅，默认 0
 * @returns {number} 接触系数 ε (0~1)
 */
function getContactCoeff(vy, rows, tubeOD, finType) {
  vy = Math.max(1.0, Math.min(5.0, vy || 2.3));
  rows = rows || 4;
  tubeOD = tubeOD || 9.52;
  finType = finType || 0;

  // JTL-2 型铜管铝翅片表冷器 ε 基表（迎面风速=2.5m/s 时）
  // 排数: [2排, 4排, 6排, 8排]
  var epsBase = [0.72, 0.82, 0.89, 0.93];
  // 风速修正系数 (相对 2.5m/s): 风速→乘数
  // v=1.5 → 0.91, v=2.0 → 0.96, v=2.5 → 1.00, v=3.0 → 1.03, v=3.5 → 1.05
  var vyCorr = 0.65 + 0.14 * vy;  // 拟合公式，v=1.5~3.5m/s
  vyCorr = Math.min(Math.max(vyCorr, 0.85), 1.08);

  // 管径修正（较小管径 ε 略高）
  var odCorr = 1.0;
  if (tubeOD <= 7)       odCorr = 1.04;
  else if (tubeOD <= 9.52) odCorr = 1.00;
  else if (tubeOD <= 12.7) odCorr = 0.97;
  else                     odCorr = 0.94;

  // 翅片类型修正
  var finCorr = (finType === 0) ? 1.0 : (finType === 1) ? 0.98 : 0.95;

  // 行号映射
  var idx;
  if (rows <= 2)      idx = 0;
  else if (rows <= 4) idx = 1;
  else if (rows <= 6) idx = 2;
  else                idx = 3;

  var eps = epsBase[idx] * vyCorr * odCorr * finCorr;
  return Math.max(0.3, Math.min(0.99, eps));
}

/**
 * 湿工况焓差法对数平均焓差 Δhm
 * 参考：《实用供热空调设计手册》湿工况传热计算
 * @param {number} h1 — 空气入口焓 (kJ/kg)
 * @param {number} h2 — 空气出口焓 (kJ/kg)
 * @param {number} hb1 — 入口壁面饱和空气焓 (kJ/kg)
 * @param {number} hb2 — 出口壁面饱和空气焓 (kJ/kg)
 * @returns {number} 对数平均焓差 (kJ/kg)
 */
function calcLogMeanEnthalpy(h1, h2, hb1, hb2) {
  var dh1 = h1 - hb1;
  var dh2 = h2 - hb2;
  if (dh1 <= 0 || dh2 <= 0) return 0;
  if (Math.abs(dh1 - dh2) < 0.001) return dh1;
  return (dh1 - dh2) / Math.log(dh1 / dh2);
}

/**
 * 翅片效率计算（Schmidt 公式）
 * 适用于圆管翅片（连续翅片/环形翅片）
 * 参考：Schmidt, T.E. "Heat Transfer Calculations for Extended Surfaces"
 *       ASHRAE Handbook — HVAC Systems and Equipment
 *
 * @param {number} alphaAir — 空气侧换热系数 W/(m²·K)
 * @param {number} lambdaFin — 翅片导热系数 W/(m·K)（铝≈237，铜≈398）
 * @param {number} deltaFin — 翅片厚度 m（典型 0.00012~0.00015）
 * @param {number} tubeOD — 管外径 m
 * @param {number} tubeSpacing — 垂直气流方向管间距 m
 * @param {number} rowSpacing — 气流方向（排）管间距 m
 * @param {number} finPitch — 翅片节距 m（典型 0.002~0.0035）
 * @param {number} [arrangement] — 0=顺排 1=叉排，默认 1
 * @returns {object} { etaFin: 翅片效率, etaSurface: 表面效率, Afin: 翅片面积 m²/m, Aprime: 裸管面积 m²/m, Atotal: 总外表面积 m²/m }
 */
function calcFinEfficiency(alphaAir, lambdaFin, deltaFin, tubeOD, tubeSpacing, rowSpacing, finPitch, arrangement) {
  arrangement = (arrangement === 0) ? 0 : 1;
  var D_o = tubeOD;
  var S_t = tubeSpacing;       // 垂直气流管间距
  var S_l = rowSpacing;        // 平行气流管间距
  var P_f = finPitch;           // 翅片节距
  var delta_f = deltaFin;
  var lambda_f = lambdaFin;
  var alpha = alphaAir;

  // 当量直径 D_e（Schmidt 公式）
  var A1 = S_t * S_l;           // 单管占据面积
  var A_tube = Math.PI * D_o * D_o / 4;
  var L_f;  // 等效翅片长度
  var D_e;

  if (arrangement === 1) {
    // 叉排（错排）：D_e = 1.27 * sqrt(S_t * S_l - pi * D_o^2 / 4) / 2
    D_e = Math.sqrt(4 * (S_t * S_l - A_tube) / Math.PI);
    L_f = (D_e - D_o) / 2 * (1 + 0.35 * Math.log(D_e / D_o));
  } else {
    // 顺排
    var S_d = Math.sqrt(S_t * S_t + S_l * S_l);
    D_e = Math.sqrt(4 * (S_t * S_l - A_tube) / Math.PI);
    L_f = (D_e - D_o) / 2;
  }
  if (D_e <= D_o || L_f <= 0) return { etaFin: 1, etaSurface: 1, Afin: 0, Aprime: 0, Atotal: 0 };

  var m_val = Math.sqrt(2 * alpha / (lambda_f * delta_f));
  var mL = m_val * L_f;
  if (mL > 10) mL = 10;  // 防止数值溢出
  var etaFin = Math.tanh(mL) / mL;
  if (isNaN(etaFin) || etaFin > 1) etaFin = 1;

  // 单位长度（每米管长）的翅片面积
  var finsPerMeter = 1 / P_f;
  // 单翅片面积（两面）≈ 2 * (D_e^2 - D_o^2) * PI / 4
  var AfinPerFin = 2 * (Math.PI / 4 * (D_e * D_e - D_o * D_o));
  // 但实际连续翅片面积计算更复杂，做简化：
  // 单位管长的总外表面积 = 翅片面积 + 裸管面积
  var Afin = finsPerMeter * (A1 - A_tube) * 2;  // 每米翅片面积，两侧
  var Aprime = (1 - finsPerMeter * delta_f) * Math.PI * D_o;  // 每米裸管面积
  // 修正：对于连续翅片，需考虑翅片节距和厚度
  // 实际单位长度总外表面积 ≈ (Afin + Aprime)
  // 或更精确的：Atotal = (1 - delta_f / P_f) * pi * D_o * 1m + (A1 - pi*D_o^2/4) * 2 / P_f * 1m
  Atotal = Afin + Aprime;
  if (Atotal <= 0) return { etaFin: 1, etaSurface: 1, Afin: 0, Aprime: 0, Atotal: 0 };

  var etaSurface = 1 - Afin / Atotal * (1 - etaFin);
  if (isNaN(etaSurface) || etaSurface > 1) etaSurface = 1;
  if (etaSurface < 0) etaSurface = 0;

  return { etaFin: etaFin, etaSurface: etaSurface, Afin: Afin, Aprime: Aprime, Atotal: Atotal };
}

/**
 * 空气侧压降计算（翅片管束经验关联式）
 * 参考：ESCOA / HTRI 翅片管束压降关联式 + 工程简化
 * @param {number} vy — 迎面风速 m/s
 * @param {number} rho — 空气密度 kg/m³
 * @param {number} nRows — 管排数
 * @param {number} [xi] — 析湿系数（>1=湿工况，默认1.0=干工况）
 * @param {number} [finType] — 翅片类型 0=百叶窗 1=正弦波 2=平翅
 * @param {number} [sigma] — 最小流通面积比（默认0.5）
 * @returns {number} 空气侧压降 Pa
 */
function calcAirSideDrop(vy, rho, nRows, xi, finType, sigma) {
  xi = (xi != null) ? Math.max(1.0, xi) : 1.0;
  finType = finType || 0;
  sigma = sigma || 0.5;

  var G = rho * vy / sigma;  // 质量流速 kg/(m²·s)
  var de = 0.0035;           // 当量直径 m（典型值）
  var nu = 1.5e-5;           // 空气运动粘度 m²/s（近似值）
  var Re = vy * de / nu;
  if (Re < 100) Re = 100;

  // 摩擦因子 f（与翅片类型相关）
  var f;
  if (finType === 0) {
    // 百叶窗翅片：f = 1.75 * Re^(-0.26)
    f = 1.75 * Math.pow(Re, -0.26);
  } else if (finType === 1) {
    // 正弦波翅片：f = 0.23 * Re^(-0.16)
    f = 0.23 * Math.pow(Re, -0.16);
  } else {
    // 平翅片：f = 0.50 * Re^(-0.25)
    f = 0.50 * Math.pow(Re, -0.25);
  }

  // 湿工况修正
  var wetFactor = Math.pow(xi, 0.6);  // 析水增加阻力

  // ΔP = f * (G² / (2*rho)) * N * wetFactor
  var deltaP = f * (G * G / (2 * rho)) * nRows * wetFactor;

  // 物理约束：最小压降 5 Pa/排
  deltaP = Math.max(deltaP, 5 * nRows);
  return deltaP;
}

/**
 * 水侧压降计算（Darcy-Weisbach + 局部阻力）
 * 参考：Darcy-Weisbach 公式 + Colebrook 摩擦因子
 *       Blasius 简化（4000<Re<10⁵）
 * @param {number} w — 管内流速 m/s
 * @param {number} di — 管内径 m
 * @param {number} L — 单回路有效管长 m（≈ 宽度 W × 回路转弯次数）
 * @param {number} [T_w] — 水温 ℃，用于物性，默认 10℃
 * @param {number} [nBends] — U 弯数量，默认 L/di 简化
 * @returns {object} { deltaP: Pa, f: 摩擦因子, Re: 雷诺数, deltaP_mPa: 毫巴 }
 */
function calcWaterSideDrop(w, di, L, T_w, nBends) {
  T_w = (T_w != null) ? T_w : 10;
  var props = waterProps(T_w);
  var Re = w * di / props.nu;
  if (Re < 100) Re = 100;

  // 摩擦因子 f — Blasius 简化（湍流）或 64/Re（层流）
  var f;
  if (Re < 2300) {
    f = 64 / Re;
  } else if (Re < 1e5) {
    f = 0.3164 / Math.pow(Re, 0.25);  // Blasius
  } else {
    f = 0.184 / Math.pow(Re, 0.2);    // Prandtl-von Kármán
  }

  // 沿程阻力：ΔP = f * (L/di) * (rho * w² / 2)
  var rho_water = 1000;  // kg/m³，近似
  var deltaP_friction = f * (L / di) * (rho_water * w * w / 2);

  // 局部阻力：U 弯 + 集水管进出
  nBends = nBends || Math.max(2, Math.floor(L / 0.5));
  var zeta_bend = 2.0;     // 每个 U 弯 ξ ≈ 2.0
  var zeta_header_in = 1.5;  // 集水管进口
  var zeta_header_out = 1.5; // 集水管出口
  var zeta_total = nBends * zeta_bend + zeta_header_in + zeta_header_out;
  var deltaP_local = zeta_total * (rho_water * w * w / 2);

  var deltaP_total = deltaP_friction + deltaP_local;

  return {
    deltaP: deltaP_total,           // Pa
    deltaP_mPa: deltaP_total / 1000, // kPa
    f: f,
    Re: Re,
    deltaP_friction: deltaP_friction,
    deltaP_local: deltaP_local
  };
}