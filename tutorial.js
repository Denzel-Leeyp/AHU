// ============================================
// tutorial.js - 交互式教学指南模块 v3.0
// 涡轮增压器测试台进气空调 (AHU) 计算器
// 包含：入门篇、进阶篇、实战篇、知识库、扩展阅读
// 引用标准：GB 50736-2012, GB/T 14294-2026, GB/T 35226-2017
// ============================================

// ==========================================
// 全局状态
// ==========================================
var currentModule = "beginner"; // beginner | advanced | practice
var currentStepIndex = 0;

// ==========================================
// 入门篇：零基础概念讲解（5步）
// ==========================================
const beginnerSteps = [
  {
    title: "什么是进气空调？",
    concept: "进气空调（Air Handling Unit, AHU）是一种专门用于处理空气温度、湿度、洁净度的设备。在涡轮增压器测试台中，进气空调的作用是：无论外界天气如何变化（酷暑、严寒、潮湿、干燥），都能向测试台提供<strong>温度恒定、湿度恒定、洁净</strong>的空气。",
    why: "为什么要这样做？因为涡轮增压器的性能测试必须在<strong>标准进气条件</strong>下进行。如果进气温度和湿度不稳定，测试结果就无法比较、无法复现，甚至可能得出错误结论。",
    formulaTitle: "进气空调的核心任务",
    formula: [
      { label: "温度控制", value: "将空气调节到 20℃ ±5℃", note: "无论外界是-5℃还是40℃" },
      { label: "湿度控制", value: "将相对湿度控制在 50% ±20%", note: "防止结露或过干" },
      { label: "洁净度", value: "过滤空气中的颗粒物", note: "保护测试台和设备" },
      { label: "流量稳定", value: "保持恒定的空气流量", note: "确保测试条件一致" }
    ],
    tip: "你可以把进气空调想象成一个「空气加工厂」：原料是室外空气（可能又热又湿、又冷又干），产品是符合标准的洁净空气。这个工厂需要24小时不间断运行。",
    misconceptions: "误区：进气空调 ≠ 家用空调。家用空调只关注舒适，进气空调关注的是<strong>精确控制</strong>（温度波动 < ±0.5℃，湿度波动 < ±3%）。",
    standards: "GB/T 23341.1-2018《涡轮增压器 第1部分：一般技术条件》",
    readings: [
      { title: "百度百科：空气处理机组", url: "https://baike.baidu.com/item/空气处理机组" },
      { title: "知乎：什么是AHU？", url: "https://www.zhihu.com/search?type=content&q=AHU空气处理机组" },
      { title: "暖通空调基础知识", url: "https://baike.baidu.com/item/暖通空调" }
    ]
  },
  {
    title: "湿空气是什么？",
    concept: "我们呼吸的空气不是「纯空气」，而是<strong>干空气 + 水蒸气</strong>的混合物，称为「湿空气」。干空气主要由氮气（78%）、氧气（21%）组成；水蒸气含量虽然很少（通常不到3%），但它对空调设计影响巨大。",
    why: "为什么水蒸气这么重要？因为水蒸气在凝结（变成水）或蒸发（变成气体）时会释放或吸收大量热量——这叫「潜热」。1克水蒸气凝结释放的热量，足以让1克干空气升温约6℃！所以空调设计中，处理水蒸气的能耗往往比单纯降温/升温还要大。",
    formulaTitle: "湿空气的组成",
    formula: [
      { label: "干空气", value: "N₂ 78% + O₂ 21% + 其他 1%", note: "分子量 ≈ 28.97 g/mol" },
      { label: "水蒸气", value: "H₂O，含量 0~3%", note: "分子量 = 18.02 g/mol" },
      { label: "含湿量 W", value: "每kg干空气中含水蒸气的kg数", note: "单位：kg/kg 或 g/kg" },
      { label: "相对湿度 RH", value: "实际水蒸气分压力 / 饱和水蒸气分压力", note: "单位：%" }
    ],
    tip: "一个直观的例子：夏天从冰箱里拿出一罐可乐，罐子表面很快出现水珠。这是因为罐子表面温度低于周围空气的「露点温度」，空气中的水蒸气在罐子表面凝结成了水。空调的除湿原理与此相同。",
    misconceptions: "误区：相对湿度100% ≠ 空气全是水。它只表示空气已经「装满了」它能容纳的最大水蒸气量，实际水蒸气含量可能只有2~3%。",
    standards: "GB/T 35226-2017《湿空气性质计算公式》",
    readings: [
      { title: "百度百科：湿空气", url: "https://baike.baidu.com/item/湿空气" },
      { title: "含湿量与相对湿度的区别", url: "https://baike.baidu.com/item/含湿量" },
      { title: "露点温度是什么？", url: "https://baike.baidu.com/item/露点温度" }
    ]
  },
  {
    title: "温度、湿度、焓值的关系",
    concept: "在空调设计中，有三个核心参数：<strong>温度</strong>（冷热程度）、<strong>湿度</strong>（水蒸气含量）、<strong>焓值</strong>（总热量）。焓值是最容易被初学者忽略的概念，但它是最重要的——因为空调的本质就是「搬运热量」。",
    why: "为什么不能只看温度？因为同样25℃的空气，湿度不同时，它含有的总热量（焓值）可以相差很大。空调要处理的是「总热量」，不仅仅是「显热」（温度变化带来的热量），还包括「潜热」（水蒸气变化带来的热量）。",
    formulaTitle: "三种热量的区别",
    formula: [
      { label: "显热", value: "温度变化带来的热量", note: "例：25℃→30℃，空气变热了" },
      { label: "潜热", value: "水蒸气相变带来的热量", note: "例：水蒸发成水蒸气，吸收热量" },
      { label: "焓值 h", value: "显热 + 潜热 = 总热量", note: "单位：kJ/kg干空气" },
      { label: "公式", value: "h = 1.006T + W(2501 + 1.86T)", note: "T=温度℃, W=含湿量kg/kg" }
    ],
    tip: "焓值的物理意义：把1kg干空气从0℃加热到T℃，并且把W kg的水蒸发到其中，所需要的总热量。这就是为什么焓值包含了「显热」和「潜热」两部分。",
    misconceptions: "误区：温度高 = 焓值高。不一定！30℃/10%RH的空气焓值可能比25℃/80%RH的还低，因为后者的水蒸气含量大得多，潜热占比高。",
    standards: "GB/T 35226-2017 第4章：湿空气焓值计算",
    readings: [
      { title: "百度百科：焓", url: "https://baike.baidu.com/item/焓" },
      { title: "显热与潜热的区别", url: "https://baike.baidu.com/item/潜热" },
      { title: "焓湿图详解", url: "https://baike.baidu.com/item/焓湿图" }
    ]
  },
  {
    title: "空气处理的基本流程",
    concept: "室外空气进入进气空调后，要经历一系列处理步骤才能变成符合标准的空气。这个过程就像一条「生产线」，每个环节都有特定的功能。",
    why: "为什么需要这么多步骤？因为单一设备无法同时完成降温、除湿、加热、加湿、过滤等多种任务。每个功能段各司其职，组合起来才能实现精确控制。",
    formulaTitle: "空气处理流程（从进口到出口）",
    formula: [
      { label: "① 初效过滤器", value: "G4级袋式过滤", note: "去除大颗粒灰尘、花粉等" },
      { label: "② 表冷器", value: "冷冻水或直接膨胀式", note: "降温 + 除湿（核心环节）" },
      { label: "③ 再热器", value: "电加热或热水加热", note: "将空气加热到目标温度" },
      { label: "④ 加湿器", value: "电极式或湿膜式", note: "精确控制湿度" },
      { label: "⑤ 风机", value: "离心风机 + 变频器", note: "推动空气流动，调节流量" }
    ],
    tip: "夏季典型流程：40℃/95%RH的室外空气 → 表冷器冷却到13℃（同时除湿）→ 再热器加热到20℃ → 送入测试台。注意：先冷后热看似浪费能量，但这是除湿的必要手段——必须把空气冷却到露点以下，水蒸气才能凝结出来。",
    misconceptions: "误区：夏天只需要制冷。实际上，除湿后的空气温度太低（约13℃），必须再加热到20℃才能送入测试台。所以夏季同时需要制冷和加热。",
    standards: "GB/T 14294-2026《组合式空调机组》第5章：功能段配置",
    readings: [
      { title: "组合式空调机组工作原理", url: "https://baike.baidu.com/item/组合式空调机组" },
      { title: "表冷器工作原理", url: "https://baike.baidu.com/item/表冷器" },
      { title: "空调系统空气处理流程", url: "https://www.zhihu.com/search?type=content&q=空调空气处理流程" }
    ]
  },
  {
    title: "设计前的准备工作",
    concept: "在开始设计进气空调之前，必须收集以下信息：测试台的位置（决定气候条件）、测试台的规格（决定空气流量）、测试标准（决定目标温湿度）。这些信息统称为「设计边界条件」。",
    why: "边界条件决定了整个设计的方向。如果边界条件取错了，比如把广州的气候当作哈尔滨的设计条件，那系统将完全无法满足实际需求。",
    formulaTitle: "需要收集的设计参数",
    formula: [
      { label: "测试台位置", value: "城市/海拔高度", note: "决定大气压力和气候条件" },
      { label: "极端气温", value: "夏季最高温 / 冬季最低温", note: "参考当地气象数据" },
      { label: "极端湿度", value: "夏季最高RH / 冬季最低RH", note: "参考当地气象数据" },
      { label: "空气流量", value: "测试台需要的空气流量", note: "单位：kg/s 或 m³/h" },
      { label: "目标温湿度", value: "测试标准要求的进气条件", note: "通常 20℃ ±5℃, 50% ±20% RH" }
    ],
    tip: "设计时通常取「最不利工况」作为设计依据：夏季取40℃/95%RH，冬季取-5℃/10%RH。这样设计出来的系统在任何天气条件下都能满足要求。",
    misconceptions: "误区：用「平均气温」做设计。应该用「极端气温」，因为空调系统必须在最恶劣的条件下也能正常工作。",
    standards: "GB 50736-2012 第4章：室外空气计算参数",
    readings: [
      { title: "中国各城市气象参数", url: "https://baike.baidu.com/item/中国建筑热环境分析专用气象数据集" },
      { title: "空调设计气象参数", url: "https://www.zhihu.com/search?type=content&q=空调设计气象参数" }
    ]
  }
];

