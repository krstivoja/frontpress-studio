<?php
/**
 * Shared bootstrap for the framework.
 * Sets up paths, autoloads, and instantiates Content/Index/Router.
 */

defined('FRONTPRESS_BOOT') || exit;

// Back-compat: pre-rename installs gate config.php on `MD_BOOT`. Mirror the
// constant so an un-migrated config.php still loads. Safe to remove once
// users have had a release or two to update their config.
if (!defined('MD_BOOT')) {
    define('MD_BOOT', true);
}

require_once __DIR__ . '/cms/vendor/autoload.php';
require_once __DIR__ . '/cms/lib/template_helpers.php';

// Simple PSR-4 autoloader for our lib/ classes (in case composer dump-autoload wasn't run)
spl_autoload_register(function ($class) {
    if (str_starts_with($class, 'FrontPress\\')) {
        $path = __DIR__ . '/cms/lib/' . str_replace('\\', '/', substr($class, 11)) . '.php';
        if (is_file($path)) require $path;
    }
});

$ROOT        = __DIR__;
$CONTENT_DIR = $ROOT . '/site/content';
$CACHE_DIR   = $ROOT . '/site/cache';
$UPLOADS_DIR = $ROOT . '/site/uploads';

// Load config.php once for both admin and public-site entry points so any
// runtime-toggleable behaviour (e.g. APP_ENV-gated SCSS compilation) sees
// the same values. Env::load is idempotent.
FrontPress\Env::load($ROOT . '/config.php');

// First-run only: copy starter content / config / theme into /site if it's
// empty. /site is gitignored — the defaults a user sees on a fresh install
// live under cms/starters/ and are seeded here. Idempotent and cheap when
// the directories already exist.
FrontPress\Bootstrap::ensureSiteDefaults($ROOT);

$config = new FrontPress\Config($ROOT . '/site/config.json');
$GLOBALS['fp_config'] = $config;

$themes       = new FrontPress\ThemeService($ROOT, $config);
$TEMPLATE_DIR = $themes->templateDir();
$GLOBALS['fp_themes'] = $themes;

// Ensure `<webroot>/assets` is symlinked to the active theme's assets dir.
// The release-zip pipeline dereferences symlinks, so a fresh unzipped
// install may end up with a real `assets/` directory full of stale files —
// edits to site/themes/<active>/assets wouldn't take effect. Self-heal on
// first public-site request. No-op when already correctly linked.
$themes->ensureAssetsLink();

// Auto-compile the active theme's SCSS in development. Even though the
// freshness check is just a few stat() calls, paying it on every public-site
// request in production is pure overhead — there is nothing to recompile.
// `.env` ships APP_ENV=dev locally; in production omit it (or set =prod).
$themeDir = dirname($TEMPLATE_DIR);
if (FrontPress\Env::get('APP_ENV', 'dev') === 'dev' && is_dir($themeDir . '/assets')) {
    (new FrontPress\ScssCompiler())->compileTheme($themeDir);
}

$content = new FrontPress\Content($CONTENT_DIR, $CACHE_DIR);
$index = new FrontPress\Index($CONTENT_DIR, $CACHE_DIR, $content);
$router = new FrontPress\Router($CONTENT_DIR);

// Expose as globals for templates
$GLOBALS['fp_content'] = $content;
$GLOBALS['fp_index'] = $index;
$GLOBALS['fp_router'] = $router;
$GLOBALS['fp_template_dir'] = $TEMPLATE_DIR;
$GLOBALS['fp_content_dir'] = $CONTENT_DIR;
$GLOBALS['fp_cache_dir'] = $CACHE_DIR;
$GLOBALS['fp_uploads_dir'] = $UPLOADS_DIR;

/**
 * CSRF token — generates and stores a token in the session.
 * Defined here (guarded) so it's available in both admin and frontend contexts.
 */
