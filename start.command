#!/usr/bin/env bash
#
# start.command — FrontPress Studio one-click launcher + preflight doctor.
#
# Double-click in Finder (macOS) or run `bash start.command` (macOS/Linux).
# It checks that PHP is present and new enough, that the required extensions
# and the built app are in place, picks a free port, opens the admin in your
# browser, and starts the built-in PHP server.
#
# This is a plain shell script on purpose: a PHP "doctor" can't tell you PHP
# is missing when PHP is the missing thing. FrontPress Local (the desktop app)
# automates the same steps — you do not need it to run a FrontPress site.

set -euo pipefail

# Run from this script's own directory, so a double-click from anywhere works.
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MIN_PHP_ID=80100          # 8.1.0
PORT_START=8080
REQUIRED_EXT=(mbstring json fileinfo dom zip gd openssl curl)

# Keep a double-clicked Terminal window open long enough to read the message.
die() {
  printf '\n\033[31m✗ %s\033[0m\n' "$1" >&2
  shift
  for line in "$@"; do printf '  %s\n' "$line" >&2; done
  printf '\nPress return to close this window…' >&2
  read -r _ || true
  exit 1
}

# 1. PHP present?
if ! command -v php >/dev/null 2>&1; then
  hints=("FrontPress needs PHP 8.1 or newer to run.")
  if command -v brew >/dev/null 2>&1; then
    hints+=("Homebrew is installed — you can get PHP with:" "    brew install php")
  else
    hints+=("Install PHP from https://www.php.net/downloads"
            "(macOS users: install Homebrew from https://brew.sh, then 'brew install php')")
  fi
  die "PHP is not installed (or not on your PATH)." "${hints[@]}"
fi

# 2. Version >= 8.1?
php_id="$(php -r 'echo PHP_VERSION_ID;' 2>/dev/null || echo 0)"
php_ver="$(php -r 'echo PHP_VERSION;' 2>/dev/null || echo '?')"
if [ "$php_id" -lt "$MIN_PHP_ID" ]; then
  die "PHP $php_ver is too old — FrontPress needs 8.1 or newer." \
      "Upgrade PHP (e.g. 'brew upgrade php') and try again."
fi

# 3. Required extensions present?
loaded="$(php -m 2>/dev/null | tr '[:upper:]' '[:lower:]')"
missing=()
for ext in "${REQUIRED_EXT[@]}"; do
  printf '%s\n' "$loaded" | grep -qx "$ext" || missing+=("$ext")
done
if [ "${#missing[@]}" -gt 0 ]; then
  die "PHP is missing required extension(s): ${missing[*]}" \
      "Install them for your PHP build (e.g. via your package manager or php.ini)."
fi

# 4. Built app present? (Zip releases always ship these; a bare git clone won't.)
if [ ! -f cms/vendor/autoload.php ] || [ ! -d admin/assets ]; then
  die "This looks like a source checkout, not a release zip." \
      "Build it first:" \
      "    composer install --working-dir=cms" \
      "    cd src && npm install && npm run build && cd .." \
      "Or download a ready-to-run zip from:" \
      "    https://github.com/krstivoja/frontpress-studio/releases/latest"
fi

# 5. Pick a free port. Everything below pins the host to 127.0.0.1 — probe,
#    server bind, and the URL we open — so there's one unambiguous address end
#    to end. (Using the name `localhost` is unreliable: it can resolve to ::1
#    for one call and 127.0.0.1 for another, even within PHP, so a probe and
#    the server can disagree about whether a port is in use.)
port="$(php -r '
  $start = (int) $argv[1];
  for ($p = $start; $p <= $start + 50; $p++) {
      $sock = @stream_socket_server("tcp://127.0.0.1:$p", $errno, $errstr);
      if ($sock) { fclose($sock); echo $p; exit(0); }
  }
  exit(1);
' "$PORT_START")" || die "No free port found from $PORT_START upward." \
  "Something is using the whole range — stop it and try again."

url="http://127.0.0.1:${port}/admin"

printf '\033[32m✓ PHP %s ready.\033[0m Starting FrontPress on %s\n' "$php_ver" "$url"
printf '  Log in with fpsadmin / fpspass, then set a real password under Settings → Security.\n'
printf '  Press Control-C in this window to stop the server.\n\n'

# 6. Open the browser BEFORE the (blocking) server. Small delay so it doesn't
#    beat the server to the bind and show a one-shot "connection refused".
( sleep 1
  if command -v open >/dev/null 2>&1; then open "$url"           # macOS
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$url"  # Linux
  fi ) >/dev/null 2>&1 &

# 7. Hand the window to the server. router.php mirrors the .htaccess rewrites
#    the built-in server doesn't read.
exec php -S "127.0.0.1:${port}" router.php