// ==========================================
// 进阶篇：详细计算与设计方法（6步）
// ==========================================
const advancedSteps = [
  {
    title: "湿空气热力学计算基础",
    concept: "要设计进气空调，必须掌握湿空气的热力学计算。核心是四个公式：饱和水汽压、水汽分压力、含湿量、焓值。这四个公式是后续所有计算的基础。",
    why: "为什么不能跳过这些公式直接用软件计算？因为作为设计师，你必须理解每个参数的物理意义，才能判断计算结果是否合理，才能在设计出现偏差时找到原因。",
    formulaTitle: "四大核心公式",
    formula: [
      { label: "饱和水汽压", value: "P_sat = 0.61078 × exp(17.27T/(T+237.3))", note: "Magnus公式，T为温度(℃)" },
      { label: "水汽分压力", value: "P_v = RH/100 × P_sat", note: "RH为相对湿度(%)" },
      { label: "含湿量", value: "W = 0.622 × P_v / (P_atm - P_v)", note: "0.622 = 18.02/28.97" },
      { label: "焓值", value: "h = 1.006T + W(2501 + 1.86T)", note: "显热 + 潜热 + 水蒸气显热" }
    ],
    tip: "计算示例：25℃、60%RH、101.325kPa 时：\nP_sat = 0.61078 × exp(17.27×25/(25+237.3)) = 3.169 kPa\nP_v = 0.6 × 3.169 = 1.901 kPa\nW = 0.622 × 1.901 / (101.325 - 1.901) = 0.0119 kg/kg = 11.9 g/kg\nh = 1.006×25 + 0.0119×(2501 + 1.86×25) = 55.3 kJ/kg",
    misconceptions: "误区：大气压力总是101.325kPa。在高原地区（如海拔2000m），大气压力只有约79.5kPa，这会显著影响含湿量计算。",
    standards: "GB/T 35226-2017《湿空气性质计算公式》",
    readings: [
      { title: "Magnus公式推导", url: "https://baike.baidu.com/item/Magnus公式" },
      { title: "湿空气计算实例", url: "https://www.zhihu.com/search?type=content&q=湿空气含湿量计算" },
      { title: "海拔对大气压的影响", url: "https://baike.baidu.com/item/大气压" }
    ]
  },
  {
    title: "冷负荷计算（焓差法）",
    concept: "冷负荷是指空气从进口状态变化到出口状态时，需要移除的热量。计算方法叫「焓差法」：用进口焓值减去出口焓值，再乘以质量流量。",
    why: "为什么用焓差法而不是温差法？因为空气处理过程中不仅有温度变化（显热），还有水分变化（潜热）。温差法只计算了显热，会严重低估制冷需求——在高湿工况下，潜热可能占总负荷的50%以上。",
    formulaTitle: "冷负荷计算公式",
    formula: [
      { label: "焓差法", value: "Q_c = ṁ × (h_in - h_out)", note: "ṁ = 质量流量 kg/s" },
      { label: "h_in", value: "进口空气焓值 kJ/kg", note: "由进口T和RH计算" },
      { label: "h_out", value: "出口空气焓值 kJ/kg", note: "由出口T和RH计算" },
      { label: "单位", value: "Q_c 的单位是 kW（千焦/秒）", note: "1 kW = 1 kJ/s" }
    ],
    tip: "典型工况：40℃/95%RH → 20℃/50%RH，1.1 kg/s 时：\nh_in ≈ 152.3 kJ/kg，h_out ≈ 38.2 kJ/kg\nQ_c = 1.1 × (152.3 - 38.2) = 125.5 kW\n这个值决定了表冷器的大小和冷冻水系统的容量。",
    misconceptions: "误区：用 Q = ṁ × c_p × ΔT 计算冷负荷。这只计算了显热，忽略了除湿的潜热负荷。在高湿工况下，潜热负荷可能比显热还大。",
    standards: "GB 50736-2012 第7.2节：空调冷负荷计算",
    readings: [
      { title: "焓差法 vs 温差法", url: "https://www.zhihu.com/search?type=content&q=空调冷负荷焓差法" },
      { title: "显热负荷与潜热负荷", url: "https://baike.baidu.com/item/空调负荷" }
    ]
  },
  {
    title: "热负荷计算（显热法）",
    concept: "热负荷是指将空气从进口温度加热到出口温度所需的热量。注意：加热通常在除湿之后进行，所以加热的是干燥后的空气。",
    why: "夏季也需要加热？是的！因为除湿需要把空气冷却到露点以下（约13~14℃），然后需要再热到20℃。冬季则更需要加热，可能从-5℃加热到25℃。",
    formulaTitle: "热负荷计算公式",
    formula: [
      { label: "显热法", value: "Q_h = ṁ × c_p × (T_out - T_in)", note: "c_p ≈ 1.006 kJ/(kg·K)" },
      { label: "c_p", value: "空气定压比热容", note: "1.006 kJ/(kg·K)" },
      { label: "T_in", value: "加热前空气温度 ℃", note: "夏季约13℃，冬季约-5℃" },
      { label: "T_out", value: "目标出口温度 ℃", note: "15~25℃可调节" }
    ],
    tip: "冬季工况：-5℃ → 25℃，1.1 kg/s 时：\nQ_h = 1.1 × 1.006 × (25 - (-5)) = 33.2 kW\n选型功率 = 33.2 × 1.15 = 38.2 kW（含15%安全系数）",
    misconceptions: "误区：加热负荷不需要安全系数。实际上电加热器有衰减，且冬季电压可能波动，必须取1.15倍安全系数。",
    standards: "GB 50736-2012 第8章：供暖与加热",
    readings: [
      { title: "电加热器选型", url: "https://www.zhihu.com/search?type=content&q=空调电加热器选型" },
      { title: "再热器的作用", url: "https://baike.baidu.com/item/再热" }
    ]
  },
  {
    title: "除湿量与冷凝水计算",
    concept: "除湿量是指进口和出口空气含湿量之差。当进口含湿量 > 出口含湿量时，多余的水分会在表冷器表面凝结成水，通过排水盘排出。",
    why: "除湿量计算的意义：① 确定表冷器的除湿能力要求 ② 计算冷凝水排水管的直径 ③ 确定排水盘的容量 ④ 评估是否需要额外的除湿设备。",
    formulaTitle: "除湿量公式",
    formula: [
      { label: "含湿量差", value: "ΔW = W_in - W_out (kg/kg)", note: "W_in > W_out 时需要除湿" },
      { label: "除湿量", value: "ṁ_deh = ṁ × ΔW × 1000 (g/s)", note: "×1000 转换为克" },
      { label: "每小时冷凝水", value: "V_water = ṁ_deh × 3.6 (L/h)", note: "1g/s = 3.6L/h" },
      { label: "排水管径", value: "DN25 ~ DN40", note: "根据流量选择" }
    ],
    tip: "极端高湿工况：40℃/95%RH → 20℃/50%RH：\nW_in ≈ 46.0 g/kg，W_out ≈ 7.3 g/kg\nΔW = 38.7 g/kg\nṁ_deh = 1.1 × 0.0387 × 1000 = 42.6 g/s\n每小时冷凝水 = 42.6 × 3.6 = 153.4 L/h\n这意味着排水管必须能在1小时内排出153升水！",
    misconceptions: "误区：冷凝水很少，随便接根管子就行。实际上极端工况下每小时可能产生150多升水，排水管径不够会导致积水、漏水。",
    standards: "GB 50736-2012 第7.5节：空调除湿设计",
    readings: [
      { title: "冷凝水排水设计", url: "https://www.zhihu.com/search?type=content&q=空调冷凝水排水设计" },
      { title: "表冷器除湿原理", url: "https://baike.baidu.com/item/表冷器" }
    ]
  },
  {
    title: "冷热水系统计算",
    concept: "知道了冷负荷和热负荷后，就可以计算需要的冷冻水和热水流量。空调系统常用的冷热源有冷冻水（7℃供水/12℃回水）和热水（60℃供水/50℃回水）。",
    why: "选型水泵和管径时，需要知道流量和供回水温差。如果流量太小会导致水温差过大，换热效率降低；流量太大会增加水泵能耗。",
    formulaTitle: "水流量公式",
    formula: [
      { label: "冷冻水流量", value: "ṁ_ch = Q_c / (4.187 × ΔT_ch)", note: "ΔT_ch = 5℃（标准温差）" },
      { label: "热水流量", value: "ṁ_h = Q_h / (4.187 × ΔT_h)", note: "ΔT_h = 10℃（标准温差）" },
      { label: "单位换算", value: "1 kg/s = 3.6 m³/h", note: "水的密度 ≈ 1000 kg/m³" },
      { label: "管径选择", value: "DN25~DN80", note: "根据流量和流速选择" }
    ],
    tip: "水的比热容 4.187 kJ/(kg·K) 远大于空气的 1.006 kJ/(kg·K)，这意味着用很少的水就能传递大量热量。例如：125kW冷负荷只需约6m³/h的冷冻水。",
    misconceptions: "误区：冷冻水温差越大越好。实际上温差过大会导致表冷器换热不均匀，通常取5℃为标准温差。",
    standards: "GB 50736-2012 第9章：空调水系统设计",
    readings: [
      { title: "空调水系统设计", url: "https://baike.baidu.com/item/空调水系统" },
      { title: "冷冻水供回水温差", url: "https://www.zhihu.com/search?type=content&q=冷冻水供回水温差" }
    ]
  },
  {
    title: "设备选型与安全系数",
    concept: "根据计算结果选择实际设备的规格参数。选型不是简单套用计算值，需要考虑安全系数、安装空间、压降损失、长期运行衰减等因素。",
    why: "安全系数是为了应对：① 设备制造公差 ② 长期运行后性能衰减（如表冷器结垢） ③ 实际工况偏离设计值 ④ 未来可能的工况扩展。",
    formulaTitle: "选型安全系数",
    formula: [
      { label: "表冷器", value: "选型 = 计算值 × 1.10", note: "6排~8排，迎面风速2.0~2.5 m/s" },
      { label: "加热器", value: "选型 = 计算值 × 1.15", note: "PID可控硅控制，分级或无级调节" },
      { label: "风机", value: "选型 = 计算值 × 1.10", note: "全压 = 系统阻力 × 1.15" },
      { label: "过滤器", value: "初效G4 + 中效F7", note: "可选更高等级" }
    ],
    tip: "系统阻力估算：初效~50Pa，中效~150Pa，表冷器~100Pa，加热器~30Pa，加湿器~50Pa，管道~100Pa，合计约 480Pa。风机全压 = 480 × 1.15 = 552Pa，取 600Pa。",
    misconceptions: "误区：安全系数越大越好。过大的安全系数会导致设备过大、能耗增加、初投资浪费。通常取1.10~1.15即可。",
    standards: "GB/T 14294-2026 附录A：机组选型方法",
    readings: [
      { title: "空调设备选型指南", url: "https://www.zhihu.com/search?type=content&q=空调设备选型" },
      { title: "风机选型计算", url: "https://baike.baidu.com/item/风机选型" }
    ]
  }
];

