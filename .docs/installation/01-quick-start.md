# Quick start

Five minutes from zero to a running CMS.

## On shared hosting (the typical case)

1. Download the latest `frontpress-studio-<version>.zip` from [GitHub Releases](https://github.com/krstivoja/frontpress-studio/releases).
2. Unzip its **contents** directly into your domain's document root (`public_html/`, `htdocs/example.com/`, whatever your host calls it). The folder should sit alongside any existing files the way WordPress lives next to `wp-config.php`:

   ```
   public_html/
   ├── .htaccess
   ├── index.php
   ├── admin/
   ├── admin.php
   ├── bootstrap.php
   ├── config.php
   ├── cms/
   └── site/
   ```

3. Visit `/admin/` in a browser.
4. Sign in with the bundled defaults: username **`fpsadmin`**, password **`fpspass`**.
5. A red banner across the top of the admin nags you until you set a real password — open **Settings → Security** and rotate it.

That's it. The default `blank` theme is active. Visit `/` and you'll see an empty archive — create your first page from the **Pages** screen.

## Local development

If you want to work on FrontPress Studio itself (or hack on a theme with the dev server), clone the source:

```bash
git clone https://github.com/krstivoja/frontpress-studio.git
cd frontpress-studio/app
composer install --working-dir=cms     # PHP deps
```

The admin UI is a React app built with Vite:

```bash
cd src
npm install
npm run dev      # HMR at localhost:5173 — visit /admin/ on your PHP host
npm run build    # production assets to ../admin/assets/
```

Point a local PHP server at `app/public/`:

```bash
cd app/public
php -S localhost:8000 router.php
```

Then visit <http://localhost:8000/admin/>.

If you use [Local by Flywheel](https://localwp.com/) or MAMP / XAMPP / Docker, point the site root at `app/public/` and you're done.

## First content

1. **Pages** → choose a folder (or create one) → **Create your first page**.
2. Write some Markdown. The toolbar has buttons for headings, lists, images, code blocks.
3. **Save**.
4. Visit `/<folder>/<slug>` on the public site to see it rendered.

Next: [Pages and posts](../features/pages-and-posts.md) covers front matter, taxonomies, per-page templates.
