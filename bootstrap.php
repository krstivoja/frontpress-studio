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
// the same values. Fresh installs only have sample.config.php — the
// resolver falls back to it until the operator's first credential change
// writes a real config.php.
FrontPress\Env::load(FrontPress\Env::resolveConfigPath($ROOT));

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
        // Mirror the globals Twig registers (see TemplateRenderer) so PHP
        // templates can reference $config / $query the same way. $config is
        // the Config object — templates call $config->get(); Twig receives the
        // flattened array. Extracted after $vars with EXTR_SKIP so vars win.
        extract(['config' => $GLOBALS['fp_config'] ?? null, 'query' => $_GET], EXTR_SKIP);
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

    // Logged-in admins get a live-CSS-reload poller so front-end edits to
    // the theme's SCSS/CSS hot-swap without a full reload. Gated purely on
    // the admin session (not admin_edit_path) so it works on every view —
    // archives, taxonomies — not just single posts/pages.
    if (!empty($GLOBALS['admin_logged_in'])) {
        $body = inject_live_css_reload($body);
    }

    echo $body;
    admin_edit_button();
}

/**
 * Inject the live-CSS-reload script for logged-in admins. Polls
 * `/admin/api/theme-css` (recompiles mtime-driven, returns a version
 * token) and, when the token changes, re-fetches every theme stylesheet
 * with a fresh cache-bust query — no page reload, so scroll and form
 * state survive. Returns $body untouched when it has no `</body>` (e.g.
 * the Atom feed writes XML), so non-HTML responses stay clean.
 */
