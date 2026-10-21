// „Wyślij raport błędów” (Profil i ekran awarii): dziennik z lib/errorLog + wersja aplikacji, język i rozkłady w telefonie.
import { getLang, t } from '@/i18n';
import { mailErrorReport } from '@/lib/errorLog';

import { APP_VERSION } from './appConfig';
import { listInstalled } from './packages';

export function sendErrorReport(): Promise<void> {
  return mailErrorReport({
    intro: t('errorReportIntro'),
    appVersion: APP_VERSION,
    lang: getLang(),
    regions: Object.values(listInstalled()).map((i) => `${i.region} ${i.version}`),
  });
}
