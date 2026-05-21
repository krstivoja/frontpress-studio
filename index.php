<?php

declare(strict_types=1);

// Webserver-agnostic admin dispatch: if a request to /admin/* falls
// through to this front controller (Local by Flywheel, shared-host
// nginx defaults, anywhere without a dedicated `location /admin { ... }`
// rule), hand it off to admin/index.php so the framework works out of
// the box without site-config edits.
//
// Done before anything else so admin/index.php owns the session, headers,
// and FRONTPRESS_BOOT define on its own — no double session_start, no
// constant redeclare notice.
$_fp_path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
if ($_fp_path === '/admin' || str_starts_with($_fp_path, '/admin/')) {
    require __DIR__ . '/admin/index.php';
    exit;
}
unset($_fp_path);

define('FRONTPRESS_BOOT', true);

session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Strict']);
session_start();

require __DIR__ . '/bootstrap.php';

$GLOBALS['admin_logged_in'] = !empty($_SESSION['admin_user']);
$GLOBALS['admin_edit_path'] = null;

$url = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';

// ── /uploads/* — image-only static serve ──────────────────────────────────────
// Resolution order:
//   1. site/content/<rest>   — per-post images stored next to the .md file
//   2. site/uploads/<rest>   — global media library
// Only image extensions are served; .md and any other type returns 404.
// realpath containment guards against `..` escapes.

if (str_starts_with($url, '/uploads/')) {
    $rel = ltrim(rawurldecode(substr($url, strlen('/uploads/'))), '/');
    if ($rel === '' || !preg_match('#^[a-zA-Z0-9._/-]+$#', $rel) || str_contains($rel, '..')) {
        not_found($url);
        exit;
    }
    if (!preg_match('/\.(jpe?g|png|gif|webp|svg|avif|mp4|webm|mov|m4v|ogv|ogg)$/i', $rel)) {
        not_found($url);
        exit;
    }

    $bases = [$CONTENT_DIR, $UPLOADS_DIR];
    foreach ($bases as $base) {
        $real     = realpath($base . '/' . $rel);
        $baseReal = realpath($base);
        if (!$real || !$baseReal || !str_starts_with($real, $baseReal . '/')) {
            continue;
        }
        $ext   = strtolower(pathinfo($real, PATHINFO_EXTENSION));
        $mimes = [
            'jpg'  => 'image/jpeg', 'jpeg' => 'image/jpeg',
            'png'  => 'image/png',  'gif'  => 'image/gif',
            'webp' => 'image/webp', 'svg'  => 'image/svg+xml',
            'avif' => 'image/avif',
            'mp4'  => 'video/mp4', 'm4v'  => 'video/mp4',
            'webm' => 'video/webm',
            'mov'  => 'video/quicktime',
            'ogv'  => 'video/ogg',  'ogg'  => 'video/ogg',
        ];
        header('Content-Type: ' . ($mimes[$ext] ?? 'application/octet-stream'));
        header('Content-Length: ' . filesize($real));
        header('Cache-Control: public, max-age=31536000, immutable');
        // Defence-in-depth alongside SVG sanitisation: refuse to let browsers
        // re-sniff the type and ensure SVGs render in an isolated context so an
        // unexpected script payload can't reach the page that embeds them.
        header('X-Content-Type-Options: nosniff');
        if ($ext === 'svg') {
            header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox");
        }
        readfile($real);
        exit;
    }
    not_found($url);
    exit;
}

// ── robots.txt ────────────────────────────────────────────────────────────────

if ($url === '/robots.txt') {
    header('Content-Type: text/plain; charset=utf-8');
    echo "User-agent: *\nDisallow: /admin/\nSitemap: " . FrontPress\Url::absolute('/sitemap.xml', $config, $_SERVER) . "\n";
    exit;
}

// ── sitemap.xml ───────────────────────────────────────────────────────────────

if ($url === '/sitemap.xml') {
    $allPages = $index->get();

    $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
    $xml .= '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
    foreach ($allPages as $page) {
        if (!empty($page['draft'])) {
            continue;
        }
        $loc     = htmlspecialchars(FrontPress\Url::forPage($page, $config, $_SERVER));
        $lastmod = !empty($page['date']) ? date('Y-m-d', strtotime((string)$page['date'])) : date('Y-m-d');
        $xml .= "  <url><loc>{$loc}</loc><lastmod>{$lastmod}</lastmod></url>\n";
    }
    $xml .= '</urlset>';

    header('Content-Type: application/xml; charset=utf-8');
    echo $xml;
    exit;
}

