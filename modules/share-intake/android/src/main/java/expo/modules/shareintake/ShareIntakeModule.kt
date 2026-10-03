// „Udostępnij → OpaBus” (Android): tekst udostępniony z Google Maps, Bookingu itp. (link + nazwa miejsca).
// Odczyt raz – po odebraniu usuwamy go z intencji, żeby powrót do aplikacji nie otwierał go ponownie.
package expo.modules.shareintake

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ShareIntakeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ShareIntake")
    Events("onShare")

    // Udostępnienie, które uruchomiło aplikację.
    Function("takeInitialShare") {
      val intent = appContext.currentActivity?.intent ?: return@Function null
      take(intent)
    }

    // Udostępnienie, gdy aplikacja już działa.
    OnNewIntent { intent ->
      take(intent)?.let { sendEvent("onShare", mapOf("text" to it)) }
    }
  }

  private fun take(intent: Intent): String? {
    if (intent.action != Intent.ACTION_SEND) return null
    val text = intent.getStringExtra(Intent.EXTRA_TEXT) ?: return null
    val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)
    intent.removeExtra(Intent.EXTRA_TEXT)
    intent.removeExtra(Intent.EXTRA_SUBJECT)
    return if (subject != null && !text.contains(subject)) "$subject\n$text" else text
  }
}
