const form = document.querySelector("#accountForm");
const observationForm = document.querySelector("#observationForm");
const confirmSaveButton = document.querySelector("#confirmSaveButton");
const fillTestButton = document.querySelector("#fillTestButton");
const refreshAllButton = document.querySelector("#refreshAllButton");
const generateTasksButton = document.querySelector("#generateTasksButton");
const loadRecordsButton = document.querySelector("#loadRecordsButton");
const loadQueueButton = document.querySelector("#loadQueueButton");
const generateReportButton = document.querySelector("#generateReportButton");
const collectPublicSourcesButton = document.querySelector("#collectPublicSourcesButton");
const loadAiNewsButton = document.querySelector("#loadAiNewsButton");
const loadHotMaterialsButton = document.querySelector("#loadHotMaterialsButton");
const loadAiBriefButton = document.querySelector("#loadAiBriefButton");
const saveObservationButton = document.querySelector("#saveObservationButton");
const resultEmpty = document.querySelector("#resultEmpty");
const resultContent = document.querySelector("#resultContent");
const saveStatus = document.querySelector("#saveStatus");
const csvPreview = document.querySelector("#csvPreview");
const previewPath = document.querySelector("#previewPath");
const taskStatus = document.querySelector("#taskStatus");
const taskTable = document.querySelector("#taskTable");
const selectedTaskStatus = document.querySelector("#selectedTaskStatus");
const recordPath = document.querySelector("#recordPath");
const recordTable = document.querySelector("#recordTable");
const queuePath = document.querySelector("#queuePath");
const queueTable = document.querySelector("#queueTable");
const reportPath = document.querySelector("#reportPath");
const reportPreview = document.querySelector("#reportPreview");
const publicSourceStatus = document.querySelector("#publicSourceStatus");
const aiNewsPath = document.querySelector("#aiNewsPath");
const aiNewsTable = document.querySelector("#aiNewsTable");
const hotMaterialsPath = document.querySelector("#hotMaterialsPath");
const hotMaterialsTable = document.querySelector("#hotMaterialsTable");
const aiBriefPath = document.querySelector("#aiBriefPath");
const aiBriefPreview = document.querySelector("#aiBriefPreview");

let pendingPayload = null;
let pendingPayloadKey = "";
let currentTasks = [];
let selectedTask = null;

const TEST_DATA = {
  platform: "抖音",
  accountName: "AI口播增长样本号",
  accountUrl: "https://example.com/account/ai-koubo-demo",
  hotVideoUrl: "https://example.com/video/hot-ai-koubo-demo",
  hotVideoData: "播放 38w，点赞 1.2w，评论 860，评论区很多人在问工具和教程，结尾引导私信。",
  videoTitle: "不会代码，普通人也能用AI口播一天产出10条短视频",
  videoScript:
    "很多自媒体人卡住不是不会拍，而是每天选题、写稿、录制太慢。我的方法是先用AI拆出标题和前3秒钩子，再用AI口播智能体生成口播稿，最后直播间拆案例。想看完整流程，可以私信我发你模板。",
  profileBio: "专注AI口播智能体、内容获客、短视频提效和直播转化，适合自媒体人、知识付费从业者和个体创业者。",
  screenshotNote: "测试数据：截图路径可填写 E:\\素材\\账号截图\\ai-koubo-demo.png；主页有直播预约和私信引导。",
  learningOptions: ["标题", "前3秒钩子", "私信转化", "直播承接"]
};

function today() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function formDataToObject(targetForm, arrayFields = []) {
  const formData = new FormData(targetForm);
  const payload = {};
  const arraySet = new Set(arrayFields);

  for (const [key, value] of formData.entries()) {
    if (arraySet.has(key)) {
      payload[key] = payload[key] || [];
      payload[key].push(value);
    } else {
      payload[key] = value;
    }
  }

  for (const key of arrayFields) {
    payload[key] = payload[key] || [];
  }

  return payload;
}

function formToPayload() {
  return formDataToObject(form, ["learningOptions"]);
}

function observationToPayload() {
  return formDataToObject(observationForm, ["monetizationTraces"]);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function getJson(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "请求失败");
  }
  return data;
}

function validateLinkPair() {
  const accountUrl = form.elements.accountUrl;
  const hotVideoUrl = form.elements.hotVideoUrl;
  const hasLink = accountUrl.value.trim() || hotVideoUrl.value.trim();
  const message = hasLink ? "" : "账号链接或代表爆款链接至少填写一个";
  accountUrl.setCustomValidity(message);
  hotVideoUrl.setCustomValidity("");
  return Boolean(hasLink);
}

