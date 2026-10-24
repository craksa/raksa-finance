import { useState } from "react";
import { supabase } from "./supabaseClient";

// ── Bank statement import (ABA / ACLEDA / Wing / any bank) ──
// Reads CSV, Excel or PDF statements, auto-detects the columns, guesses a
// category per row and lets the user review everything before saving.

const KHR_RATE = 4100;
// Category for loans / repayments / pass-through money — excluded from totals in App.jsx
export const TRANSFER_CAT = "Loan / Transfer";
// `match` is tried against the statement's top section (account info + header),
// SWIFT codes first since descriptions often mention other banks.
const BANKS = [
  { id: "auto",   label: "Auto-detect" },
  { id: "aba",    label: "ABA Bank",    short: "ABA",    match: /ABAAKHPP|Advanced Bank of Asia|Transaction Details Money In/i },
  { id: "acleda", label: "ACLEDA Bank", short: "ACLEDA", match: /ACLBKHPP|ACLEDA BANK Plc/i },
  { id: "wing",   label: "Wing Bank",   short: "Wing",   match: /WIGCKHPP|Wing Bank \(Cambodia\)/i },
  { id: "other",  label: "Other bank",  short: "" },
];

// Header keywords per field, best match first (compared after norm()).
const FIELD_KEYS = {
  date:   ["transaction date", "trans date", "txn date", "tran date", "posting date", "post date", "date", "value date", "ថ្ងៃខែ", "កាលបរិច្ឆេទ"],
  debit:  ["money out", "debit", "debit amount", "withdrawal", "withdrawals", "withdraw", "paid out", "out", "dr", "ដក"],
  credit: ["money in", "credit", "credit amount", "deposit", "deposits", "paid in", "received", "in", "cr", "ដាក់"],
  amount: ["amount", "transaction amount", "txn amount", "ចំនួនទឹកប្រាក់", "ចំនួន"],
  ccy:    ["currency", "ccy", "រូបិយប័ណ្ណ"],
  dir:    ["dr cr", "debit credit", "cr dr", "in out", "transaction type", "type"],
  desc:   ["transaction details", "description", "descriptions", "details", "narrative", "particulars", "remarks", "remark", "purpose", "note", "memo", "transaction", "ពិពណ៌នា", "ការពិពណ៌នា"],
};
const FIELD_ORDER = ["date", "debit", "credit", "amount", "ccy", "dir", "desc"];

// Keyword → category guesses (only used when that category exists for the user).
const RULES = [
  [/borrow|\bloan\b|\blend\b|repay|pay ?back|ខ្ចី|សងវិញ|សងលុយ|កម្ចី/i, "any", TRANSFER_CAT],
  [/salary|payroll|ប្រាក់ខែ/i, "income", "Salary"],
  [/bonus/i, "income", "Bonus"],
  [/interest|dividend/i, "income", "Investment"],
  [/grab ?food|foodpanda|nham ?24|e-?gets|restaurant|cafe|caf[eé]|coffee|starbucks|amazon caf|brown|tube|kfc|burger|pizza|noodle|bbq|bakery|food|lunch|dinner|breakfast|ម្ហូប|កាហ្វេ/i, "expense", "Food & Dining"],
  [/grab|passapp|pass app|tada|taxi|tuk|fuel|petrol|gas station|caltex|\bptt\b|\btela\b|\btotal\b|sokimex|petronas|lim long|\bcamko\b|parking|\bbus\b|សាំង/i, "expense", "Transport"],
  [/\bedc\b|electric|ppwsa|water|internet|metfone|smart|cellcard|ezecom|opennet|sinet|top ?up|bill ?pay|ភ្លើង|ទឹក/i, "expense", "Utilities"],
  [/pharma|hospital|clinic|dental|medic|health|ពេទ្យ|ឱសថ/i, "expense", "Health"],
  [/cinema|legend|major|netflix|spotify|youtube|game|karaoke/i, "expense", "Entertainment"],
  [/\brent\b|landlord|ជួលផ្ទះ/i, "expense", "Rent"],
  [/saving|fixed deposit|term deposit/i, "expense", "Savings"],
  [/aeon|lucky|chip ?mong|makro|supermarket|mart\b|shop|mall|store|lazada|shopee|taobao|alibaba/i, "expense", "Shopping"],
];

