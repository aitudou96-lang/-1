const fs = require("node:fs/promises");
const path = require("node:path");
const { serializeRows } = require("./csvStore");
const { todayString } = require("./monitoring");

const AI_NEWS_HEADERS = [
  "日期",
  "来源",
  "标题",
  "摘要",
  "链接",
  "关键词",
  "与AI先锋相关度",
  "与AI先锋者相关度",
  "是否适合做内容",
  "建议切入角度",
  "风险备注"
];

const HOT_MATERIAL_HEADERS = [
  "日期",
  "热点名称",
  "来源",
  "热点类型",
  "热度判断",
  "可延展方向",
  "适合AI先锋还是AI先锋者",
  "适合流量/信任/转化",
  "可做视频角度",
  "风险备注"
];

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_ITEMS_PER_SOURCE = 6;

function normalize(value) {
  return (value || "").toString().trim();
}

function stripHtml(value) {
  return normalize(
    decodeEntities(value)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  );
}

function decodeEntities(value) {
  return normalize(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return decodeEntities(match[1] || match[2] || "");
  }
  return "";
}

function resolveUrl(baseUrl, href) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return normalize(href);
  }
}

function parseRssItems(xml, sourceUrl) {
  const itemBlocks = [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  if (itemBlocks.length) {
    return itemBlocks.map((block) => {
      const title = firstMatch(block, [/<title[^>]*>([\s\S]*?)<\/title>/i]);
      const link = firstMatch(block, [/<link[^>]*>([\s\S]*?)<\/link>/i, /<guid[^>]*>([\s\S]*?)<\/guid>/i]);
      const summary = firstMatch(block, [
        /<description[^>]*>([\s\S]*?)<\/description>/i,
        /<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i
      ]);
      return {
        title: stripHtml(title),
        summary: stripHtml(summary),
        link: resolveUrl(sourceUrl, stripHtml(link))
      };
    });
  }

  return [...xml.matchAll(/<entry[\s\S]*?<\/entry>/gi)].map((match) => {
    const block = match[0];
    const title = firstMatch(block, [/<title[^>]*>([\s\S]*?)<\/title>/i]);
    const summary = firstMatch(block, [
      /<summary[^>]*>([\s\S]*?)<\/summary>/i,
      /<content[^>]*>([\s\S]*?)<\/content>/i
    ]);
    const href = firstMatch(block, [/<link[^>]*href=["']([^"']+)["'][^>]*>/i]);
    return {
      title: stripHtml(title),
      summary: stripHtml(summary),
      link: resolveUrl(sourceUrl, href)
    };
  });
}

function parsePublicPage(html, sourceUrl) {
  const pageTitle = stripHtml(firstMatch(html, [/<title[^>]*>([\s\S]*?)<\/title>/i]));
  const pageSummary = stripHtml(
    firstMatch(html, [
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i
    ])
  );
  const headings = [...html.matchAll(/<(h1|h2|h3)[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => stripHtml(match[2]))
    .filter(Boolean)
    .slice(0, MAX_ITEMS_PER_SOURCE);

  const titles = headings.length ? headings : [pageTitle].filter(Boolean);
  return titles.map((title) => ({
    title,
    summary: pageSummary || "公开页面可见标题，建议人工打开确认上下文。",
    link: sourceUrl
  }));
}

function extractKeywords(text) {
  const dictionary = [
    "AI",
    "智能体",
    "agent",
    "ChatGPT",
    "Claude",
    "Gemini",
    "model",
    "模型",
    "tool",
    "工具",
    "video",
    "视频",
    "creator",
    "自媒体",
    "startup",
    "创业",
    "marketing",
    "营销",
    "automation",
    "自动化",
    "workflow",
    "工作流",
    "course",
    "课程",
    "live",
    "直播"
  ];
  const lower = text.toLowerCase();
  return dictionary
    .filter((keyword) => lower.includes(keyword.toLowerCase()))
    .slice(0, 8)
    .join("、") || "待人工标注";
}

function countMatches(text, words) {
  const lower = text.toLowerCase();
  return words.reduce((sum, word) => sum + (lower.includes(word.toLowerCase()) ? 1 : 0), 0);
}

function relevanceLabel(score) {
  if (score >= 4) return "高";
  if (score >= 2) return "中";
  return "低";
}

function analyzeFit(text) {
  const xianfengScore = countMatches(text, [
    "tool",
    "工具",
    "automation",
    "自动化",
    "workflow",
    "工作流",
    "creator",
    "自媒体",
    "video",
    "视频",
    "marketing",
    "营销",
    "course",
    "课程",
    "business",
    "商业",
    "startup",
    "创业",
    "agent",
    "智能体",
    "live",
    "直播"
  ]);
  const xianfengzheScore = countMatches(text, [
    "model",
    "模型",
    "research",
    "研究",
    "industry",
    "行业",
    "trend",
    "趋势",
    "safety",
    "安全",
    "policy",
    "政策",
    "strategy",
    "战略",
    "future",
    "未来",
    "Claude",
    "Gemini",
    "OpenAI"
  ]);

  const accountFit =
    Math.abs(xianfengScore - xianfengzheScore) <= 1 && xianfengScore + xianfengzheScore >= 2
      ? "两个都适合"
      : xianfengScore > xianfengzheScore
        ? "AI先锋"
        : "AI先锋者";
  const goal = xianfengScore >= 4 ? "转化" : xianfengzheScore >= 3 ? "信任" : "流量";
  return {
    xianfeng: relevanceLabel(xianfengScore),
    xianfengzhe: relevanceLabel(xianfengzheScore),
    accountFit,
    goal
  };
}

function buildAngle(item, source, fit) {
  if (fit.accountFit === "AI先锋") {
    return `拆成“普通人/自媒体人如何用${source.category}提升内容产能或转化”的实操选题。`;
  }
  if (fit.accountFit === "AI先锋者") {
    return `拆成“这条${source.category}变化说明了什么趋势/机会/误区”的认知判断选题。`;
  }
  return `同时做 AI先锋 的落地版和 AI先锋者 的判断版，避免同稿复用。`;
}

function riskNote(item, source) {
  const text = `${item.title} ${item.summary}`;
  const risks = [];
  if (/rumor|leak|unconfirmed|传闻|泄露|爆料/i.test(text)) risks.push("疑似传闻或爆料，需核验后再做内容");
  if (/policy|regulation|lawsuit|法律|监管|诉讼|安全/i.test(text)) risks.push("涉及政策/法律/安全，避免直接做强转化");
  if (!normalize(item.summary)) risks.push("摘要不足，建议打开公开链接人工确认");
  return risks.join("；") || `公开来源：${source.source_name}，发布时仍需核验时效和上下文。`;
}

function buildAiNewsRow(dateText, source, item) {
  const text = `${item.title} ${item.summary} ${source.category}`;
  const fit = analyzeFit(text);
  const suitable = fit.xianfeng !== "低" || fit.xianfengzhe !== "低" ? "是" : "待观察";
  return {
    "日期": dateText,
    "来源": source.source_name,
    "标题": item.title || "未识别标题",
    "摘要": item.summary || "公开来源未提供摘要，建议打开链接确认。",
    "链接": item.link || source.url,
    "关键词": extractKeywords(text),
    "与AI先锋相关度": fit.xianfeng,
    "与AI先锋者相关度": fit.xianfengzhe,
    "是否适合做内容": suitable,
    "建议切入角度": buildAngle(item, source, fit),
    "风险备注": riskNote(item, source)
  };
}

function buildHotMaterialRow(dateText, source, item) {
  const text = `${item.title} ${item.summary} ${source.category}`;
  const fit = analyzeFit(text);
  return {
    "日期": dateText,
    "热点名称": item.title || "未识别热点名称",
    "来源": source.source_name,
    "热点类型": source.category,
    "热度判断": "公开来源新近更新，需结合平台可见数据人工核验热度",
    "可延展方向": fit.accountFit === "AI先锋者"
      ? "趋势判断、机会判断、误区拆解、行业观察"
      : "工具落地、内容提效、获客转化、案例拆解",
    "适合AI先锋还是AI先锋者": fit.accountFit,
    "适合流量/信任/转化": fit.goal,
    "可做视频角度": buildAngle(item, source, fit),
    "风险备注": riskNote(item, source)
  };
}

function failureAiNewsRow(dateText, source, error) {
  return {
    "日期": dateText,
    "来源": source.source_name || "未命名来源",
    "标题": "来源读取失败",
    "摘要": error.message || String(error),
    "链接": source.url || "",
    "关键词": "读取失败",
    "与AI先锋相关度": "待判断",
    "与AI先锋者相关度": "待判断",
    "是否适合做内容": "否",
    "建议切入角度": "先检查公开链接是否可访问，必要时更换来源或人工补充。",
    "风险备注": "未访问登录页，未绕过限制；仅记录公开来源读取失败原因。"
  };
}

function failureHotMaterialRow(dateText, source, error) {
  return {
    "日期": dateText,
    "热点名称": "来源读取失败",
    "来源": source.source_name || "未命名来源",
    "热点类型": source.category || "待判断",
    "热度判断": "读取失败",
    "可延展方向": "先检查公开链接是否可访问，必要时更换来源或人工补充。",
    "适合AI先锋还是AI先锋者": "待判断",
    "适合流量/信任/转化": "待判断",
    "可做视频角度": "暂无",
    "风险备注": error.message || String(error)
  };
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function enabledSources(sources) {
  return (Array.isArray(sources) ? sources : []).filter((source) => source && source.enabled === true && normalize(source.url));
}

async function fetchText(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/rss+xml, application/atom+xml, text/xml, text/html, */*"
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function readSource(source) {
  const text = await fetchText(source.url);
  const type = normalize(source.source_type).toLowerCase();
  const items = type === "rss" || text.includes("<rss") || text.includes("<feed")
    ? parseRssItems(text, source.url)
    : parsePublicPage(text, source.url);

  return items
    .filter((item) => normalize(item.title))
    .slice(0, MAX_ITEMS_PER_SOURCE);
}

async function collectRows(dateText, sources, buildRow, failureRow) {
  const rows = [];
  const failures = [];

  for (const source of enabledSources(sources)) {
    try {
      const items = await readSource(source);
      if (!items.length) {
        throw new Error("公开来源可访问，但未识别到可用条目");
      }
      for (const item of items) {
        rows.push(buildRow(dateText, source, item));
      }
    } catch (error) {
      rows.push(failureRow(dateText, source, error));
      failures.push({
        source: source.source_name,
        url: source.url,
        error: error.message || String(error)
      });
    }
  }

  return { rows, failures };
}

function listLines(items, formatter) {
  if (!items.length) return "- 暂无";
  return items.slice(0, 12).map(formatter).join("\n");
}

function buildDailyBrief(dateText, aiRows, hotRows, failures) {
  const validAi = aiRows.filter((row) => row["标题"] !== "来源读取失败");
  const validHot = hotRows.filter((row) => row["热点名称"] !== "来源读取失败");
  const productRows = validAi.filter((row) => /产品|工具|模型|OpenAI|Claude|Gemini|model|tool/i.test(`${row["标题"]} ${row["摘要"]} ${row["关键词"]}`));
  const xianfengRows = validAi.filter((row) => ["高", "中"].includes(row["与AI先锋相关度"]));
  const xianfengzheRows = validAi.filter((row) => ["高", "中"].includes(row["与AI先锋者相关度"]));
  const riskyRows = [...aiRows, ...hotRows].filter((row) => /失败|传闻|爆料|法律|监管|安全|核验/.test(`${row["标题"] || row["热点名称"]} ${row["风险备注"]}`));

  return `# 每日AI简报 ${dateText}

## 今日AI最新消息摘要

${listLines(validAi, (row) => `- ${row["标题"]}（${row["来源"]}）：${row["摘要"]}`)}

## 今日值得关注的AI产品/工具/模型变化

${listLines(productRows, (row) => `- ${row["标题"]}：${row["建议切入角度"]}`)}

## 今日可借势热点素材

${listLines(validHot, (row) => `- ${row["热点名称"]}（${row["热点类型"]}）：${row["可做视频角度"]}`)}

## 今日更适合AI先锋的选题

${listLines(xianfengRows, (row) => `- ${row["标题"]}：${row["建议切入角度"]}`)}

## 今日更适合AI先锋者的选题

${listLines(xianfengzheRows, (row) => `- ${row["标题"]}：${row["建议切入角度"]}`)}

## 今日不建议做的热点及原因

${listLines(riskyRows, (row) => `- ${row["标题"] || row["热点名称"]}：${row["风险备注"]}`)}

## 明天建议继续观察什么

- 继续观察公开 AI 产品/工具/模型更新是否能转成普通人可落地的内容生产、提效获客或直播承接选题。
- 继续观察哪些公开热点适合 AI先锋 做转化型案例，哪些适合 AI先锋者 做趋势判断。
- 对读取失败的信息源，检查公开链接是否仍可访问，必要时更换来源或手动补充。

## 读取失败或需要人工确认的来源

${listLines(failures, (item) => `- ${item.source}：${item.error}（${item.url}）`)}

## 合规边界

- 本次只读取配置文件中 enabled=true 的公开来源。
- 不访问需要登录的平台页面。
- 不处理验证码，不绕过平台安全机制。
- 读取失败只记录原因，不重试异常请求。
`;
}

async function writeCsv(filePath, headers, rows) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, serializeRows(headers, rows), "utf8");
}

async function collectDailyPublicSources(options = {}) {
  const root = options.root || process.cwd();
  const dateText = options.dateText || todayString();
  const sourceDir = options.sourceDir || path.join(root, "data", "sources");
  const dailyDir = options.dailyDir || path.join(root, "data", "daily");
  const outputDir = options.outputDir || path.join(root, "outputs");
  const aiSourcePath = path.join(sourceDir, "public_ai_sources.json");
  const hotSourcePath = path.join(sourceDir, "public_hot_material_sources.json");
  const aiSources = await readJson(aiSourcePath, []);
  const hotSources = await readJson(hotSourcePath, []);

  const aiResult = await collectRows(dateText, aiSources, buildAiNewsRow, failureAiNewsRow);
  const hotResult = await collectRows(dateText, hotSources, buildHotMaterialRow, failureHotMaterialRow);
  const failures = [...aiResult.failures, ...hotResult.failures];
  const aiNewsPath = path.join(dailyDir, `ai_news_${dateText}.csv`);
  const hotMaterialsPath = path.join(dailyDir, `hot_materials_${dateText}.csv`);
  const briefPath = path.join(outputDir, `ai_daily_brief_${dateText}.md`);
  const brief = buildDailyBrief(dateText, aiResult.rows, hotResult.rows, failures);

  await writeCsv(aiNewsPath, AI_NEWS_HEADERS, aiResult.rows);
  await writeCsv(hotMaterialsPath, HOT_MATERIAL_HEADERS, hotResult.rows);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(briefPath, brief, "utf8");

  return {
    date: dateText,
    aiNewsPath,
    hotMaterialsPath,
    briefPath,
    aiRows: aiResult.rows,
    hotRows: hotResult.rows,
    failures,
    brief
  };
}

module.exports = {
  AI_NEWS_HEADERS,
  HOT_MATERIAL_HEADERS,
  collectDailyPublicSources,
  parseRssItems,
  parsePublicPage,
  buildDailyBrief
};