// ── Block public access to submission folders ───────────────────────────────
// Every configured form name is also the folder its submissions land in
// (e.g. `forms.contact` → `site/content/contact/`). Submissions are saved
// with `draft: true` so the renderer already 404s them individually; we
// belt-and-braces 404 the whole subtree so an attacker can't guess at
// filenames either. The bare `/contact` URL is left alone — that resolves
// to `pages/contact.md` (or a folder archive) and is the natural spot for
// the public contact form. The admin's Pages list still surfaces the
// submission folder normally.
$_fp_forms = (array)$config->get('forms', []);
foreach ($_fp_forms as $_fp_name => $_fp_spec) {
    $_fp_name = (string)$_fp_name;
    if ($_fp_name === '') continue;
    if (str_starts_with($url, '/' . $_fp_name . '/')) {
        not_found($url);
        exit;
    }
}
unset($_fp_forms, $_fp_name, $_fp_spec);

// ── /submit/<form> — public form submission handler ─────────────────────────
// One generic POST endpoint, configurable per form via site/config.json:
//   forms.<name>.{to, subject_prefix, fields[], honeypot_field,
//                 rate_limit_per_hour, success_redirect, store_submissions}
// Honeypot + per-IP rate-limit guard the endpoint; CSRF intentionally NOT
// required (the submitter is anonymous and the operator can't pre-share a
// token with them). Field whitelist + server-side type validation come
// from the same `fields` list the admin builder edits.