const MON = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
const pad2 = n => String(n).padStart(2, "0");
const norm = s => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
const clean = s => String(s ?? "").replace(/\s+/g, " ").trim();
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── Value parsing ──
function parseTime(s) {
  const m = /(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])?\.?m?\.?/i.exec(s);
  if (!m) return null;
  let h = +m[1];
  const ap = m[3] && m[3].toLowerCase();
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  if (h > 23 || +m[2] > 59) return null;
  return `${pad2(h)}:${m[2]}`;
}
function mkDate(y, m, d, time) {
  y = +y; m = +m; d = +d;
  if (y < 100) y += 2000;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1990 && y <= 2100)) return null;
  return { date: `${y}-${pad2(m)}-${pad2(d)}`, time };
}
// Returns { date: "yyyy-mm-dd", time: "HH:MM"|null } or null.
// `order` resolves 05/10/2026: "dmy" (Cambodia default) or "mdy".
function parseDate(v, order = "dmy") {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (typeof v === "number" || /^\d{5}(\.\d+)?$/.test(s)) {           // Excel serial date
    const n = +v;
    if (n < 30000 || n > 80000) return null;
    const dt = new Date(Math.round((n - 25569) * 86400000));
    return mkDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(),
      n % 1 ? `${pad2(dt.getUTCHours())}:${pad2(dt.getUTCMinutes())}` : null);
  }
  const time = parseTime(s);
  let m;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s))) return mkDate(m[1], m[2], m[3], time);
  if ((m = /^(\d{1,2})[-/.\s]+([A-Za-z]{3,9})\.?[-/.\s,]+(\d{2,4})/.exec(s)) && MON[m[2].slice(0,3).toLowerCase()])
    return mkDate(m[3], MON[m[2].slice(0,3).toLowerCase()], m[1], time);
  if ((m = /^([A-Za-z]{3,9})\.?[-/.\s]+(\d{1,2})(?:st|nd|rd|th)?,?[-/.\s]+(\d{2,4})/.exec(s)) && MON[m[1].slice(0,3).toLowerCase()])
    return mkDate(m[3], MON[m[1].slice(0,3).toLowerCase()], m[2], time);
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s)))
    return order === "mdy" ? mkDate(m[3], m[1], m[2], time) : mkDate(m[3], m[2], m[1], time);
  return null;
}
// Decide day/month order from values like 13/02/2026 vs 02/13/2026.
function detectDateOrder(values) {
  let dmy = 0, mdy = 0;
  values.forEach(v => {
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/.exec(String(v ?? "").trim());
    if (!m) return;
    if (+m[1] > 12) dmy++;
    if (+m[2] > 12) mdy++;
  });
  return mdy > dmy ? "mdy" : "dmy";
}
// "1,234.50" / "(12.00)" / "-5.00" / "12.00 DR" / "USD 3.50" → signed number, or null.
function parseAmount(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!/\d/.test(s)) return null;
  const neg = (/\(/.test(s) && /\)/.test(s)) || /-\s*[\d.,]/.test(s) || /[\d.]\s*-$/.test(s) || /\bDR\.?$/i.test(s);
  let num = s.replace(/[^\d.,]/g, "");
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(num)) num = num.replace(/\./g, "").replace(",", ".");
  else num = num.replace(/,/g, "");
  const n = parseFloat(num);
  if (isNaN(n)) return null;
  return neg ? -n : n;
}
const isMoney = s => /^[-+(]?\s*(USD|KHR|\$|៛)?\s*[-+]?[\d,]+\.\d{1,2}\)?\s*(USD|KHR|CR|DR|៛)?$/i.test(clean(s));
const ccyOf = s => /KHR|៛|riel/i.test(String(s ?? "")) ? "KHR" : /USD|\$/i.test(String(s ?? "")) ? "USD" : null;
function dirOf(s) {
  const v = norm(s);
  if (/^(dr|debit|d|out|withdraw|withdrawal|money out|payment|paid)$/.test(v)) return "expense";
  if (/^(cr|credit|c|in|deposit|money in|received)$/.test(v)) return "income";
  return null;
}

// ── Column detection ──
function keyScore(h, key) {
  if (h === key) return 3;
  return new RegExp(`(^| )${escRe(key)}( |$)`, "u").test(h) ? 2 : 0;
}
function detectColumns(cells) {
  const hs = cells.map(norm);
  const used = new Set();
  const m = { date: -1, debit: -1, credit: -1, amount: -1, ccy: -1, dir: -1, desc: -1 };
  for (const f of FIELD_ORDER) {
    let best = -1, bestScore = 0;
    hs.forEach((h, i) => {
      if (used.has(i) || !h || h.length > 40) return;
      if (f !== "desc" && /balance|សមតុល្យ/.test(h)) return;
      FIELD_KEYS[f].forEach((k, ki) => {
        const sc = keyScore(h, k);
        if (sc && sc * 100 - ki > bestScore) { bestScore = sc * 100 - ki; best = i; }
      });
    });
    if (best >= 0) { m[f] = best; used.add(best); }
  }
  return m;
}
const validHeader = m => m.date >= 0 && (m.debit >= 0 || m.credit >= 0 || m.amount >= 0);

function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const m = detectColumns(rows[i]);
    if (validHeader(m)) return { headerIdx: i, mapping: m };
  }
  return null;
}
// No header row (e.g. Wing's Excel export): guess from the cell contents instead.
const blank = v => v == null || /^[\s-]*$/.test(String(v));
function guessByContent(rows) {
  const width = Math.max(...rows.map(r => r.length));
  const sample = rows.slice(0, 300);
  const m = { date: -1, debit: -1, credit: -1, amount: -1, ccy: -1, dir: -1, desc: -1 };
  let best = 0;
  for (let c = 0; c < width; c++) {
    const n = sample.filter(r => parseDate(r[c])).length;
    if (n > best) { best = n; m.date = c; }
  }
  if (m.date < 0) return null;
  // Only look at transaction rows — summary blocks above/below would skew the stats
  const data = sample.filter(r => parseDate(r[m.date]));
  const money = c => data.filter(r => typeof r[c] === "number" || isMoney(r[c])).length;
  const filled = c => data.filter(r => !blank(r[c])).length;
  const moneyCols = [];
  for (let c = 0; c < width; c++) if (c !== m.date && filled(c) && money(c) >= filled(c) * 0.9) moneyCols.push(c);
  if (!moneyCols.length) return null;
  // Two money columns that are never both filled = money-out / money-in pair
  let pair = null;
  for (let i = 0; i < moneyCols.length && !pair; i++)
    for (let j = i + 1; j < moneyCols.length && !pair; j++) {
      const [a, b] = [moneyCols[i], moneyCols[j]];
      const both = data.filter(r => !blank(r[a]) && !blank(r[b]) && parseAmount(r[a]) && parseAmount(r[b])).length;
      if (filled(a) && filled(b) && both <= data.length * 0.05) pair = [a, b];
    }
  if (pair) {
    const negs = c => data.filter(r => (parseAmount(r[c]) || 0) < 0).length;
    [m.debit, m.credit] = negs(pair[1]) > negs(pair[0]) ? [pair[1], pair[0]] : pair;
  } else m.amount = moneyCols[0];
  let bestText = 0;
  for (let c = 0; c < width; c++) {
    if (c === m.date || moneyCols.includes(c)) continue;
    const avg = data.reduce((s, r) => s + (/[a-zក-៿]{3}/i.test(String(r[c] ?? "")) ? String(r[c]).length : 0), 0) / (data.length || 1);
    if (avg > bestText) { bestText = avg; m.desc = c; }
  }
  return { headerIdx: -1, mapping: m };
}

