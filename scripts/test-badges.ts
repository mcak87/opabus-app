// Test reguł odznak (Etap 1, liczone w telefonie):  node scripts/test-badges.ts
import { apply, BADGES, currentRun, EMPTY_STATS, isOffSeason, longestRun, newlyEarned, nextGoal, tierOf, type BadgeStats } from '../src/data/badgeRules.ts';

let fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (!ok) fail++;
  console.log(ok ? 'OK  ' : 'BŁĄD', label, extra);
};
const def = (id: string) => BADGES.find((b) => b.id === id)!;
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

// Pierwsze zgłoszenie
let s: BadgeStats = EMPTY_STATS;
s = apply(s, { kind: 'report', region: 'rodos', date: '2026-10-08' }, day(2026, 10, 8));
check('1 zgłoszenie → Pierwsze zgłoszenie', tierOf(def('first_report'), s) === 1);
check('1 zgłoszenie → Punktualny jeszcze nie', tierOf(def('punctual'), s) === 0);
check('październik nie jest poza sezonem', s.offSeason === 0);
check('region Rodos', s.regions.join() === 'rodos');
check('seria 1 dzień', s.bestStreak === 1);
check('nowe: tylko Pierwsze zgłoszenie', JSON.stringify(newlyEarned({}, s)) === JSON.stringify([{ id: 'first_report', tier: 1 }]), JSON.stringify(newlyEarned({}, s)));
check('cel Punktualny 1/10', JSON.stringify(nextGoal(def('punctual'), s)) === JSON.stringify({ have: 1, need: 10, tier: 1 }));

// 10 zgłoszeń przez 7 kolejnych dni → Punktualny I i Seria I
for (let i = 1; i <= 9; i++) s = apply(s, { kind: 'report', region: 'rodos', date: '2026-10-09' }, day(2026, 10, 8 + Math.min(i, 6)));
check('10 zgłoszeń → Punktualny I', tierOf(def('punctual'), s) === 1, String(s.reports));
check('7 dni z rzędu → Seria I', tierOf(def('streak'), s) === 1, String(s.bestStreak));
check('przed: Punktualny 0 → nowy stopień', newlyEarned({ first_report: 1 }, s).some((x) => x.id === 'punctual' && x.tier === 1));

// Poza sezonem
check('listopad poza sezonem', isOffSeason('2026-11-02'));
check('marzec poza sezonem', isOffSeason('20270315'));
check('kwiecień w sezonie', !isOffSeason('2027-04-01'));

// Zdjęcia: wysłane liczy się tylko do serii, zatwierdzone do odznak
let p: BadgeStats = EMPTY_STATS;
p = apply(p, { kind: 'photoSent', region: 'symi' }, day(2026, 10, 8));
check('wysłane zdjęcie – bez odznaki i bez regionu', p.photos === 0 && p.regions.length === 0 && p.days.length === 1);
p = apply(p, { kind: 'photoApproved', region: 'symi', first: true }, day(2026, 10, 9));
check('zatwierdzone pierwsze → Pierwsze zdjęcie i Odkrywca', tierOf(def('first_photo'), p) === 1 && tierOf(def('explorer'), p) === 1);
check('zatwierdzenie nie dodaje dnia serii', p.days.length === 1);
check('region po zatwierdzeniu', p.regions.join() === 'symi');

// Wyspiarz: 3 regiony
let r: BadgeStats = EMPTY_STATS;
for (const reg of ['rodos', 'kos', 'kos', 'santorini']) r = apply(r, { kind: 'fix', region: reg }, day(2026, 10, 8));
check('3 różne regiony → Wyspiarz I', tierOf(def('islander'), r) === 1, r.regions.join());
check('Kartograf I po 3 poprawkach (4 wysłane)', tierOf(def('cartographer'), r) === 1);

// Serie
check('longestRun z przerwą', longestRun(['20261001', '20261002', '20261004', '20261005', '20261006']) === 3);
check('longestRun przez koniec miesiąca', longestRun(['20261030', '20261031', '20261101']) === 3);
check('currentRun do wczoraj', currentRun(['20261006', '20261007'], day(2026, 10, 8)) === 2);
check('currentRun przerwana', currentRun(['20261005'], day(2026, 10, 8)) === 0);

// Najwyższy stopień
const max: BadgeStats = { ...EMPTY_STATS, reports: 250 };
check('200+ zgłoszeń → Punktualny III i brak celu', tierOf(def('punctual'), max) === 3 && nextGoal(def('punctual'), max) === null);

console.log(fail ? `\n${fail} błędów` : '\nWszystko OK');
process.exit(fail ? 1 : 0);
