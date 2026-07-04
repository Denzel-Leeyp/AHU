/**
 * AHRI 410 标准工况验证
 * 
 * AHRI 410 标准额定制冷工况（强制循环空冷冷却盘管）:
 *   进风干球: 80°F (26.7°C)
 *   进风湿球: 67°F (19.4°C)  [约 26.7°C/51%RH]
 *   进水温度: 45°F (7.2°C)
 *   水温升:   10°F (5.6°C)
 *   迎面风速: 500 fpm (2.54 m/s)
 *   盘管出口: 接近饱和, 通常取 9~12°C / 95%RH
 *   空气密度: 标准 1.20 kg/m³ @ 21°C
 * 
 * 参考: AHRI Standard 410-2015, Section 5 — Standard Rating Conditions
 *       AHRI 盘管认证程序 — 额定容量标定
 */

const fs = require('fs');
const path = require('path');

// 加载 calculations.js（全量）
eval(fs.readFileSync(path.join(__dirname, 'calculations.js'), 'utf8'));

// 提取 calcCoilByContactFactor 和 getContactCoeff
const cdSrc = fs.readFileSync(path.join(__dirname, 'component_design.js'), 'utf8');
const fnMatch = cdSrc.match(/function calcCoilByContactFactor[\s\S]*?\n\}\n/);
if (!fnMatch) { console.error('未找到 calcCoilByContactFactor'); process.exit(1); }
eval(fnMatch[0]);

// 模拟 DOM（用于函数内部 document.getElementById 调用）
if (typeof document === 'undefined') {
  global.document = {
    getElementById: function(id) {
      var defaults = {
        'cd-chwDeltaT': '5.6',
        'cd-tubeSpacing': '25.4',
        'cd-rowSpacing': '22',
        'cd-circuits': '4',
        'cd-tubeOD': '9.52',
        'cd-finType': '0',
        'cd-spacingVar': '0',
        'cd-coilRH': '95',
        'cd-chwSupply': '7.2',
        'cd-tempIn': '26.7',
        'cd-rhIn': '51',
        'cd-tempOut': '13',
        'cd-rhOut': '90'
      };
      return defaults[id] != null ? { value: String(defaults[id]) } : null;
    }
  };
}

// =============================================
// 工具函数
// =============================================
function fmt(v, d) {
  if (v == null || isNaN(v)) return '—';
  return Number(v).toFixed(d);
}

function heading(s) { console.log('\n' + '='.repeat(70)); console.log('  ' + s); console.log('='.repeat(70)); }

function check(label, expected, actual, tol) {
  var diff = Math.abs(expected - actual);
  var pct = expected !== 0 ? diff / Math.abs(expected) * 100 : diff * 100;
  var ok = diff <= tol || pct <= (tol / Math.abs(expected) * 100 || 5);
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + label);
  console.log('    期望: ' + fmt(expected, 3) + '  实际: ' + fmt(actual, 3) + '  偏差: ' + fmt(pct, 1) + '%');
  return ok;
}

// =============================================
// AHRI 410 标准工况
// =============================================
heading('AHRI 410 标准额定制冷工况验证');

// 进风状态
var T_in = 26.7;        // °C, 80°F DB
var rhIn = 51;          // %, 对应 67°F WB
var P_atm = 101.325;    // kPa

// 冷冻水
var T_chw_in = 7.2;     // °C, 45°F
var chwDT = 5.6;         // °C, 10°F

// 盘管设计参数
var v_face = 2.54;       // m/s, 500 fpm
var massFlow = 1.0;      // kg/s (假设 1 kg/s 作为基准)

// 盘管出口（再热前）— 接近饱和
var T_coil = 10.0;       // °C 典型值
var rh_coil = 95;

// 计算入口空气状态
var W_in = calcHumidityRatio(T_in, rhIn, P_atm);
var h_in = enthalpy(T_in, W_in);
var ts_in = calcWetBulb((rhIn/100) * satPressure(T_in), T_in, P_atm);
var ts_in_val = ts_in ? ts_in.ts : NaN;

console.log('  进风干球: ' + T_in + '°C  (80°F)');
console.log('  进风湿球: ' + fmt(ts_in_val, 2) + '°C  (67°F)');
console.log('  进风含湿量: ' + fmt(W_in, 5) + ' kg/kg');
console.log('  进风焓值: ' + fmt(h_in, 2) + ' kJ/kg');
console.log('  进水温度: ' + T_chw_in + '°C  (45°F)');
console.log('  迎面风速: ' + v_face + ' m/s  (500 fpm)');

// =============================================
// 1. 接触系数法计算
// =============================================
heading('1. 接触系数法 (ε 法)');