// Account holder name from the statement's info block ("Account name : CHOU RAKSA").
function findHolderName(rows) {
  for (const r of rows.slice(0, 30)) {
    const i = r.findIndex(c => /^account (holder )?name\b/i.test(clean(c)));
    if (i < 0) continue;
    const inline = clean(r[i]).replace(/^account (holder )?name\s*:?\s*/i, "");
    const val = inline || r.slice(i + 1).map(c => clean(c).replace(/^:\s*/, "")).find(Boolean);
    if (val) return val;
  }
  return "";
}

// Shorten ABA-style descriptions: drop refs, timestamps and codes; decode the remark.
function cleanNote(s) {
  let remark = "";
  s = clean(s).replace(/\bREMARK\b:?(.*)$/i, (_, rest) => {
    const m = /(NON)?UNICODE-(\S*)/i.exec(rest);
    if (m && m[2]) {
      if (m[1]) remark = m[2];
      else try { remark = new TextDecoder().decode(Uint8Array.from(atob(m[2]), c => c.charCodeAt(0))); } catch (_) {}
    }
    return "";
  });
  s = s.replace(/\s+BY [A-Z][A-Z .]+ CARD#.*$/, "")   // card purchase tail: cardholder, card no., auth codes
    .replace(/ BANK .+?(?= ORIGINAL AMOUNT)/, "")
    .replace(/\bON [A-Z][a-z]{2} \d{1,2}, \d{4} \d{1,2}:\d{2} ?[AP]M\b/g, "")
    .replace(/\b(REF|BAKONG|PURCHASE|EXT)#\s*\S+/gi, "")
    .replace(/\bAPV:? ?\d+/gi, "")
    .replace(/\bORIGINAL AMOUNT [\d,.]+ (USD|KHR)\b/gi, "")
    .replace(/\|.*$/, "")
    .replace(/^FUNDS TRANSFERRED TO /i, "Transfer to ")
    .replace(/^FUNDS TRANSFER TO /i, "Transfer to ")
    .replace(/^FUNDS RECEIVED FROM /i, "Received from ")
    .replace(/^PURCHASE AT /i, "Paid ")
    .replace(/^REFUND BY /i, "Refund from ");
  s = clean(s).replace(/[\s:;,.-]+$/, "");
  remark = clean(remark);
  return remark && !s.includes(remark) ? `${s} — ${remark}` : s;
}

// ── File readers → array of rows (array of cells) ──
function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const head = text.split(/\r?\n/).slice(0, 15).join("\n");
  const delim = [",", ";", "\t"].map(d => [d, head.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
      continue;
    }
    if (c === '"') { q = true; continue; }
    if (c === delim) { row.push(cur); cur = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); rows.push(row); row = []; cur = "";
      continue;
    }
    cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.map(r => r.map(c => c.trim())).filter(r => r.some(c => c));
}

async function readExcel(buf) {
  const XLSX = await import("xlsx");
  // raw:false formats dates from their serial numbers — avoids timezone drift.
  const wb = XLSX.read(buf, { type: "array" });
  let best = [];
  wb.SheetNames.forEach(name => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: "", dateNF: "yyyy-mm-dd hh:mm" })
      .map(r => r.map(c => clean(c))).filter(r => r.some(c => c));
    if (rows.length > best.length) best = rows;
  });
  return best;
}

