const ACCOUNT_TYPES = [
  "AI流量号",
  "AI实操号",
  "高转化商业号",
  "目标用户爱看的号",
  "IP认知号"
];

const ACCOUNT_FIT = ["AI先锋", "AI先锋者", "两个都适合"];
const MONITOR_LEVELS = ["A重点", "B观察", "C备用"];
const LEARNING_OPTIONS = [
  "标题",
  "前3秒钩子",
  "口播节奏",
  "案例拆解",
  "教程演示",
  "私信转化",
  "直播承接",
  "人设表达"
];

const CSV_HEADERS = [
  "录入时间",
  "平台",
  "账号名称",
  "账号链接",
  "代表爆款链接",
  "代表爆款数据",
  "视频标题",
  "视频文案或转写稿",
  "主页简介",
  "截图路径或备注",
  "账号类型",
  "主要受众",
  "我为什么关注它",
  "适合学习什么",
  "更适合哪个号",
  "为什么适合 AI先锋",
  "为什么适合 AI先锋者",
  "内容风格",
  "变现痕迹",
  "是否重点监控",
  "备注",
  "是否值得进入监控池",
  "值得/不值得原因",
  "学习重点",
  "推荐拆解3条代表视频",
  "下一步补充信息"
];

const KEYWORDS = {
  ai: [
    "ai",
    "chatgpt",
    "gpt",
    "智能体",
    "数字人",
    "口播",
    "自动化",
    "提示词",
    "工具",
    "aigc",
    "工作流"
  ],
  practical: [
    "教程",
    "实操",
    "步骤",
    "落地",
    "案例",
    "演示",
    "录屏",
    "模板",
    "方法",
    "怎么做",
    "不用代码"
  ],
  conversion: [
    "私信",
    "直播",
    "成交",
    "转化",
    "咨询",
    "课程",
    "训练营",
    "陪跑",
    "社群",
    "付费",
    "领取",
    "加我",
    "变现",
    "799"
  ],
  ip: [
    "认知",
    "观点",
    "判断",
    "趋势",
    "机会",
    "行业",
    "普通人",
    "创业",
    "反常识",
    "复盘",
    "人设",
    "长期"
  ],
  audience: [
    "个体创业者",
    "创业者",
    "自媒体",
    "知识付费",
    "老板",
    "实体店",
    "商家",
    "普通人",
    "副业",
    "获客",
    "内容"
  ],
  traffic: [
    "爆款",
    "涨粉",
    "流量",
    "播放",
    "点赞",
    "评论",
    "热门",
    "起号",
    "钩子",
    "标题",
    "完播"
  ],
  trust: [
    "真实",
    "经历",
    "复盘",
    "案例",
    "结果",
    "避坑",
    "长期",
    "判断",
    "为什么",
    "信任"
  ]
};

function getCsvHeaders() {
  return CSV_HEADERS;
}

function normalize(value) {
  return (value || "").toString().trim();
}

function normalizeLearningOptions(value) {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(raw.map(normalize).filter((item) => LEARNING_OPTIONS.includes(item)))];
}

function compactJoin(parts) {
  return parts.map(normalize).filter(Boolean).join("\n");
}

function countMatches(text, words) {
  const lower = text.toLowerCase();
  return words.reduce((count, word) => count + (lower.includes(word.toLowerCase()) ? 1 : 0), 0);
}

function extractNumbers(text) {
  const normalized = text.replace(/,/g, "");
  const matches = normalized.match(/\d+(?:\.\d+)?\s*(?:w|万|k|千)?/gi) || [];
  return matches.map((raw) => {
    const value = parseFloat(raw);
    if (Number.isNaN(value)) return 0;
    if (/w|万/i.test(raw)) return value * 10000;
    if (/k|千/i.test(raw)) return value * 1000;
    return value;
  });
}

function maxMetric(text) {
  const numbers = extractNumbers(text);
  return numbers.length ? Math.max(...numbers) : 0;
}

function inferAccountType(scores, text) {
  if (scores.ai >= 2 && scores.conversion >= 2) return "高转化商业号";
  if (scores.ai >= 2 && scores.practical >= 2) return "AI实操号";
  if (scores.ai >= 2 && scores.traffic >= 2) return "AI流量号";
  if (scores.ip >= 2 && scores.practical < 2) return "IP认知号";
  if (scores.audience >= 2 || /获客|成交|自媒体|知识付费|实体店|老板/.test(text)) {
    return "目标用户爱看的号";
  }
  if (scores.ai > 0) return "AI流量号";
  return "目标用户爱看的号";
}

