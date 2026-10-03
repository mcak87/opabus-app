// Test wyszukiwania nazw (greka/łacinka, pisownia):  node scripts/test-search-norm.ts
import { fold, matchesWords, translitGreek, words } from '../src/lib/searchNorm.ts';

let fail = 0;
const check = (label: string, ok: boolean, extra = '') => {
  if (!ok) fail++;
  console.log(ok ? 'OK  ' : 'BŁĄD', label, extra);
};
const finds = (name: string, query: string) => matchesWords(words(name), words(query));

check('translit Λίνδος', translitGreek('Λίνδος') === 'Lindos', translitGreek('Λίνδος'));
check('translit Φαληράκι', translitGreek('Φαληράκι') === 'Faliraki', translitGreek('Φαληράκι'));
check('translit Μπλε', translitGreek('Μπλε') === 'Ble', translitGreek('Μπλε'));
check('translit Αγκίστρι', translitGreek('Αγκίστρι') === 'Ankistri', translitGreek('Αγκίστρι'));
check('translit Ευρώπη', translitGreek('Ευρώπη') === 'Evropi', translitGreek('Ευρώπη'));
check('translit Πεύκοι', translitGreek('Πεύκοι') === 'Pefkoi', translitGreek('Πεύκοι'));
check('fold Θεσσαλονίκη = Thessaloniki', fold('Θεσσαλονίκη') === fold('Thessaloniki'), `${fold('Θεσσαλονίκη')} / ${fold('Thessaloniki')}`);

const cases: [string, string, boolean][] = [
  ['Λίνδος', 'lindos', true],
  ['Acropolis of Lindos', 'lindos akropol', true],
  ['Acropolis of Lindos', 'akropolis', true],
  ['Blue Bay Resort', 'blue bay', true],
  ['Blue Bay Resort', 'bay blu', true],
  ['Φαληράκι', 'Faliraki', true],
  ['Kallithea Springs', 'kalithea', true],
  ['Ψαράδικο', 'psaradiko', true],
  ['Πεύκοι', 'pefkoi', true],
  ['Ermou 12', 'ermou 12', true],
  ['Mitropoleos 5', 'ermou', false],
  ['Lindos Krana', 'kos', false],
  ['Hotel Mediterranean', 'mediterr', true],
  ['Agios Pavlos Bay', 'saint', false],
];
for (const [name, query, want] of cases) check(`„${query}” → „${name}”`, finds(name, query) === want, `[${words(name).join(' ')}] / [${words(query).join(' ')}]`);

console.log(fail ? `${fail} błędów` : 'Wszystko OK');
process.exit(fail ? 1 : 0);
