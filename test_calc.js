// 计算层端到端测试 — AHU_App
// 加载 calculations.js(纯函数,无 DOM 依赖)
const path = require('path');
const fs = require('fs');

// calculations.js 定义全局 function,需在全局上下文执行
const calcSrc = fs.readFileSync(path.join(__dirname, 'calculations.js'), 'utf8');
eval(calcSrc); // 定义 satPressure, humidityRatio, enthalpy, fmt, satVaporPressure, virtualTemp, rhoMoistAir

// 从 renderer.js 提取的函数(calcDewPoint / calcTemperatureFromW,无 DOM 依赖)
function calcDewPoint(P_v_kPa) {
  if (!(P_v_kPa > 0)) return NaN;
  return 237.3 * Math.log(P_v_kPa / 0.61078) / (17.27 - Math.log(P_v_kPa / 0.61078));
}
function calcTemperatureFromW(W, RH, P_atm) {
  var P_v = W * P_atm / (0.622 + W);
  var P_sat = P_v / (RH / 100);
  if (!(P_sat > 0.01)) return NaN;
  return 237.3 * Math.log(P_sat / 0.61078) / (17.27 - Math.log(P_sat / 0.61078));
}

// 复现 calculate() 数值链(去 DOM,带 BF 能量平衡修正)
function computeState(inp) {
  const { massFlow, tempIn, rhIn, tempOut, rhOut, P_atm, BF, coilRH, chwDeltaT } = inp;
  const Cp_water = 4.187;

  const P_sat_in = satPressure(tempIn);
  const P_v_in = (rhIn / 100) * P_sat_in;
  const W_in = humidityRatio(P_sat_in, rhIn, P_atm);
  const h_in = enthalpy(tempIn, W_in);

  const P_sat_out = satPressure(tempOut);
  const P_v_out = (rhOut / 100) * P_sat_out;
  const W_out = humidityRatio(P_sat_out, rhOut, P_atm);
  const h_out = enthalpy(tempOut, W_out);

  const Q_cooling_signed = massFlow * (h_in - h_out);
  const Q_cooling = Math.max(0, Q_cooling_signed);
  const dW_signed = W_in - W_out;
  const m_dehumid = Math.max(0, massFlow * dW_signed * 1000);

  let T_coil, Q_reheat, Q_coil_actual, h_coil;
  if (W_in > W_out) {
    var cl = calcCoilLoad(massFlow, h_in, W_out, tempOut, P_atm, coilRH);
    T_coil = cl.T_coil; h_coil = cl.h_coil;
    Q_reheat = cl.Q_reheat; Q_coil_actual = cl.Q_coil_actual;
  } else if (W_out > W_in) {
    T_coil = tempIn;
    h_coil = h_in;
    Q_reheat = (tempOut > tempIn) ? massFlow * 1.006 * (tempOut - tempIn) : 0;
    Q_coil_actual = 0;
  } else {
    T_coil = tempOut;
    h_coil = h_out;
    Q_reheat = 0;
    Q_coil_actual = Q_cooling;
  }

  const m_humidify = Math.max(0, massFlow * (W_out - W_in) * 1000);
  const m_humidify_kg_h = m_humidify * 3.6;
  const humidify_power = m_humidify > 0 ? m_humidify_kg_h * 0.62 : 0;
  const m_chilled = Q_coil_actual > 0 ? Q_coil_actual / (Cp_water * chwDeltaT) : 0;
  const elec_power = Q_reheat > 0 ? Q_reheat / 0.98 : 0;
  const rho_air = rhoMoistAir(P_atm, tempIn, W_in);
  const volFlow_m3h = massFlow / rho_air * 3600;
  const dewIn = calcDewPoint(P_v_in);

  return {
    P_sat_in, P_v_in, W_in, h_in,
    P_sat_out, P_v_out, W_out, h_out,
    Q_cooling_signed, Q_cooling, dW_signed, m_dehumid,
    T_coil, Q_reheat, Q_coil_actual, h_coil,
    m_humidify, m_humidify_kg_h, humidify_power,
    m_chilled, elec_power, rho_air, volFlow_m3h, dewIn
  };
}

