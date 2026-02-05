export interface ParsedCsv {
  delimiter: "," | "\t" | ";";
  headers: string[];
  rows: Record<string, string>[];
}

function detectDelimiter(text: string): "," | "\t" | ";" {
  // Count delimiters outside quotes in the first chunk.
  const chunk = text.slice(0, 4000);
  let inQuotes = false;
  const counts: Record<string, number> = { ",": 0, "\t": 0, ";": 0 };
  for (let i = 0; i < chunk.length; i++) {
    const c = chunk[i];
    if (c === '"') {
      if (inQuotes && chunk[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (inQuotes) continue;
    if (c === "," || c === "\t" || c === ";") counts[c] += 1;
    if (c === "\n") break;
  }

  const best = (Object.entries(counts) as Array<["," | "\t" | ";", number]>).sort(
    (a, b) => b[1] - a[1]
  )[0];
  return best?.[0] ?? ",";
}

export function parseCsv(text: string): ParsedCsv {
  const delimiter = detectDelimiter(text);

  const rawRows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      continue;
    }

    if (c === "\r") continue;

    if (c === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    if (c === "\n") {
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim().length > 0)) rawRows.push(row);
      row = [];
      continue;
    }

    field += c;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim().length > 0)) rawRows.push(row);
  }

  if (rawRows.length === 0) {
    return { delimiter, headers: [], rows: [] };
  }

  const headers = rawRows[0].map((h) => h.trim());
  const rows = rawRows.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i] ?? `col_${i}`] = (cells[i] ?? "").trim();
    }
    return obj;
  });

  return { delimiter, headers, rows };
}

