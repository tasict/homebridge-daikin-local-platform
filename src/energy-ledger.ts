import fs from 'fs';
import path from 'path';
import { EnergyHistory } from './daikin-device';

interface LedgerData {
  months: Record<string, number>; // 'YYYY-MM' -> Wh
  days: Record<string, number>;   // 'YYYY-MM-DD' -> Wh
}

// Skip updates this close to local midnight: the unit and the host may not
// agree on which day the last array slot belongs to yet.
const MIDNIGHT_GUARD_MINUTES = 10;
// Days older than this have left the unit's 7-day window for good.
const FOLD_AFTER_DAYS = 8;

const pad = (n: number) => String(n).padStart(2, '0');
// Dates below are "wall clock as UTC": shifted by the unit's UTC offset and
// read with getUTC*, so day/month boundaries follow the unit, not the host.
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
const dayKey = (d: Date) => `${monthKey(d)}-${pad(d.getUTCDate())}`;
const daysBefore = (d: Date, days: number) => new Date(d.getTime() - days * 86400000);

// Monotonic lifetime energy total for Matter's cumulativeEnergyImported.
// The unit only reports rolling windows (7 days at 100 Wh, this/previous year
// by month at 1 kWh) that get overwritten as time moves on, so every reading
// is merged into per-month and per-day tables where a key only ever grows.
// A month counts as the larger of its monthly figure and the sum of its days,
// so the total never steps back when the coarse monthly value takes over.
export class EnergyLedger {

  private data: LedgerData = { months: {}, days: {} };

  constructor(private readonly file?: string) {
    if (!file) {
      return;
    }
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      this.data = { months: saved.months ?? {}, days: saved.days ?? {} };
    }
    catch {
      // First run or unreadable file: start from what the unit reports.
    }
  }

  // Merge one reading; returns true when the total grew.
  public update(history: EnergyHistory, now: Date = new Date()): boolean {

    const offset = history.utcOffsetMinutes ?? -now.getTimezoneOffset();
    const local = new Date(now.getTime() + offset * 60000);
    const year = local.getUTCFullYear();
    const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
    if (minutes < MIDNIGHT_GUARD_MINUTES || minutes > 24 * 60 - MIDNIGHT_GUARD_MINUTES) {
      return false;
    }

    const before = this.cumulativeWh();
    const grow = (table: Record<string, number>, key: string, wh: number) => {
      if (Number.isFinite(wh) && wh > (table[key] ?? 0)) {
        table[key] = wh;
      }
    };

    history.dailyWh.forEach((wh, i) => {
      grow(this.data.days, dayKey(daysBefore(local, history.dailyWh.length - 1 - i)), wh);
    });
    history.thisYearKWh.forEach((kwh, i) => grow(this.data.months, `${year}-${pad(i + 1)}`, kwh * 1000));
    history.previousYearKWh.forEach((kwh, i) => grow(this.data.months, `${year - 1}-${pad(i + 1)}`, kwh * 1000));

    // Fold the days of months that are complete and out of the window.
    const foldBefore = monthKey(daysBefore(local, FOLD_AFTER_DAYS));
    for (const month of Object.keys(this.daySums())) {
      if (month < foldBefore) {
        grow(this.data.months, month, this.daySums()[month]);
        for (const day of Object.keys(this.data.days).filter((d) => d.startsWith(month))) {
          delete this.data.days[day];
        }
      }
    }

    const grew = this.cumulativeWh() > before;
    if (grew) {
      this.save();
    }
    return grew;
  }

  public cumulativeWh(): number {
    const sums = this.daySums();
    const months = new Set([...Object.keys(this.data.months), ...Object.keys(sums)]);
    let total = 0;
    for (const month of months) {
      total += Math.max(this.data.months[month] ?? 0, sums[month] ?? 0);
    }
    return total;
  }

  private daySums(): Record<string, number> {
    const sums: Record<string, number> = {};
    for (const [day, wh] of Object.entries(this.data.days)) {
      sums[day.substring(0, 7)] = (sums[day.substring(0, 7)] ?? 0) + wh;
    }
    return sums;
  }

  private save() {
    if (!this.file) {
      return;
    }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data));
    }
    catch {
      // Persistence is best effort; the next reading rebuilds from the unit.
    }
  }
}