// ============ 测试框架 ============
let pass = 0, fail = 0;
const failures = [];
function approx(a, b, tol, label) {
  const ok = Math.abs(a - b) <= tol;
  if (ok) { pass++; }
  else { fail++; failures.push(`FAIL ${label}: 期望 ${b} ± ${tol}, 实际 ${a}`); }
  return ok;
}
function gt(a, b, label) {
  const ok = a > b;
  if (ok) pass++; else { fail++; failures.push(`FAIL ${label}: 期望 > ${b}, 实际 ${a}`); }
  return ok;
}
function isFinite_(a, label) {
  const ok = Number.isFinite(a);
  if (ok) pass++; else { fail++; failures.push(`FAIL ${label}: 期望有限值, 实际 ${a}`); }
  return ok;
}
function isNaN_(a, label) {
  const ok = Number.isNaN(a);
  if (ok) pass++; else { fail++; failures.push(`FAIL ${label}: 期望 NaN, 实际 ${a}`); }
  return ok;
}

// ============ 1. 基础物性函数 ============
console.log('\n=== 1. 基础物性函数 ===');

// satPressure 水面 20℃ → ~2.338 kPa(标准查表值 2.339)
approx(satPressure(20), 2.338, 0.01, 'satPressure(20℃) 水面');
// satPressure 0℃ → 0.61078(定义值)
approx(satPressure(0), 0.61078, 0.001, 'satPressure(0℃)');
// satPressure 冰面 -5℃ → ~0.402 kPa(Sonntag 冰面公式;0.421 是过冷水水面值)
approx(satPressure(-5), 0.402, 0.005, 'satPressure(-5℃) 冰面');
// 冰面应 < 水面外推(验证分支生效)
const iceVsWater = satPressure(-5);
const waterExtrapolated = 0.61078 * Math.exp(17.27 * (-5) / (-5 + 237.3));
gt(waterExtrapolated, iceVsWater, '冰面分支生效(-5℃ 冰面 < 水面外推)');

// humidityRatio 20℃/50%/101.325 → ~0.00726 kg/kg(查表 ~7.3 g/kg)
approx(humidityRatio(satPressure(20), 50, 101.325), 0.00726, 0.0002, 'humidityRatio(20℃/50%)');

// enthalpy 20℃/W=0.00726 → ~38.6 kJ/kg
approx(enthalpy(20, 0.00726), 38.6, 0.3, 'enthalpy(20℃, W=0.00726)');

// calcDewPoint 20℃/50% → ~9.3℃(查表 ~9.3℃)
const dp20 = calcDewPoint(0.5 * satPressure(20));
approx(dp20, 9.3, 0.5, 'calcDewPoint(20℃/50%) ≈ 9.3℃');
// calcDewPoint 负值(冬季 -5℃/10%)应可解,不再是 -100
const dpWinter = calcDewPoint(0.10 * satPressure(-5));
gt(dpWinter, -100, 'calcDewPoint 冬季负值 > -100(哨兵已移除)');
isFinite_(dpWinter, 'calcDewPoint 冬季负值为有限值');
// calcDewPoint(0) → NaN
isNaN_(calcDewPoint(0), 'calcDewPoint(0) → NaN');

// calcTemperatureFromW 正常
const T_back = calcTemperatureFromW(0.00726, 50, 101.325);
approx(T_back, 20, 0.5, 'calcTemperatureFromW 往返 20℃/50%');

// virtualTemp 20℃/W=0.00726 → 293.15×(1+1.6078×0.00726)/(1+0.00726) ≈ 294.43 K
approx(virtualTemp(20, 0.00726), 294.43, 0.2, 'virtualTemp(20℃, W=0.00726)');
// rhoMoistAir 20℃/50%/101.325 → ~1.198 kg/m³(干空气 1.204,湿空气略低)
approx(rhoMoistAir(101.325, 20, 0.00726), 1.198, 0.005, 'rhoMoistAir(20℃/50%)');

// ============ 2. 三种预设工况完整计算链 ============
console.log('\n=== 2. 预设工况计算链 ===');

