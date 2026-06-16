"use strict";

// Sample transaction data (also lets "Use sample data" work offline).
const SAMPLE_CSV = `order_id,order_date,customer_name,country,phone,product_id,product_name,quantity,unit_price,amount,payment_mode,email
ORD1001,2025-04-01,Aarav Mehta,India,9876543210,PRD55,Wireless Mouse,2,499,998,UPI,aarav.mehta@gmail.com
ORD1002,2025-04-02,Li Wei,Singapore,81234567,PRD56,USB-C Cable,3,150,450,Credit Card,li.wei@gmail.com
ORD1003,02-04-2025,John Carter,USA,+1 415 555 0199,PRD57,Laptop Stand,1,1200,1200,PayPal,john.carter@outlook.com
ORD1004,2025-04-03,Fatima Noor,UAE,+971 50 123 4567,PRD58,Keyboard,1,2500,2500,Credit Card,fatima.noor@gmail.com
ORD1005,2025-04-03,Priya Singh,India,98765,PRD59,Webcam,1,1800,1800,Debit Card,priya.singh@gmail.com
ORD1006,2025/04/04,Tan Ah Kow,Singapore,6512345,PRD60,HDMI Adapter,2,300,600,UPI,tan.ahkow@gmail.com
ORD1007,2025-04-05,Rahul Verma,India,919812345678,PRD61,Monitor,1,9000,9000,Net Banking,rahul.verma.gmail.com
ORD1008,2025-04-05,Sophia Lee,Singapore,87654321,PRD62,Mouse Pad,-1,200,200,Cash,sophia.lee@gmail.com
ORD1009,31-13-2025,Mohammed Ali,UAE,501234567,PRD63,Headphones,1,3500,3500,Credit Card,m.ali@gmail.com
ORD1010,2025-04-06,Neha Gupta,India,8765432109,PRD64,Charger,2,799,1598,UPI,neha.gupta@gmail.com
ORD1011,2025-04-07,David Brown,USA,2025550143,PRD65,Speaker,1,4500,4500,PayPal,david.brown@gmail.com
ORD1010,2025-04-06,Neha Gupta,India,8765432109,PRD64,Charger,2,799,1598,UPI,neha.gupta@gmail.com
ORD1012,2025-04-08,Aisha Khan,India,,PRD66,Power Bank,1,1500,1500,Debit Card,aisha.khan@gmail.com
ORD1013,2025-04-08,Marcus Tan,Singapore,98765432,PRD67,Tripod,1,2200,abc,Credit Card,marcus.tan@gmail.com
ORD1014,2025-04-09,Sanjay Rao,India,9123456780,PRD68,SD Card,4,600,2400,UPI,sanjay.rao@gmail.com`;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

let DATA = null;       // array of row objects (all string values)
let COLUMNS = [];      // column names
let LAST = null;       // last validation result
let LAST_SQL = null;   // last SQL result rows

const METRIC_ICONS = {
  total: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
  ok: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  warn: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  err: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
};

// ----------------------------------------------------------------------
// Config readers (from the sidebar)
// ----------------------------------------------------------------------
function readCountryRules() {
  const out = {};
  document.getElementById("cfg-countries").value.split("\n").forEach((line) => {
    const p = line.split(",").map((s) => s.trim());
    if (p.length >= 3 && p[0]) {
      out[p[0].toLowerCase()] = { country: p[0], dialing: p[1], digits: parseInt(p[2], 10) };
    }
  });
  return out;
}
function readList(id) {
  return document.getElementById(id).value.split("\n").map((s) => s.trim()).filter(Boolean);
}
function cfg() {
  return {
    rules: readCountryRules(),
    payments: readList("cfg-payments"),
    refDate: document.getElementById("cfg-refdate").value || "2025-04-16",
    tolerance: parseFloat(document.getElementById("cfg-tolerance").value) || 0,
    chunk: parseInt(document.getElementById("cfg-chunk").value, 10) || 500,
  };
}

// ----------------------------------------------------------------------
// Field validators -> { ok, value, msg }
// ----------------------------------------------------------------------
function isBlank(v) {
  const s = (v === null || v === undefined ? "" : String(v)).trim().toLowerCase();
  return s === "" || s === "nan" || s === "none";
}
function digitsOnly(v) { return String(v).replace(/\D/g, ""); }

