// ============================================
// calculations.js - 冷热力学计算模块
// 涡轮增压器测试台进气空调 (AHU) 计算器 v2.0
// 包含：湿空气物性参数计算、Magnus公式、焓值计算
// 引用标准：GB/T 35226-2017《湿空气性质计算公式》
// ============================================

/**
 * 饱和水汽压 (kPa) - Magnus公式
 * P_sat(T) = 0.61078 * exp(17.27*T / (T+237.3))
 * 参考：GB/T 35226-2017《湿空气性质计算公式》
 * 物理意义：温度越高，空气能容纳的水蒸气越多，饱和水汽压越大
 */
function satPressure(T) {
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

/** 格式化数字 */
function fmt(v, d) {
  return Number(v).toFixed(d);
}

/**
 * 饱和水蒸气分压力 (kPa) - Sonntag 1990 公式（用于焓湿图）
 * 区分水面和冰面，精度更高
 */
function satVaporPressure(T) {
  if (T < 0) {
    // 冰面
    return 0.6112 * Math.exp(22.46 * T / (272.62 + T));
  } else {
    // 水面
    return 0.6112 * Math.exp(17.62 * T / (243.12 + T));
  }
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