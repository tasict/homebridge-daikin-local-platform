// Self-check for EnergyLedger: `npx ts-node src/energy-ledger-check.ts`.
import assert from 'assert';
import { EnergyLedger } from './energy-ledger';

const ledger = new EnergyLedger();
const at = (s: string) => new Date(s + '+08:00');

// 2026-09-23 reading from a real unit (datas ends with today).
assert.ok(ledger.update({
  todayRuntimeMinutes: 0,
  dailyWh: [2600, 1600, 10000, 6900, 4000, 5000, 0],
  thisYearKWh: [33, 19, 10, 24, 92, 115, 346, 266, 82],
  previousYearKWh: [33, 22, 14, 21, 74, 162, 163, 350, 309, 215, 31, 15],
}, at('2026-09-23T12:00:00')));
const sep = ledger.cumulativeWh();
assert.strictEqual(sep, (1409 + 987) * 1000); // Sept: max(82 kWh, 29.1 kWh of days)

// Midnight guard: ignored.
assert.ok(!ledger.update({ todayRuntimeMinutes: 0, dailyWh: [99999], thisYearKWh: [], previousYearKWh: [] , utcOffsetMinutes: 480 }, at('2026-09-24T00:03:00')));

// Month end: 30.9.: days add up above the coarse monthly value, then the
// monthly value (rounded down) takes over in October -> must not decrease.
let total = sep;
const days = [5000, 0, 0, 0, 0, 0, 0];
for (let d = 24; d <= 30; d++) {
  days.shift();
  days.push(60000);
  ledger.update({ todayRuntimeMinutes: 0, dailyWh: [...days], thisYearKWh: [33, 19, 10, 24, 92, 115, 346, 266, 82], previousYearKWh: [] , utcOffsetMinutes: 480 }, at(`2026-09-${d}T12:00:00`));
  assert.ok(ledger.cumulativeWh() >= total);
  total = ledger.cumulativeWh();
}
assert.ok(total > sep);
for (let d = 1; d <= 12; d++) {
  days.shift();
  days.push(100);
  ledger.update({ todayRuntimeMinutes: 0, dailyWh: [...days], thisYearKWh: [33, 19, 10, 24, 92, 115, 346, 266, 400, 1], previousYearKWh: [] , utcOffsetMinutes: 480 }, at(`2026-10-${String(d).padStart(2, '0')}T12:00:00`));
  assert.ok(ledger.cumulativeWh() >= total, `decreased on Oct ${d}`);
  total = ledger.cumulativeWh();
}

// New year: previous_year is overwritten by this_year -> must not decrease.
ledger.update({ todayRuntimeMinutes: 0, dailyWh: [0, 0, 0, 0, 0, 0, 100], thisYearKWh: [0], previousYearKWh: [33, 19, 10, 24, 92, 115, 346, 266, 400, 5, 0, 0] , utcOffsetMinutes: 480 }, at('2027-01-01T12:00:00'));
assert.ok(ledger.cumulativeWh() >= total);

console.log('energy-ledger: ok');
