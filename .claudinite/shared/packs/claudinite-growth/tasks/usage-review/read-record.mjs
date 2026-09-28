// The RECORD half of the review's inputs: the two 28-day windows, built from the
// fold's file.
//
// Read off the file's own `fields` header and nothing else. The fold is another
// pack's task and ships on its own cycle; importing its vocabulary would make this
// review break the day a counter was appended there, which is exactly the day it
// most wants to read one. A counter this code has never heard of arrives named and
// usable; one that was retired reads back as what it meant.
//
// A day inside the window that the file does not carry is not a day of zeroes - it
// is a day the record says nothing about, and every reader in figures.mjs treats a
// map that no day carried as *not recorded*.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const USAGE_PATH = '.claudinite/usage/sessions-and-elements.json';
// Where the fold wrote it before `.claudinite/usage/`, read until the fold has moved it.
// @legacy-tolerance advisory:legacy-shape-in-use retire:#2323
export const LEGACY_USAGE_PATH = '.claudinite/local/usage.GENERATED.json';
export const WINDOW_DAYS = 28;

// One tuple → named counters, against the vocabulary the FILE declared.
function decodeCounters(tuple, fields) {
  const row = {};
  (fields ?? []).forEach((f, i) => {
    const n = Array.isArray(tuple) ? tuple[i] : undefined;
    if (typeof n === 'number') row[f] = n;
  });
  return row;
}

// One row → named counters plus its sub-maps. Generic over the header: a key the
// file declares a vocabulary for is a counter group and is expanded; anything else
// is a bare per-name map and passes through as it stands.
export function decodeRow(row, totalsFields, fields = {}) {
  const out = { ...decodeCounters(row?.totals, totalsFields) };
  for (const [key, value] of Object.entries(row ?? {})) {
    if (key === 'totals') continue;
    const vocab = fields[key];
    out[key] = vocab
      ? Object.fromEntries(Object.entries(value ?? {}).map(([k, t]) => [k, decodeCounters(t, vocab)]))
      : value;
  }
  return out;
}

export function readUsageFile(root) {
  for (const path of [USAGE_PATH, LEGACY_USAGE_PATH]) {
    try { return JSON.parse(readFileSync(join(root, path), 'utf8')); } catch { /* not at this path */ }
  }
  return null;
}

const iso = (d) => d.toISOString().slice(0, 10);
export function dayBefore(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return iso(d);
}

// The dates a window covers, oldest first. The window ENDS on the day before today:
// today's capture files are still arriving, so a figure including it would read a
// morning as a quiet day.
export function windowDates(today, offset = 0) {
  const end = dayBefore(today, 1 + offset * WINDOW_DAYS);
  return Array.from({ length: WINDOW_DAYS }, (_, i) => dayBefore(end, WINDOW_DAYS - 1 - i));
}

// A window: the decoded day rows the file carries for those dates, plus the bounds a
// reader needs to judge the figures against.
//
// The day tier alone, deliberately. The week rows are the same days summed, and the
// fold only freezes a week once its days have aged out of the raw window - so a
// window built from both would double-count its overlap. What that costs is reach:
// the review sees as far back as the fold's day retention, and says so in `days`,
// which is how a reader tells a quiet window from a short one.
export function buildWindow(file, today, offset = 0) {
  const dates = windowDates(today, offset);
  const fields = file?.fields ?? {};
  const rows = file?.days ?? {};
  const days = dates.filter((d) => rows[d]).map((d) => decodeRow(rows[d], fields.day, fields));
  return {
    from: dates[0],
    to: dates.at(-1),
    days,
    daysCovered: days.length,
    // Whether the window carries the check-findings counter at all - the one figure
    // whose absence genuinely means "nothing fired" rather than "not recorded", since
    // the check counters cover every session the fold saw.
    carriesCheckFindings: days.some((d) => d.checkFindings && typeof d.checkFindings === 'object'),
  };
}

// Both windows, and the fold's own watermark - which is what the precondition
// compares to decide whether there is anything new to review.
export function readWindows(root, today) {
  const file = readUsageFile(root);
  if (!file) return null;
  return {
    generated: file.generated ?? null,
    foldedThrough: file.foldedThrough ?? null,
    window: buildWindow(file, today, 0),
    previous: buildWindow(file, today, 1),
  };
}
