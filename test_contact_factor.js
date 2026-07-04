// 接触系数法(ε 法)独立验证
// 依据《空气调节设计手册》第三版: ε = 1 − (tg₂−ts₂)/(tg₁−ts₁)
// 注意:tg₂/ts₂ 为盘管出口(再热前,~95%RH)状态,非最终 AHU 出口
const fs = require('fs');
const path = require('path');
eval(fs.readFileSync(path.join(__dirname, 'calculations.js'), 'utf8'));

const cdSrc = fs.readFileSync(path.join(__dirname, 'component_design.js'), 'utf8');
const fnMatch = cdSrc.match(/function calcCoilByContactFactor[\s\S]*?\n\}\n/);
if (!fnMatch) { console.error('未找到 calcCoilByContactFactor'); process.exit(1); }
eval(fnMatch[0]);

if (typeof document === 'undefined') {
  global.document = {
    getElementById: function(id) {
      if (id === 'cd-chwDeltaT') return { value: '5' };
      return null;
    }
  };
}

console.log('=== 接触系数法验证 (ε = 1 − (tg₂−ts₂)/(tg₁−ts₁)) ===\n');

let pass = 0, fail = 0;
function chk(cond, label) { if (cond) { pass++; console.log('  ✓', label); } else { fail++; console.log('  ✗', label); } }

// ====== 案例1: 夏季高湿 40℃/95% → 20℃/50% ======
console.log('【案例1】夏季 40℃/95% → 20℃/50% @1.1kg/s, 盘管出口≈10℃/95%');
const summer = calcCoilByContactFactor({
  massFlow: 1.1, T_in: 40, rhIn: 95,
  T_out: 20, rhOut: 50,
  T_coil: 10, rh_coil: 95,
  T_w1: 7, P_atm: 101.325
});
console.log('  进口: tg₁=' + summer.T1.toFixed(1) + '℃, ts₁=' + summer.ts1.toFixed(2) + '℃, Δwb=' + (summer.T1 - summer.ts1).toFixed(2) + '℃');
console.log('  盘管出口: tg₂=' + summer.T_coil.toFixed(1) + '℃, ts₂=' + summer.ts2.toFixed(2) + '℃, Δwb=' + (summer.T_coil - summer.ts2).toFixed(2) + '℃');
console.log('  ε=' + summer.eps.toFixed(4) + ', BF=' + summer.BF.toFixed(4) + ', 排数=' + summer.rows);
chk(summer.Q > 100 && summer.Q < 150, 'Q 在 100~150 kW');
chk(summer.eps > 0.8 && summer.eps <= 1.01, 'ε≈1.0(焓值修正,进口近饱和)');
chk(!isNaN(summer.ts1) && !isNaN(summer.ts2), '湿球计算成功');
chk(summer.T_coil - summer.ts2 < 3, '盘管出口干湿球差<3℃');

// ====== 案例2: 标准工况 25℃/60% → 20℃/50% ======
console.log('\n【案例2】标准 25℃/60% → 20℃/50% @0.5kg/s, 盘管出口≈10℃/95%');
const std = calcCoilByContactFactor({
  massFlow: 0.5, T_in: 25, rhIn: 60,
  T_out: 20, rhOut: 50,
  T_coil: 10, rh_coil: 95,
  T_w1: 7, P_atm: 101.325
});
console.log('  ε=' + std.eps.toFixed(4) + ', BF=' + std.BF.toFixed(4) + ', 排数=' + std.rows);
chk(std.eps > 0.8 && std.eps < 1, 'ε=0.8~1.0(标准工况)');
chk(std.BF >= 0 && std.BF < 0.25, 'BF=0~0.25');
chk(std.rows >= 4 && std.rows <= 8, '排数 4~8');

// ====== 案例3: 中湿工况 30℃/65% → 18℃/50%, 盘管出口≈9℃/95% ======
console.log('\n【案例3】中湿 30℃/65% → 18℃/50%, 盘管出口≈9℃/95%');
const mid = calcCoilByContactFactor({
  massFlow: 0.8, T_in: 30, rhIn: 65,
  T_out: 18, rhOut: 50,
  T_coil: 9, rh_coil: 95,
  T_w1: 7, P_atm: 101.325
});
console.log('  进口Δwb=' + (mid.T1 - mid.ts1).toFixed(2) + '℃, 盘管出口Δwb=' + (mid.T_coil - mid.ts2).toFixed(2) + '℃');
console.log('  ε=' + mid.eps.toFixed(4) + ', 排数=' + mid.rows);
chk(mid.eps > 0.75 && mid.eps < 0.95, 'ε=0.75~0.95');
chk(mid.rows >= 4, '排数 ≥ 4');

// ====== 案例4: 冬季(不适用) ======
console.log('\n【案例4】冬季(不适用)');
const winter = calcCoilByContactFactor({
  massFlow: 1.1, T_in: -5, rhIn: 10, T_out: 25, rhOut: 50, T_w1: 7, P_atm: 101.325
});
chk(!winter.valid, '正确判定不适用');

// ====== 案例5: 无 T_coil 参数(兼容旧调用) ======
console.log('\n【案例5】无 T_coil 参数(回退到 T_out)');
const fallback = calcCoilByContactFactor({
  massFlow: 1.0, T_in: 30, rhIn: 65, T_out: 16, rhOut: 90, T_w1: 7, P_atm: 101.325
});
console.log('  ε=' + fallback.eps.toFixed(4) + ', T_coil(回退)=' + fallback.T_coil.toFixed(1) + '℃');
chk(!isNaN(fallback.eps), '无 T_coil 正常计算');

// ====== 案例6: 排数选择边界验证(eps_hi vs eps 典型值) ======
console.log('\n【案例6】边界验证 33℃/70% → 16℃/50%, 盘管出口≈11℃/95%');
const boundary = calcCoilByContactFactor({
  massFlow: 0.6, T_in: 33, rhIn: 70,
  T_out: 16, rhOut: 50,
  T_coil: 11, rh_coil: 95,
  T_w1: 7, P_atm: 101.325
});
console.log('  ε=' + boundary.eps.toFixed(4) + ', BF=' + boundary.BF.toFixed(4), ', 排数=' + boundary.rows);
console.log('  进口Δwb=' + (boundary.T1 - boundary.ts1).toFixed(2) + '℃, 盘管出口Δwb=' + (boundary.T_coil - boundary.ts2).toFixed(2) + '℃');
// 验证排数选择是否使用典型eps(而非eps_hi)作为阈值
chk(boundary.eps > 0 && boundary.eps < 1, 'ε 在 0~1 范围内');
chk(boundary.rows >= 2 && boundary.rows <= 8, '排数在合理范围');

console.log('\n========================================');
console.log('通过: ' + pass + ', 失败: ' + fail);
process.exit(fail > 0 ? 1 : 0);
