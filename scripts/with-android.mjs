// Uruchamia polecenie z Android SDK i Javą z Android Studio – bez zmieniania zmiennych systemowych Windows.
//   node scripts/with-android.mjs <polecenie> [argumenty…]
//   node scripts/with-android.mjs --emulator   → włącza pierwszy emulator z Android Studio (Device Manager)
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const env = { ...process.env };
const sdk = env.ANDROID_HOME || join(env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
const jbr = env.JAVA_HOME || 'C:\\Program Files\\Android\\Android Studio\\jbr';

if (!existsSync(sdk)) {
  console.error(`Brak Android SDK w ${sdk}.\nOtwórz Android Studio i dokończ kreator pierwszego uruchomienia (typ instalacji: Standard).`);
  process.exit(1);
}
if (!existsSync(join(jbr, 'bin'))) {
  console.error(`Brak Javy z Android Studio w ${jbr}. Zainstaluj Android Studio albo ustaw JAVA_HOME.`);
  process.exit(1);
}

env.ANDROID_HOME = sdk;
env.JAVA_HOME = jbr;
// Na Windows zmienna nazywa się „Path” – podmieniamy istniejący klucz, żeby nie powstały dwa.
const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
const sep = process.platform === 'win32' ? ';' : ':';
env[pathKey] = [join(jbr, 'bin'), join(sdk, 'platform-tools'), join(sdk, 'emulator'), env[pathKey]].join(sep);

let [cmd, ...args] = process.argv.slice(2);
if (cmd === '--emulator') {
  const avds = execFileSync(join(sdk, 'emulator', 'emulator'), ['-list-avds'], { env, encoding: 'utf8' })
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('INFO'));
  if (avds.length === 0) {
    console.error('Brak emulatora. W Android Studio: More Actions → Virtual Device Manager → Create device.');
    process.exit(1);
  }
  console.log(`Uruchamiam emulator: ${avds[0]}`);
  cmd = 'emulator';
  args = ['-avd', avds[0], ...args];
}
if (!cmd) {
  console.error('Podaj polecenie, np. node scripts/with-android.mjs npx expo run:android');
  process.exit(1);
}

const child = spawn(cmd, args, { stdio: 'inherit', env, shell: true });
child.on('exit', (code) => process.exit(code ?? 1));
