const fs = require("node:fs/promises");
const path = require("node:path");
const { analyzeAccount } = require("./analyzer");

const DAILY_RECORD_HEADERS = [
  "日期",
  "平台",
  "账号名称",
  "账号链接",
  "账号类型",
  "今日发现视频链接",
  "今日发现视频标题",
  "今日数据",
  "内容类型",
  "变现痕迹",
  "适合学习什么",
  "更适合 AI先锋 还是 AI先锋者",
  "更适合流量/信任/转化",
  "为什么值得拆",
  "是否进入爆款拆解池",
  "备注"
];

const VIRAL_QUEUE_HEADERS = [
  "日期",
  "平台",
  "账号名称",
  "视频链接",
  "视频标题",
  "视频数据",
  "入池原因",
  "优先级",
  "拆解状态"
];

const LEVEL_RANK = {
  "A重点": 0,
  "B观察": 1,
  "C备用": 2
};

function todayString(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function normalize(value) {
  return (value || "").toString().trim();
}

function compactJoin(parts) {
  return parts.map(normalize).filter(Boolean).join(" ");
}

function stableHash(text) {
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function dayIndex(dateText) {
  return Math.floor(new Date(`${dateText}T00:00:00`).getTime() / 86_400_000);
}

function levelOf(account) {
  return normalize(account["是否重点监控"]) || "B观察";
}

function shouldCheckToday(account, dateText) {
  const level = levelOf(account);
  if (level === "A重点") return true;
  const key = compactJoin([account["平台"], account["账号名称"], account["账号链接"]]);
  const hash = stableHash(key || account["账号名称"] || "account");
  const index = dayIndex(dateText);

  if (level === "B观察") return hash % 2 === index % 2;
  if (level === "C备用") return hash % 7 === index % 7;
  return hash % 3 === index % 3;
}

function extractMetricNumber(text) {
  const matches = normalize(text).replace(/,/g, "").match(/\d+(?:\.\d+)?\s*(?:w|万|k|千)?/gi) || [];
  return matches.reduce((max, raw) => {
    const value = parseFloat(raw);
    if (Number.isNaN(value)) return max;
    const normalized = /w|万/i.test(raw) ? value * 10000 : /k|千/i.test(raw) ? value * 1000 : value;
    return Math.max(max, normalized);
  }, 0);
}

function buildNeedData(account, recordedCount = 0) {
  const parts = [
    "今日发现视频链接",
    "视频标题",
    "播放/点赞/评论/收藏/转发",
    "视频文案或转写稿",
    "截图路径"
  ];
  const fit = normalize(account["更适合哪个号"]);
  const type = normalize(account["账号类型"]);

  if (fit.includes("AI先锋") || type.includes("高转化")) {
    parts.push("直播/私信/课程/工具/社群等变现痕迹");
  }
  if (fit.includes("AI先锋者") || type.includes("IP")) {
    parts.push("观点表达、行业判断、评论区信任反馈");
  }
  if (!normalize(account["账号链接"])) parts.push("账号链接");
  if (recordedCount > 0) parts.push(`今日已记录 ${recordedCount} 条，可继续补充新视频`);
  return parts.join("、");
}

function generateMonitorTasks(accounts, records, dateText = todayString()) {
  const todayRecords = records.filter((row) => row["日期"] === dateText);
  const countByAccount = new Map();
  for (const row of todayRecords) {
    const key = `${row["平台"]}__${row["账号名称"]}`;
    countByAccount.set(key, (countByAccount.get(key) || 0) + 1);
  }

  return accounts
    .filter((account) => normalize(account["平台"]) && normalize(account["账号名称"]))
    .filter((account) => shouldCheckToday(account, dateText))
    .sort((a, b) => {
      const levelDiff = (LEVEL_RANK[levelOf(a)] ?? 9) - (LEVEL_RANK[levelOf(b)] ?? 9);
      if (levelDiff !== 0) return levelDiff;
      return normalize(a["账号名称"]).localeCompare(normalize(b["账号名称"]), "zh-CN");
    })
    .map((account, index) => {
      const key = `${account["平台"]}__${account["账号名称"]}`;
      const recordedCount = countByAccount.get(key) || 0;
      return {
        id: `${dateText}-${index + 1}-${stableHash(key)}`,
        "日期": dateText,
        "平台": account["平台"],
        "账号名称": account["账号名称"],
        "账号链接": account["账号链接"],
        "账号类型": account["账号类型"],
        "更适合哪个号": account["更适合哪个号"],
        "我为什么关注它": account["我为什么关注它"],
        "适合学习什么": account["适合学习什么"],
        "是否重点监控": levelOf(account),
        "今日需要我补充什么数据": buildNeedData(account, recordedCount),
        "今日记录数": recordedCount
      };
    });
}

function buildMetrics(input) {
  const metrics = [
    ["播放", input.playCount],
    ["点赞", input.likeCount],
    ["评论", input.commentCount],
    ["收藏", input.favoriteCount],
    ["转发", input.shareCount]
  ]
    .map(([label, value]) => {
      const text = normalize(value);
      return text ? `${label} ${text}` : "";
    })
    .filter(Boolean);
  return metrics.join("，");
}

function inferContentType(text) {
  if (/直播|私信|成交|咨询|课程|社群|工具|领取/.test(text)) return "转化承接";
  if (/教程|步骤|演示|录屏|实操|模板|怎么做/.test(text)) return "教程演示";
  if (/观点|认知|判断|趋势|反常识|行业|机会/.test(text)) return "认知观点";
  if (/案例|复盘|结果|对比|经历/.test(text)) return "案例拆解";
  if (/标题|钩子|爆款|播放|涨粉/.test(text)) return "流量结构";
  return "观察样本";
}

function normalizeTraces(value) {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(raw.map(normalize).filter(Boolean))].join("、") || "暂未发现明确变现痕迹";
}

function buildObservationAnalysis(task, input) {
  const dataText = buildMetrics(input);
  const monetization = normalizeTraces(input.monetizationTraces);
  const text = compactJoin([
    task["平台"],
    task["账号名称"],
    task["账号类型"],
    task["适合学习什么"],
    input.videoTitle,
    dataText,
    input.videoScript,
    monetization,
    input.notes
  ]);
  const contentType = inferContentType(text);

  const analysis = analyzeAccount({
    platform: task["平台"],
    accountName: task["账号名称"],
    accountUrl: task["账号链接"],
    hotVideoUrl: input.videoUrl || task["账号链接"],
    hotVideoData: dataText,
    videoTitle: input.videoTitle,
    videoScript: input.videoScript,
    profileBio: task["我为什么关注它"],
    screenshotNote: compactJoin([input.screenshotPath, input.notes, monetization])
  });

  const metric = extractMetricNumber(dataText);
  const hasConversion = /直播|私信|课程|工具|社群|成交|咨询/.test(monetization);
  const hasScript = Boolean(normalize(input.videoScript));
  const isViral = metric >= 10000 || hasConversion || levelOf(task) === "A重点";
  const priority = metric >= 100000 || (hasConversion && levelOf(task) === "A重点")
    ? "高"
    : isViral
      ? "中"
      : "低";
  const queueReason = [
    metric >= 10000 ? "数据表现达到拆解阈值" : "",
    hasConversion ? "发现转化承接动作" : "",
    levelOf(task) === "A重点" ? "来自A重点监控账号" : "",
    hasScript ? "已有文案/转写稿可深拆" : "缺少文案，需补充后深拆"
  ]
    .filter(Boolean)
    .join("；");

  const why = isViral
    ? queueReason
    : "暂未达到爆款拆解阈值，可作为低频观察样本沉淀";

  return {
    dataText,
    monetization,
    contentType,
    analysis,
    isViral,
    priority,
    why
  };
}

function buildDailyRecord(task, input, dateText = todayString()) {
  const result = buildObservationAnalysis(task, input);
  return {
    record: {
      "日期": dateText,
      "平台": task["平台"],
      "账号名称": task["账号名称"],
      "账号链接": task["账号链接"],
      "账号类型": task["账号类型"],
      "今日发现视频链接": normalize(input.videoUrl),
      "今日发现视频标题": normalize(input.videoTitle),
      "今日数据": result.dataText,
      "内容类型": result.contentType,
      "变现痕迹": result.monetization,
      "适合学习什么": result.analysis.analysis["适合学习什么"],
      "更适合 AI先锋 还是 AI先锋者": result.analysis.report["更适合 AI先锋 还是 AI先锋者"],
      "更适合流量/信任/转化": result.analysis.report["更适合学习流量、信任还是转化"],
      "为什么值得拆": result.why,
      "是否进入爆款拆解池": result.isViral ? "是" : "否",
      "备注": compactJoin([normalize(input.screenshotPath) ? `截图：${normalize(input.screenshotPath)}` : "", input.notes])
    },
    queueItem: result.isViral
      ? {
          "日期": dateText,
          "平台": task["平台"],
          "账号名称": task["账号名称"],
          "视频链接": normalize(input.videoUrl),
          "视频标题": normalize(input.videoTitle),
          "视频数据": result.dataText,
          "入池原因": result.why,
          "优先级": result.priority,
          "拆解状态": "待拆解"
        }
      : null
  };
}

function groupBy(rows, key) {
  return rows.reduce((map, row) => {
    const value = normalize(row[key]) || "未标注";
    map.set(value, (map.get(value) || 0) + 1);
    return map;
  }, new Map());
}

function formatCounts(map) {
  if (!map.size) return "暂无";
  return [...map.entries()].map(([key, count]) => `${key} ${count} 条`).join("；");
}

function listItems(items) {
  if (!items.length) return "- 暂无";
  return items.map((item) => `- ${item}`).join("\n");
}

function buildDailyReport({ dateText, tasks, records, queue }) {
  const todayRecords = records.filter((row) => row["日期"] === dateText);
  const todayQueue = queue.filter((row) => row["日期"] === dateText);
  const monitoredAccounts = new Set(todayRecords.map((row) => `${row["平台"]}｜${row["账号名称"]}`));
  const pendingTasks = tasks.filter((task) => !monitoredAccounts.has(`${task["平台"]}｜${task["账号名称"]}`));
  const xianfeng = todayRecords
    .filter((row) => normalize(row["更适合 AI先锋 还是 AI先锋者"]).includes("AI先锋"))
    .map((row) => `${row["平台"]}｜${row["账号名称"]}｜${row["今日发现视频标题"] || row["今日发现视频链接"]}`);
  const xianfengzhe = todayRecords
    .filter((row) => normalize(row["更适合 AI先锋 还是 AI先锋者"]).includes("AI先锋者"))
    .map((row) => `${row["平台"]}｜${row["账号名称"]}｜${row["今日发现视频标题"] || row["今日发现视频链接"]}`);
  const conversions = todayRecords
    .filter((row) => !/暂未发现/.test(row["变现痕迹"] || ""))
    .map((row) => `${row["平台"]}｜${row["账号名称"]}：${row["变现痕迹"]}`);

  return `# 每日监控日报 ${dateText}

## 今日结论

- 今日生成监控任务：${tasks.length} 个。
- 今日已补充观察记录：${todayRecords.length} 条。
- 今日进入爆款拆解池：${todayQueue.length} 条。
- 当前阶段仍为半自动监控，不自动抓取平台数据，不绕过登录、验证码或风控。

## 今日监控了哪些账号

${listItems([...monitoredAccounts])}

## 今日发现哪些值得拆的视频

${listItems(todayQueue.map((row) => `${row["优先级"]}优先级｜${row["平台"]}｜${row["账号名称"]}｜${row["视频标题"] || row["视频链接"]}｜${row["入池原因"]}`))}

## 今日发现哪些平台风向

- 内容类型分布：${formatCounts(groupBy(todayRecords, "内容类型"))}
- 学习重点分布：${formatCounts(groupBy(todayRecords, "更适合流量/信任/转化"))}

## 今日发现哪些转化动作

${listItems(conversions)}

## 哪些内容更适合 AI先锋

${listItems(xianfeng)}

## 哪些内容更适合 AI先锋者

${listItems(xianfengzhe)}

## 今日还需要我补充什么

${listItems(pendingTasks.slice(0, 20).map((task) => `${task["平台"]}｜${task["账号名称"]}：${task["今日需要我补充什么数据"]}`))}

## 自动化边界

- 能自动处理：读取监控池、生成今日任务、分析人工补充数据、写入记录、加入拆解池、生成日报。
- 需要人工协助：平台未登录、扫码、验证码、授权、插件安装、浏览器设置、手动打开平台页面、高风险动作确认。
`;
}

async function writeDailyReport(reportDir, dateText, content) {
  await fs.mkdir(reportDir, { recursive: true });
  const filePath = path.join(reportDir, `daily_monitor_report_${dateText}.md`);
  await fs.writeFile(filePath, content, "utf8");
  return filePath;
}

module.exports = {
  DAILY_RECORD_HEADERS,
  VIRAL_QUEUE_HEADERS,
  todayString,
  generateMonitorTasks,
  buildDailyRecord,
  buildDailyReport,
  writeDailyReport
};