function inferAudience(text, type) {
  const audiences = [];
  if (/自媒体|博主|短视频|口播|剪辑|内容/.test(text)) audiences.push("自媒体人/内容创作者");
  if (/知识付费|课程|训练营|社群|讲师|咨询/.test(text)) audiences.push("知识付费从业者");
  if (/创业|副业|个体|老板|商家|实体店|获客/.test(text)) audiences.push("个体创业者/小微商家");
  if (/普通人|小白|不会代码|零基础/.test(text)) audiences.push("AI入门普通用户");
  if (/ai|智能体|数字人|自动化|gpt|chatgpt/i.test(text)) audiences.push("AI工具和提效需求人群");
  if (!audiences.length && type === "IP认知号") audiences.push("关注AI趋势和个人成长的人群");
  if (!audiences.length) audiences.push("待通过评论区和主页数据进一步确认的目标用户");
  return [...new Set(audiences)].join("、");
}

function inferFit(scores, type) {
  const xianfengScore = scores.conversion * 2 + scores.practical * 1.5 + scores.traffic + scores.audience;
  const xianfengzheScore = scores.ip * 2 + scores.trust * 1.5 + scores.ai + (type === "IP认知号" ? 2 : 0);

  if (Math.abs(xianfengScore - xianfengzheScore) <= 2 && xianfengScore + xianfengzheScore >= 4) {
    return "两个都适合";
  }
  return xianfengScore > xianfengzheScore ? "AI先锋" : "AI先锋者";
}

function inferLearningFocus(scores, type, fit) {
  const items = [];
  if (scores.traffic >= 1) items.push("流量");
  if (scores.trust >= 1 || fit === "AI先锋者" || type === "IP认知号") items.push("信任");
  if (scores.conversion >= 1 || fit === "AI先锋" || type === "高转化商业号") items.push("转化");
  if (!items.length) items.push("流量");
  return [...new Set(items)].join("、");
}

function inferLearningOptions(scores, type, fit, text) {
  const options = [];
  if (/标题|爆款|起号|播放|涨粉|流量/.test(text) || scores.traffic >= 1) options.push("标题");
  if (/钩子|前3秒|前三秒|开头|停留|完播/.test(text) || scores.traffic >= 1) options.push("前3秒钩子");
  if (/口播|节奏|表达|露脸|话术/.test(text)) options.push("口播节奏");
  if (/案例|复盘|结果|见证|对比/.test(text) || scores.trust >= 1) options.push("案例拆解");
  if (/教程|步骤|演示|录屏|实操|模板|怎么做/.test(text) || type === "AI实操号") options.push("教程演示");
  if (/私信|咨询|加我|领取/.test(text) || scores.conversion >= 1) options.push("私信转化");
  if (/直播|直播间|连麦|转粉/.test(text) || scores.conversion >= 2) options.push("直播承接");
  if (/人设|认知|观点|判断|趋势|反常识|长期/.test(text) || fit === "AI先锋者") options.push("人设表达");

  if (!options.length) options.push(type === "IP认知号" ? "人设表达" : "标题");
  return [...new Set(options)].filter((item) => LEARNING_OPTIONS.includes(item));
}

function inferStyle(text, type) {
  const styles = [];
  if (/教程|步骤|录屏|演示|模板|清单|方法/.test(text)) styles.push("实操教学");
  if (/观点|认知|趋势|判断|反常识|避坑|为什么/.test(text)) styles.push("观点判断");
  if (/案例|复盘|结果|真实|经历/.test(text)) styles.push("案例复盘");
  if (/直播|私信|成交|领取|咨询|加我/.test(text)) styles.push("强CTA转化");
  if (/爆款|标题|钩子|涨粉|播放/.test(text)) styles.push("流量钩子");
  if (!styles.length) styles.push(type === "IP认知号" ? "认知表达" : "信息整理");
  return [...new Set(styles)].join("、");
}