function inject_live_css_reload(string $body): string
{
    $pos = stripos($body, '</body>');
    if ($pos === false) {
        return $body;
    }
    $script = <<<'HTML'
<script>(function () {
  // Only theme stylesheets (served from /assets/) are swapped; the admin
  // edit-button's inline <style> and any third-party links are left alone.
  var last = null, url = '/admin/api/theme-css', timer = null;

  function swap(v) {
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var href = link.getAttribute('href') || '';
      if (href.indexOf('/assets/') === -1) continue;
      var clean = href.split('?')[0];
      // Clone so the fresh sheet paints before we drop the stale one —
      // avoids an unstyled flash mid-swap.
      var next = link.cloneNode(false);
      next.setAttribute('href', clean + '?v=' + v);
      next.addEventListener('load', function () { if (link.parentNode) link.parentNode.removeChild(link); });
      next.addEventListener('error', function () { if (next.parentNode) next.parentNode.removeChild(next); });
      link.parentNode.insertBefore(next, link.nextSibling);
    }
  }

  function tick() {
    fetch(url, { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) {
        if (r.status === 401) { clearInterval(timer); return null; } // session gone
        return r.ok ? r.json() : null;
      })
      .then(function (d) {
        if (!d || typeof d.v === 'undefined') return;
        if (last === null) { last = d.v; return; } // first tick: baseline only
        if (d.v !== last) { last = d.v; swap(d.v); }
      })
      .catch(function () {});
  }

  timer = setInterval(tick, 1000);
  tick();
})();</script>
HTML;
    return substr($body, 0, $pos) . $script . substr($body, $pos);
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
  // --- Scroll preservation across Theme Builder reloads ---------------
  // Save / duplicate / delete / move all re-navigate this iframe to the
  // freshly rendered output. Without this the iframe would land at the
  // top on every edit. We stash the offset on `pagehide` and restore it
  // on the next load, keyed by pathname so switching to a different
  // preview URL doesn't inherit a stale offset.
  try {
    var FP_SCROLL_KEY = 'fp:preview-scroll';
    var fpSaved = sessionStorage.getItem(FP_SCROLL_KEY);
    if (fpSaved) {
      sessionStorage.removeItem(FP_SCROLL_KEY);
      var fpPos = JSON.parse(fpSaved);
      if (fpPos && fpPos.path === location.pathname) {
        var fpRestore = function () { window.scrollTo(fpPos.x || 0, fpPos.y || 0); };
        // Restore as early as possible, then again after load in case
        // images / fonts / async content shifted the layout underneath us.
        requestAnimationFrame(fpRestore);
        window.addEventListener('load', fpRestore);
      }
    }
    window.addEventListener('pagehide', function () {
      try {
        sessionStorage.setItem(FP_SCROLL_KEY, JSON.stringify({
          path: location.pathname, x: window.scrollX, y: window.scrollY,
        }));
      } catch (_) {}
    });
  } catch (_) {}
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
  // --- In-canvas selection toolbar (Duplicate / Delete) ---------------
  // Injected chrome, marked `data-fp-ui` so our own click + hover handlers
  // skip it. Buttons postMessage the parent, which rewrites the template
  // source, saves, and reloads this iframe with the rendered result.
  var fpBar = null, fpSel = null, fpSelPrev = null, fpCur = null;
  // Block tags that can hold children — mirrors CONTAINER_TAGS in
  // src/components/ThemeBuilderOutline.jsx so the canvas offers the same
  // before / after / inside drops as the outline's drag-to-reorder.
  var CONTAINER_TAGS = {
    article: 1, aside: 1, div: 1, footer: 1, form: 1, header: 1, main: 1,
    nav: 1, ol: 1, section: 1, ul: 1, li: 1, figure: 1, blockquote: 1,
    table: 1, thead: 1, tbody: 1, tfoot: 1, tr: 1
  };
  function fpCanContain(el) {
    return el && el.tagName && !!CONTAINER_TAGS[el.tagName.toLowerCase()];
  }
  function fpMkBtn(label, color) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('data-fp-ui', '1');
    b.style.cssText = 'all:unset;box-sizing:border-box;cursor:pointer;padding:4px 8px;'
      + 'border-radius:4px;color:' + color + ';font:500 12px/1 system-ui,-apple-system,sans-serif;';
    b.addEventListener('mouseenter', function () { b.style.background = 'rgba(255,255,255,.14)'; });
    b.addEventListener('mouseleave', function () { b.style.background = 'transparent'; });
    return b;
  }
  function fpEnsureBar() {
    if (fpBar) return fpBar;
    fpBar = document.createElement('div');
    fpBar.setAttribute('data-fp-ui', '1');
    fpBar.style.cssText = 'position:fixed;z-index:2147483647;display:none;align-items:center;'
      + 'gap:2px;padding:3px;background:#18181b;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.35);';
    // Drag grip — press and drag to move the selected element before/after
    // another element or inside a container. Uses pointer capture so the
    // drag keeps tracking even over iframes/inputs in the rendered page.
    var grip = fpMkBtn('⠇', '#a1a1aa');
    grip.title = 'Drag to move';
    grip.style.cursor = 'grab';
    grip.style.padding = '4px 6px';
    // Only `pointerdown` lives on the grip. Movement + release are tracked
    // on `window` (see fpStartDrag) — hiding the toolbar during the drag
    // detaches pointer capture from the grip in some browsers, so binding
    // move/up to the grip would silently drop the rest of the gesture.
    grip.addEventListener('pointerdown', function (e) {
      if (!fpSel) return;
      e.preventDefault();
      e.stopPropagation();
      fpStartDrag(e, grip);
    });
    var dup = fpMkBtn('Duplicate', '#e4e4e7');
    var del = fpMkBtn('Delete', '#fca5a5');
    dup.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); fpAct('duplicate'); });
    del.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); fpAct('delete'); });
    fpBar.appendChild(grip);
    fpBar.appendChild(dup);
    fpBar.appendChild(del);
    (document.body || document.documentElement).appendChild(fpBar);
    return fpBar;
  }
  function fpPosition() {
    if (!fpCur || !fpSel || !fpBar || fpBar.style.display === 'none') return;
    var r = fpSel.getBoundingClientRect();
    var top = r.top - 34;
    if (top < 4) top = r.top + 4;      // element hugs the top → drop below its edge
    fpBar.style.top = top + 'px';
    fpBar.style.left = (r.left < 4 ? 4 : r.left) + 'px';
  }
  function fpClearOutline() {
    if (fpSel && fpSelPrev) {
      fpSel.style.outline = fpSelPrev.o;
      fpSel.style.outlineOffset = fpSelPrev.off;
    }
    fpSel = null; fpSelPrev = null;
  }
  function showBar(el, path, tag, occurrence) {
    fpEnsureBar();
    fpClearOutline();
    fpSel = el;
    fpSelPrev = { o: el.style.outline, off: el.style.outlineOffset };
    el.style.outline = '2px solid rgb(59,130,246)';
    el.style.outlineOffset = '2px';
    fpCur = { path: path, tag: tag, occurrence: occurrence };
    fpBar.style.display = 'flex';
    fpPosition();
  }
  function hideBar() {
    if (fpBar) fpBar.style.display = 'none';
    fpClearOutline();
    fpCur = null;
  }
  function fpAct(action) {
    if (!fpCur) return;
    try {
      parent.postMessage({
        type: 'fp:action', action: action,
        path: fpCur.path, tag: fpCur.tag, occurrence: fpCur.occurrence,
      }, '*');
    } catch (_) {}
    // Parent saves + reloads this iframe on success; drop the toolbar now
    // so it doesn't linger over a soon-to-be-stale element.
    hideBar();
  }
  // --- Drag-to-move -----------------------------------------------------
  // Reimplements the outline's before/after/inside reorder on the canvas.
  // We can't use the parent's drag-and-drop across the iframe boundary, so
  // we track the drag here and postMessage the parent a `fp:move` with the
  // source + target (tag, occurrence) and a position; the parent resolves
  // both to source blocks, rewrites the template, and reloads this iframe.
  var fpDragging = false, fpDragEl = null, fpDragPath = null, fpGrip = null;
  var fpDropTarget = null, fpDropPos = null, fpInd = null;
  // Window-level drag handlers. Bound on drag start and removed on finish so
  // the gesture keeps tracking even after the captured grip is hidden. Named
  // (not inline) so the same reference can be removed.
  function fpOnMove(e) {
    if (!fpDragging) return;
    fpUpdateDrop(e.clientX, e.clientY);
  }
  function fpOnUp(e) {
    if (!fpDragging) return;
    e.preventDefault();
    e.stopPropagation();
    fpFinishDrag();
  }
  function fpEnsureInd() {
    if (fpInd) return fpInd;
    fpInd = document.createElement('div');
    fpInd.setAttribute('data-fp-ui', '1');
    fpInd.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;display:none;box-sizing:border-box;';
    (document.body || document.documentElement).appendChild(fpInd);
    return fpInd;
  }
  function fpShowInd(el, pos) {
    fpEnsureInd();
    var r = el.getBoundingClientRect();
    var s = fpInd.style;
    s.display = 'block';
    if (pos === 'inside') {
      s.background = 'transparent';
      s.border = '2px solid rgb(59,130,246)';
      s.borderRadius = '3px';
      s.left = r.left + 'px'; s.top = r.top + 'px';
      s.width = r.width + 'px'; s.height = r.height + 'px';
    } else {
      s.background = 'rgb(59,130,246)';
      s.border = 'none';
      s.borderRadius = '2px';
      s.left = r.left + 'px'; s.width = r.width + 'px'; s.height = '3px';
      s.top = ((pos === 'before' ? r.top : r.bottom) - 1.5) + 'px';
    }
  }
  function fpHideInd() { if (fpInd) fpInd.style.display = 'none'; }
  function fpStartDrag(e, grip) {
    fpDragging = true;
    fpDragEl = fpSel;
    fpDragPath = fpCur ? fpCur.path : null;
    fpDropTarget = null;
    fpGrip = grip;
    grip.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    // Best-effort capture keeps events flowing over nested iframes/inputs;
    // the window listeners below are the reliable fallback if it's dropped.
    try { grip.setPointerCapture(e.pointerId); } catch (_) {}
    window.addEventListener('pointermove', fpOnMove, true);
    window.addEventListener('pointerup', fpOnUp, true);
    window.addEventListener('pointercancel', fpOnUp, true);
    // Hide the toolbar so it can't sit under the pointer during hit-testing.
    fpBar.style.display = 'none';
  }
  function fpUpdateDrop(x, y) {
    // Indicator has pointer-events:none, toolbar is hidden — elementFromPoint
    // returns the real page element.
    var raw = document.elementFromPoint(x, y);
    var el = raw ? nearestVisual(raw) : null;
    if (!el || findSrc(el) !== fpDragPath || el === fpDragEl || fpDragEl.contains(el)) {
      fpDropTarget = null; fpHideInd(); return;
    }
    var r = el.getBoundingClientRect();
    var rel = r.height ? (y - r.top) / r.height : 0.5;
    var pos;
    if (fpCanContain(el) && rel > 0.30 && rel < 0.70) pos = 'inside';
    else pos = rel < 0.5 ? 'before' : 'after';
    fpDropTarget = el; fpDropPos = pos;
    fpShowInd(el, pos);
  }
  function fpFinishDrag() {
    fpDragging = false;
    window.removeEventListener('pointermove', fpOnMove, true);
    window.removeEventListener('pointerup', fpOnUp, true);
    window.removeEventListener('pointercancel', fpOnUp, true);
    document.body.style.userSelect = '';
    if (fpGrip) { fpGrip.style.cursor = 'grab'; fpGrip = null; }
    fpHideInd();
    if (fpDropTarget) {
      var toOcc = tagOccurrence(fpDropTarget, fpDragPath);
      var fromOcc = tagOccurrence(fpDragEl, fpDragPath);
      if (toOcc >= 0 && fromOcc >= 0) {
        try {
          parent.postMessage({
            type: 'fp:move', path: fpDragPath,
            fromTag: fpDragEl.tagName.toLowerCase(), fromOccurrence: fromOcc,
            toTag: fpDropTarget.tagName.toLowerCase(), toOccurrence: toOcc,
            position: fpDropPos,
          }, '*');
        } catch (_) {}
        // Valid drop → parent saves + reloads; leave the toolbar hidden.
        fpDragEl = null; fpDropTarget = null;
        return;
      }
    }
    // No / invalid target → restore the toolbar on the still-selected element.
    fpDragEl = null; fpDropTarget = null;
    if (fpCur) { fpBar.style.display = 'flex'; fpPosition(); }
  }
  // --- Drag-to-place (sidebar component → canvas) ----------------------
  // The sidebar can't drag across the iframe boundary either, so it streams
  // pointer coordinates via `fp:place-move` (iframe-relative x/y + the open
  // file path). We reuse the move indicator to show a before/after/inside
  // drop, then on `fp:place-end` (commit) post `fp:insert` back with the
  // target element (tag, occurrence) + position; the parent inserts the
  // component's `<Tag/>` at that source line, saves, and reloads us.
  var fpPlacePath = null, fpPlaceTarget = null, fpPlacePos = null;
  function fpUpdatePlace(x, y, path) {
    fpPlacePath = path;
    if (fpBar) fpBar.style.display = 'none';   // don't let the toolbar block hit-testing
    var raw = document.elementFromPoint(x, y);
    var el = raw ? nearestVisual(raw) : null;
    if (!el || findSrc(el) !== path) { fpPlaceTarget = null; fpHideInd(); return; }
    var r = el.getBoundingClientRect();
    var rel = r.height ? (y - r.top) / r.height : 0.5;
    var pos;
    if (fpCanContain(el) && rel > 0.30 && rel < 0.70) pos = 'inside';
    else pos = rel < 0.5 ? 'before' : 'after';
    fpPlaceTarget = el; fpPlacePos = pos;
    fpShowInd(el, pos);
  }
  function fpEndPlace(commit) {
    fpHideInd();
    var t = fpPlaceTarget, pos = fpPlacePos, path = fpPlacePath;
    fpPlaceTarget = null; fpPlacePath = null;
    if (commit && t) {
      var occ = tagOccurrence(t, path);
      if (occ >= 0) {
        try {
          parent.postMessage({
            type: 'fp:insert', path: path,
            tag: t.tagName.toLowerCase(), occurrence: occ, position: pos,
          }, '*');
        } catch (_) {}
      }
    }
    // Restore the selection toolbar if something was selected before the drag.
    if (fpCur && fpBar) { fpBar.style.display = 'flex'; fpPosition(); }
  }
  window.addEventListener('scroll', fpPosition, true);
  window.addEventListener('resize', fpPosition);

  document.addEventListener('click', function (e) {
    // Ignore clicks on our own injected chrome (the toolbar buttons).
    if (e.target.closest && e.target.closest('[data-fp-ui]')) return;
    // While editing, clicks inside the editable place the caret — don't turn
    // them into a fresh selection. Clicks outside first blur-commit the edit
    // (clearing fpEdit), so those still select normally.
    if (fpEdit) return;
    var path = findSrc(e.target);
    if (!path) { hideBar(); return; }
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
    if (tag && occurrence >= 0) showBar(resolve, path, tag, occurrence);
    else hideBar();
  }, true);
  // --- Inline text editing --------------------------------------------
  // Double-click a text element to edit it in place. The rendered DOM can't
  // reveal whether the text is a static literal or resolved `{{ ... }}`
  // output, so we probe the parent, which inspects the source and replies
  // with an `fp:text-verdict`: editable → contentEditable; data-bound → a
  // brief hint. Text with inline formatting (`<span>`, `<a>`, `<strong>`, …)
  // is editable and round-trips via innerHTML; only Twig/PHP values and
  // nested block markup are rejected — the parent's guard decides which.
  var fpEdit = null; // { el, tag, occurrence, path, prev, outlinePrev, offPrev }
  var fpHint = null, fpHintTimer = null;
  function fpTextCandidate(node) {
    var el = nearestVisual(node);
    if (!el) return null;
    var path = findSrc(el);
    if (!path) return null;
    var tag = el.tagName.toLowerCase();
    return { el: el, tag: tag, path: path, occurrence: tagOccurrence(el, path) };
  }
  function fpOnEditBlur() { fpEndEdit(false); }
  // --- Formatting toolbar (shown while editing) -----------------------
  // Bold / Italic act on the selection via execCommand (styleWithCSS off so
  // they emit <b>/<i> tags, which round-trip through the parent's inline-tag
  // guard). Align sets `text-align` live; the tag menu switches <p> ↔ <h1>–
  // <h6>. Buttons preventDefault on mousedown so the editable keeps focus and
  // selection — a plain focus loss would blur-commit the edit.
  var fpFmtBar = null, fpTagMenu = null;
  function fpFmtBtn(label, title, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('data-fp-ui', '1');
    b.title = title || '';
    b.textContent = label;
    b.style.cssText = 'all:unset;box-sizing:border-box;cursor:pointer;min-width:24px;'
      + 'text-align:center;padding:4px 6px;border-radius:4px;color:#e4e4e7;'
      + 'font:600 12px/1 system-ui,-apple-system,sans-serif;';
    b.addEventListener('mouseenter', function () { b.style.background = 'rgba(255,255,255,.14)'; });
    b.addEventListener('mouseleave', function () { b.style.background = 'transparent'; });
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); onClick(); });
    return b;
  }
  function fpFmtSep() {
    var s = document.createElement('div');
    s.setAttribute('data-fp-ui', '1');
    s.style.cssText = 'width:1px;align-self:stretch;background:rgba(255,255,255,.18);margin:2px 1px;';
    return s;
  }
  function fpExec(cmd) {
    if (!fpEdit) return;
    try { document.execCommand('styleWithCSS', false, false); } catch (_) {}
    try { document.execCommand(cmd, false, null); } catch (_) {}
    fpEdit.el.focus();
  }
  function fpAlign(dir) {
    if (!fpEdit) return;
    fpEdit.el.style.textAlign = dir;
    fpEdit.el.focus();
  }
  function fpToggleTagMenu(anchor) {
    if (!fpTagMenu) {
      fpTagMenu = document.createElement('div');
      fpTagMenu.setAttribute('data-fp-ui', '1');
      fpTagMenu.style.cssText = 'position:fixed;z-index:2147483647;display:none;flex-direction:column;'
        + 'background:#18181b;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.35);padding:3px;min-width:72px;';
      ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].forEach(function (t) {
        var it = fpFmtBtn(t.toUpperCase(), 'Switch to <' + t + '>', function () { fpPickTag(t); });
        it.style.textAlign = 'left'; it.style.width = '100%'; it.style.minWidth = '0';
        fpTagMenu.appendChild(it);
      });
      (document.body || document.documentElement).appendChild(fpTagMenu);
    }
    if (fpTagMenu.style.display === 'flex') { fpTagMenu.style.display = 'none'; return; }
    var r = anchor.getBoundingClientRect();
    fpTagMenu.style.display = 'flex';
    fpTagMenu.style.left = r.left + 'px';
    fpTagMenu.style.top = (r.bottom + 4) + 'px';
  }
  function fpPickTag(t) {
    if (!fpEdit) return;
    if (fpTagMenu) fpTagMenu.style.display = 'none';
    if (t === fpEdit.tag) return;
    // A tag rename can't be previewed on a live DOM node, so commit now with
    // the new tag; the reload re-renders the element as <t>.
    fpEdit.newTag = t;
    fpEndEdit(false);
  }
  function fpEnsureFmtBar() {
    if (fpFmtBar) return fpFmtBar;
    fpFmtBar = document.createElement('div');
    fpFmtBar.setAttribute('data-fp-ui', '1');
    fpFmtBar.style.cssText = 'position:fixed;z-index:2147483647;display:none;align-items:center;'
      + 'gap:1px;padding:3px;background:#18181b;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.35);';
    var bBtn = fpFmtBtn('B', 'Bold (⌘B)', function () { fpExec('bold'); });
    bBtn.style.fontWeight = '800';
    var iBtn = fpFmtBtn('I', 'Italic (⌘I)', function () { fpExec('italic'); });
    iBtn.style.fontStyle = 'italic';
    var tagBtn = fpFmtBtn('¶ ▾', 'Change tag', function () { fpToggleTagMenu(tagBtn); });
    fpFmtBar.appendChild(bBtn);
    fpFmtBar.appendChild(iBtn);
    fpFmtBar.appendChild(fpFmtSep());
    fpFmtBar.appendChild(fpFmtBtn('L', 'Align left', function () { fpAlign('left'); }));
    fpFmtBar.appendChild(fpFmtBtn('C', 'Align center', function () { fpAlign('center'); }));
    fpFmtBar.appendChild(fpFmtBtn('R', 'Align right', function () { fpAlign('right'); }));
    fpFmtBar.appendChild(fpFmtSep());
    fpFmtBar.appendChild(tagBtn);
    fpFmtBar._tagBtn = tagBtn;
    (document.body || document.documentElement).appendChild(fpFmtBar);
    return fpFmtBar;
  }
  function fpFmtPosition() {
    if (!fpEdit || !fpFmtBar || fpFmtBar.style.display === 'none') return;
    var r = fpEdit.el.getBoundingClientRect();
    var top = r.top - 34;
    if (top < 4) top = r.bottom + 4;
    fpFmtBar.style.top = top + 'px';
    fpFmtBar.style.left = (r.left < 4 ? 4 : r.left) + 'px';
  }
  function fpShowFmtBar() {
    if (!fpEdit) return;
    var bar = fpEnsureFmtBar();
    // Tag switch only applies to <p> / <h1>–<h6> blocks.
    var headingLike = /^(p|h[1-6])$/.test(fpEdit.tag);
    bar._tagBtn.style.display = headingLike ? '' : 'none';
    if (headingLike) bar._tagBtn.textContent = fpEdit.tag.toUpperCase() + ' ▾';
    bar.style.display = 'flex';
    fpFmtPosition();
  }
  window.addEventListener('scroll', fpFmtPosition, true);
  window.addEventListener('resize', fpFmtPosition);
  function fpBeginEdit() {
    if (!fpEdit) return;
    var el = fpEdit.el;
    hideBar(); // don't overlap the selection toolbar while typing
    fpEdit.prev = el.innerHTML;
    fpEdit.prevAlign = el.style.textAlign || '';
    fpEdit.newTag = null;
    fpEdit.outlinePrev = el.style.outline;
    fpEdit.offPrev = el.style.outlineOffset;
    el.setAttribute('contenteditable', 'true');
    el.style.outline = '2px solid rgb(34,197,94)';
    el.style.outlineOffset = '2px';
    el.addEventListener('blur', fpOnEditBlur, true);
    el.focus();
    try {
      var range = document.createRange();
      range.selectNodeContents(el);
      var sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
    } catch (_) {}
    fpShowFmtBar();
  }
  // Raw source editing for data-bound text: swap the rendered value for the
  // element's raw inner source (e.g. `{{ meta.title|default('') }}`) so the
  // user edits the expression itself on the canvas. Committed verbatim — no
  // formatting toolbar, amber outline to signal "editing source".
  function fpBeginRawEdit(raw) {
    if (!fpEdit) return;
    var el = fpEdit.el;
    hideBar();
    fpEdit.rawMode = true;
    fpEdit.prev = el.innerHTML;
    fpEdit.prevRaw = String(raw == null ? '' : raw);
    fpEdit.outlinePrev = el.style.outline;
    fpEdit.offPrev = el.style.outlineOffset;
    el.textContent = fpEdit.prevRaw;
    el.setAttribute('contenteditable', 'plaintext-only');
    el.style.outline = '2px solid rgb(245,158,11)';
    el.style.outlineOffset = '2px';
    el.addEventListener('blur', fpOnEditBlur, true);
    el.focus();
    try {
      var range = document.createRange();
      range.selectNodeContents(el);
      var sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
    } catch (_) {}
  }
  // Commit (revert=false) or discard (revert=true) the active edit. No-op
  // unless we're actually in contentEditable, so an Escape during the probe
  // wait can't act on a half-set state.
  function fpEndEdit(revert) {
    if (!fpEdit || !fpEdit.el.isContentEditable) { fpEdit = null; return; }
    var el = fpEdit.el, info = fpEdit;
    el.removeEventListener('blur', fpOnEditBlur, true);
    el.removeAttribute('contenteditable');
    el.style.outline = info.outlinePrev;
    el.style.outlineOffset = info.offPrev;
    if (fpFmtBar) fpFmtBar.style.display = 'none';
    if (fpTagMenu) fpTagMenu.style.display = 'none';
    fpEdit = null;

    // Raw source mode: read the edited expression, restore the rendered look
    // (until the reload re-renders it), and post the verbatim inner.
    if (info.rawMode) {
      var raw = el.textContent;
      el.innerHTML = info.prev;
      if (!revert && raw !== info.prevRaw) {
        try {
          parent.postMessage({
            type: 'fp:text', path: info.path, tag: info.tag,
            occurrence: info.occurrence, raw: raw,
          }, '*');
        } catch (_) {}
      }
      return;
    }

    var html = el.innerHTML;
    var align = el.style.textAlign || '';
    if (revert) {
      el.innerHTML = info.prev;
      el.style.textAlign = info.prevAlign;
      return;
    }
    // Only send the fields that actually changed; the parent no-ops on an
    // empty diff and reloads on any real change.
    var msg = { type: 'fp:text', path: info.path, tag: info.tag, occurrence: info.occurrence };
    var changed = false;
    if (html !== info.prev) { msg.html = html; changed = true; }
    if (align !== info.prevAlign) { msg.align = align; changed = true; }
    if (info.newTag && info.newTag !== info.tag) { msg.newTag = info.newTag; changed = true; }
    if (!changed) return;
    try { parent.postMessage(msg, '*'); } catch (_) {}
  }
  function fpShowHint(el, message) {
    if (!fpHint) {
      fpHint = document.createElement('div');
      fpHint.setAttribute('data-fp-ui', '1');
      fpHint.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;'
        + 'background:#18181b;color:#e4e4e7;font:500 11px/1.35 system-ui,-apple-system,sans-serif;'
        + 'padding:5px 8px;border-radius:5px;box-shadow:0 2px 10px rgba(0,0,0,.35);max-width:230px;';
      (document.body || document.documentElement).appendChild(fpHint);
    }
    fpHint.textContent = message;
    var r = el.getBoundingClientRect();
    fpHint.style.display = 'block';
    fpHint.style.top = ((r.top - 30 < 4) ? r.bottom + 6 : r.top - 30) + 'px';
    fpHint.style.left = (r.left < 4 ? 4 : r.left) + 'px';
    if (fpHintTimer) clearTimeout(fpHintTimer);
    fpHintTimer = setTimeout(function () { if (fpHint) fpHint.style.display = 'none'; }, 2400);
  }
  document.addEventListener('dblclick', function (e) {
    if (e.target.closest && e.target.closest('[data-fp-ui]')) return;
    if (fpEdit) return; // a probe / edit is already in flight
    var c = fpTextCandidate(e.target);
    if (!c || c.occurrence < 0) return;
    e.preventDefault();
    e.stopPropagation();
    fpEdit = c;
    try {
      parent.postMessage({
        type: 'fp:text-probe', path: c.path, tag: c.tag, occurrence: c.occurrence,
      }, '*');
    } catch (_) {}
  }, true);
  document.addEventListener('keydown', function (e) {
    if (!fpEdit || !fpEdit.el.isContentEditable) return;
    var meta = e.metaKey || e.ctrlKey;
    if (!fpEdit.rawMode) {
      if (meta && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); fpExec('bold'); return; }
      if (meta && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); fpExec('italic'); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); fpEndEdit(false); }
    else if (e.key === 'Escape') { e.preventDefault(); fpEndEdit(true); }
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
    if (!data) return;
    // Sidebar component placement drag: coordinates stream + commit/cancel.
    if (data.type === 'fp:place-move') { fpUpdatePlace(data.x, data.y, data.path); return; }
    if (data.type === 'fp:place-end')  { fpEndPlace(!!data.commit); return; }
    // Verdict for a pending double-click probe. Match it to the element we
    // queued so a stale reply can't hijack a newer edit.
    if (data.type === 'fp:text-verdict') {
      if (!fpEdit || fpEdit.tag !== data.tag
        || fpEdit.occurrence !== data.occurrence || fpEdit.path !== data.path) return;
      if (data.mode === 'rich') fpBeginEdit();
      else if (data.mode === 'raw') fpBeginRawEdit(data.raw);
      else {
        // Not inline-editable and no clean single-line expression — take the
        // user to the element's source row in the code panel and focus it.
        var target = fpEdit.el, info = fpEdit;
        fpEdit = null;
        try {
          parent.postMessage({
            type: 'fp:goto-source', path: info.path, tag: info.tag, occurrence: info.occurrence,
          }, '*');
        } catch (_) {}
        fpShowHint(target, 'Opened the code row to edit this');
      }
      return;
    }
    if (data.type !== 'fp:focus') return;
    var el = findByOccurrence(data.path, data.tag, data.occurrence);
    if (!el || !el.scrollIntoView) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Selecting from the outline gets the same persistent selection outline
    // + Duplicate/Delete toolbar as a click in the canvas.
    showBar(el, data.path, data.tag, data.occurrence);
  });
  // Subtle hover outline so the user can tell something is mappable.
  var style = document.createElement('style');
  style.textContent = '*:hover:not([data-fp-ui]) { outline: 1px dashed rgba(59,130,246,.4); outline-offset: 1px; cursor: crosshair; } [data-fp-ui] { cursor: pointer; }';
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