function cleanPhone(value, country, rules) {
  if (isBlank(value)) return { ok: false, value, msg: "phone is empty" };
  const digits = digitsOnly(value);
  let rule = country ? rules[String(country).trim().toLowerCase()] : null;
  if (!rule) {
    for (const k in rules) {
      const r = rules[k];
      if (digits.startsWith(r.dialing) && digits.length === r.dialing.length + r.digits) { rule = r; break; }
    }
  }
  if (!rule) {
    const ok = digits.length >= 7 && digits.length <= 15;
    return { ok, value: digits, msg: ok ? "" : "phone length looks wrong (no matching country rule)" };
  }
  let local = digits;
  if (digits.startsWith(rule.dialing) && digits.length === rule.dialing.length + rule.digits) {
    local = digits.slice(rule.dialing.length);
  }
  const ok = local.length === rule.digits;
  return { ok, value: local, msg: ok ? "" : `phone should be ${rule.digits} digits for ${rule.country}` };
}

const DATE_PATTERNS = [
  { re: /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/, order: "ymd" },
  { re: /^(\d{4})\/(\d{2})\/(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/, order: "ymd" },
  { re: /^(\d{2})-(\d{2})-(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/, order: "dmy" },
  { re: /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/, order: "dmy" },
];
function daysInMonth(y, m) { return [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }

function cleanDate(value, refDate) {
  if (isBlank(value)) return { ok: false, value, msg: "date is empty", future: false };
  const raw = String(value).trim();
  for (const p of DATE_PATTERNS) {
    const m = raw.match(p.re);
    if (!m) continue;
    let y, mo, d, hh, mm, ss;
    if (p.order === "ymd") { y = +m[1]; mo = +m[2]; d = +m[3]; } else { d = +m[1]; mo = +m[2]; y = +m[3]; }
    hh = m[4] !== undefined ? +m[4] : null; mm = m[5] !== undefined ? +m[5] : null; ss = m[6] !== undefined ? +m[6] : 0;
    if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) break;
    if (hh !== null && (hh > 23 || mm > 59 || ss > 59)) break;
    const pad = (n) => String(n).padStart(2, "0");
    let iso = `${y}-${pad(mo)}-${pad(d)}`;
    if (hh !== null) iso += ` ${pad(hh)}:${pad(mm)}:${pad(ss)}`;
    const future = `${y}-${pad(mo)}-${pad(d)}` > refDate;
    return { ok: true, value: iso, msg: "", future };
  }
  return { ok: false, value: raw, msg: "date format not recognised", future: false };
}

function cleanNumber(value, field, allowZero) {
  if (isBlank(value)) return { ok: false, value, msg: `${field} is empty` };
  const num = Number(String(value).trim());
  if (Number.isNaN(num)) return { ok: false, value, msg: `${field} is not a number` };
  if (num < 0 || (num === 0 && !allowZero)) return { ok: false, value: num, msg: `${field} must be ${allowZero ? ">= 0" : "> 0"}` };
  return { ok: true, value: num, msg: "" };
}

function checkEmail(value) {
  if (isBlank(value)) return { ok: true, value, msg: "" };
  const raw = String(value).trim();
  const ok = EMAIL_RE.test(raw);
  return { ok, value: raw, msg: ok ? "" : "email format looks invalid" };
}

// ----------------------------------------------------------------------
// Core engine
// ----------------------------------------------------------------------
function runValidation(rows, map, c) {
  const errors = rows.map(() => []);
  const warnings = rows.map(() => []);
  const out = rows.map((r) => Object.assign({}, r));

  rows.forEach((row, i) => {
    if (map.phone) {
      const country = map.country ? row[map.country] : "";
      const res = cleanPhone(row[map.phone], country, c.rules);
      out[i][map.phone] = res.value;
      if (!res.ok) errors[i].push(res.msg);
    }
    if (map.date) {
      const res = cleanDate(row[map.date], c.refDate);
      out[i][map.date] = res.value;
      if (!res.ok) errors[i].push(res.msg); else if (res.future) warnings[i].push("date is in the future");
    }
    [["amount", true], ["price", true], ["quantity", false]].forEach(([f, az]) => {
      if (map[f]) {
        const res = cleanNumber(row[map[f]], f, az);
        out[i][map[f]] = res.value;
        if (!res.ok) errors[i].push(res.msg);
      }
    });
    if (map.amount && map.quantity && map.price) {
      const a = out[i][map.amount], q = out[i][map.quantity], p = out[i][map.price];
      if ([a, q, p].every((x) => typeof x === "number")) {
        if (Math.abs(a - q * p) > c.tolerance) warnings[i].push(`amount ${a} does not match qty*price (${q * p})`);
      }
    }
    if (map.email) {
      const res = checkEmail(row[map.email]);
      out[i][map.email] = res.value;
      if (!res.ok) warnings[i].push(res.msg);
    }
    if (map.payment && c.payments.length) {
      const pm = String(row[map.payment] || "").trim();
      if (pm && !c.payments.includes(pm)) errors[i].push(`unknown payment mode '${pm}'`);
    }
    if (map.order_id && isBlank(row[map.order_id])) errors[i].push("order_id is empty");
  });

  // duplicate order ids
  if (map.order_id) {
    const seen = new Set();
    rows.forEach((row, i) => {
      const v = row[map.order_id];
      if (isBlank(v)) return;
      if (seen.has(v)) errors[i].push("duplicate order_id"); else seen.add(v);
    });
  }

  const breakdown = {};
  const annotated = out.map((r, i) => {
    const status = errors[i].length ? "error" : (warnings[i].length ? "warning" : "ok");
    errors[i].forEach((m) => {
      const key = m.replace(/'.*?'/g, "'...'");
      breakdown[key] = (breakdown[key] || 0) + 1;
    });
    return Object.assign({}, r, { status, errors: errors[i].join("; "), warnings: warnings[i].join("; ") });
  });

  const cleaned = annotated.filter((r) => r.status !== "error").map((r) => {
    const o = {}; COLUMNS.forEach((c2) => (o[c2] = r[c2])); return o;
  });
  const issues = annotated.filter((r) => r.status !== "ok");

  const summary = {
    total: rows.length,
    clean: annotated.filter((r) => r.status === "ok").length,
    warning: annotated.filter((r) => r.status === "warning").length,
    error: annotated.filter((r) => r.status === "error").length,
    breakdown: Object.entries(breakdown).sort((a, b) => b[1] - a[1]),
  };
  return { cleaned, issues, summary };
}

// ----------------------------------------------------------------------
// Rendering helpers
// ----------------------------------------------------------------------
function renderTable(container, rows, cols, errorCol) {
  container.innerHTML = "";
  if (!rows.length) { container.innerHTML = '<p class="muted" style="padding:10px">No rows.</p>'; return; }
  const columns = cols || Object.keys(rows[0]);
  const table = document.createElement("table");
  const thead = table.createTHead().insertRow();
  columns.forEach((c) => { const th = document.createElement("th"); th.textContent = c; thead.appendChild(th); });
  const tbody = table.createTBody();
  rows.slice(0, 200).forEach((r) => {
    const tr = tbody.insertRow();
    columns.forEach((c) => {
      const td = tr.insertCell();
      if (c === "status") {
        const span = document.createElement("span");
        span.className = "tpill pill-" + (r[c] || "");
        span.textContent = r[c] || "";
        td.appendChild(span);
      } else {
        td.textContent = r[c] === null || r[c] === undefined ? "" : r[c];
        if (c === errorCol) td.className = "err-cell";
      }
    });
  });
  container.appendChild(table);
  if (rows.length > 200) {
    const note = document.createElement("p");
    note.className = "muted"; note.style.padding = "6px 10px";
    note.textContent = `Showing 200 of ${rows.length} rows.`;
    container.appendChild(note);
  }
}

function guess(cols, ...needles) {
  for (const n of needles) for (const c of cols) if (c.toLowerCase().replace(/\s/g, "_").includes(n)) return c;
  return "none";
}

// ----------------------------------------------------------------------
// Data loading
// ----------------------------------------------------------------------
function loadData(rows) {
  DATA = rows;
  COLUMNS = rows.length ? Object.keys(rows[0]) : [];
  document.getElementById("load-status").textContent = `Loaded ${rows.length} rows and ${COLUMNS.length} columns.`;
  document.getElementById("load-status").className = "status ok";

  document.getElementById("preview-wrap").classList.remove("hidden");
  renderTable(document.getElementById("preview"), rows.slice(0, 15), COLUMNS);

  document.getElementById("sql-card").classList.remove("hidden");
  buildMapping();
  document.getElementById("map-card").classList.remove("hidden");

  ["results-card", "download-card"].forEach((id) => document.getElementById(id).classList.add("hidden"));
}

function parseCsvText(text) {
  const res = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
  loadData(res.data);
}

document.getElementById("file").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (f) Papa.parse(f, { header: true, skipEmptyLines: true, complete: (res) => loadData(res.data) });
});
document.getElementById("btn-sample").addEventListener("click", () => parseCsvText(SAMPLE_CSV));