function inferMonetization(text) {
  const traces = [];
  if (/直播/.test(text)) traces.push("直播承接");
  if (/私信|加我|联系|咨询/.test(text)) traces.push("私信/咨询承接");
  if (/课程|训练营|陪跑|社群|会员/.test(text)) traces.push("课程/训练营/社群");
  if (/工具|智能体|数字人|软件|系统|模板/.test(text)) traces.push("工具/模板/产品");
  if (/付费|成交|变现|报价|价格|799|下单/.test(text)) traces.push("明确成交信号");
  if (!traces.length) traces.push("暂未看到明确变现痕迹");
  return [...new Set(traces)].join("、");
}

function inferMonitorLevel(scores, metric, requiredMissingCount, type) {
  const relevance = scores.ai + scores.practical + scores.conversion + scores.ip + scores.audience;
  if (relevance >= 8 || metric >= 100000 || type === "高转化商业号") return "A重点";
  if (relevance >= 4 || metric >= 10000) return "B观察";
  if (requiredMissingCount >= 5) return "C备用";
  return "B观察";
}

function buildReason(type, fit, focus, scores, metric, hasTranscript) {
  const reasons = [];
  if (scores.ai > 0) reasons.push("和AI/内容生产/提效赛道有关");
  if (scores.conversion > 0) reasons.push("能观察私信、直播或产品承接");
  if (scores.ip > 0) reasons.push("能提炼认知表达和行业判断");
  if (scores.audience > 0) reasons.push("贴近目标用户日常关注内容");
  if (metric >= 10000) reasons.push("已有可参考的数据表现");
  if (!hasTranscript) reasons.push("但缺少文案/转写稿，深拆准确度有限");

  if (!reasons.length) {
    return `当前信息偏少，先按${type}低成本入池观察，后续用截图、评论和代表视频数据确认价值。`;
  }

  return `归为${type}，更适合${fit}学习${focus}。${reasons.join("；")}。`;
}

function buildLearnWhat(type, focus, fit, style, monetization, learningOptions) {
  const parts = [];
  if (focus.includes("流量")) parts.push("标题/前3秒钩子/高停留结构");
  if (focus.includes("信任")) parts.push("案例呈现/观点站位/人设信任");
  if (focus.includes("转化")) parts.push("痛点放大/CTA/私信或直播承接");
  if (type === "AI实操号") parts.push("低门槛实操路径");
  if (type === "高转化商业号") parts.push("产品包装和成交链路");
  if (fit === "AI先锋者") parts.push("行业判断和长期关注理由");
  const selected = learningOptions.length ? `重点学习项：${learningOptions.join("、")}。` : "";
  return `${selected}${[...new Set(parts)].join("、")}。内容风格偏${style}；变现痕迹：${monetization}。`;
}

function buildAttentionReason(type, fit, focus, input, scores) {
  const account = normalize(input.accountName) || "该账号";
  if (type === "高转化商业号") {
    return `${account}可用于拆解从痛点、信任到私信/直播承接的短链路，服务 AI先锋 的799元AI口播智能体成交。`;
  }
  if (type === "IP认知号") {
    return `${account}适合观察高认知表达、激进观点和长期人设信任，给 AI先锋者 提供观点骨架。`;
  }
  if (type === "AI实操号") {
    return `${account}能补充AI口播、内容生产或提效落地的实操表达，适合转成可拍摄教程和案例。`;
  }
  if (scores.audience > 0) {
    return `${account}贴近目标用户正在消费的内容，能反推他们的痛点、语言和付费场景。`;
  }
  return `${account}可作为${fit}的${focus}参考样本，但需要补充更多数据确认优先级。`;
}

