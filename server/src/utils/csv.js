import { ApiError } from "./apiError.js";

export function parseCsv(text, { maxRows = 5000 } = {}) {
  const source = String(text ?? "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let quoteClosed = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
          quoteClosed = true;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      if (field.length > 0 || quoteClosed) {
        throw new ApiError(400, "Invalid CSV: quote inside an unquoted field.");
      }
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
      quoteClosed = false;
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      quoteClosed = false;

      if (rows.length > maxRows) {
        throw new ApiError(400, `CSV import is limited to ${maxRows} rows.`);
      }
    } else if (char !== "\r") {
      if (quoteClosed) {
        throw new ApiError(400, "Invalid CSV: unexpected character after closing quote.");
      }
      field += char;
    }
  }

  if (inQuotes) {
    throw new ApiError(400, "Invalid CSV: unterminated quoted field.");
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length > maxRows) {
    throw new ApiError(400, `CSV import is limited to ${maxRows} rows.`);
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