const presets = {
  summer:   { massFlow: 1.1, tempIn: 40, rhIn: 95, tempOut: 20, rhOut: 50, P_atm: 101.325, BF: 0.15, coilRH: 95, chwDeltaT: 5 },
  winter:   { massFlow: 1.1, tempIn: -5, rhIn: 10, tempOut: 25, rhOut: 50, P_atm: 101.325, BF: 0.15, coilRH: 95, chwDeltaT: 5 },
  standard: { massFlow: 0.5, tempIn: 25, rhIn: 60, tempOut: 20, rhOut: 50, P_atm: 101.325, BF: 0.15, coilRH: 95, chwDeltaT: 5 }
};

for (const [name, inp] of Object.entries(presets)) {
  console.log(`\n--- ${name} 工况: ${inp.tempIn}℃/${inp.rhIn}% → ${inp.tempOut}℃/${inp.rhOut}% @ ${inp.massFlow} kg/s ---`);
  const r = computeState(inp);
  console.log(`  入口: h_in=${fmt(r.h_in,2)} kJ/kg, W_in=${fmt(r.W_in*1000,3)} g/kg, 露点=${isNaN(r.dewIn)?'NaN':fmt(r.dewIn,1)}℃`);
  console.log(`  出口: h_out=${fmt(r.h_out,2)} kJ/kg, W_out=${fmt(r.W_out*1000,3)} g/kg`);
  console.log(`  Q_cooling=${fmt(r.Q_cooling,2)} kW, Q_coil_actual=${fmt(r.Q_coil_actual,2)} kW, Q_reheat=${fmt(r.Q_reheat,2)} kW`);
  console.log(`  T_coil=${isNaN(r.T_coil)?'NaN':fmt(r.T_coil,1)}℃, m_chilled=${fmt(r.m_chilled,3)} kg/s, elec=${fmt(r.elec_power,2)} kW`);
  console.log(`  m_dehumid=${fmt(r.m_dehumid,2)} g/s, m_humidify=${fmt(r.m_humidify_kg_h,2)} kg/h, humid_power=${fmt(r.humidify_power,2)} kW`);
  console.log(`  rho=${fmt(r.rho_air,4)} kg/m³, volFlow=${fmt(r.volFlow_m3h,0)} m³/h`);

  isFinite_(r.h_in, `${name} h_in 有限`);
  isFinite_(r.h_out, `${name} h_out 有限`);
  isFinite_(r.Q_cooling, `${name} Q_cooling 有限`);
}

// 夏季工况专项校核
console.log('\n=== 3. 夏季工况量级校核(工程经验) ===');
const s = computeState(presets.summer);
// 40℃/95% 饱和水汽压 ~7.38 kPa
approx(satPressure(40), 7.38, 0.05, 'satPressure(40℃) ≈ 7.38 kPa');
// 入口焓 40℃/95% 应 ~159.2 kJ/kg(查表 W≈46.2 g/kg,h=40.24+0.0462×2575≈159.2)
approx(s.h_in, 159.2, 3, '夏季入口焓 h_in ≈ 159.2 kJ/kg');
// 出口焓 20℃/50% 应 ~38.6 kJ/kg
approx(s.h_out, 38.6, 1, '夏季出口焓 h_out ≈ 38.6 kJ/kg');
// Q_cooling = 1.1 × (159.2−38.6) ≈ 132.7 kW
approx(s.Q_cooling, 132.7, 4, '夏季净制冷量 ≈ 132.7 kW');
// Q_coil_actual 应 = Q_cooling + Q_reheat(盘管负荷含再热)
approx(s.Q_coil_actual, s.Q_cooling + s.Q_reheat, 0.5, '夏季 Q_coil_actual = Q_cooling + Q_reheat');
// h_coil 应在 h_out 之上（再热前焓低于再热后）
gt(s.h_out, s.h_coil, '夏季 h_out > h_coil(再热增加了焓)');
// 旧 BF=0 公式与新盘管出口焓法一致(均基于盘管出口,不再有 BF 偏差)
const T_adp = calcTemperatureFromW(s.W_out, 95, 101.325);
const h_adp = enthalpy(T_adp, s.W_out);
const Q_oldBF0 = 1.1 * (s.h_in - h_adp);
approx(Q_oldBF0, s.Q_coil_actual, 0.1, '旧 BF=0 公式与 Q_coil_actual 一致(均基于盘管出口焓)');
console.log(`  → 旧 BF=0 公式 Q=${fmt(Q_oldBF0,2)} kW vs 新盘管出口焓法 Q=${fmt(s.Q_coil_actual,2)} kW,偏差 ${fmt((Q_oldBF0/s.Q_coil_actual-1)*100,3)}%`);
// 冷冻水流量 = 143.9/(4.187×5) ≈ 6.87 kg/s (Q_coil_actual 增大后)
approx(s.m_chilled, 6.87, 0.5, '夏季冷冻水流量 ≈ 6.87 kg/s(Q_coil_actual=143.9kW增量)');
// 再热负荷:T_coil ~9℃ → 1.1×1.006×(20−9) ≈ 12.2 kW
gt(s.Q_reheat, 8, '夏季再热负荷 > 8 kW');
gt(s.Q_reheat, 0, '夏季需再热');
// 密度 40℃/95% 应 ~1.096 kg/m³(高温高湿密度低)
approx(s.rho_air, 1.096, 0.01, '夏季湿空气密度 ≈ 1.096 kg/m³');