// ==========================================
// 实战篇：完整工程案例（4步）
// ==========================================
const practiceSteps = [
  {
    title: "案例一：夏季极端工况设计",
    concept: "本案例以中国南方夏季极端工况（40℃/95%RH）为设计条件，演示完整的进气空调设计流程。这是最具挑战性的工况，因为高温高湿同时存在，制冷和除湿负荷都很大。",
    why: "夏季极端工况是进气空调设计的「最不利工况」。如果系统能在这个工况下满足要求，那么在其他工况下自然也能满足。因此，设计通常从夏季极端工况开始。",
    formulaTitle: "设计条件与计算结果",
    formula: [
      { label: "设计条件", value: "40℃ / 95%RH → 20℃ / 50%RH", note: "质量流量 1.1 kg/s" },
      { label: "入口焓值", value: "h_in ≈ 152.3 kJ/kg", note: "高温高湿，焓值很高" },
      { label: "出口焓值", value: "h_out ≈ 38.2 kJ/kg", note: "标准测试条件" },
      { label: "制冷量", value: "Q_c = 125.5 kW", note: "选型 = 138.1 kW（×1.10）" },
      { label: "除湿量", value: "42.6 g/s（153.4 L/h）", note: "冷凝水量很大" },
      { label: "冷冻水", value: "6.0 m³/h（ΔT=5℃）", note: "管径 DN50" }
    ],
    tip: "设计要点：\n1. 表冷器需要6~8排管，迎面风速2.0~2.5 m/s\n2. 冷凝水排水管径不小于DN40\n3. 再热器功率约30kW（从13℃加热到20℃）\n4. 风机全压约600Pa，功率约3.5kW",
    misconceptions: "误区：夏季只需要制冷。实际上除湿后的空气温度太低（约13℃），必须再加热到20℃。所以夏季同时需要制冷和加热，这称为「再热除湿」过程。",
    standards: "GB 50736-2012 第7章：空调设计",
    readings: [
      { title: "夏季空调设计案例", url: "https://www.zhihu.com/search?type=content&q=夏季空调设计案例" },
      { title: "再热除湿过程", url: "https://baike.baidu.com/item/再热除湿" }
    ]
  },
  {
    title: "案例二：冬季极端工况设计",
    concept: "本案例以中国北方冬季极端工况（-5℃/10%RH）为设计条件。与夏季不同，冬季的主要挑战是加热和加湿，而不是制冷和除湿。",
    why: "冬季工况的特点：空气温度低、湿度低。需要将-5℃的冷空气加热到20~25℃，同时可能需要加湿（因为冷空气含湿量很低）。",
    formulaTitle: "设计条件与计算结果",
    formula: [
      { label: "设计条件", value: "-5℃ / 10%RH → 25℃ / 50%RH", note: "质量流量 1.1 kg/s" },
      { label: "入口焓值", value: "h_in ≈ -3.5 kJ/kg", note: "低温低湿，焓值为负" },
      { label: "出口焓值", value: "h_out ≈ 55.3 kJ/kg", note: "标准测试条件" },
      { label: "加热量", value: "Q_h = 33.2 kW", note: "选型 = 38.2 kW（×1.15）" },
      { label: "加湿量", value: "需要加湿", note: "入口含湿量仅0.25 g/kg" },
      { label: "热水", value: "0.79 m³/h（ΔT=10℃）", note: "管径 DN25" }
    ],
    tip: "设计要点：\n1. 加热器功率约38kW，建议分2~3级控制\n2. 需要加湿器，加湿量约10.7 g/s\n3. 不需要表冷器制冷（但需要防冻保护）\n4. 风机需要考虑低温启动问题",
    misconceptions: "误区：冬季不需要空调。实际上冬季的加热和加湿同样重要，特别是对于精密测试台，温度波动必须控制在±0.5℃以内。",
    standards: "GB 50736-2012 第8章：供暖设计",
    readings: [
      { title: "冬季空调设计", url: "https://www.zhihu.com/search?type=content&q=冬季空调设计" },
      { title: "工业加湿器选型", url: "https://baike.baidu.com/item/工业加湿器" }
    ]
  },
  {
    title: "案例三：标准工况验证",
    concept: "本案例以标准测试工况（25℃/60%RH → 20℃/50%RH）为设计条件，验证系统在常规工况下的性能。这是测试台最常用的工况。",
    why: "标准工况验证的意义：① 确认系统在常规工况下的运行效率 ② 评估能耗 ③ 为日常运行提供参考参数。",
    formulaTitle: "设计条件与计算结果",
    formula: [
      { label: "设计条件", value: "25℃ / 60%RH → 20℃ / 50%RH", note: "质量流量 0.5 kg/s" },
      { label: "入口焓值", value: "h_in ≈ 55.3 kJ/kg", note: "常温常湿" },
      { label: "出口焓值", value: "h_out ≈ 38.2 kJ/kg", note: "标准测试条件" },
      { label: "制冷量", value: "Q_c = 8.6 kW", note: "选型 = 9.4 kW" },
      { label: "加热量", value: "Q_h = 0（无需加热）", note: "入口温度高于出口" },
      { label: "除湿量", value: "2.3 g/s", note: "少量除湿" }
    ],
    tip: "标准工况下负荷很小，说明系统在大部分时间运行在低负荷状态。因此，设备选型应考虑部分负荷效率，建议选择变频设备。",
    misconceptions: "误区：按标准工况选型就够了。实际上必须按极端工况选型，标准工况只用于验证和日常运行参考。",
    standards: "GB/T 23341.1-2018 进气条件要求",
    readings: [
      { title: "空调部分负荷运行", url: "https://www.zhihu.com/search?type=content&q=空调部分负荷" },
      { title: "变频空调优势", url: "https://baike.baidu.com/item/变频空调" }
    ]
  },
  {
    title: "控制系统设计与调试",
    concept: "控制系统是进气空调的「大脑」，负责采集传感器数据、执行控制算法、调节执行机构，使系统在各种工况下稳定运行在设定值附近。",
    why: "涡轮增压器测试台对进气条件要求严格，通常要求温度波动 < ±0.5℃，湿度波动 < ±3% RH。这需要精密的控制系统和合理的控制策略。",
    formulaTitle: "控制系统架构",
    formula: [
      { label: "控制器", value: "PLC（如西门子S7-1200）", note: "支持以太网通讯" },
      { label: "温度控制", value: "PID + 电动调节阀", note: "冷冻水阀/加热器调节" },
      { label: "湿度控制", value: "PID + 加湿器", note: "电容式湿度传感器" },
      { label: "风机控制", value: "变频器 + 压力传感器", note: "恒压变风量" },
      { label: "人机界面", value: "触摸屏HMI", note: "实时显示、参数设定、报警" }
    ],
    tip: "调试步骤：\n1. 单机调试：逐个测试传感器、执行器\n2. 回路调试：PID参数整定（先P后I再D）\n3. 联动调试：模拟各种工况，验证控制效果\n4. 长期运行：记录数据，优化PID参数",
    misconceptions: "误区：PID参数一次调好就不用改了。实际上不同工况下最优PID参数可能不同，建议设置多组PID参数，根据工况自动切换。",
    standards: "GB 50736-2012 第13章：自动控制系统",
    readings: [
      { title: "PLC控制系统设计", url: "https://baike.baidu.com/item/PLC控制系统" },
      { title: "PID参数整定方法", url: "https://www.zhihu.com/search?type=content&q=PID参数整定" },
      { title: "空调自控系统设计", url: "https://baike.baidu.com/item/楼宇自控系统" }
    ]
  }
];