function buildFitExplanations(scores, type, learningOptions, text) {
  const xianfeng = [];
  const xianfengzhe = [];

  if (scores.conversion > 0 || /私信|直播|成交|咨询|领取|799/.test(text)) {
    xianfeng.push("出现私信、直播、成交或产品承接信号，可拆转化链路");
  }
  if (scores.practical > 0 || /教程|步骤|演示|实操|模板|口播|智能体/.test(text)) {
    xianfeng.push("有实操、教程或AI口播提效内容，能服务低门槛产品表达");
  }
  if (scores.traffic > 0 || learningOptions.some((item) => ["标题", "前3秒钩子"].includes(item))) {
    xianfeng.push("可学习标题、钩子和高停留结构，为变现号获取精准流量");
  }
  if (type === "高转化商业号") {
    xianfeng.push("账号类型本身更接近短链路成交样本");
  }

  if (scores.ip > 0 || /认知|观点|判断|趋势|机会|反常识|行业/.test(text)) {
    xianfengzhe.push("有观点、趋势或行业判断素材，可转成高认知表达");
  }
  if (scores.trust > 0 || /真实|复盘|经历|案例|避坑|长期/.test(text)) {
    xianfengzhe.push("有复盘、案例或避坑线索，利于沉淀人设信任");
  }
  if (learningOptions.includes("人设表达")) {
    xianfengzhe.push("学习项包含人设表达，适合做长期信任和观点资产");
  }
  if (type === "IP认知号") {
    xianfengzhe.push("账号类型本身更接近认知/IP样本");
  }

  if (!xianfeng.length) {
    xianfeng.push("可低成本观察其面向目标用户的痛点表达，暂不作为转化主样本");
  }
  if (!xianfengzhe.length) {
    xianfengzhe.push("可观察其选题背后的用户关注点，暂不作为IP表达主样本");
  }

  return {
    whyXianfeng: [...new Set(xianfeng)].join("；"),
    whyXianfengzhe: [...new Set(xianfengzhe)].join("；")
  };
}

function buildRecommendedVideos(input, type) {
  const title = normalize(input.videoTitle);
  const link = normalize(input.hotVideoUrl);
  const suggestions = [];

  if (title || link) {
    suggestions.push(`当前代表爆款：${title || "未填标题"}${link ? `（${link}）` : ""}`);
  }

  if (type === "高转化商业号") {
    suggestions.push("一条强痛点+私信/直播CTA的视频");
    suggestions.push("一条案例结果展示或成交见证视频");
  } else if (type === "IP认知号") {
    suggestions.push("一条明确观点或反常识判断视频");
    suggestions.push("一条行业趋势/机会/避坑视频");
  } else if (type === "AI实操号") {
    suggestions.push("一条录屏教程或步骤演示视频");
    suggestions.push("一条AI工具前后对比视频");
  } else {
    suggestions.push("一条最高赞/最高评论的视频");
    suggestions.push("一条评论区问题最多的视频");
  }

  suggestions.push("一条近期发布但数据一般的视频，用来对比爆款差异");
  return suggestions.slice(0, 3).join("；");
}

function buildMissingInfo(input) {
  const missing = [];
  if (!normalize(input.screenshotNote)) missing.push("截图");
  if (!normalize(input.videoScript)) missing.push("视频文案或转写稿");
  if (!normalize(input.hotVideoData)) missing.push("点赞评论数据");
  if (!normalize(input.profileBio)) missing.push("主页简介");
  if (!normalize(input.hotVideoUrl)) missing.push("代表视频链接");
  if (!normalize(input.accountUrl)) missing.push("账号链接");
  return missing.length ? missing.join("、") : "可以继续补充评论区高频问题、直播/私信承接截图、近3条代表视频数据";
}

function validateInput(input) {
  const platform = normalize(input.platform);
  const accountName = normalize(input.accountName);
  const accountUrl = normalize(input.accountUrl);
  const hotVideoUrl = normalize(input.hotVideoUrl);
  if (!platform) throw new Error("请先填写平台");
  if (!accountName) throw new Error("请先填写账号名称");
  if (!accountUrl && !hotVideoUrl) throw new Error("账号链接或代表爆款链接至少填写一个");
}

