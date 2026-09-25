@AGENTS.md

# OpaBus

Główny kontekst projektu (decyzje, zasady komunikacji, plan): `C:\Users\cizio\OneDrive\Desktop\Apliakcja Publiczny transport\CLAUDE.md` – przeczytaj przed pracą.

- Każda godzina i cena w aplikacji pochodzi z danych rozkładowych – nic nie zmyślamy.
- Bez słowa „na żywo” (nie mamy GPS pojazdów); „autobus”, nie „transfer”; nazwy wysp nieodmieniane („na Rodos”).
- Teksty interfejsu tylko przez `t()` z `src/i18n` (klucze w `pl.ts` i `en.ts`).
- Przed zakończeniem: `npm run typecheck` i `npm run lint`.
