const fs = require("node:fs/promises");
const path = require("node:path");

function csvEscape(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

function rowsToObjects(rows) {
  const headers = rows[0] || [];
  return rows.slice(1).map((cells) => {
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  });
}

function serializeRows(headers, objects) {
  const lines = [
    headers.map(csvEscape).join(","),
    ...objects.map((row) => headers.map((key) => csvEscape(row[key])).join(","))
  ];
  return `\uFEFF${lines.join("\n")}\n`;
}

function createCsvStore(filePath, headers) {
  async function ensure() {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    try {
      const text = await fs.readFile(filePath, "utf8");
      const rows = parseCsv(text);

      if (!rows.length) {
        await fs.writeFile(filePath, serializeRows(headers, []), "utf8");
        return;
      }

      const currentHeaders = rows[0];
      const hasSameSchema =
        currentHeaders.length === headers.length &&
        headers.every((header, index) => currentHeaders[index] === header);

      if (!hasSameSchema) {
        await fs.writeFile(filePath, serializeRows(headers, rowsToObjects(rows)), "utf8");
      }
    } catch {
      await fs.writeFile(filePath, serializeRows(headers, []), "utf8");
    }
  }

  async function readRows() {
    await ensure();
    const text = await fs.readFile(filePath, "utf8");
    return rowsToObjects(parseCsv(text));
  }

  async function appendRow(row) {
    await ensure();
    const line = headers.map((key) => csvEscape(row[key])).join(",") + "\n";
    await fs.appendFile(filePath, line, "utf8");
  }

  async function preview(limit = 50) {
    const rows = await readRows();
    return {
      headers,
      rows: rows.slice(-limit).reverse(),
      total: rows.length
    };
  }

  return {
    filePath,
    headers,
    ensure,
    readRows,
    appendRow,
    preview
  };
}

module.exports = {
  createCsvStore,
  csvEscape,
  parseCsv,
  rowsToObjects,
  serializeRows
};