// ----------------------------------------------------------------------
// Column mapping UI
// ----------------------------------------------------------------------
const FIELDS = [
  ["order_id", "Order ID", ["order_id", "order"]],
  ["phone", "Phone", ["phone", "mobile", "contact"]],
  ["country", "Country", ["country"]],
  ["date", "Date / time", ["date", "time"]],
  ["amount", "Amount", ["amount", "total"]],
  ["quantity", "Quantity", ["quantity", "qty"]],
  ["price", "Unit price", ["unit_price", "price"]],
  ["payment", "Payment mode", ["payment", "pay_mode"]],
  ["email", "Email", ["email"]],
];

function buildMapping() {
  const grid = document.getElementById("map-grid");
  grid.innerHTML = "";
  FIELDS.forEach(([key, label, needles]) => {
    const field = document.createElement("div");
    field.className = "field";
    const lab = document.createElement("label");
    lab.textContent = label;
    const sel = document.createElement("select");
    sel.id = "map-" + key;
    ["none", ...COLUMNS].forEach((c) => {
      const o = document.createElement("option"); o.value = c; o.textContent = c; sel.appendChild(o);
    });
    sel.value = guess(COLUMNS, ...needles);
    field.appendChild(lab); field.appendChild(sel); grid.appendChild(field);
  });
}

