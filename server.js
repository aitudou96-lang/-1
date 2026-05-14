const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { analyzeAccount, getCsvHeaders } = require("./src/analyzer");
const { createCsvStore } = require("./src/csvStore");
const {
  DAILY_RECORD_HEADERS,
  VIRAL_QUEUE_HEADERS,
  todayString,
  generateMonitorTasks,
  buildDailyRecord,
  buildDailyReport,
  writeDailyReport
} = require("./src/monitoring");
const {
  collectDailyPublicSources,
  AI_NEWS_HEADERS,
  HOT_MATERIAL_HEADERS
} = require("./src/publicSourceCollector");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const CSV_PATH = process.env.ACCOUNT_MONITOR_CSV
  ? path.resolve(process.env.ACCOUNT_MONITOR_CSV)
  : path.join(ROOT, "data", "monitoring", "account_monitor_pool.csv");
const DAILY_RECORDS_PATH = process.env.DAILY_MONITOR_RECORDS_CSV
  ? path.resolve(process.env.DAILY_MONITOR_RECORDS_CSV)
  : path.join(ROOT, "data", "monitoring", "daily_monitor_records.csv");
const VIRAL_QUEUE_PATH = process.env.VIRAL_ANALYSIS_QUEUE_CSV
  ? path.resolve(process.env.VIRAL_ANALYSIS_QUEUE_CSV)
  : path.join(ROOT, "data", "monitoring", "viral_analysis_queue.csv");
const REPORT_DIR = process.env.DAILY_MONITOR_REPORT_DIR
  ? path.resolve(process.env.DAILY_MONITOR_REPORT_DIR)
  : path.join(ROOT, "outputs");
const DAILY_DIR = process.env.PUBLIC_SOURCE_DAILY_DIR
  ? path.resolve(process.env.PUBLIC_SOURCE_DAILY_DIR)
  : path.join(ROOT, "data", "daily");
const SOURCE_DIR = process.env.PUBLIC_SOURCE_CONFIG_DIR
  ? path.resolve(process.env.PUBLIC_SOURCE_CONFIG_DIR)
  : path.join(ROOT, "data", "sources");
const accountStore = createCsvStore(CSV_PATH, getCsvHeaders());
const dailyRecordStore = createCsvStore(DAILY_RECORDS_PATH, DAILY_RECORD_HEADERS);
const viralQueueStore = createCsvStore(VIRAL_QUEUE_PATH, VIRAL_QUEUE_HEADERS);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function relativePath(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error("请求内容过大"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("JSON 格式不正确"));
      }
    });
    req.on("error", reject);
  });
}