// ==========================================
// 知识库数据
// ==========================================
const knowledgeData = [
  {
    category: "🌡️ 热力学基础",
    items: [
      {
        title: "温度与温标",
        content: `<h3>温度是什么？</h3>
<p>温度是物体冷热程度的物理量度。在空调工程中，常用两种温标：</p>
<ul>
<li><strong>摄氏温标（℃）</strong>：水的冰点为0℃，沸点为100℃（标准大气压下）</li>
<li><strong>开尔文温标（K）</strong>：绝对温标，0K = -273.15℃（绝对零度）</li>
</ul>
<p>换算关系：T(K) = T(℃) + 273.15</p>

<h3>干球温度 vs 湿球温度</h3>
<ul>
<li><strong>干球温度（DBT）</strong>：普通温度计测得的温度，即我们常说的「气温」</li>
<li><strong>湿球温度（WBT）</strong>：湿纱布包裹的温度计测得的温度，反映空气的冷却极限</li>
<li><strong>露点温度（DPT）</strong>：空气冷却到水蒸气开始凝结的温度</li>
</ul>
<p>三者关系：干球温度 ≥ 湿球温度 ≥ 露点温度（饱和时三者相等）</p>`
      },
      {
        title: "热量与比热容",
        content: `<h3>热量是什么？</h3>
<p>热量是能量的一种形式，单位为焦耳（J）或千焦（kJ）。在空调中，常用功率单位千瓦（kW）表示单位时间内的热量。</p>

<h3>比热容</h3>
<p>比热容是指1kg物质温度升高1℃所需的热量：</p>
<ul>
<li><strong>空气定压比热容</strong>：c_p ≈ 1.006 kJ/(kg·K)</li>
<li><strong>水蒸气比热容</strong>：c_pv ≈ 1.86 kJ/(kg·K)</li>
<li><strong>水的比热容</strong>：c_pw ≈ 4.187 kJ/(kg·K)</li>
</ul>
<p>水的比热容是空气的4倍多，这意味着水是非常好的热量传递介质。</p>

<h3>显热 vs 潜热</h3>
<ul>
<li><strong>显热</strong>：温度变化带来的热量，可以用温度计测量</li>
<li><strong>潜热</strong>：物质相变（如蒸发/凝结）时吸收/释放的热量，温度不变</li>
</ul>
<p>0℃时水的汽化潜热为2501 kJ/kg——这意味着蒸发1kg水需要2501kJ的热量，足以让1kg空气升温约2500℃！</p>`
      },
      {
        title: "传热方式",
        content: `<h3>三种传热方式</h3>
<ul>
<li><strong>导热（传导）</strong>：热量通过固体材料传递，如金属管壁。傅里叶定律：Q = -kA(dT/dx)</li>
<li><strong>对流</strong>：热量通过流体（空气/水）流动传递。牛顿冷却定律：Q = hA(T_s - T_f)</li>
<li><strong>辐射</strong>：热量以电磁波形式传递，不需要介质。斯蒂芬-玻尔兹曼定律：Q = εσA(T₁⁴ - T₂⁴)</li>
</ul>

<h3>在空调中的应用</h3>
<ul>
<li>表冷器：对流换热（空气与翅片管之间）+ 导热（管壁内部）</li>
<li>加热器：对流换热（电热管与空气之间）</li>
<li>箱体保温：导热（保温层内部）</li>
</ul>`
      }
    ]
  },
  {
    category: "💧 湿空气性质",
    items: [
      {
        title: "饱和水汽压",
        content: `<h3>什么是饱和水汽压？</h3>
<p>在一定温度下，空气中水蒸气达到饱和时的水蒸气分压力，称为饱和水汽压。它只与温度有关，温度越高，饱和水汽压越大。</p>

<h3>Magnus公式</h3>
<p>P_sat(T) = 0.61078 × exp(17.27 × T / (T + 237.3))</p>
<p>其中 T 为温度（℃），P_sat 单位为 kPa。</p>

<h3>常用值参考</h3>
<table>
<tr><th>温度(℃)</th><th>-5</th><th>0</th><th>10</th><th>20</th><th>30</th><th>40</th></tr>
<tr><td>P_sat(kPa)</td><td>0.40</td><td>0.61</td><td>1.23</td><td>2.34</td><td>4.24</td><td>7.38</td></tr>
</table>
<p>可以看到，40℃时的饱和水汽压是0℃时的12倍！这就是为什么夏季空气含水量远大于冬季。</p>`
      },
      {
        title: "含湿量与相对湿度",
        content: `<h3>含湿量（W）</h3>
<p>含湿量是指每千克干空气中所含水蒸气的质量，单位为 kg/kg 或 g/kg。</p>
<p>W = 0.622 × P_v / (P_atm - P_v)</p>
<p>其中 0.622 = 水分子量(18.02) / 干空气分子量(28.97)</p>

<h3>相对湿度（RH）</h3>
<p>相对湿度是指空气中实际水蒸气分压力与同温度下饱和水蒸气分压力之比：</p>
<p>RH = P_v / P_sat × 100%</p>

<h3>两者的区别</h3>
<ul>
<li><strong>含湿量</strong>：绝对量，表示空气中实际有多少水蒸气</li>
<li><strong>相对湿度</strong>：相对量，表示空气「装水」的饱和程度</li>
</ul>
<p>举例：30℃/50%RH 的含湿量（13.3 g/kg）比 20℃/80%RH 的含湿量（11.7 g/kg）还大！</p>`
      },
      {
        title: "焓值与焓湿图",
        content: `<h3>焓值（h）</h3>
<p>焓值是湿空气的总热量，包含显热和潜热两部分：</p>
<p>h = 1.006T + W(2501 + 1.86T)</p>
<ul>
<li>1.006T = 干空气显热</li>
<li>W × 2501 = 水蒸气潜热（0℃时汽化潜热）</li>
<li>W × 1.86T = 水蒸气显热</li>
</ul>

<h3>焓湿图（Psychrometric Chart）</h3>
<p>焓湿图是以焓值为纵坐标、含湿量为横坐标的图表，上面绘制了等温线、等相对湿度线等。它是空调设计的重要工具，可以直观地表示空气状态变化过程。</p>
<p>在焓湿图上，空气处理过程可以用线段表示：</p>
<ul>
<li>加热过程：水平向右（含湿量不变，焓值增加）</li>
<li>冷却除湿：向左下方（含湿量和焓值都减少）</li>
<li>加湿过程：向上（含湿量增加）</li>
</ul>`
      },
      {
        title: "露点温度",
        content: `<h3>什么是露点温度？</h3>
<p>露点温度是指空气在水蒸气含量不变的情况下，冷却到水蒸气开始凝结成水的温度。</p>

<h3>物理意义</h3>
<p>当物体表面温度低于空气露点温度时，空气中的水蒸气会在物体表面凝结成水。这就是为什么夏天冰镇饮料罐表面会有水珠。</p>

<h3>在空调中的应用</h3>
<p>表冷器除湿的原理就是：让空气流过温度低于露点温度的冷表面，水蒸气在冷表面凝结，从而实现除湿。</p>
<p>因此，表冷器的表面温度必须低于空气的露点温度，才能有效除湿。</p>`
      }
    ]
  },
  {
    category: "🔧 设备原理",
    items: [
      {
        title: "表冷器",
        content: `<h3>表冷器是什么？</h3>
<p>表冷器（Surface Cooler）是空调系统中用于冷却和除湿空气的核心设备。它由翅片管组成，管内通冷冻水或直接膨胀制冷剂，管外空气流过时被冷却。</p>

<h3>工作原理</h3>
<ul>
<li><strong>干工况</strong>：表冷器表面温度 > 空气露点温度，只降温不除湿</li>
<li><strong>湿工况</strong>：表冷器表面温度 < 空气露点温度，同时降温除湿</li>
</ul>

<h3>选型参数</h3>
<ul>
<li>排数：6排~8排（排数越多，换热效果越好，但阻力也越大）</li>
<li>翅片间距：2.0~3.0mm</li>
<li>迎面风速：2.0~2.5 m/s</li>
<li>冷冻水温度：7℃供水/12℃回水</li>
</ul>`
      },
      {
        title: "加热器",
        content: `<h3>加热器的类型</h3>
<ul>
<li><strong>电加热器</strong>：电热管加热，响应快，控制精确，适合精密空调</li>
<li><strong>热水加热器</strong>：热水盘管加热，运行成本低，但响应较慢</li>
<li><strong>蒸汽加热器</strong>：蒸汽盘管加热，适合大型系统</li>
</ul>

<h3>电加热器设计要点</h3>
<ul>
<li>功率选择：计算值 × 1.15 安全系数</li>
<li>控制方式：PID + 可控硅（无级调节）或分级控制</li>
<li>安全保护：超温保护、缺风保护、过流保护</li>
<li>材质：不锈钢电热管，耐腐蚀</li>
</ul>`
      },
      {
        title: "风机",
        content: `<h3>风机的作用</h3>
<p>风机是空调系统的「心脏」，负责推动空气流过各个功能段，克服系统阻力，将处理后的空气送入测试台。</p>

<h3>风机类型</h3>
<ul>
<li><strong>离心风机</strong>：风压高，适合阻力较大的系统（常用）</li>
<li><strong>轴流风机</strong>：风量大，风压低，适合阻力小的系统</li>
</ul>

<h3>选型计算</h3>
<ul>
<li>风量：根据质量流量和空气密度计算</li>
<li>全压：系统总阻力 × 1.15 安全系数</li>
<li>功率：风量 × 全压 / (风机效率 × 电机效率)</li>
<li>控制方式：变频器调速，实现变风量控制</li>
</ul>`
      },
      {
        title: "过滤器",
        content: `<h3>过滤器的作用</h3>
<p>过滤器用于去除空气中的颗粒物（灰尘、花粉等），保护下游设备和测试台。</p>

<h3>过滤等级</h3>
<table>
<tr><th>等级</th><th>效率</th><th>用途</th></tr>
<tr><td>G4（初效）</td><td>≥90%（5μm以上）</td><td>去除大颗粒，保护设备</td></tr>
<tr><td>F7（中效）</td><td>≥80%（1μm以上）</td><td>去除中等颗粒</td></tr>
<tr><td>H13（高效）</td><td>≥99.95%（0.3μm）</td><td>洁净室级别</td></tr>
</table>

<h3>设计要点</h3>
<ul>
<li>初效过滤器阻力：约50Pa（干净时）~ 150Pa（脏时）</li>
<li>建议配置压差传感器，当阻力过大时报警更换</li>
<li>过滤器应便于拆卸和更换</li>
</ul>`
      },
      {
        title: "加湿器",
        content: `<h3>加湿器的类型</h3>
<ul>
<li><strong>电极式加湿器</strong>：电极加热水产生蒸汽，控制精确，响应快</li>
<li><strong>湿膜加湿器</strong>：水通过湿膜蒸发，能耗低，但响应慢</li>
<li><strong>超声波加湿器</strong>：超声波雾化，颗粒小，但可能产生白粉</li>
</ul>

<h3>电极式加湿器设计要点</h3>
<ul>
<li>加湿量：根据计算结果选择，单位 kg/h</li>
<li>控制方式：PID + 湿度传感器反馈</li>
<li>水质要求：建议使用软化水或去离子水</li>
<li>安全保护：缺水保护、过流保护</li>
</ul>`
      }
    ]
  },
  {
    category: "📐 设计规范",
    items: [
      {
        title: "GB 50736-2012 核心要点",
        content: `<h3>标准简介</h3>
<p>GB 50736-2012《民用建筑供暖通风与空气调节设计规范》是中国空调设计最核心的国家标准，涵盖了空调设计的各个方面。</p>

<h3>与进气空调相关的核心章节</h3>
<ul>
<li><strong>第4章</strong>：室外空气计算参数（设计气象条件）</li>
<li><strong>第7章</strong>：空调冷负荷计算（焓差法）</li>
<li><strong>第8章</strong>：供暖与加热设计</li>
<li><strong>第9章</strong>：空调水系统设计</li>
<li><strong>第13章</strong>：自动控制系统设计</li>
</ul>

<h3>关键规定</h3>
<ul>
<li>空调冷负荷应按最不利工况计算</li>
<li>设备选型应考虑安全系数</li>
<li>水系统设计应考虑部分负荷运行</li>
<li>控制系统应保证温湿度控制精度（温度 ±0.5℃，湿度 ±3%）</li>
</ul>`
      },
      {
        title: "GB/T 14294-2026 核心要点",
        content: `<h3>标准简介</h3>
<p>GB/T 14294-2026《组合式空调机组》规定了组合式空调机组的技术要求、试验方法和检验规则。</p>

<h3>核心要求</h3>
<ul>
<li><strong>漏风率</strong>：≤2%（机组内部漏风）</li>
<li><strong>冷量偏差</strong>：实测值与标称值偏差 ≤ 10%</li>
<li><strong>噪声</strong>：符合规定限值</li>
<li><strong>绝缘电阻</strong>：≥2MΩ</li>
</ul>

<h3>选型指导</h3>
<ul>
<li>根据功能需求选择功能段组合</li>
<li>根据风量、冷量、热量选择规格</li>
<li>考虑安装空间和检修空间</li>
</ul>`
      }
    ]
  }
];

