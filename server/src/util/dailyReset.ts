// Every ConnectedAccount's post counter resets at UTC midnight. Rather than
// running a cron job, each read/write lazily checks and resets if the
// account's stored reset time has passed.
export function nextUtcMidnight(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setUTCHours(24, 0, 0, 0);
  return d;
}

export function isDailyCountStale(dailyCountResetAt: Date): boolean {
  return dailyCountResetAt.getTime() <= Date.now();
}
