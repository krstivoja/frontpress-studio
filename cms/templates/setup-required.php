<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Setup required — FrontPress Studio</title>
<style>
  /* This template renders before the SPA exists (or when it can't load), so
     it carries its own minimal styles. Visual language mirrors Login.jsx —
     zinc-100 background, white card, system font stack. */
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: #f4f4f5;
    color: #18181b;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    line-height: 1.5;
  }
  .card {
    width: 100%;
    max-width: 32rem;
    background: #fff;
    border: 1px solid #e4e4e7;
    border-radius: 0.5rem;
    box-shadow: 0 1px 2px rgba(0,0,0,.05);
    padding: 1.5rem;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .brand .logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    background: #18181b;
    color: #fff;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 600;
  }
  .brand h1 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0;
  }
  .alert {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #b91c1c;
    border-radius: 0.375rem;
    padding: 0.625rem 0.75rem;
    font-size: 0.8125rem;
    margin-bottom: 1rem;
  }
  p { font-size: 0.875rem; margin: 0.75rem 0; }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.8125rem;
    background: #f4f4f5;
    border: 1px solid #e4e4e7;
    border-radius: 0.25rem;
    padding: 0.0625rem 0.25rem;
  }
  .code {
    position: relative;
    margin: 0.75rem 0;
  }
  .code pre {
    background: #18181b;
    color: #fafafa;
    border-radius: 0.375rem;
    padding: 0.75rem 2.75rem 0.75rem 0.875rem;
    overflow-x: auto;
    margin: 0;
  }
  .code pre code {
    background: transparent;
    border: 0;
    padding: 0;
    color: inherit;
    font-size: 0.8125rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .copy-btn {
    position: absolute;
    top: 0.375rem;
    right: 0.375rem;
    background: #27272a;
    color: #d4d4d8;
    border: 1px solid #3f3f46;
    border-radius: 0.25rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.6875rem;
    font-family: inherit;
    font-weight: 500;
    line-height: 1;
    cursor: pointer;
    transition: background-color 120ms, color 120ms;
  }
  .copy-btn:hover { background: #3f3f46; color: #fafafa; }
  .copy-btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(250, 250, 250, 0.4);
  }
  .copy-btn[data-state="copied"] { color: #a7f3d0; }
  a { color: #18181b; text-decoration: underline; text-underline-offset: 2px; }
  a:hover { color: #3f3f46; }
  .footer { margin-top: 1.25rem; font-size: 0.8125rem; color: #71717a; }
</style>
</head>
<body>
<main class="card" role="main">
  <div class="brand">
    <span class="logo" aria-hidden="true">M</span>
    <h1>FrontPress Admin</h1>
  </div>

  <div class="alert" role="alert">
    No admin credentials are configured yet.
  </div>

  <p>Create <code><?= e($configFile) ?></code> with:</p>
  <div class="code">
    <pre><code id="snippet-env">&lt;?php
defined('FRONTPRESS_BOOT') || exit;

define('FPS_ADMIN_USER', 'admin');
define('FPS_ADMIN_PASS_HASH', '');</code></pre>
    <button type="button" class="copy-btn" data-copy-target="snippet-env">Copy</button>
  </div>

  <p>Generate a bcrypt hash for the password:</p>
  <div class="code">
    <pre><code id="snippet-hash">php -r "echo password_hash('yourpassword', PASSWORD_BCRYPT);"</code></pre>
    <button type="button" class="copy-btn" data-copy-target="snippet-hash">Copy</button>
  </div>

  <p>Paste the output as the value of <code>FPS_ADMIN_PASS_HASH</code>, then reload this page.</p>

  <p class="footer">Full instructions: <a href="https://frontpress.studio/docs/admin/" target="_blank" rel="noopener">Admin docs</a>.</p>
</main>
<script>
  // Clipboard API where available; fall back to a temporary textarea +
  // execCommand for non-secure contexts (e.g. plain http:// during local
  // setup). Resets the button label after ~1.5s.
  document.querySelectorAll('.copy-btn').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var target = document.getElementById(btn.dataset.copyTarget);
      if (!target) return;
      var text = target.innerText;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.top = '-1000px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        btn.textContent = 'Copied';
        btn.dataset.state = 'copied';
        setTimeout(function () {
          btn.textContent = 'Copy';
          delete btn.dataset.state;
        }, 1500);
      } catch (e) {
        btn.textContent = 'Press ⌘C';
        setTimeout(function () { btn.textContent = 'Copy'; }, 1500);
      }
    });
  });
</script>
</body>
</html>