function analyzeAccount(rawInput) {
  const input = {
    platform: normalize(rawInput.platform),
    accountName: normalize(rawInput.accountName),
    accountUrl: normalize(rawInput.accountUrl),
    hotVideoUrl: normalize(rawInput.hotVideoUrl),
    hotVideoData: normalize(rawInput.hotVideoData),
    videoTitle: normalize(rawInput.videoTitle),
    videoScript: normalize(rawInput.videoScript),
    profileBio: normalize(rawInput.profileBio),
    screenshotNote: normalize(rawInput.screenshotNote),
    learningOptions: normalizeLearningOptions(rawInput.learningOptions)
  };

  validateInput(input);

  const text = compactJoin([
    input.platform,
    input.accountName,
    input.accountUrl,
    input.hotVideoUrl,
    input.hotVideoData,
    input.videoTitle,
    input.videoScript,
    input.profileBio,
    input.screenshotNote,
    input.learningOptions.join("、")
  ]);

  const scores = {
    ai: countMatches(text, KEYWORDS.ai),
    practical: countMatches(text, KEYWORDS.practical),
    conversion: countMatches(text, KEYWORDS.conversion),
    ip: countMatches(text, KEYWORDS.ip),
    audience: countMatches(text, KEYWORDS.audience),
    traffic: countMatches(text, KEYWORDS.traffic),
    trust: countMatches(text, KEYWORDS.trust)
  };

  const metric = maxMetric(input.hotVideoData);
  const accountType = inferAccountType(scores, text);
  const audience = inferAudience(text, accountType);
  const fit = inferFit(scores, accountType);
  const learningFocus = inferLearningFocus(scores, accountType, fit);
  const learningOptions = [
    ...new Set([...input.learningOptions, ...inferLearningOptions(scores, accountType, fit, text)])
  ];
  const style = inferStyle(text, accountType);
  const monetization = inferMonetization(text);
  const missingInfo = buildMissingInfo(input);
  const missingCount = missingInfo === "可以继续补充评论区高频问题、直播/私信承接截图、近3条代表视频数据"
    ? 0
    : missingInfo.split("、").length;
  const monitorLevel = inferMonitorLevel(scores, metric, missingCount, accountType);
  const isWorth = monitorLevel === "C备用" ? "暂缓，信息补齐后再判断" : "值得进入监控池";
  const reason = buildReason(accountType, fit, learningFocus, scores, metric, Boolean(input.videoScript));
  const whyFollow = buildAttentionReason(accountType, fit, learningFocus, input, scores);
  const learnWhat = buildLearnWhat(accountType, learningFocus, fit, style, monetization, learningOptions);
  const fitExplanations = buildFitExplanations(scores, accountType, learningOptions, text);
  const recommendedVideos = buildRecommendedVideos(input, accountType);
  const note = [
    missingCount ? `缺失信息：${missingInfo}` : "信息完整度较好",
    "不自动访问平台链接；如链接打不开，请用截图、文案、数据和主页简介补齐。"
  ].join("；");

  const analysis = {
    "账号类型": accountType,
    "主要受众": audience,
    "我为什么关注它": whyFollow,
    "适合学习什么": learnWhat,
    "更适合哪个号": fit,
    "为什么适合 AI先锋": fitExplanations.whyXianfeng,
    "为什么适合 AI先锋者": fitExplanations.whyXianfengzhe,
    "内容风格": style,
    "变现痕迹": monetization,
    "是否重点监控": monitorLevel,
    "备注": note
  };

  const report = {
    "是否值得进入监控池": isWorth,
    "为什么值得/不值得": reason,
    "应该归为哪类账号": accountType,
    "更适合学习流量、信任还是转化": learningFocus,
    "更适合 AI先锋 还是 AI先锋者": fit,
    "为什么适合 AI先锋": fitExplanations.whyXianfeng,
    "为什么适合 AI先锋者": fitExplanations.whyXianfengzhe,
    "推荐拆解哪 3 条代表视频": recommendedVideos,
    "下一步我还需要补充什么信息": missingInfo
  };

  const now = new Date().toISOString();
  const csvRow = {
    "录入时间": now,
    "平台": input.platform,
    "账号名称": input.accountName,
    "账号链接": input.accountUrl,
    "代表爆款链接": input.hotVideoUrl,
    "代表爆款数据": input.hotVideoData,
    "视频标题": input.videoTitle,
    "视频文案或转写稿": input.videoScript,
    "主页简介": input.profileBio,
    "截图路径或备注": input.screenshotNote,
    ...analysis,
    "是否值得进入监控池": report["是否值得进入监控池"],
    "值得/不值得原因": report["为什么值得/不值得"],
    "学习重点": report["更适合学习流量、信任还是转化"],
    "推荐拆解3条代表视频": report["推荐拆解哪 3 条代表视频"],
    "下一步补充信息": report["下一步我还需要补充什么信息"]
  };

  return {
    input,
    allowedValues: {
      accountTypes: ACCOUNT_TYPES,
      accountFit: ACCOUNT_FIT,
      monitorLevels: MONITOR_LEVELS,
      learningOptions: LEARNING_OPTIONS
    },
    scores,
    analysis,
    report,
    csvRow
  };
}

module.exports = {
  analyzeAccount,
  getCsvHeaders
};