function readMapping() {
  const m = {};
  FIELDS.forEach(([key]) => {
    const v = document.getElementById("map-" + key).value;
    m[key] = v === "none" ? null : v;
  });
  return m;
}

// ----------------------------------------------------------------------
// Validate
// ----------------------------------------------------------------------
document.getElementById("btn-validate").addEventListener("click", () => {
  if (!DATA) return;
  const c = cfg();
  const map = readMapping();
  const res = runValidation(DATA, map, c);
  LAST = { res, map, c };

  document.getElementById("results-card").classList.remove("hidden");
  document.getElementById("download-card").classList.remove("hidden");

  const s = res.summary;
  const metrics = document.getElementById("metrics");
  metrics.innerHTML = "";
  [["Total rows", s.total, "", "total"], ["Clean", s.clean, "ok", "ok"], ["Warnings", s.warning, "warn", "warn"], ["Errors", s.error, "err", "err"]]
    .forEach(([lbl, num, cls, ico]) => {
      const d = document.createElement("div"); d.className = "metric " + cls;
      d.innerHTML = `<span class="m-ico">${METRIC_ICONS[ico]}</span><div><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`;
      metrics.appendChild(d);
    });

  const usablePct = s.total ? Math.round(((s.clean + s.warning) / s.total) * 100) : 0;
  document.getElementById("usable-bar").innerHTML =
    `${usablePct}% of rows are usable (clean or warning only)<div class="track"><div class="fill" style="width:${usablePct}%"></div></div>`;

  const failedH = document.getElementById("failed-h");
  const bd = document.getElementById("breakdown");
  bd.innerHTML = "";
  if (s.breakdown.length) {
    failedH.classList.remove("hidden");
    const max = s.breakdown[0][1];
    s.breakdown.forEach(([label, count]) => {
      const row = document.createElement("div"); row.className = "bar-row";
      row.innerHTML = `<span class="lbl">${label}</span><span class="bar" style="width:${(count / max) * 200}px"></span><span class="cnt">${count}</span>`;
      bd.appendChild(row);
    });
  } else { failedH.classList.add("hidden"); }

  const issuesH = document.getElementById("issues-h");
  if (res.issues.length) {
    issuesH.classList.remove("hidden");
    const cols = [...Object.values(map).filter(Boolean), "status", "errors", "warnings"];
    renderTable(document.getElementById("issues"), res.issues, cols, "errors");
  } else {
    issuesH.classList.add("hidden");
    document.getElementById("issues").innerHTML = "";
  }

  const nChunks = Math.ceil(res.cleaned.length / c.chunk) || 0;
  document.getElementById("download-note").textContent =
    `Clean data will be split into ${nChunks} file(s) of up to ${c.chunk} rows each.`;
});

