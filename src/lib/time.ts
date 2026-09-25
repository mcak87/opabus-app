// Czas w strefie rozkładów (Europe/Athens), niezależnie od strefy ustawionej w telefonie.
// Dni tygodnia jak w paczkach offline: 0 = poniedziałek … 6 = niedziela (bit 0 = poniedziałek).

export type ServiceDay = { date: number; weekday: number };
export type Now = ServiceDay & { sec: number; prev: ServiceDay };

const TZ = 'Europe/Athens';

function ymd(y: number, m: number, d: number): ServiceDay {
  const utc = new Date(Date.UTC(y, m - 1, d));
  return {
    date: utc.getUTCFullYear() * 10000 + (utc.getUTCMonth() + 1) * 100 + utc.getUTCDate(),
    weekday: (utc.getUTCDay() + 6) % 7,
  };
}

export function athensNow(at: Date = new Date()): Now {
  let y: number, m: number, d: number, h: number, mi: number, s: number;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(at);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    [y, m, d, h, mi, s] = [get('year'), get('month'), get('day'), get('hour') % 24, get('minute'), get('second')];
    if ([y, m, d, h, mi, s].some(Number.isNaN)) throw new Error('Intl');
  } catch {
    [y, m, d, h, mi, s] = [at.getFullYear(), at.getMonth() + 1, at.getDate(), at.getHours(), at.getMinutes(), at.getSeconds()];
  }
  return { ...ymd(y, m, d), sec: h * 3600 + mi * 60 + s, prev: ymd(y, m, d - 1) };
}

export function addDays(day: ServiceDay, n: number): ServiceDay {
  const y = Math.floor(day.date / 10000);
  const m = Math.floor((day.date % 10000) / 100);
  const d = day.date % 100;
  return ymd(y, m, d + n);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Sekundy od północy (mogą przekraczać 24 h) → „HH:MM”. */
export function hhmm(sec: number): string {
  const t = ((Math.round(sec / 60) * 60) % 86400 + 86400) % 86400;
  return `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}`;
}

/** „20261031” → „31.10.2026” */
export function formatDate(date: number): string {
  const s = String(date);
  return `${s.slice(6, 8)}.${s.slice(4, 6)}.${s.slice(0, 4)}`;
}