if (str_starts_with($url, '/submit/')) {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        http_response_code(405);
        echo 'Method not allowed';
        exit;
    }

    $name = preg_replace('/[^a-z0-9_-]/', '', strtolower(substr($url, strlen('/submit/'))));
    $forms = (array)$config->get('forms', []);
    $spec  = $forms[$name] ?? null;
    if (!$spec) {
        http_response_code(404);
        echo 'Unknown form';
        exit;
    }

    $redirect = (string)($spec['success_redirect'] ?? '/?sent=1');
    $errRedirect = function (string $err) use ($redirect) {
        $sep = str_contains($redirect, '?') ? '&' : '?';
        header('Location: ' . $redirect . $sep . 'err=' . urlencode($err), true, 303);
        exit;
    };

    // Honeypot — bots fill every field; humans leave the hidden one empty.
    // We mirror a "thanks!" redirect so bots can't tell they were caught.
    $hp = (string)($spec['honeypot_field'] ?? 'website');
    if (!empty($_POST[$hp])) {
        header('Location: ' . $redirect, true, 303);
        exit;
    }

    // Rate limit. Key is form + IP so each form can have its own budget.
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $cfgBag = [
        'appRoot'    => __DIR__,
        'cacheDir'   => $CACHE_DIR,
        'config'     => $config,
        'contentDir' => $CONTENT_DIR,
        'uploadsDir' => $UPLOADS_DIR,
        'themesDir'  => __DIR__ . '/site/themes',
    ];
    $limiter = FrontPress\Api\ServiceFactory::rateLimiter($cfgBag);
    $max = (int)($spec['rate_limit_per_hour'] ?? 5);
    if ($max > 0 && !$limiter->check("$name:$ip", $max, 3600)) {
        http_response_code(429);
        echo 'Too many requests — try again later.';
        exit;
    }

    // Collect + validate fields against the spec.
    $errors  = [];
    $payload = [];
    foreach ((array)($spec['fields'] ?? []) as $f) {
        if (!is_array($f)) continue;
        $fname    = (string)($f['name'] ?? '');
        if ($fname === '') continue;
        $ftype    = (string)($f['type'] ?? 'text');
        $required = !empty($f['required']);
        $raw      = $_POST[$fname] ?? '';
        $v        = is_string($raw) ? trim($raw) : '';
        if ($v === '') {
            if ($required && $ftype !== 'checkbox') $errors[$fname] = 'required';
            if ($ftype === 'checkbox' && $required) $errors[$fname] = 'required';
            continue;
        }
        $v = mb_substr($v, 0, 5000);
        switch ($ftype) {
            case 'email':
                if (!filter_var($v, FILTER_VALIDATE_EMAIL)) { $errors[$fname] = 'invalid_email'; continue 2; }
                break;
            case 'url':
                if (!filter_var($v, FILTER_VALIDATE_URL)) { $errors[$fname] = 'invalid_url'; continue 2; }
                break;
            case 'tel':
                if (!preg_match('/^[0-9+\-() ]{4,32}$/', $v)) { $errors[$fname] = 'invalid_tel'; continue 2; }
                break;
            case 'select':
                $choices = (array)($f['choices'] ?? []);
                if (!in_array($v, $choices, true)) { $errors[$fname] = 'invalid_choice'; continue 2; }
                break;
            case 'checkbox':
                $v = '1';
                break;
            case 'text':
            case 'textarea':
            default:
                // Just trimmed — already capped at 5000 chars above.
                break;
        }
        $payload[$fname] = $v;
    }

    if (!empty($errors)) {
        $firstField = array_key_first($errors);
        $errRedirect($errors[$firstField] . ':' . $firstField);
    }

    // Build the outgoing email body — every collected field on its own
    // labelled paragraph. Reply-To is the submitter's email if present.
    $bodyLines = [];
    foreach ($payload as $k => $v) {
        $label = ucfirst(str_replace('_', ' ', $k));
        $bodyLines[] = $label . ":\n" . $v;
    }
    $emailBody = implode("\n\n", $bodyLines) . "\n\n— Sent from " . ($_SERVER['HTTP_HOST'] ?? 'site') . " at " . date(\DATE_ATOM);

    $subjectName = $payload['name'] ?? ($payload['email'] ?? 'New submission');
    $subject = trim(((string)($spec['subject_prefix'] ?? '')) . ' ' . $subjectName);
    if ($subject === '') $subject = 'New submission';

    $emailRes = ['ok' => false, 'transport' => 'none'];
    $to = (string)($spec['to'] ?? '');
    if ($to !== '') {
        $mailer = FrontPress\Api\ServiceFactory::mailer($cfgBag);
        $replyTo = $payload['email'] ?? null;
        $emailRes = $mailer->send($to, $subject, $emailBody, $replyTo);
    }

    if (!empty($spec['store_submissions'])) {
        try {
            // Persist as a regular content file under `<form>/`. Always
            // draft so it never appears on the public site even by accident
            // (the route-block above is the second lock). The Pages list
            // surfaces the folder automatically once the first submission
            // lands; operators get search / trash / backup for free.
            $now    = new DateTimeImmutable('now', new DateTimeZone('UTC'));
            $slug   = $now->format('Y-m-d-His') . '-' . bin2hex(random_bytes(2));
            $relRaw = $name . '/' . $slug;
            $folder = $CONTENT_DIR . '/' . $name;
            if (!is_dir($folder)) @mkdir($folder, 0755, true);

            $title = trim((string)($payload['name'] ?? $payload['email'] ?? $payload['subject'] ?? 'Submission'));
            if ($title === '') $title = 'Submission';

            $meta = array_merge($payload, [
                'title'              => $title . ' — ' . $now->format('M j, Y g:i A'),
                'date'               => $now->format('Y-m-d'),
                'draft'              => true,
                'submitted_at'       => $now->format(\DATE_ATOM),
                'submitted_ip'       => $ip,
                'submitted_ua'       => $_SERVER['HTTP_USER_AGENT'] ?? null,
                'form'               => $name,
                'delivery_ok'        => (bool)$emailRes['ok'],
                'delivery_transport' => (string)$emailRes['transport'],
            ]);
            if (!empty($emailRes['error'])) $meta['delivery_error'] = (string)$emailRes['error'];

            // The markdown body — preferentially the `message` field, since
            // that's the long-form text on most contact forms. Fall back to
            // a labelled dump of every field when no `message` is present.
            $body = !empty($payload['message'])
                ? (string)$payload['message']
                : implode("\n\n", array_map(
                    fn ($k, $v) => '**' . ucfirst(str_replace('_', ' ', (string)$k)) . ":**\n" . $v,
                    array_keys($payload), array_values($payload),
                ));

            FrontPress\Api\ServiceFactory::repository($cfgBag)->save($relRaw, $meta, $body);
        } catch (\Throwable $e) {
            error_log('[fp.submit] persist failed: ' . $e->getMessage());
        }
    }

    header('Location: ' . $redirect, true, 303);
    exit;
}

$route = $router->resolve($url);