// 冬季工况专项校核
console.log('\n=== 4. 冬季工况量级校核 ===');
const w = computeState(presets.winter);
// -5℃/10% 应无制冷(Q_coil_actual=0,加湿工况)
approx(w.Q_coil_actual, 0, 0.01, '冬季无制冷 Q_coil_actual=0');
gt(w.m_humidify_kg_h, 0, '冬季需加湿');
// 加湿功率 = m_humid_kg_h × 0.62
approx(w.humidify_power, w.m_humidify_kg_h * 0.62, 0.001, '加湿功率 = m×0.62(汽化潜热)');
// 预热负荷 = 1.1×1.006×(25−(−5)) ≈ 33.2 kW
approx(w.Q_reheat, 33.2, 1, '冬季预热负荷 ≈ 33.2 kW');
// 露点为负值且有限(不再是 -100)
gt(w.dewIn, -100, '冬季入口露点 > -100(哨兵移除)');
isFinite_(w.dewIn, '冬季入口露点有限值');
console.log(`  → 冬季入口露点 = ${fmt(w.dewIn,2)}℃(负值正常)`);

// 标准工况
console.log('\n=== 5. 标准工况量级校核 ===');
const st = computeState(presets.standard);
// 25℃/60% → 20℃/50%:降温除湿
gt(st.Q_cooling, 0, '标准工况有制冷');
approx(st.h_in, 55.6, 2, '标准入口焓 ≈ 55.6 kJ/kg');
approx(st.h_out, 38.6, 1, '标准出口焓 ≈ 38.6 kJ/kg');

// ============ 6. 边界 case ============
console.log('\n=== 6. 边界 case ===');
// T<0 全程用冰面 satPressure,不报错
const w2 = computeState({ massFlow: 0.5, tempIn: -10, rhIn: 30, tempOut: 20, rhOut: 50, P_atm: 101.325, BF: 0.15, coilRH: 95, chwDeltaT: 5 });
isFinite_(w2.h_in, '-10℃ 入口焓有限(冰面公式)');
gt(w2.m_humidify_kg_h, 0, '-10℃ 入口需加湿');

// 等湿降温(W_in==W_out 近似)
const eq = computeState({ massFlow: 0.5, tempIn: 30, rhIn: 50, tempOut: 25, rhOut: 60, P_atm: 101.325, BF: 0.15, coilRH: 95, chwDeltaT: 5 });
isFinite_(eq.Q_cooling, '等湿降温 Q_cooling 有限');

// chwDeltaT 影响冷冻水流量
const dt5 = computeState(presets.summer);
const dt7 = computeState(Object.assign({}, presets.summer, { chwDeltaT: 7 }));
gt(dt5.m_chilled, dt7.m_chilled, 'ΔT=5 冷冻水流量 > ΔT=7');
approx(dt7.m_chilled, dt5.m_chilled * 5 / 7, 0.01, 'ΔT=7 流量 = ΔT=5 × 5/7');

// ============ 结果 ============
console.log('\n========================================');
console.log(`测试结果: ${pass} 通过, ${fail} 失败`);
if (failures.length > 0) {
  console.log('\n失败项:');
  failures.forEach(f => console.log('  ' + f));
  process.exit(1);
} else {
  console.log('全部通过 ✓');
  process.exit(0);
}
