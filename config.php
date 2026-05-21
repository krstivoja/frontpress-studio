<?php

defined('FRONTPRESS_BOOT') || exit;

// ── Admin login ───────────────────────────────────────────────────────────
define('FPS_ADMIN_USER',      getenv('FPS_ADMIN_USER')      ?: 'fpsadmin');
define('FPS_ADMIN_PASS_HASH', '$2y$12$WFAGSzJ9ZtvcWNDLg8IXDeNCOWOoaHlmyNoFM2wBaagpx.wJ0V4k6');

// ── Runtime ───────────────────────────────────────────────────────────────
define('FPS_APP_ENV',              getenv('FPS_APP_ENV')              ?: 'dev');
define('FPS_APP_DEBUG',            getenv('FPS_APP_DEBUG')            ?: '0');
define('FPS_SESSION_IDLE_SECONDS', getenv('FPS_SESSION_IDLE_SECONDS') ?: '7200');