async function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const rawPath = decodeURIComponent(requestUrl.pathname);
  const safePath = rawPath === "/" ? "index.html" : rawPath.replace(/^\/+/, "");
  const publicRoot = path.resolve(PUBLIC_DIR);
  const filePath = path.resolve(PUBLIC_DIR, safePath);

  if (filePath !== publicRoot && !filePath.startsWith(publicRoot + path.sep)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = requestUrl.pathname;

    if (req.method === "POST" && pathname === "/api/analyze") {
      const input = await parseBody(req);
      const result = analyzeAccount(input, { persist: false });
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && pathname === "/api/accounts") {
      const input = await parseBody(req);
      const result = analyzeAccount(input, { persist: true });
      await accountStore.appendRow(result.csvRow);
      sendJson(res, 201, {
        ...result,
        savedTo: relativePath(CSV_PATH)
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/preview") {
      const preview = await accountStore.preview();
      sendJson(res, 200, {
        path: relativePath(CSV_PATH),
        ...preview
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/tasks/today") {
      const dateText = requestUrl.searchParams.get("date") || todayString();
      const accounts = await accountStore.readRows();
      const records = await dailyRecordStore.readRows();
      const tasks = generateMonitorTasks(accounts, records, dateText);
      sendJson(res, 200, {
        date: dateText,
        total: tasks.length,
        rows: tasks
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/records") {
      const dateText = requestUrl.searchParams.get("date");
      const records = await dailyRecordStore.readRows();
      const rows = dateText ? records.filter((row) => row["日期"] === dateText) : records;
      sendJson(res, 200, {
        path: relativePath(DAILY_RECORDS_PATH),
        headers: DAILY_RECORD_HEADERS,
        rows: rows.slice(-100).reverse(),
        total: rows.length
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/viral-queue") {
      const rows = await viralQueueStore.readRows();
      sendJson(res, 200, {
        path: relativePath(VIRAL_QUEUE_PATH),
        headers: VIRAL_QUEUE_HEADERS,
        rows: rows.slice(-100).reverse(),
        total: rows.length
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/observations") {
      const body = await parseBody(req);
      const dateText = body.date || todayString();
      const task = body.task || {};
      const observation = body.observation || {};

      if (!task["平台"] || !task["账号名称"]) {
        throw new Error("缺少监控任务账号信息");
      }

      const { record, queueItem } = buildDailyRecord(task, observation, dateText);
      await dailyRecordStore.appendRow(record);
      if (queueItem) {
        await viralQueueStore.appendRow(queueItem);
      }

      const accounts = await accountStore.readRows();
      const records = await dailyRecordStore.readRows();
      const queue = await viralQueueStore.readRows();
      const tasks = generateMonitorTasks(accounts, records, dateText);
      const report = buildDailyReport({ dateText, tasks, records, queue });
      const reportPath = await writeDailyReport(REPORT_DIR, dateText, report);

      sendJson(res, 201, {
        record,
        queueItem,
        report,
        savedTo: relativePath(DAILY_RECORDS_PATH),
        queueSavedTo: queueItem ? relativePath(VIRAL_QUEUE_PATH) : null,
        reportPath: relativePath(reportPath)
      });
      return;
    }

    if (
      (req.method === "GET" || req.method === "POST") &&
      pathname === "/api/reports/daily"
    ) {
      const body = req.method === "POST" ? await parseBody(req) : {};
      const dateText = body.date || requestUrl.searchParams.get("date") || todayString();
      const accounts = await accountStore.readRows();
      const records = await dailyRecordStore.readRows();
      const queue = await viralQueueStore.readRows();
      const tasks = generateMonitorTasks(accounts, records, dateText);
      const report = buildDailyReport({ dateText, tasks, records, queue });
      const reportPath = await writeDailyReport(REPORT_DIR, dateText, report);

      sendJson(res, 200, {
        date: dateText,
        path: relativePath(reportPath),
        report
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/public-sources/collect") {
      const result = await collectDailyPublicSources({
        root: ROOT,
        sourceDir: SOURCE_DIR,
        dailyDir: DAILY_DIR,
        outputDir: REPORT_DIR
      });
      sendJson(res, 200, {
        date: result.date,
        aiNewsPath: relativePath(result.aiNewsPath),
        hotMaterialsPath: relativePath(result.hotMaterialsPath),
        briefPath: relativePath(result.briefPath),
        aiRows: result.aiRows,
        hotRows: result.hotRows,
        failures: result.failures,
        brief: result.brief
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/public-sources/ai-news") {
      const dateText = requestUrl.searchParams.get("date") || todayString();
      const filePath = path.join(DAILY_DIR, `ai_news_${dateText}.csv`);
      const store = createCsvStore(filePath, AI_NEWS_HEADERS);
      const preview = await store.preview(100);
      sendJson(res, 200, {
        path: relativePath(filePath),
        ...preview
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/public-sources/hot-materials") {
      const dateText = requestUrl.searchParams.get("date") || todayString();
      const filePath = path.join(DAILY_DIR, `hot_materials_${dateText}.csv`);
      const store = createCsvStore(filePath, HOT_MATERIAL_HEADERS);
      const preview = await store.preview(100);
      sendJson(res, 200, {
        path: relativePath(filePath),
        ...preview
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/public-sources/brief") {
      const dateText = requestUrl.searchParams.get("date") || todayString();
      const filePath = path.join(REPORT_DIR, `ai_daily_brief_${dateText}.md`);
      let brief = "";
      try {
        brief = await fs.readFile(filePath, "utf8");
      } catch {
        brief = "暂无每日AI简报，请先点击“读取公开信息源”。";
      }
      sendJson(res, 200, {
        path: relativePath(filePath),
        brief
      });
      return;
    }

    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(res, 400, { error: error.message || "请求处理失败" });
  }
});

server.listen(PORT, () => {
  console.log(`账号监控池分析工具已启动: http://localhost:${PORT}`);
  console.log(`数据将保存到: ${CSV_PATH}`);
});