// ==========================================
// 模块切换
// ==========================================
function switchModule(module) {
  currentModule = module;
  currentStepIndex = 0;

  // 更新模块标签高亮
  var tabs = document.querySelectorAll(".module-tab");
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.remove("active");
  }
  var moduleMap = { beginner: 0, advanced: 1, practice: 2 };
  tabs[moduleMap[module]].classList.add("active");

  initTutorial();
}

// ==========================================
// 获取当前模块的步骤数据
// ==========================================
function getCurrentSteps() {
  if (currentModule === "beginner") return beginnerSteps;
  if (currentModule === "advanced") return advancedSteps;
  return practiceSteps;
}

// ==========================================
// 初始化教程
// ==========================================
function initTutorial() {
  var steps = getCurrentSteps();
  renderStepDots(steps.length);
  renderStep(currentStepIndex);
  updateNavButtons();
  updateProgress();
  renderReadingLinks(currentStepIndex);
  renderQuickJump();
}

// ==========================================
// 渲染步骤圆点
// ==========================================
function renderStepDots(total) {
  var container = document.getElementById("stepDots");
  var html = "";
  for (var i = 0; i < total; i++) {
    html += '<span class="dot' + (i === 0 ? " active" : "") + '" data-step="' + i + '" onclick="goToStep(' + i + ')"></span>';
  }
  container.innerHTML = html;
}