// ----------------------------------------------------------------------
// Downloads
// ----------------------------------------------------------------------
function downloadBlob(content, name, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  URL.revokeObjectURL(a.href);
}

document.getElementById("dl-clean").addEventListener("click", () => {
  if (!LAST) return;
  downloadBlob(Papa.unparse(LAST.res.cleaned), "cleaned_transactions.csv", "text/csv");
});
document.getElementById("dl-issues").addEventListener("click", () => {
  if (!LAST || !LAST.res.issues.length) return;
  downloadBlob(Papa.unparse(LAST.res.issues), "issues_report.csv", "text/csv");
});
document.getElementById("dl-chunks").addEventListener("click", async () => {
  if (!LAST) return;
  const { cleaned } = LAST.res, size = LAST.c.chunk, zip = new JSZip();
  const total = Math.ceil(cleaned.length / size);
  for (let i = 0; i < total; i++) {
    zip.file(`cleaned_part_${String(i + 1).padStart(3, "0")}.csv`, Papa.unparse(cleaned.slice(i * size, (i + 1) * size)));
  }
  downloadBlob(await zip.generateAsync({ type: "blob" }), "cleaned_chunks.zip", "application/zip");
});

// ----------------------------------------------------------------------
// SQL playground (AlaSQL)
// ----------------------------------------------------------------------
document.getElementById("sql-example").addEventListener("change", (e) => {
  document.getElementById("sql-query").value = e.target.value;
});
document.getElementById("btn-sql").addEventListener("click", () => {
  const status = document.getElementById("sql-status");
  if (!DATA) { status.textContent = "Load data first."; status.className = "status err"; return; }
  try {
    alasql("DROP TABLE IF EXISTS data");
    alasql("CREATE TABLE data");
    alasql.tables.data.data = DATA;
    const rows = alasql(document.getElementById("sql-query").value);
    LAST_SQL = Array.isArray(rows) ? rows : [];
    status.textContent = `Returned ${LAST_SQL.length} row(s).`; status.className = "status ok";
    renderTable(document.getElementById("sql-result"), LAST_SQL);
    document.getElementById("btn-sql-dl").classList.toggle("hidden", LAST_SQL.length === 0);
  } catch (err) {
    status.textContent = "SQL error: " + err.message; status.className = "status err";
    document.getElementById("sql-result").innerHTML = "";
  }
});
document.getElementById("btn-sql-dl").addEventListener("click", () => {
  if (LAST_SQL && LAST_SQL.length) downloadBlob(Papa.unparse(LAST_SQL), "query_results.csv", "text/csv");
});

// Cloud MySQL (real engine via the /api/sql serverless function)
async function callApi(payload) {
  const r = await fetch("/api/sql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
  return data;
}

document.getElementById("btn-cloud-load").addEventListener("click", async () => {
  const status = document.getElementById("sql-status");
  if (!DATA) { status.textContent = "Load data first."; status.className = "status err"; return; }
  status.textContent = "Pushing data to cloud database..."; status.className = "status";
  try {
    const res = await callApi({ action: "load", rows: DATA });
    status.textContent = `Loaded ${res.loaded} rows into cloud table 'data'. You can now query it.`;
    status.className = "status ok";
  } catch (e) {
    status.textContent = "Cloud load failed: " + e.message; status.className = "status err";
  }
});

document.getElementById("btn-sql-cloud").addEventListener("click", async () => {
  const status = document.getElementById("sql-status");
  status.textContent = "Running on cloud MySQL..."; status.className = "status";
  try {
    const res = await callApi({ action: "query", query: document.getElementById("sql-query").value });
    LAST_SQL = res.rows || [];
    status.textContent = `Returned ${LAST_SQL.length} row(s) from cloud MySQL.`; status.className = "status ok";
    renderTable(document.getElementById("sql-result"), LAST_SQL, res.columns);
    document.getElementById("btn-sql-dl").classList.toggle("hidden", LAST_SQL.length === 0);
  } catch (e) {
    status.textContent = "Cloud SQL error: " + e.message; status.className = "status err";
    document.getElementById("sql-result").innerHTML = "";
  }
});