switch ($route['type']) {
    case 'post':
    case 'page':
        $GLOBALS['admin_edit_path'] = $route['path'];
        $data                       = $content->load($route['path']);
        if ($data === null || !empty($data['meta']['draft'])) {
            not_found($url);
            break;
        }
        $template = $route['type'];
        if (!empty($data['meta']['template'])) {
            $override = $themes->resolveTemplate((string)$data['meta']['template']);
            if ($override) {
                $template = $override;
            }
        }
        render($template, [
            'meta'  => $data['meta'],
            'html'  => $data['html'],
            'route' => $route,
        ]);
        break;

    case 'feed':
        $siteName = $config->get('site', [])['name'] ?? 'Site';
        $folder   = $route['folder'];
        $all      = array_values($folder ? $index->filter(['folder' => $folder]) : $index->get());
        $items    = array_slice($all, 0, 20);
        $title    = $folder ? ($siteName . ' — ' . ucfirst($folder)) : $siteName;
        $feedUrl  = FrontPress\Url::absolute($folder ? '/' . $folder . '/feed' : '/feed', $config, $_SERVER);
        $siteUrl  = FrontPress\Url::absolute('/', $config, $_SERVER);
        $updated  = $items ? max(array_map(fn ($p) => (int)($p['mtime'] ?? 0), $items)) : time();
        // Resolve each item to an absolute URL up front so the template stays dumb.
        foreach ($items as &$it) {
            $it['absolute_url'] = FrontPress\Url::forPage($it, $config, $_SERVER);
        }
        unset($it);
        header('Content-Type: application/atom+xml; charset=utf-8');
        render('feed', [
            'site_name' => $siteName,
            'title'     => $title,
            'site_url'  => $siteUrl,
            'feed_url'  => $feedUrl,
            'updated'   => $updated,
            'items'     => $items,
        ]);
        break;

    case 'taxonomy':
        $found = $index->findByTaxonomyTerm($route['taxonomy'], $route['term']);
        if (!$found['posts']) {
            not_found($url);
            break;
        }
        $perPage = (int)$config->get('posts_per_page', 10);
        if ($perPage < 1) {
            $perPage = 10;
        }
        $total = count($found['posts']);
        $pages = max(1, (int)ceil($total / $perPage));
        $page  = max(1, (int)($route['page'] ?? 1));
        if ($page > $pages) {
            not_found($url);
            break;
        }
        $items = array_slice($found['posts'], ($page - 1) * $perPage, $perPage);
        foreach ($items as &$it) {
            $it = array_merge($it['meta'] ?? [], $it);
        }
        unset($it);
        render('taxonomy', [
            'taxonomy'    => $route['taxonomy'],
            'term'        => $route['term'],
            'label'       => $found['label'] ?? $route['term'],
            'items'       => $items,
            'posts'       => $items, // alias — most theme conventions use `posts`
            'page'        => $page,
            'total_pages' => $pages,
            'per_page'    => $perPage,
        ]);
        break;

    case 'archive':
        $intro   = $content->load($route['folder'] . '/_index');
        $all     = array_values($index->filter(['folder' => $route['folder']]));
        $perPage = (int)($intro['meta']['posts_per_page'] ?? $config->get('posts_per_page', 10));
        if ($perPage < 1) {
            $perPage = 10;
        }
        $total = count($all);
        $pages = max(1, (int)ceil($total / $perPage));
        $page  = max(1, (int)($route['page'] ?? 1));
        if ($page > $pages) {
            not_found($url);
            break;
        }
        $items = array_slice($all, ($page - 1) * $perPage, $perPage);
        // Flatten meta into each post so themes can use `post.image`,
        // `post.excerpt`, etc. Canonical fields (title, url, date) win over
        // any same-named meta keys.
        foreach ($items as &$it) {
            $it = array_merge($it['meta'] ?? [], $it);
        }
        unset($it);
        // List of every content folder (for filter-tabs and similar).
        $folders = array_values(array_unique(array_filter(array_map(
            fn ($p) => $p['folder'] ?? null,
            $index->get(),
        ))));
        render('archive', [
            'folder'      => $route['folder'],
            'items'       => $items,
            'posts'       => $items, // alias — most theme conventions use `posts`
            'folders'     => $folders,
            'intro'       => $intro,
            'page'        => $page,
            'total_pages' => $pages,
            'per_page'    => $perPage,
        ]);
        break;

    default:
        not_found($url);
        break;
}