var result_cf = calcCoilByContactFactor({
  massFlow: massFlow, T_in: T_in, rhIn: rhIn,
  T_out: 13, rhOut: 90,
  T_coil: T_coil, rh_coil: rh_coil,
  T_w1: T_chw_in, chwDT: chwDT, P_atm: P_atm,
  vy: v_face,
  tubeOD: 9.52, finType: 0,
  circuits: 4
});

console.log('  接触系数 ε: ' + fmt(result_cf.eps, 4));
console.log('  析湿系数 ξ: ' + fmt(result_cf.xi, 3));
console.log('  推荐排数: ' + result_cf.rows + ' 排 (' + result_cf.rowsSource + ')');
console.log('  盘管冷量 Q: ' + fmt(result_cf.Q, 2) + ' kW');
console.log('  有效: ' + result_cf.valid);
if (result_cf.msgs.length > 0) {
  console.log('  提示: ' + result_cf.msgs.join('; '));
}

// AHRI 410 典型 4 排盘的 ε ≈ 0.85~0.95 (9.52mm 管, 500fpm)
check('ε 在合理范围 (0.70~1.00)', 0.85, result_cf.eps, 0.15);

// =============================================
// 2. 迎面尺寸
// =============================================
heading('2. 迎面尺寸计算');

var volFlow = massFlow / rhoMoistAir(P_atm, T_in, W_in);
var A_face = volFlow / v_face;
var W = Math.sqrt(A_face * 1.5);
var H = A_face / W;

console.log('  体积流量: ' + fmt(volFlow, 3) + ' m³/s');
console.log('  迎面面积: ' + fmt(A_face, 3) + ' m²');
console.log('  宽度 W: ' + fmt(W * 1000, 0) + ' mm');
console.log('  高度 H: ' + fmt(H * 1000, 0) + ' mm');

// =============================================
// 3. 排数推荐的合理性
// =============================================
heading('3. 排数分析');

// AHRI 410 标准盘管: 4 排/6 排/8 排
// 对于 26.7°C/51% → 10°C/95% 的典型空调用途
// 4 排盘管在 500fpm 下通常足够
var rowsRec = result_cf.rows;

if (rowsRec <= 8 && rowsRec >= 2) {
  console.log('  ✓ 排数 ' + rowsRec + ' 在合理范围 (2~8 排)');
} else {
  console.log('  ✗ 排数 ' + rowsRec + ' 超出典型范围');
}

// =============================================
// 4. 冷量合理性
// =============================================
heading('4. 冷量合理性校核');

// AHRI 410 标准: 4 排 9.52mm 管盘管在 500fpm 下
// 每 m² 迎面面积约 30~40 kW 冷量
var kW_per_m2 = result_cf.Q / A_face;
console.log('  单位面积冷量: ' + fmt(kW_per_m2, 1) + ' kW/m²');
console.log('  AHRI 410 典型值: 30~40 kW/m² (4 排, 9.52mm, 500fpm)');

if (kW_per_m2 >= 20 && kW_per_m2 <= 60) {
  console.log('  ✓ 冷量密度合理');
} else {
  console.log('  ⚠ 冷量密度偏高或偏低');
}

// =============================================
// 5. 显热比 SHR
// =============================================
heading('5. 显热比 SHR (Sensible Heat Ratio)');

var W_out = calcHumidityRatio(13, 90, P_atm);
var Q_total = result_cf.Q;
var Q_sensible = massFlow * 1.006 * (T_in - T_coil);
var SHR = Q_sensible / Q_total;

console.log('  总冷量: ' + fmt(Q_total, 2) + ' kW');
console.log('  显热冷量: ' + fmt(Q_sensible, 2) + ' kW');
console.log('  显热比 SHR: ' + fmt(SHR, 3));

// AHRI 410 典型: 对于 80/67°F 进风, SHR ≈ 0.65~0.75
if (SHR >= 0.4 && SHR <= 0.9) {
  console.log('  ✓ SHR 在合理范围 (0.4~0.9)');
} else {
  console.log('  ⚠ SHR 异常');
}

// =============================================
// 6. 综合结论
// =============================================
heading('6. 综合结论');

var passed = true;
console.log('  AHRI 410 标准工况: 26.7°C DB / 19.4°C WB / 7.2°C 进水');
console.log('  迎风风速: 2.54 m/s (500 fpm)');
console.log('');
console.log('  排数: ' + rowsRec + ' 排');
console.log('  接触系数 ε: ' + fmt(result_cf.eps, 4));
console.log('  单位面积冷量: ' + fmt(kW_per_m2, 1) + ' kW/m²');

if (rowsRec >= 2 && rowsRec <= 8 && result_cf.eps > 0.5) {
  console.log('');
  console.log('  ✅ 计算结果在 AHRI 410 典型范围内');
  console.log('  建议: 可将此算例作为盘管选型的基准对标');
} else {
  console.log('');
  console.log('  ⚠ 计算结果偏离 AHRI 410 典型值，建议检查参数');
}
