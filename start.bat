@echo off
setlocal enabledelayedexpansion
rem ===========================================================================
rem  start.bat - FrontPress Studio one-click launcher + preflight doctor.
rem
rem  Double-click in Explorer, or run `start.bat` from a terminal. Checks that
rem  PHP is present and new enough, that the built app is in place, picks a free
rem  port, opens the admin in your browser, and starts the built-in PHP server.
rem
rem  A batch file on purpose: a PHP "doctor" can't tell you PHP is missing when
rem  PHP is the missing thing. You do not need FrontPress Local to run a site.
rem ===========================================================================

rem Run from this script's own directory.
cd /d "%~dp0"

set "MIN_PHP_ID=80100"
set "PORT_START=8080"

rem 1. PHP present?
where php >nul 2>&1
if errorlevel 1 (
  echo.
  echo   [X] PHP is not installed ^(or not on your PATH^).
  echo       FrontPress needs PHP 8.1 or newer to run.
  echo       Install with:  winget install PHP.PHP
  echo       or download from https://windows.php.net/download/
  echo.
  pause
  exit /b 1
)

rem 2. Version >= 8.1?
for /f "usebackq delims=" %%v in (`php -r "echo PHP_VERSION_ID;"`) do set "PHP_ID=%%v"
for /f "usebackq delims=" %%v in (`php -r "echo PHP_VERSION;"`) do set "PHP_VER=%%v"
if !PHP_ID! LSS %MIN_PHP_ID% (
  echo.
  echo   [X] PHP !PHP_VER! is too old - FrontPress needs 8.1 or newer.
  echo       Upgrade PHP and try again.
  echo.
  pause
  exit /b 1
)

rem 3. Required extensions present?
set "MISSING="
for %%E in (mbstring json fileinfo dom zip gd openssl curl) do (
  php -r "exit(extension_loaded('%%E')?0:1);" || set "MISSING=!MISSING! %%E"
)
if defined MISSING (
  echo.
  echo   [X] PHP is missing required extension^(s^):!MISSING!
  echo       Enable them in your php.ini and try again.
  echo.
  pause
  exit /b 1
)

rem 4. Built app present? (Zip releases ship these; a bare git clone won't.)
if not exist "cms\vendor\autoload.php" goto :notbuilt
if not exist "admin\assets" goto :notbuilt
goto :pickport
:notbuilt
echo.
echo   [X] This looks like a source checkout, not a release zip.
echo       Build it first:
echo           composer install --working-dir=cms
echo           cd src ^&^& npm install ^&^& npm run build ^&^& cd ..
echo       Or download a ready-to-run zip from:
echo           https://github.com/krstivoja/frontpress-studio/releases/latest
echo.
pause
exit /b 1

rem 5. Pick a free port (8080, then bump until one is free).
:pickport
set /a "PORT=%PORT_START%"
set /a "PORT_MAX=%PORT_START%+50"
:portloop
netstat -ano -p tcp | find ":!PORT! " | find "LISTENING" >nul 2>&1
if not errorlevel 1 (
  set /a "PORT+=1"
  if !PORT! GTR !PORT_MAX! (
    echo   [X] No free port found from %PORT_START%.
    pause
    exit /b 1
  )
  goto :portloop
)

set "URL=http://127.0.0.1:!PORT!/admin"
echo.
echo   [OK] PHP !PHP_VER! ready. Starting FrontPress on !URL!
echo        Log in with fpsadmin / fpspass, then set a real password under Settings ^> Security.
echo        Close this window or press Control-C to stop the server.
echo.

rem 6. Open the browser first (non-blocking), then hand the window to the
rem    blocking server. `start "" <url>` returns immediately.
start "" "!URL!"

rem 7. router.php mirrors the .htaccess rewrites the built-in server ignores.
rem     Host pinned to 127.0.0.1 to match the URL and the port check above.
php -S 127.0.0.1:!PORT! router.php

endlocal
