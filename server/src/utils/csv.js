import { ApiError } from "./apiError.js";

export function parseCsv(text, { maxRows = 5000 } = {}) {
  const source = String(text ?? "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";

      if (rows.length > maxRows) {
        throw new ApiError(400, `CSV import is limited to ${maxRows} rows.`);
      }
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((item) => !(item.length === 1 && item[0].trim() === ""));
}

export function csvEscape(value) {
  const text = String(value ?? "");

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function toCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

export function rowsToObjects(rows) {
  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header) => header.trim());

  return rows.slice(1).map((cells, index) => {
    const record = { __row: index + 2 };

    headers.forEach((header, position) => {
      record[header] = cells[position] ?? "";
    });

    return record;
  });
}