// ==========================================
// 渲染指定步骤
// ==========================================
function renderStep(index) {
  var steps = getCurrentSteps();
  var step = steps[index];
  var slide = document.getElementById("tutorialSlide");

  let formulaRows = "";
  for (let i = 0; i < step.formula.length; i++) {
    const f = step.formula[i];
    formulaRows += "<tr><td>" + f.label + "</td><td>" + f.value + "</td><td>" + f.note + "</td></tr>";
  }

  slide.innerHTML =
    '<div class="tutorial-card">' +
      '<div class="tutorial-section concept-section">' +
        '<h3>📖 概念讲解</h3>' +
        '<p>' + step.concept + '</p>' +
        '<div class="why-box">' +
          '<strong>💡 为什么要理解这个知识点</strong>' +
          '<p>' + step.why + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="tutorial-section formula-section">' +
        '<h3>📐 ' + step.formulaTitle + '</h3>' +
        '<table class="tutorial-formula-table">' +
          '<tr><th>参数</th><th>公式/值</th><th>说明</th></tr>' +
          formulaRows +
        '</table>' +
      '</div>' +
      '<div class="tutorial-section tip-section">' +
        '<h3>⭐ 设计要点 / 计算示例</h3>' +
        '<p>' + step.tip.replace(/\n/g, '<br>') + '</p>' +
      '</div>' +
      (step.misconceptions ?
        '<div class="tutorial-section misconception-section">' +
          '<h3>⚠️ 常见误区</h3>' +
          '<p>' + step.misconceptions + '</p>' +
        '</div>' : "") +
      '<div class="tutorial-section standards-section">' +
        '<h3>📋 引用标准</h3>' +
        '<p>' + step.standards + '</p>' +
      '</div>' +
    '</div>';
}

