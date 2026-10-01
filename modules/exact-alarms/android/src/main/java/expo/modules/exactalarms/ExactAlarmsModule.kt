// „Alarmy i przypomnienia” (Android 12+): czy aplikacja może ustawiać dokładne alarmy i otwarcie ekranu zgody.
// Bez tej zgody Android dostarcza przypomnienia z opóźnieniem (nawet do godziny) – za późno na autobus.
package expo.modules.exactalarms

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExactAlarmsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExactAlarms")

    Function("canScheduleExact") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@Function true
      val ctx = appContext.reactContext ?: return@Function true
      val am = ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return@Function true
      am.canScheduleExactAlarms()
    }

    Function("openSettings") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@Function false
      val ctx = appContext.reactContext ?: return@Function false
      val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + ctx.packageName))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(intent)
      true
    }
  }
}
