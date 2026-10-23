#!/usr/bin/env bash
# ============================================================
# Build the installable Android app
# ------------------------------------------------------------
# The android/ folder is GENERATED and gitignored, so everything that must
# survive a fresh clone lives here or in mobile/. Regenerating it by hand and
# remembering to re-apply three pieces of configuration is how a build ends up
# subtly different from the one before it.
#
#   bash scripts/mobile/build-apk.sh            # signed release
#   bash scripts/mobile/build-apk.sh --debug    # quick unsigned build
#
# WHAT IT PUTS BACK, every time, because `npx cap add android` does not:
#
#   mobile/google-services.json  ->  android/app/
#       Firebase's client config. NOT secret: it ships inside every copy of
#       the app and its API key is restricted to the project. Without it the
#       push plugin cannot register a device and native notifications never
#       arrive.
#
#   android/local.properties
#       The SDK path, with FORWARD SLASHES. A Java .properties file treats a
#       backslash as an escape, so C:\Users\... silently becomes garbage and
#       Gradle fails with "The filename, directory name, or volume label
#       syntax is incorrect" — a message that names neither the file nor the
#       path. That cost an hour once.
#
# THE SIGNING KEY IS NOT IN THIS REPOSITORY, and must not be. It lives at
# ~/ORM-signing/keystore.properties. Anyone holding it can publish an update
# that Android accepts as this app — and if it is LOST, no future release can
# upgrade an installed copy in place: every user must uninstall first and
# loses anything held locally. Back it up somewhere that outlives this
# machine.
# ============================================================

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:-}"
cd "$REPO" || { echo "cannot enter $REPO"; exit 1; }

say() { echo "[build-apk] $*"; }

# ── The SDK ─────────────────────────────────────────────────────────────────
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/AppData/Local/Android/Sdk}}"
if [ ! -d "$SDK" ]; then
  say "FAILED: no Android SDK at $SDK"
  say "        Install one, or set ANDROID_HOME."
  exit 1
fi
export ANDROID_HOME="$SDK"
export ANDROID_SDK_ROOT="$SDK"

# ── The native project, generated if absent ─────────────────────────────────
if [ ! -d android ]; then
  say "no android/ — generating it"
  npx --no-install cap add android || { say "FAILED: cap add android"; exit 1; }
fi

say "syncing web assets and plugins"
npx --no-install cap sync android || { say "FAILED: cap sync"; exit 1; }

# ── The two files cap sync does not restore ─────────────────────────────────
if [ -f mobile/google-services.json ]; then
  cp mobile/google-services.json android/app/google-services.json
  say "restored google-services.json"
else
  say "WARNING: mobile/google-services.json is missing."
  say "         The app will build, install and run, but it cannot register"
  say "         for push and native notifications will never arrive."
fi

# Forward slashes. See the header.
SDK_FWD="$(printf '%s' "$SDK" | sed 's#\\\\#/#g')"
case "$SDK_FWD" in
  /c/*) SDK_FWD="C:${SDK_FWD#/c}" ;;   # git-bash path -> what Java expects
esac
printf 'sdk.dir=%s\n' "$SDK_FWD" > android/local.properties
say "sdk.dir=$SDK_FWD"

# ── Build ───────────────────────────────────────────────────────────────────
cd android || exit 1

if [ "$MODE" = "--debug" ]; then
  say "building debug"
  ./gradlew.bat assembleDebug --no-daemon || { say "FAILED: gradle"; exit 1; }
  OUT="app/build/outputs/apk/debug/app-debug.apk"
else
  if [ ! -f "$HOME/ORM-signing/keystore.properties" ]; then
    say "WARNING: no signing key at ~/ORM-signing/keystore.properties."
    say "         The release will be UNSIGNED and Android will refuse to"
    say "         install it. Use --debug, or restore the keystore."
  fi
  say "building signed release"
  ./gradlew.bat assembleRelease --no-daemon || { say "FAILED: gradle"; exit 1; }
  OUT="app/build/outputs/apk/release/app-release.apk"
fi

if [ ! -f "$OUT" ]; then
  say "FAILED: gradle reported success but produced no APK at $OUT"
  exit 1
fi

say "built: $(cd "$REPO/android" && pwd)/$OUT"
say "size:  $(du -h "$OUT" | cut -f1)"
say ""
say "To publish it for staff to install:"
say "  cp android/$OUT public/downloads/orm-unth.apk"
say "  then commit and deploy."