// ==========================================
// 渲染扩展阅读链接
// ==========================================
function renderReadingLinks(index) {
  var steps = getCurrentSteps();
  var step = steps[index];
  var container = document.getElementById("readingLinks");

  if (!step.readings || step.readings.length === 0) {
    container.innerHTML = '<p class="placeholder">暂无扩展阅读</p>';
    return;
  }

  var html = "";
  for (var i = 0; i < step.readings.length; i++) {
    var r = step.readings[i];
    html += '<a class="reading-link" href="#" onclick="openReadingLink(\'' + r.url.replace(/'/g, "\\'") + '\'); return false;">' +
      '<span class="reading-icon">📄</span>' +
      '<span class="reading-title">' + r.title + '</span>' +
      '<span class="reading-arrow">→</span>' +
      '</a>';
  }
  container.innerHTML = html;
}

function openReadingLink(url) {
  try {
    // 在Electron中打开外部链接
    var electron = require("electron");
    electron.shell.openExternal(url);
  } catch (e) {
    // 在浏览器中打开
    window.open(url, "_blank");
  }
}

// ==========================================
// 渲染快速跳转
// ==========================================
function renderQuickJump() {
  var container = document.getElementById("quickJump");
  var modules = [
    { key: "beginner", label: "📗 入门篇", steps: beginnerSteps },
    { key: "advanced", label: "📘 进阶篇", steps: advancedSteps },
    { key: "practice", label: "📙 实战篇", steps: practiceSteps }
  ];

  var html = "";
  for (var m = 0; m < modules.length; m++) {
    html += '<div class="quick-jump-group">';
    html += '<div class="quick-jump-label">' + modules[m].label + '</div>';
    for (var i = 0; i < modules[m].steps.length; i++) {
      var isActive = (modules[m].key === currentModule && i === currentStepIndex);
      html += '<a class="quick-jump-item' + (isActive ? " active" : "") + '" href="#" onclick="jumpToModule(\'' + modules[m].key + '\', ' + i + '); return false;">' +
        (i + 1) + '. ' + modules[m].steps[i].title + '</a>';
    }
    html += '</div>';
  }
  container.innerHTML = html;
}

function jumpToModule(module, index) {
  currentModule = module;
  currentStepIndex = index;

  // 更新模块标签高亮
  var tabs = document.querySelectorAll(".module-tab");
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.remove("active");
  }
  var moduleMap = { beginner: 0, advanced: 1, practice: 2 };
  tabs[moduleMap[module]].classList.add("active");

  initTutorial();
}

