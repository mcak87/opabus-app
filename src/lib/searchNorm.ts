// Wyszukiwanie nazw po grecku i łacinką: „Lindos”, „Λίνδος”, „lindos akropol” i „Acropolis of Lindos” trafiają w to samo.
// Nazwę i zapytanie sprowadzamy do jednej postaci (bez akcentów, greka → łacinka, uproszczona pisownia).
// Czysty TypeScript (test: scripts/test-search-norm.ts).

const GR: Record<string, string> = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x',
  ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
};

/** Transliteracja grecka (uproszczone ELOT 743), wielkość liter zachowana – także do wyświetlania nazw bez wersji łacińskiej. */
export function translitGreek(s: string): string {
  const plain = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  let out = '';
  for (let i = 0; i < plain.length; i++) {
    const ch = plain[i];
    const lo = ch.toLowerCase();
    const next = (plain[i + 1] || '').toLowerCase();
    const wordStart = !/\p{L}/u.test(plain[i - 1] || '');
    let t: string | undefined;
    if (lo === 'ο' && next === 'υ') {
      t = 'ou';
      i++;
    } else if ((lo === 'α' || lo === 'ε') && next === 'υ') {
      // αυ/ευ: „af/ef” przed spółgłoską bezdźwięczną i na końcu słowa, inaczej „av/ev” (Πεύκοι = Pefkoi, Ευρώπη = Evropi).
      const after = (plain[i + 2] || '').toLowerCase();
      t = GR[lo] + (!after || /[θκξπστφχψ\s]/.test(after) ? 'f' : 'v');
      i++;
    } else if (lo === 'μ' && next === 'π' && wordStart) {
      t = 'b';
      i++;
    } else if (lo === 'ν' && next === 'τ' && wordStart) {
      t = 'd';
      i++;
    } else if (lo === 'γ' && (next === 'γ' || next === 'κ' || next === 'χ')) t = 'n';
    else t = GR[lo];
    if (t === undefined) out += ch;
    else out += ch !== lo ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  }
  return out;
}

export const isGreek = (s: string) => /[Ͱ-Ͽἀ-῿]/.test(s);

/** Postać do porównań: małe litery, bez akcentów, łacinka, uproszczenia (ph=f, ch=h, y=i, c=k, ou=u, podwójne litery…). */
export function fold(s: string): string {
  let t = translitGreek(s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
  t = t.replace(/ł/g, 'l').replace(/ß/g, 'ss');
  t = t.replace(/[^a-z0-9]+/g, ' ');
  t = t
    .replace(/\bmp/g, 'b')
    .replace(/\bnt/g, 'd')
    .replace(/ph/g, 'f')
    .replace(/[ck]h/g, 'h')
    .replace(/c/g, 'k')
    .replace(/y/g, 'i')
    .replace(/ou/g, 'u')
    .replace(/g[gk]/g, 'g')
    .replace(/ng/g, 'g')
    .replace(/([a-z])\1+/g, '$1');
  return t.trim().replace(/\s+/g, ' ');
}

export const words = (s: string) => fold(s).split(' ').filter(Boolean);

/** Każde słowo zapytania musi być początkiem któregoś słowa nazwy (kolejność dowolna). */
export function matchesWords(nameWords: string[], queryWords: string[]): boolean {
  return queryWords.every((q) => nameWords.some((w) => w.startsWith(q)));
}