function setBusy(isBusy) {
  [...document.querySelectorAll("button")].forEach((button) => {
    button.disabled = isBusy || (button === confirmSaveButton && !pendingPayload) || (button === saveObservationButton && !selectedTask);
  });
}

function clearPendingState(message = "表单已改动，请重新生成分析预览") {
  if (!pendingPayload) return;
  pendingPayload = null;
  pendingPayloadKey = "";
  confirmSaveButton.disabled = true;
  saveStatus.textContent = message;
}

function renderTable(element, rows, columns, emptyText, actionRenderer) {
  if (!rows || !rows.length) {
    element.textContent = emptyText;
    return;
  }

  element.innerHTML = `
    <table class="preview-table">
      <thead>
        <tr>
          ${actionRenderer ? "<th>操作</th>" : ""}
          ${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((row, index) => {
            const action = actionRenderer ? `<td>${actionRenderer(row, index)}</td>` : "";
            return `<tr>${action}${columns
              .map((column) => `<td>${escapeHtml(row[column] || "")}</td>`)
              .join("")}</tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderResult(data, { saved = false } = {}) {
  const analysis = data.analysis;
  const report = data.report;
  const monitorLevel = analysis["是否重点监控"];
  const levelClass = monitorLevel === "A重点" ? "" : "warn";

  const cards = [
    ["是否值得进入监控池", report["是否值得进入监控池"]],
    ["为什么值得/不值得", report["为什么值得/不值得"]],
    ["应该归为哪类账号", report["应该归为哪类账号"]],
    ["适合学习什么", analysis["适合学习什么"]],
    ["更适合学习流量、信任还是转化", report["更适合学习流量、信任还是转化"]],
    ["更适合 AI先锋 还是 AI先锋者", report["更适合 AI先锋 还是 AI先锋者"]],
    ["为什么适合 AI先锋", report["为什么适合 AI先锋"]],
    ["为什么适合 AI先锋者", report["为什么适合 AI先锋者"]],
    ["推荐拆解哪 3 条代表视频", report["推荐拆解哪 3 条代表视频"]],
    ["下一步我还需要补充什么信息", report["下一步我还需要补充什么信息"]]
  ];

  const analysisCards = Object.entries(analysis)
    .map(([label, value]) => {
      return `<article class="summary-card"><strong>${escapeHtml(label)}</strong><p>${escapeHtml(value)}</p></article>`;
    })
    .join("");

  resultContent.innerHTML = `
    <div class="tags">
      <span class="tag">${escapeHtml(analysis["账号类型"])}</span>
      <span class="tag">${escapeHtml(analysis["更适合哪个号"])}</span>
      <span class="tag ${levelClass}">${escapeHtml(monitorLevel)}</span>
      <span class="tag ${saved ? "" : "warn"}">${saved ? "已入库" : "待确认入库"}</span>
    </div>
    ${cards
      .map(([label, value]) => {
        return `<article class="summary-card"><strong>${escapeHtml(label)}</strong><p>${escapeHtml(value)}</p></article>`;
      })
      .join("")}
    <article class="summary-card"><strong>完整入库字段</strong><p>确认入库后，这些字段会追加写入 CSV。</p></article>
    ${analysisCards}
  `;

  resultEmpty.classList.add("hidden");
  resultContent.classList.remove("hidden");
}

function renderCsvPreview(data) {
  previewPath.textContent = `${data.path}（共 ${data.total || 0} 条）`;
  renderTable(
    csvPreview,
    data.rows,
    ["录入时间", "平台", "账号名称", "账号类型", "更适合哪个号", "是否重点监控", "适合学习什么", "账号链接", "代表爆款链接"],
    "暂无入库账号"
  );
}

async function loadPreview() {
  const data = await getJson("/api/preview");
  renderCsvPreview(data);
}

async function loadTasks() {
  const data = await getJson(`/api/tasks/today?date=${today()}`);
  currentTasks = data.rows || [];
  taskStatus.textContent = `${data.date} 今日建议查看 ${data.total || 0} 个账号。A重点每天检查，B观察轮流检查，C备用低频检查。`;
  renderTable(
    taskTable,
    currentTasks,
    ["平台", "账号名称", "账号链接", "账号类型", "更适合哪个号", "我为什么关注它", "适合学习什么", "是否重点监控", "今日需要我补充什么数据"],
    "暂无任务：请先在账号监控池录入账号。",
    (row, index) => `<button type="button" class="secondary-button row-action" data-task-index="${index}">补充观察</button>`
  );
}

async function loadRecords() {
  const data = await getJson(`/api/records?date=${today()}`);
  recordPath.textContent = `${data.path}（今日 ${data.total || 0} 条）`;
  renderTable(
    recordTable,
    data.rows,
    ["日期", "平台", "账号名称", "账号类型", "今日发现视频标题", "今日数据", "内容类型", "变现痕迹", "更适合 AI先锋 还是 AI先锋者", "更适合流量/信任/转化", "是否进入爆款拆解池", "备注"],
    "今日暂无观察记录"
  );
}

async function loadQueue() {
  const data = await getJson("/api/viral-queue");
  queuePath.textContent = `${data.path}（共 ${data.total || 0} 条）`;
  renderTable(
    queueTable,
    data.rows,
    ["日期", "平台", "账号名称", "视频标题", "视频数据", "入池原因", "优先级", "拆解状态", "视频链接"],
    "暂无待拆解视频"
  );
}

async function loadReport() {
  const data = await getJson(`/api/reports/daily?date=${today()}`);
  reportPath.textContent = data.path;
  reportPreview.textContent = data.report || "暂无日报";
}

async function loadAiNews() {
  const data = await getJson(`/api/public-sources/ai-news?date=${today()}`);
  aiNewsPath.textContent = `${data.path}（共 ${data.total || 0} 条）`;
  renderTable(
    aiNewsTable,
    data.rows,
    ["日期", "来源", "标题", "摘要", "关键词", "与AI先锋相关度", "与AI先锋者相关度", "是否适合做内容", "建议切入角度", "风险备注", "链接"],
    "暂无AI消息，请先读取公开信息源。"
  );
}

async function loadHotMaterials() {
  const data = await getJson(`/api/public-sources/hot-materials?date=${today()}`);
  hotMaterialsPath.textContent = `${data.path}（共 ${data.total || 0} 条）`;
  renderTable(
    hotMaterialsTable,
    data.rows,
    ["日期", "热点名称", "来源", "热点类型", "热度判断", "可延展方向", "适合AI先锋还是AI先锋者", "适合流量/信任/转化", "可做视频角度", "风险备注"],
    "暂无热点素材，请先读取公开信息源。"
  );
}

async function loadAiBrief() {
  const data = await getJson(`/api/public-sources/brief?date=${today()}`);
  aiBriefPath.textContent = data.path;
  aiBriefPreview.textContent = data.brief || "暂无每日AI简报";
}

async function collectPublicSources() {
  setBusy(true);
  publicSourceStatus.textContent = "正在读取公开信息源；如某个来源不可访问，会写入失败原因。";

  try {
    const data = await postJson("/api/public-sources/collect", {});
    publicSourceStatus.textContent = `读取完成：AI消息 ${data.aiRows.length} 条，热点素材 ${data.hotRows.length} 条，失败来源 ${data.failures.length} 个。`;
    aiNewsPath.textContent = data.aiNewsPath;
    hotMaterialsPath.textContent = data.hotMaterialsPath;
    aiBriefPath.textContent = data.briefPath;
    renderTable(
      aiNewsTable,
      data.aiRows.slice().reverse(),
      ["日期", "来源", "标题", "摘要", "关键词", "与AI先锋相关度", "与AI先锋者相关度", "是否适合做内容", "建议切入角度", "风险备注", "链接"],
      "暂无AI消息"
    );
    renderTable(
      hotMaterialsTable,
      data.hotRows.slice().reverse(),
      ["日期", "热点名称", "来源", "热点类型", "热度判断", "可延展方向", "适合AI先锋还是AI先锋者", "适合流量/信任/转化", "可做视频角度", "风险备注"],
      "暂无热点素材"
    );
    aiBriefPreview.textContent = data.brief || "暂无每日AI简报";
  } catch (error) {
    publicSourceStatus.textContent = error.message;
  } finally {
    setBusy(false);
  }
}

async function refreshAll() {
  setBusy(true);
  try {
    await Promise.all([
      loadPreview(),
      loadTasks(),
      loadRecords(),
      loadQueue(),
      loadReport(),
      loadAiNews(),
      loadHotMaterials(),
      loadAiBrief()
    ]);
  } catch (error) {
    taskStatus.textContent = error.message;
  } finally {
    setBusy(false);
  }
}

async function runPreview() {
  validateLinkPair();
  if (!form.reportValidity()) return;

  const payload = formToPayload();
  setBusy(true);
  saveStatus.textContent = "正在生成分析预览...";

  try {
    const data = await postJson("/api/analyze", payload);
    renderResult(data, { saved: false });
    pendingPayload = payload;
    pendingPayloadKey = stableStringify(payload);
    confirmSaveButton.disabled = false;
    saveStatus.textContent = "分析预览已生成，确认无误后点击“确认入库”。";
  } catch (error) {
    saveStatus.textContent = error.message;
  } finally {
    setBusy(false);
  }
}

async function confirmSave() {
  validateLinkPair();
  if (!form.reportValidity()) return;
  if (!pendingPayload) {
    saveStatus.textContent = "请先生成分析预览，再确认入库。";
    return;
  }

  const currentKey = stableStringify(formToPayload());
  if (currentKey !== pendingPayloadKey) {
    clearPendingState("表单已改动，请重新生成分析预览后再入库。");
    return;
  }

  setBusy(true);
  saveStatus.textContent = "正在写入 CSV...";

  try {
    const data = await postJson("/api/accounts", pendingPayload);
    renderResult(data, { saved: true });
    pendingPayload = null;
    pendingPayloadKey = "";
    confirmSaveButton.disabled = true;
    saveStatus.textContent = `已保存到 ${data.savedTo}`;
    await Promise.all([loadPreview(), loadTasks()]);
  } catch (error) {
    saveStatus.textContent = error.message;
  } finally {
    setBusy(false);
  }
}

function fillTestData() {
  form.reset();

  for (const [key, value] of Object.entries(TEST_DATA)) {
    if (key === "learningOptions") continue;
    if (form.elements[key]) form.elements[key].value = value;
  }

  const selected = new Set(TEST_DATA.learningOptions);
  form.querySelectorAll('input[name="learningOptions"]').forEach((checkbox) => {
    checkbox.checked = selected.has(checkbox.value);
  });

  pendingPayload = null;
  pendingPayloadKey = "";
  confirmSaveButton.disabled = true;
  resultEmpty.classList.remove("hidden");
  resultContent.classList.add("hidden");
  saveStatus.textContent = "已填充测试数据，可以生成分析预览。";
  validateLinkPair();
}

function selectTask(index) {
  observationForm.reset();
  selectedTask = currentTasks[index];
  if (!selectedTask) return;

  observationForm.elements.taskPlatform.value = selectedTask["平台"] || "";
  observationForm.elements.taskAccountName.value = selectedTask["账号名称"] || "";
  selectedTaskStatus.textContent = `当前补充：${selectedTask["平台"]}｜${selectedTask["账号名称"]}｜${selectedTask["今日需要我补充什么数据"]}`;
  saveObservationButton.disabled = false;
  location.hash = "#observationFormPanel";
}

async function saveObservation() {
  if (!selectedTask) {
    selectedTaskStatus.textContent = "请先在今日监控任务中选择一个账号。";
    return;
  }

  const observation = observationToPayload();
  setBusy(true);
  selectedTaskStatus.textContent = "正在分析并保存今日观察记录...";

  try {
    const data = await postJson("/api/observations", {
      date: today(),
      task: selectedTask,
      observation
    });
    selectedTaskStatus.textContent = data.queueItem
      ? `已保存观察记录，并加入爆款拆解池。日报已更新：${data.reportPath}`
      : `已保存观察记录。日报已更新：${data.reportPath}`;
    observationForm.reset();
    selectedTask = null;
    saveObservationButton.disabled = true;
    await Promise.all([loadTasks(), loadRecords(), loadQueue(), loadReport()]);
  } catch (error) {
    selectedTaskStatus.textContent = error.message;
  } finally {
    setBusy(false);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runPreview();
});

form.addEventListener("input", () => {
  validateLinkPair();
  clearPendingState();
});

form.addEventListener("reset", () => {
  pendingPayload = null;
  pendingPayloadKey = "";
  confirmSaveButton.disabled = true;
  saveStatus.textContent = "等待录入";
  resultEmpty.classList.remove("hidden");
  resultContent.classList.add("hidden");
  setTimeout(validateLinkPair, 0);
});

observationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveObservation();
});

observationForm.addEventListener("reset", () => {
  selectedTask = null;
  saveObservationButton.disabled = true;
  selectedTaskStatus.textContent = "请先在“今日监控任务”中选择一个账号。";
});

taskTable.addEventListener("click", (event) => {
  const button = event.target.closest("[data-task-index]");
  if (!button) return;
  selectTask(Number(button.dataset.taskIndex));
});

confirmSaveButton.addEventListener("click", confirmSave);
fillTestButton.addEventListener("click", fillTestData);
refreshAllButton.addEventListener("click", refreshAll);
generateTasksButton.addEventListener("click", loadTasks);
loadRecordsButton.addEventListener("click", loadRecords);
loadQueueButton.addEventListener("click", loadQueue);
generateReportButton.addEventListener("click", loadReport);
collectPublicSourcesButton.addEventListener("click", collectPublicSources);
loadAiNewsButton.addEventListener("click", loadAiNews);
loadHotMaterialsButton.addEventListener("click", loadHotMaterials);
loadAiBriefButton.addEventListener("click", loadAiBrief);

refreshAll();