// ==========================================
// 导航按钮
// ==========================================
function updateNavButtons() {
  var steps = getCurrentSteps();
  document.getElementById("prevBtn").disabled = (currentStepIndex === 0);
  document.getElementById("nextBtn").disabled = (currentStepIndex === steps.length - 1);

  if (currentStepIndex === steps.length - 1) {
    document.getElementById("nextBtn").textContent = "完成 ✓";
  } else {
    document.getElementById("nextBtn").textContent = "下一步 →";
  }
}

function updateProgress() {
  var steps = getCurrentSteps();
  var total = steps.length;
  var pct = ((currentStepIndex + 1) / total) * 100;
  document.getElementById("progressFill").style.width = pct + "%";
  document.getElementById("progressText").textContent = "第 " + (currentStepIndex + 1) + " / " + total + " 步";

  var dots = document.querySelectorAll("#stepDots .dot");
  for (var i = 0; i < dots.length; i++) {
    dots[i].classList.toggle("active", i === currentStepIndex);
  }

  // 更新快速跳转高亮
  renderQuickJump();
}

function nextStep() {
  var steps = getCurrentSteps();
  if (currentStepIndex < steps.length - 1) {
    currentStepIndex++;
    renderStep(currentStepIndex);
    updateNavButtons();
    updateProgress();
    renderReadingLinks(currentStepIndex);
    document.getElementById("tutorialSlide").scrollTop = 0;
  }
}

function prevStep() {
  if (currentStepIndex > 0) {
    currentStepIndex--;
    renderStep(currentStepIndex);
    updateNavButtons();
    updateProgress();
    renderReadingLinks(currentStepIndex);
    document.getElementById("tutorialSlide").scrollTop = 0;
  }
}

function goToStep(index) {
  var steps = getCurrentSteps();
  if (index >= 0 && index < steps.length) {
    currentStepIndex = index;
    renderStep(currentStepIndex);
    updateNavButtons();
    updateProgress();
    renderReadingLinks(currentStepIndex);
    document.getElementById("tutorialSlide").scrollTop = 0;
  }
}

// ==========================================
// 知识库初始化
// ==========================================
function initKnowledgeBase() {
  var tocContainer = document.getElementById("knowledgeToc");
  var html = "";

  for (var c = 0; c < knowledgeData.length; c++) {
    var cat = knowledgeData[c];
    html += '<div class="knowledge-category">';
    html += '<div class="knowledge-category-title">' + cat.category + '</div>';
    for (var i = 0; i < cat.items.length; i++) {
      html += '<a class="knowledge-toc-item" href="#" onclick="showKnowledgeItem(' + c + ', ' + i + '); return false;">' + cat.items[i].title + '</a>';
    }
    html += '</div>';
  }
  tocContainer.innerHTML = html;
}

function showKnowledgeItem(catIndex, itemIndex) {
  var item = knowledgeData[catIndex].items[itemIndex];
  var container = document.getElementById("knowledgeContent");
  container.innerHTML = item.content;

  // 高亮当前TOC项
  var tocItems = document.querySelectorAll(".knowledge-toc-item");
  var idx = 0;
  for (var c = 0; c < knowledgeData.length; c++) {
    for (var i = 0; i < knowledgeData[c].items.length; i++) {
      tocItems[idx].classList.toggle("active", c === catIndex && i === itemIndex);
      idx++;
    }
  }
}

// ==========================================
// 初始化
// ==========================================
document.addEventListener("DOMContentLoaded", function() {
  currentModule = "beginner";
  currentStepIndex = 0;
  initTutorial();
});