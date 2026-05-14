const path = require("node:path");
const { collectDailyPublicSources } = require("../src/publicSourceCollector");

function relative(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const result = await collectDailyPublicSources({ root });

  console.log(`公开信息源读取完成：${result.date}`);
  console.log(`AI最新消息表：${relative(root, result.aiNewsPath)}`);
  console.log(`热点素材表：${relative(root, result.hotMaterialsPath)}`);
  console.log(`来源健康检查表：${relative(root, result.sourceHealthPath)}`);
  console.log(`每日AI简报：${relative(root, result.briefPath)}`);

  if (result.fileWriteWarnings.length) {
    console.log("文件写入提示：");
    for (const item of result.fileWriteWarnings) {
      console.log(`- 原目标文件被占用：${item.targetPath}`);
      console.log(`  已改写到备用文件：${item.writtenPath}`);
    }
  }

  if (result.failures.length) {
    console.log(`读取失败来源：${result.failures.length} 个，详情已写入表格和简报。`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
