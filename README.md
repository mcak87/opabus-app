# OpaBus – aplikacja mobilna

Rozkłady autobusów, promów, metra i kolei w Grecji – offline, bez konta. Expo SDK 57 + React Native, Expo Router, SQLite.

Opis projektu, decyzje i plan: `C:\Users\cizio\OneDrive\Desktop\Apliakcja Publiczny transport\CLAUDE.md`.
Format paczek z rozkładami: `…\Apliakcja Publiczny transport\OpaBus_paczki_offline_format.md`.

## Uruchomienie na telefonie (Expo Go)

Telefon i komputer muszą być w tej samej sieci Wi-Fi.

1. Zainstaluj na telefonie **Expo Go** (Google Play / App Store).
2. Pierwszy raz: `npm install`
3. Terminal 1 – serwer z rozkładami (dopóki opabus.com nie działa):

   ```bash
   npm run dane
   ```

   Wypisze adres, np. `EXPO_PUBLIC_DATA_URL=http://192.168.1.87:8787`. Wpisz tę linię do pliku `.env.local`
   (wzór: `.env.example`). Adres zmienia się tylko wtedy, gdy komputer dostanie inny adres w sieci.
4. Terminal 2 – aplikacja w Expo Go:

   ```bash
   npm run go
   ```

   Zeskanuj kod QR: Android – w Expo Go, iPhone – aparatem.

Przy pierwszym uruchomieniu Windows może zapytać o dostęp Node.js do sieci – zezwól dla **sieci prywatnych**.

Expo Go nie ma mapy (MapLibre) – zakładka Przystanki → Mapa pokazuje wtedy komunikat. Mapa działa w wersji testowej.

## Wersja testowa z mapą (Android, development build)

Budowana w chmurze Expo (EAS) na koncie Michała. Raz na początku:

```bash
npx eas-cli@latest login
```

```bash
npx eas-cli@latest init
```

Budowa (ok. 15–30 min w darmowej kolejce; powtarzać tylko po dodaniu nowych modułów natywnych):

```bash
npm run build:test
```

Na końcu pojawi się kod QR / link do pliku APK – otwórz go na telefonie i zainstaluj „OpaBus”.
Potem na co dzień: `npm run dane` + `npm start` (bez `--go`) i zeskanuj kod QR aplikacją OpaBus.

## Polecenia

| Polecenie | Co robi |
| --- | --- |
| `npm start` | serwer Expo dla wersji testowej OpaBus (z mapą) |
| `npm run go` | serwer Expo dla Expo Go (bez mapy) |
| `npm run build:test` | budowa wersji testowej na Androida w chmurze Expo |
| `npm run dane` | lokalny serwer paczek z rozkładami (`strona-opabus/public`) |
| `npm run typecheck` | sprawdzenie typów TypeScript |
| `npm run lint` | ESLint |
| `npm run test:dane -- <paczka.sqlite.gz> [lat lon] [RRRR-MM-DDTGG:MM]` | test zapytań na prawdziwej paczce (Node 24) |

## Struktura

- `src/app/` – ekrany (Expo Router): `(tabs)/` Start, Przystanki, Trasa, Profil; `stop/` odjazdy; `trip/` przebieg kursu; `s/` linki z kodów QR (`opabus.com/s/<region>/<przystanek>`).
- `src/data/` – paczki offline (pobieranie, sha256, SQLite), zapytania o odjazdy, kontekst danych.
- `src/lib/` – czas Aten (dzień kursowania, kursy po północy), odległości i czas dojścia.
- `src/i18n/` – 12 języków (na razie gotowe: polski, angielski).
- `src/components/`, `src/constants/` – wygląd: kolory, czcionka Nunito, ikony, panoramy regionów.

Folderów `android/` i `ios/` nie edytujemy – generuje je Expo (CNG) na podstawie `app.json`.