if (!function_exists('csrf_token')) {
    function csrf_token(): string
    {
        if (empty($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['csrf_token'];
    }
}

/**
 * Query posts with filtering, ordering, and pagination.
 *
 * $args keys:
 *   folder   string   — limit to a content folder (e.g. 'blog')
 *   filter   array    — key/value pairs matched against meta fields
 *   orderby  string   — field to sort by: 'date' (default), 'title', or any meta key
 *   order    string   — 'desc' (default) or 'asc'
 *   limit    int      — max number of posts to return (0 = all)
 *   offset   int      — skip N posts (for pagination)
 */
/**
 * @param  array<string, mixed> $args
 * @return array<int, array<string, mixed>>
 */
function posts(array $args = []): array
{
    $index = $GLOBALS['fp_index'];

    // Build filter criteria
    $criteria = $args['filter'] ?? [];
    if (!empty($args['folder'])) $criteria['folder'] = $args['folder'];

    $posts = $criteria ? $index->filter($criteria) : $index->get();
    $posts = array_values($posts);

    // Sort
    $orderby = $args['orderby'] ?? 'date';
    $order   = strtolower($args['order'] ?? 'desc') === 'asc' ? 1 : -1;
    usort($posts, function ($a, $b) use ($orderby, $order) {
        $av = $a[$orderby] ?? $a['meta'][$orderby] ?? '';
        $bv = $b[$orderby] ?? $b['meta'][$orderby] ?? '';
        if ($orderby === 'date') {
            $av = $av ? strtotime((string)$av) : 0;
            $bv = $bv ? strtotime((string)$bv) : 0;
        }
        return ($av <=> $bv) * $order;
    });

    // Paginate
    $offset = (int)($args['offset'] ?? 0);
    $limit  = (int)($args['limit']  ?? 0);
    if ($offset || $limit) {
        $posts = array_slice($posts, $offset, $limit ?: null);
    }

    return $posts;
}

/**
 * Render a theme template by name (no extension). PHP wins if both files
 * exist, so existing themes are unchanged; a theme opts into Twig per-template
 * by shipping `<name>.twig` instead of `<name>.php`.
 */
/** @param array<string, mixed> $vars */
function render(string $template, array $vars = []): void
{
    $dir = $GLOBALS['fp_template_dir'];
    $php     = "$dir/$template.php";
    $twig    = "$dir/$template.twig";

    if (!is_file($php) && !is_file($twig)) {
        throw new RuntimeException("Template not found: $template (looked for $php, $twig)");
    }

    // Buffer the rendered output so we can inject SEO tags into <head>
    // before flushing. Templates that don't produce HTML (feed.* writes
    // Atom XML and sets its own Content-Type) won't contain `</head>` and
    // pass through untouched. A theme that calls seo_head() explicitly
    // flips FrontPress\Seo::markEmittedThisRequest() so we skip the implicit
    // injection here and don't double-emit.
    FrontPress\Seo::resetForNextRequest();
    $GLOBALS['fp_current_template'] = $template;
    $GLOBALS['fp_current_vars']     = $vars;

    // Admin Theme Builder asks for source-mapped preview chrome by sending
    // `?fp_admin_preview=1`. We honour it only when the request also has
    // a valid admin session, so visitors can't trigger the marker output
    // on a live site by appending the query param.
    $previewMode = !empty($_GET['fp_admin_preview']) && !empty($GLOBALS['admin_logged_in']);
    $GLOBALS['fp_template_preview'] = $previewMode;

    ob_start();
    if (is_file($php)) {
        extract($vars, EXTR_SKIP);
        require $php;
    } else {
        FrontPress\TemplateRenderer::instance()->render("$template.twig", $vars);
    }
    $body = (string)ob_get_clean();

    if ($previewMode) {
        $tplPath = is_file($php) ? "templates/$template.php" : "templates/$template.twig";
        // Wrap the whole rendered body so a click that lands outside any
        // partial still maps back to the route template. Markers are HTML
        // comments — invisible to the renderer, walkable from JS via
        // `previousSibling` + `parentNode`.
        $body = "<!--fp:src:" . htmlspecialchars($tplPath, ENT_QUOTES) . ":start-->\n"
              . $body
              . "\n<!--fp:src:" . htmlspecialchars($tplPath, ENT_QUOTES) . ":end-->";
        $body = inject_preview_script($body);
    }

    if (!FrontPress\Seo::wasEmittedThisRequest()) {
        $body = inject_seo($body, $template, $vars);
    }

    echo $body;
    admin_edit_button();
}

/**
 * Append a small click-handler script to a preview-mode render. The
 * script intercepts clicks, walks up the DOM to find the nearest
 * `<!--fp:src:<path>:start-->` marker, and `postMessage`s the parent
 * window with `{ type: 'fp:select', path }`. The Theme Builder's
 * iframe parent receives that and opens the file in the code panel.
 */
function inject_preview_script(string $body): string
{
    $script = <<<'HTML'
<script>(function () {
  // Walk back through previous siblings looking for the nearest
  // `fp:src:<path>:start` marker. We balance any `:end` markers we
  // cross — a sibling region's end means we should step past its
  // matching start (it belongs to that already-closed sibling, not
  // to us). When we run out of siblings, move up to the parent.
  function findSrc(node) {
    while (node) {
      var sib = node.previousSibling;
      var depth = 0;
      while (sib) {
        if (sib.nodeType === 8) {
          var s = String(sib.nodeValue || '');
          var endM = s.match(/^fp:src:(.+?):end$/);
          var startM = endM ? null : s.match(/^fp:src:(.+?):start$/);
          if (endM) {
            depth += 1;
          } else if (startM) {
            if (depth === 0) return startM[1];
            depth -= 1;
          }
        }
        sib = sib.previousSibling;
      }
      node = node.parentNode;
    }
    return null;
  }
  // The outline tracks these tags as selectable blocks. Mirror of the
  // VISUAL_TAGS set in src/lib/themeBuilderBlocks.js — keep the two in
  // sync. Clicks on tags not in this list (e.g. <span>) walk up to the
  // nearest ancestor that IS in the list so we always have something
  // to highlight.
  var VISUAL_TAGS = {
    article: 1, aside: 1, div: 1, footer: 1, form: 1, header: 1,
    li: 1, main: 1, nav: 1, ol: 1, section: 1, ul: 1,
    h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1,
    p: 1, blockquote: 1, pre: 1,
    a: 1, button: 1, img: 1, figure: 1, figcaption: 1,
    video: 1, audio: 1, iframe: 1,
    table: 1, thead: 1, tbody: 1, tfoot: 1, tr: 1, td: 1, th: 1,
    hr: 1
  };
  function nearestVisual(node) {
    while (node && node.nodeType === 1) {
      if (VISUAL_TAGS[node.tagName.toLowerCase()]) return node;
      node = node.parentNode;
    }
    return null;
  }
  // Count how many same-tag visual elements that ALSO live inside the
  // same source file appear before `target` in document order. The
  // parent window uses this index to pick the matching element in
  // its parsed source tree — letting it highlight the exact element
  // in the outline + jump the code editor to that source line.
  function tagOccurrence(target, path) {
    var tag = target.tagName.toLowerCase();
    var all = document.body.getElementsByTagName(tag);
    var n = 0;
    for (var i = 0; i < all.length; i++) {
      if (all[i] === target) return n;
      if (findSrc(all[i]) === path) n += 1;
    }
    return -1;
  }
  document.addEventListener('click', function (e) {
    var path = findSrc(e.target);
    if (!path) return;
    // Anchor/form clicks would otherwise leave the iframe; in preview
    // mode the click is a selection action, not a navigation.
    e.preventDefault();
    e.stopPropagation();
    var resolve = nearestVisual(e.target) || e.target;
    var tag = resolve.tagName ? resolve.tagName.toLowerCase() : null;
    var occurrence = tag ? tagOccurrence(resolve, path) : -1;
    try {
      parent.postMessage({
        type: 'fp:select',
        path: path,
        tag: tag,
        occurrence: occurrence,
      }, '*');
    } catch (_) {}
  }, true);
  // Inverse lookup: walk same-tag elements in document order, return
  // the Nth one whose source-file marker matches `path`. Mirrors the
  // counting in `tagOccurrence` so a selection round-trips cleanly.
  function findByOccurrence(path, tag, occurrence) {
    if (!tag || occurrence < 0) return null;
    var all = document.body.getElementsByTagName(tag);
    var n = 0;
    for (var i = 0; i < all.length; i++) {
      if (findSrc(all[i]) === path) {
        if (n === occurrence) return all[i];
        n += 1;
      }
    }
    return null;
  }
  // Parent → iframe: when the user selects a block in the outline, the
  // Theme Builder posts `{ type: 'fp:focus', path, tag, occurrence }`
  // and we scroll the matching element into view with a brief
  // outline so it's obvious which one got picked.
  window.addEventListener('message', function (e) {
    var data = e.data;
    if (!data || data.type !== 'fp:focus') return;
    var el = findByOccurrence(data.path, data.tag, data.occurrence);
    if (!el || !el.scrollIntoView) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Briefly outline so the scroll target is obvious. Restore the
    // original inline outline values so we don't clobber a theme that
    // sets them itself.
    var prevOutline = el.style.outline;
    var prevOffset = el.style.outlineOffset;
    el.style.outline = '2px solid rgb(59, 130, 246)';
    el.style.outlineOffset = '2px';
    setTimeout(function () {
      el.style.outline = prevOutline;
      el.style.outlineOffset = prevOffset;
    }, 1200);
  });
  // Subtle hover outline so the user can tell something is mappable.
  var style = document.createElement('style');
  style.textContent = '*:hover { outline: 1px dashed rgba(59,130,246,.4); outline-offset: 1px; cursor: crosshair; }';
  document.head && document.head.appendChild(style);
})();</script>
HTML;
    $bodyClose = stripos($body, '</body>');
    if ($bodyClose === false) return $body . $script;
    return substr($body, 0, $bodyClose) . $script . substr($body, $bodyClose);
}

/**
 * Inject the framework-built SEO block into the rendered HTML right before
 * `</head>`. If the body is not HTML (no </head>), pass through untouched.
 *
 * @param array<string, mixed> $vars
 */
function inject_seo(string $body, string $template, array $vars): string
{
    $headClose = stripos($body, '</head>');
    if ($headClose === false) {
        return $body;
    }
    $config = $GLOBALS['fp_config'] ?? null;
    $configArr = ($config && method_exists($config, 'all')) ? $config->all() : [];
    $url       = (string)($_SERVER['REQUEST_URI'] ?? '/');
    $tags      = FrontPress\Seo::tagsFor($template, $vars, $configArr, parse_url($url, PHP_URL_PATH) ?: '/');
    if ($tags === '') {
        return $body;
    }
    return substr($body, 0, $headClose) . $tags . substr($body, $headClose);
}

/**
 * Render a floating "Edit" link in the bottom-right corner of the public
 * site when the operator is logged in and the current route resolves to
 * an editable post/page. Tapping it deep-links into the admin editor for
 * that file. Quietly no-ops on non-editable routes (feeds, sitemap,
 * taxonomy archives, real 404s where `admin_edit_path` is null) and for
 * anonymous visitors.
 *
 * Styles are inlined so the button is independent of the active theme's
 * CSS — themes don't need to opt in and can't accidentally break it.
 */
function admin_edit_button(): void
{
    if (empty($GLOBALS['admin_logged_in']) || empty($GLOBALS['admin_edit_path'])) {
        return;
    }
    $path = (string)$GLOBALS['admin_edit_path'];
    // rawurlencode each path segment so spaces / non-ASCII slugs survive
    // the round-trip into React Router.
    $url  = '/admin/' . implode('/', array_map('rawurlencode', explode('/', $path)));
    $href = htmlspecialchars($url, ENT_QUOTES);
    ?>
<style>
  .fp-admin-edit-btn {
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483000;
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 14px; border-radius: 999px;
    background: #18181b; color: #fafafa;
    font: 500 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    text-decoration: none;
    box-shadow: 0 8px 24px rgba(0,0,0,.25), 0 0 0 1px rgba(255,255,255,.06) inset;
    transition: transform .15s ease, box-shadow .15s ease;
  }
  .fp-admin-edit-btn:hover, .fp-admin-edit-btn:focus-visible {
    transform: translateY(-1px);
    box-shadow: 0 10px 28px rgba(0,0,0,.32), 0 0 0 1px rgba(255,255,255,.08) inset;
    color: #fafafa;
    outline: none;
  }
  .fp-admin-edit-btn:focus-visible {
    box-shadow: 0 10px 28px rgba(0,0,0,.32), 0 0 0 2px #fafafa, 0 0 0 4px #18181b;
  }
  @media print { .fp-admin-edit-btn { display: none; } }
</style>
<a class="fp-admin-edit-btn" href="<?= $href ?>" rel="noopener">
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 20h9"></path>
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
  </svg>
  Edit
</a>
<?php
}

/**
 * Emit a 404 response rendered through the active theme's 404 template.
 */
function not_found(?string $url = null): void
{
    http_response_code(404);
    render('404', ['url' => $url ?? ($_SERVER['REQUEST_URI'] ?? '/')]);
}