// Text lines of a PDF: [{ page, cells: [{ x0, x1, text }] }]
async function readPdfLines(buf, password) {
  const pdfjs = await import("pdfjs-dist/build/pdf");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.js", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), password }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const { items } = await page.getTextContent();
    const its = items.filter(it => it.str && it.str.trim())
      .map(it => ({ x: it.transform[4], y: it.transform[5], w: it.width, str: it.str }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    const rows = [];
    its.forEach(it => {
      const r = rows.find(r => Math.abs(r.y - it.y) < 3);
      if (r) r.items.push(it); else rows.push({ y: it.y, items: [it] });
    });
    rows.sort((a, b) => b.y - a.y).forEach(r => {
      const cells = [];
      r.items.sort((a, b) => a.x - b.x).forEach(it => {
        const last = cells[cells.length - 1];
        if (last && it.x < last.x1 - 1 && last.text.trim().endsWith(it.str.trim())) return; // text drawn twice (fake bold)
        if (last && it.x - last.x1 < 4) { last.text += (it.x - last.x1 > 1 ? " " : "") + it.str; last.x1 = it.x + it.w; }
        else cells.push({ x0: it.x, x1: it.x + it.w, text: it.str });
      });
      lines.push({ page: p, y: r.y, cells: cells.map(c => ({ ...c, text: clean(c.text) })).filter(c => c.text) });
    });
  }
  return lines.filter(l => l.cells.length);
}

// PDF without a header row (e.g. Wing): each transaction is a block of nearby
// lines around its date. Columns come from clustering the cells' x positions;
// guessByContent() then works out which column is which.
function pdfBlocksToRows(lines) {
  const anchors = lines.map((l, i) => (l.cells.some(c => parseDate(c.text)) ? i : -1)).filter(i => i >= 0);
  if (!anchors.length) return [];
  const blocks = new Map(anchors.map(i => [i, []]));
  lines.forEach(l => {
    let best = -1, bestD = Infinity;
    anchors.forEach(a => {
      const d = Math.abs(lines[a].y - l.y);
      if (lines[a].page === l.page && d < bestD) { bestD = d; best = a; }
    });
    if (best >= 0 && bestD <= 30) blocks.get(best).push(l);
  });
  const xs = [...new Set(lines.flatMap(l => l.cells.map(c => Math.round(c.x0))))].sort((a, b) => a - b);
  const starts = xs.filter((x, i) => i === 0 || x - xs[i - 1] > 15);
  const colOf = x => { let i = 0; while (i + 1 < starts.length && starts[i + 1] <= Math.round(x)) i++; return i; };
  return anchors.map(a => {
    const row = starts.map(() => "");
    blocks.get(a).sort((p, q) => q.y - p.y).forEach(l => l.cells.forEach(c => { const i = colOf(c.x0); row[i] = clean(row[i] + " " + c.text); }));
    return row;
  });
}

// Lay PDF lines out into table rows using the header row's column positions.
function pdfLinesToRows(lines) {
  const hIdx = lines.findIndex(l => validHeader(detectColumns(l.cells.map(c => c.text))));
  if (hIdx < 0) return pdfBlocksToRows(lines);
  const header = lines[hIdx].cells;
  const headerKey = header.map(c => c.text).join("|");
  const mapping = detectColumns(header.map(c => c.text));
  const colOf = cell => {
    let best = 0, bestD = Infinity;
    header.forEach((h, i) => {
      const d = Math.min(Math.abs((cell.x0 + cell.x1) / 2 - (h.x0 + h.x1) / 2), Math.abs(cell.x0 - h.x0), Math.abs(cell.x1 - h.x1));
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  };
  const rows = [header.map(c => c.text)];
  let prev = null, prevPage = 0;
  lines.slice(hIdx + 1).forEach(l => {
    if (l.page !== prevPage) { prev = null; prevPage = l.page; }
    if (l.cells.map(c => c.text).join("|") === headerKey) { prev = null; return; } // repeated header on a new page
    const row = header.map(() => "");
    l.cells.forEach(c => { const i = colOf(c); row[i] = clean(row[i] + " " + c.text); });
    if (parseDate(row[mapping.date])) { rows.push(row); prev = row; return; }
    // Wrapped description line → append to the row above
    const moneyCols = [mapping.debit, mapping.credit, mapping.amount].filter(i => i >= 0);
    if (prev && mapping.desc >= 0 && !moneyCols.some(i => row[i])) {
      const extra = clean(l.cells.filter(c => colOf(c) === mapping.desc).map(c => c.text).join(" "));
      if (extra) prev[mapping.desc] = clean(prev[mapping.desc] + " " + extra);
    }
  });
  return rows;
}

// ── Turn table rows into reviewable transactions ──
function buildItems(rows, headerIdx, m, opts) {
  const data = rows.slice(headerIdx + 1);
  const order = detectDateOrder(data.map(r => r[m.date]));
  const out = [];
  data.forEach((r, i) => {
    const d = parseDate(r[m.date], order);
    if (!d) return;
    const raw = m.desc >= 0 ? clean(r[m.desc]) : "";
    const desc = cleanNote(raw);
    if (!d.time) d.time = parseTime(raw);   // ABA puts the time inside the description
    const moneyCells = [m.debit, m.credit, m.amount].filter(c => c >= 0).map(c => r[c]);
    const ccy = (m.ccy >= 0 && ccyOf(r[m.ccy])) || moneyCells.map(ccyOf).find(Boolean) || opts.currency;
    const entries = [];
    if (m.debit >= 0 || m.credit >= 0) {
      const cv = Math.abs(parseAmount(m.credit >= 0 ? r[m.credit] : "") || 0);
      const dv = Math.abs(parseAmount(m.debit >= 0 ? r[m.debit] : "") || 0);
      if (cv) entries.push(["income", cv]);
      if (dv) entries.push(["expense", dv]);
    } else if (m.amount >= 0) {
      const v = parseAmount(r[m.amount]);
      if (!v) return;
      let type = v < 0 ? "expense" : "income";
      const dir = m.dir >= 0 ? dirOf(r[m.dir]) : null;
      if (dir) type = dir;
      else if (opts.flip) type = type === "income" ? "expense" : "income";
      entries.push([type, Math.abs(v)]);
    }
    entries.forEach(([type, orig]) => {
      const amount = Math.round((ccy === "KHR" ? orig / KHR_RATE : orig) * 100) / 100;
      if (amount <= 0) return;
      out.push({ key: `${i}-${type}`, date: d.date, time: d.time, type, orig, ccy, amount,
        note: (opts.prefix ? `${opts.prefix} · ` : "") + desc });
    });
  });
  return out;
}

const learnKey = (note, type) => `${type}|${norm(String(note || "").replace(/^(ABA|ACLEDA|Wing) · /, "")).replace(/\d+/g, "").trim().slice(0, 40)}`;

function guessCategory(note, type, cats, learned) {
  const list = cats[type] || [];
  const hist = learned.get(learnKey(note, type));
  if (hist && list.includes(hist)) return hist;
  for (const [re, t, cat] of RULES) {
    if ((t !== type && t !== "any") || !re.test(note)) continue;
    const hit = list.find(c => c.toLowerCase() === cat.toLowerCase()) || list.find(c => c.toLowerCase().includes(cat.split(" ")[0].toLowerCase()));
    if (hit) return hit;
  }
  return list.find(c => /^other/i.test(c)) || list[0] || "";
}

// Every word of the user's name appears → a transfer between their own accounts.
// Joint accounts ("CHOU RAKSA AND BUT SREYDY") are shared money, not a self-transfer.
function isOwnTransfer(note, ownName) {
  const tokens = norm(ownName).split(" ").filter(t => t.length > 1);
  if (!tokens.length) return false;
  const words = norm(note).split(" ");
  if (!tokens.every(t => words.includes(t))) return false;
  return !/\b(AND|&)\b/.test(String(note).replace(/^\w+ · /, "").replace(/ — .*$/, ""));
}

function annotate(items, cats, transactions, ownName) {
  const learned = new Map();
  [...transactions].reverse().forEach(t => learned.set(learnKey(t.note, t.type), t.category)); // newest wins
  // Same day + type + amount, and the same note or the same minute → certainly
  // already recorded ("duplicate", can't be imported). Same day + type + amount
  // only → "possible" (unticked, but the user may still import it).
  const byNote = new Map(), byTime = new Map(), loose = new Map();
  const bump = (map, k) => map.set(k, (map.get(k) || 0) + 1);
  const hhmm = t => { if (!t.created_at) return ""; const c = new Date(t.created_at); return `${pad2(c.getHours())}:${pad2(c.getMinutes())}`; };
  transactions.forEach(t => {
    const k = `${t.date}|${t.type}|${Number(t.amount).toFixed(2)}`;
    bump(byNote, `${k}|${t.note || ""}`);
    if (hhmm(t) && hhmm(t) !== "00:00") bump(byTime, `${k}|${hhmm(t)}`);
    bump(loose, k);
  });
  const take = (map, k) => { const n = map.get(k) || 0; if (n) map.set(k, n - 1); return n > 0; };
  return items.map(it => {
    const k = `${it.date}|${it.type}|${it.amount.toFixed(2)}`;
    const dup = (take(byNote, `${k}|${it.note}`) || (it.time && take(byTime, `${k}|${it.time}`))) ? "duplicate"
      : take(loose, k) ? "possible" : null;
    if (dup === "duplicate") take(loose, k);
    const own = isOwnTransfer(it.note, ownName);
    return { ...it, category: guessCategory(it.note, it.type, cats, learned), dup, own, checked: !dup && !own };
  });
}

const fmtUSD = n => "$" + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
function toTimestamp(date, time) {
  return new Date(`${date}T${/^\d{2}:\d{2}$/.test(time || "") ? time : "00:00"}`).toISOString();
}

// ── Modal ──
export default function BankImportModal({ session, cats, transactions, onImported, onClose, showToast }) {
  const [bank, setBank]         = useState("auto");
  const [fileName, setFileName] = useState("");
  const [table, setTable]       = useState(null);   // { rows, headerIdx, detectedBank }
  const [mapping, setMapping]   = useState(null);
  const [currency, setCurrency] = useState("USD");
  const [flip, setFlip]         = useState(false);
  const [items, setItems]       = useState([]);
  const [showCols, setShowCols] = useState(false);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState("");
  const [warn, setWarn]         = useState("");
  const [pdfLock, setPdfLock]   = useState(null);   // { buf, wrong } when the PDF needs a password
  const [password, setPassword] = useState("");
  const [ownName, setOwnName]   = useState(session.user.user_metadata?.username || "");
  const [range, setRange]       = useState({ from: "", to: "" }); // only rows in this date range are imported

  const bankDef = id => BANKS.find(b => b.id === id) || BANKS[0];

  function rebuild(t, m, opts) {
    const prefix = bankDef(opts.bank === "auto" ? (t.detectedBank || "other") : opts.bank).short;
    const built = buildItems(t.rows, t.headerIdx, m, { currency: opts.currency, flip: opts.flip, prefix });
    setItems(annotate(built, cats, transactions, opts.ownName));
    if (opts.resetRange) {
      const ds = built.map(it => it.date).sort();
      setRange({ from: ds[0] || "", to: ds[ds.length - 1] || "" });
    }
    return built.length;
  }

  // `info` = every text row of the file (for PDFs the table rows lose the account-info block)
  function loadRows(rows, name, info = null) {
    if (!rows.length) { setError("The file is empty or has no readable text."); return; }
    const found = findHeader(rows) || guessByContent(rows);
    if (!found) { setError("Couldn't find a date and amount column in this file. Try the CSV or Excel export from your bank."); return; }
    const flat = rs => rs.map(r => r.map(clean).filter(Boolean).join(" ")).join(" ");
    const all = info || rows;
    const pre = flat(info ? info.slice(0, 30) : rows.slice(0, Math.max(found.headerIdx + 1, 14)));
    const detect = text => (BANKS.find(b => b.match && b.match.test(text)) || {}).id;
    const detectedBank = detect(pre) || detect(flat(all.slice(-6)) + " " + name) || "other";
    const ccyLabel = /currency\s*:?\s*(KHR|USD)/i.exec(pre);
    const cur = ccyLabel ? ccyLabel[1].toUpperCase() : (ccyOf(pre) === "KHR" && !/\bUSD\b|\$/.test(pre) ? "KHR" : "USD");
    const holder = findHolderName(all) || ownName;
    const t = { rows, headerIdx: found.headerIdx, detectedBank };
    setTable(t); setMapping(found.mapping); setCurrency(cur); setFlip(false); setOwnName(holder);
    const n = rebuild(t, found.mapping, { bank, currency: cur, flip: false, ownName: holder, resetRange: true });
    // ABA's Excel export silently stops at 60 transactions; its PDF has them all
    const txRows = rows.slice(found.headerIdx + 1).filter(r => parseDate(r[found.mapping.date]));
    if (detectedBank === "aba" && !/\.pdf$/i.test(name) && txRows.length >= 60) {
      const last = parseDate(txRows[txRows.length - 1][found.mapping.date]);
      setWarn(`ABA's Excel export stops at 60 transactions — this file ends on ${last ? last.date : "an early date"} and is probably missing the rest of the period. Import the PDF statement for the same period to get everything (rows you already have will be skipped).`);
    }
    if (!n) {
      const hasRows = rows.slice(found.headerIdx + 1).some(r => parseDate(r[found.mapping.date]));
      if (hasRows) { setShowCols(true); setError("No transactions recognised — check the column settings below."); }
      else setError("This statement has no transactions in it. Try a different date range in your bank app.");
    }
  }

  async function openPdf(buf, name, pw) {
    try {
      const lines = await readPdfLines(buf, pw);
      setPdfLock(null); setPassword("");
      if (!lines.length) { setError("This PDF has no text (it may be a scanned image). Please download the Excel or CSV statement instead."); return; }
      loadRows(pdfLinesToRows(lines).map(r => r.map(clean)), name, lines.map(l => l.cells.map(c => c.text)));
    } catch (e) {
      if (e && e.name === "PasswordException") { setPdfLock({ buf, name, wrong: !!pw }); return; }
      setError("Couldn't read this PDF.");
    }
  }

  async function handleFile(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setError(""); setWarn(""); setTable(null); setItems([]); setPdfLock(null); setFileName(file.name); setBusy(true);
    try {
      const ext = file.name.split(".").pop().toLowerCase();
      const buf = await file.arrayBuffer();
      if (ext === "pdf") await openPdf(buf, file.name);
      else if (ext === "xlsx" || ext === "xls") loadRows(await readExcel(buf), file.name);
      else loadRows(parseCSV(new TextDecoder("utf-8").decode(buf)), file.name);
    } catch (_) {
      setError("Couldn't read this file.");
    }
    setBusy(false);
  }

  function changeSetting(next) {
    const m = next.mapping || mapping;
    const opts = { bank: next.bank ?? bank, currency: next.currency ?? currency, flip: next.flip ?? flip, ownName: next.ownName ?? ownName };
    if (next.mapping) setMapping(m);
    if (next.ownName != null) setOwnName(next.ownName);
    if (next.bank != null) setBank(next.bank);
    if (next.currency) setCurrency(next.currency);
    if (next.flip != null) setFlip(next.flip);
    setError("");
    if (table) rebuild(table, m, { ...opts, resetRange: !!next.mapping });
  }

  const setItem = (key, patch) => setItems(p => p.map(it => it.key === key ? { ...it, ...patch } : it));
  const inRange = it => (!range.from || it.date >= range.from) && (!range.to || it.date <= range.to);
  const shown = items.filter(inRange);
  const selected = shown.filter(it => it.checked && it.dup !== "duplicate");
  const inc = selected.filter(it => it.type === "income").reduce((s, it) => s + it.amount, 0);
  const exp = selected.filter(it => it.type === "expense").reduce((s, it) => s + it.amount, 0);
  const dupCount = shown.filter(it => it.dup === "duplicate").length;
  const maybeCount = shown.filter(it => it.dup === "possible").length;
  const ownCount = shown.filter(it => it.own && !it.dup).length;
  const allDates = items.map(it => it.date).sort();
  const months = [...new Set(allDates.map(d => d.slice(0, 7)))];
  const MON_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthLabel = ym => `${MON_NAMES[+ym.slice(5, 7) - 1]} ${ym.slice(2, 4)}`;
  const lastDay = ym => `${ym}-${pad2(new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate())}`;
  const selectShown = checked => setItems(p => p.map(it => inRange(it) && it.dup !== "duplicate" ? { ...it, checked } : it));

  async function handleImport() {
    if (!selected.length) return;
    if (selected.some(it => !it.category)) { setError("Every selected row needs a category."); return; }
    setBusy(true); setError("");
    // Re-check against the database right before saving (e.g. imported meanwhile on another device)
    const ds = selected.map(it => it.date).sort();
    const { data: fresh, error: fetchErr } = await supabase.from("transactions").select("date,type,amount,note,created_at")
      .eq("user_id", session.user.id).gte("date", ds[0]).lte("date", ds[ds.length - 1]);
    if (fetchErr) { setBusy(false); setError("Couldn't check for duplicates — please try again."); return; }
    const recheck = annotate(selected, cats, fresh || [], "");
    const toSave = selected.filter((_, i) => recheck[i].dup !== "duplicate");
    const skipped = selected.length - toSave.length;
    if (!toSave.length) { setBusy(false); setError("All selected transactions are already in your records."); return; }
    const payload = toSave.map(it => ({
      user_id: session.user.id, type: it.type, category: it.category, amount: it.amount,
      note: it.note.slice(0, 250), date: it.date, created_at: toTimestamp(it.date, it.time),
    }));
    const saved = [];
    for (let i = 0; i < payload.length; i += 500) {
      const { data, error } = await supabase.from("transactions").insert(payload.slice(i, i + 500)).select();
      if (error) {
        setBusy(false);
        if (saved.length) onImported(saved);
        setError(saved.length ? `Saved ${saved.length}, then failed. Re-open the file to finish (saved rows will show as duplicates).` : "Import failed — please try again.");
        return;
      }
      saved.push(...data);
    }
    setBusy(false);
    onImported(saved);
    showToast(`Imported ${saved.length} transactions ✓${skipped ? ` · ${skipped} duplicates skipped` : ""}`);
    onClose();
  }

  const header = table && table.headerIdx >= 0 ? table.rows[table.headerIdx] : null;
  const colCount = table ? Math.max(...table.rows.slice(0, 50).map(r => r.length)) : 0;
  const colLabel = i => (header && header[i]) ? header[i] : `Column ${i + 1}`;
  const colSelect = (field, label) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <label style={{ fontSize: 11, color: "#a7a9be", paddingLeft: 2 }}>{label}</label>
      <select className="input" value={mapping[field]} onChange={e => changeSetting({ mapping: { ...mapping, [field]: +e.target.value } })}>
        <option value={-1}>— none —</option>
        {Array.from({ length: colCount }, (_, i) => <option key={i} value={i}>{colLabel(i)}</option>)}
      </select>
    </div>
  );

  return (
    <div className="overlay">
      <div className="modal" style={{ maxWidth: 760 }}>
        <div style={{ fontFamily: "Tahoma,sans-serif", fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Import Bank Statement</div>
        <div style={{ fontSize: 11, color: "#a7a9be", marginBottom: 18 }}>ABA, ACLEDA, Wing or any bank · PDF, Excel or CSV · nothing is saved until you confirm</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <label style={{ fontSize: 11, color: "#a7a9be", paddingLeft: 2 }}>Bank</label>
            <select className="input" value={bank} onChange={e => changeSetting({ bank: e.target.value })}>
              {BANKS.map(b => <option key={b.id} value={b.id}>{b.id === "auto" && table ? `Auto (${bankDef(table.detectedBank).label})` : b.label}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <label style={{ fontSize: 11, color: "#a7a9be", paddingLeft: 2 }}>Statement file</label>
            <label className="btn btn-primary" style={{ textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: busy ? 0.6 : 1 }}>
              {busy ? "Reading…" : fileName ? "Change file" : "Choose file"}
              <input type="file" accept=".pdf,.xlsx,.xls,.csv,.txt" style={{ display: "none" }} onChange={handleFile} disabled={busy} />
            </label>
          </div>
        </div>
        {fileName && <div style={{ fontSize: 11, color: "#a7a9be", marginBottom: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📄 {fileName}</div>}

        {pdfLock && (
          <div style={{ background: "#12111f", border: "1px solid #2e2d3d", borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 12, marginBottom: 8 }}>{pdfLock.wrong ? "Wrong password — try again." : "This PDF is password-protected."}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="input" type="password" placeholder="PDF password" value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && openPdf(pdfLock.buf, pdfLock.name, password)} />
              <button className="btn btn-primary" style={{ flexShrink: 0 }} onClick={() => openPdf(pdfLock.buf, pdfLock.name, password)}>Unlock</button>
            </div>
          </div>
        )}

        {error && <div style={{ color: "#f25f4c", fontSize: 12, marginBottom: 12 }}>{error}</div>}
        {warn && <div style={{ background: "#ff890615", border: "1px solid #ff890640", color: "#ff8906", borderRadius: 10, padding: "10px 12px", fontSize: 12, marginBottom: 12 }}>⚠ {warn}</div>}

        {table && mapping && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                <label style={{ fontSize: 11, color: "#a7a9be", paddingLeft: 2 }}>Account currency</label>
                <select className="input" value={currency} onChange={e => changeSetting({ currency: e.target.value })}>
                  <option value="USD">USD ($)</option>
                  <option value="KHR">KHR (៛ → converted to USD)</option>
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button className="btn btn-ghost" style={{ width: "100%", fontSize: 12 }} onClick={() => setShowCols(v => !v)}>
                  {showCols ? "Hide columns ▲" : "Adjust columns ▼"}
                </button>
              </div>
            </div>

            {showCols && (
              <div style={{ background: "#12111f", border: "1px solid #2e2d3d", borderRadius: 10, padding: 14, marginBottom: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
                  {colSelect("date", "Date")}
                  {colSelect("desc", "Description")}
                  {colSelect("credit", "Money in (credit)")}
                  {colSelect("debit", "Money out (debit)")}
                  {colSelect("amount", "Amount (+/−)")}
                  {colSelect("dir", "DR/CR column")}
                  {colSelect("ccy", "Currency column")}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
                  <label style={{ fontSize: 11, color: "#a7a9be", paddingLeft: 2 }}>Your name — transfers between your own accounts start unticked</label>
                  <input className="input" value={ownName} placeholder="e.g. CHOU RAKSA" onChange={e => changeSetting({ ownName: e.target.value })} />
                </div>
                {mapping.amount >= 0 && mapping.debit < 0 && mapping.credit < 0 && mapping.dir < 0 && (
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginTop: 12, cursor: "pointer" }}>
                    <input type="checkbox" checked={flip} onChange={e => changeSetting({ flip: e.target.checked })} />
                    Positive amounts are money out (expenses)
                  </label>
                )}
              </div>
            )}

            {allDates.length > 0 && (
              <div style={{ background: "#12111f", border: "1px solid #2e2d3d", borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "#a7a9be", marginBottom: 8 }}>Date range to import · statement covers {allDates[0]} → {allDates[allDates.length - 1]}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  <button className={`tab ${range.from === allDates[0] && range.to === allDates[allDates.length - 1] ? "active" : ""}`} style={{ padding: "5px 10px", border: "1px solid #2e2d3d" }}
                    onClick={() => setRange({ from: allDates[0], to: allDates[allDates.length - 1] })}>All</button>
                  {months.map(ym => (
                    <button key={ym} className={`tab ${range.from === `${ym}-01` && range.to === lastDay(ym) ? "active" : ""}`} style={{ padding: "5px 10px", border: "1px solid #2e2d3d" }}
                      onClick={() => setRange({ from: `${ym}-01`, to: lastDay(ym) })}>{monthLabel(ym)}</button>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                    <label style={{ fontSize: 11, color: "#a7a9be", paddingLeft: 2 }}>From</label>
                    <input className="input" type="date" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} style={{ textAlign: "left", width: "100%" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                    <label style={{ fontSize: 11, color: "#a7a9be", paddingLeft: 2 }}>To</label>
                    <input className="input" type="date" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} style={{ textAlign: "left", width: "100%" }} />
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", fontSize: 12, marginBottom: 10, color: "#a7a9be" }}>
              <span>{shown.length} in range · <b style={{ color: "#fffffe" }}>{selected.length} selected</b></span>
              <span style={{ color: "#2cb67d" }}>+{fmtUSD(inc)}</span>
              <span style={{ color: "#f25f4c" }}>−{fmtUSD(exp)}</span>
              {dupCount > 0 && <span style={{ color: "#ff8906" }}>{dupCount} already imported (locked)</span>}
              {maybeCount > 0 && <span style={{ color: "#ff8906" }}>{maybeCount} maybe added already (unticked)</span>}
              {ownCount > 0 && <span style={{ color: "#ff8906" }}>{ownCount} own-account transfers (unticked)</span>}
            </div>

            {shown.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 11 }} onClick={() => selectShown(true)}>Select all</button>
                <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 11 }} onClick={() => selectShown(false)}>Select none</button>
              </div>
            )}

            <div style={{ maxHeight: "45vh", overflowY: "auto", borderTop: "1px solid #2e2d3d" }}>
              {items.length > 0 && !shown.length && <div style={{ textAlign: "center", color: "#a7a9be", padding: "14px 0", fontSize: 12 }}>No transactions in this date range</div>}
              {shown.map(it => (
                <div key={it.key} className="row-item" style={{ flexWrap: "wrap", opacity: it.checked && it.dup !== "duplicate" ? 1 : 0.5 }}>
                  <input type="checkbox" checked={it.checked && it.dup !== "duplicate"} disabled={it.dup === "duplicate"} title={it.dup === "duplicate" ? "Already in your records" : undefined}
                    onChange={e => setItem(it.key, { checked: e.target.checked })} style={{ flexShrink: 0, width: 16, height: 16 }} />
                  <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                    <div style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={it.note}>{it.note || "—"}</div>
                    <div style={{ fontSize: 10, color: "#a7a9be", marginTop: 2 }}>
                      {it.date}{it.time ? ` ${it.time}` : ""}
                      {it.dup && <span style={{ color: "#ff8906", marginLeft: 6 }}>{it.dup === "duplicate" ? "🔒 already imported" : "maybe already added"}</span>}
                      {it.own && !it.dup && <span style={{ color: "#ff8906", marginLeft: 6 }}>own transfer</span>}
                    </div>
                  </div>
                  <button className="btn" title="Switch income / expense"
                    style={{ padding: "4px 8px", fontSize: 11, flexShrink: 0, background: it.type === "income" ? "#2cb67d22" : "#f25f4c22", color: it.type === "income" ? "#2cb67d" : "#f25f4c" }}
                    onClick={() => { const type = it.type === "income" ? "expense" : "income"; setItem(it.key, { type, category: guessCategory(it.note, type, cats, new Map()) }); }}>
                    {it.type === "income" ? "Income" : "Expense"}
                  </button>
                  <select className="input" style={{ flex: "0 1 150px", minWidth: 0, padding: "6px 8px", fontSize: 12 }} value={it.category} onChange={e => setItem(it.key, { category: e.target.value })}>
                    <option value="">Category…</option>
                    {(cats[it.type] || []).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div style={{ textAlign: "right", flexShrink: 0, minWidth: 70 }}>
                    <div style={{ fontFamily: "Tahoma,sans-serif", fontWeight: 700, fontSize: 13, color: it.type === "income" ? "#2cb67d" : "#f25f4c" }}>
                      {it.type === "income" ? "+" : "−"}{fmtUSD(it.amount)}
                    </div>
                    {it.ccy === "KHR" && <div style={{ fontSize: 10, color: "#a7a9be" }}>៛{Math.round(it.orig).toLocaleString()}</div>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button className="btn btn-ghost" style={{ flex: 1, minWidth: 0 }} onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2, minWidth: 0, opacity: selected.length && !busy ? 1 : 0.5 }} onClick={handleImport} disabled={!selected.length || busy}>
            {busy && table ? "Saving…" : `Import ${selected.length || ""} transaction${selected.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
