[![][version]](https://github.com/krstivoja/frontpress-studio/releases/latest)
[![][commit]](https://github.com/krstivoja/frontpress-studio)
[![][stars]](https://github.com/krstivoja/frontpress-studio)

# FrontPress Studio

<img width="1000" height="688" alt="frontpress studio" src="https://github.com/user-attachments/assets/9cb7a9c5-058a-466d-921d-6ed4725f0ce2" />

## Global website settings
<img width="5120" height="2880" alt="Global settings" src="https://github.com/user-attachments/assets/9dd66759-901c-443f-ac08-61a356f98424" />

## Media library
This is global. There is also have per post media as well.
<img width="5120" height="2880" alt="Global media library" src="https://github.com/user-attachments/assets/68e5cc72-252e-4414-87b7-456121d9acec" />

## Theme editor
<img width="5120" height="2880" alt="Theme Editor" src="https://github.com/user-attachments/assets/70ec5ec5-e16d-4dbe-9c03-b39b81c6300a" />

## Fields
In wordpress you would need to use ACF or Metabox to get this
<img width="5120" height="2880" alt="Fields" src="https://github.com/user-attachments/assets/1991ed9c-63d0-484d-9a08-79588b248cd6" />

## Markdown editor
<img width="5120" height="2880" alt="Editor" src="https://github.com/user-attachments/assets/15af6302-ef06-4295-aa16-d9d2b3aeeba6" />

## Backup
<img width="5120" height="2880" alt="backup" src="https://github.com/user-attachments/assets/03626f7a-0706-4b5b-bd88-a917aa64a83c" />



Ultralight flat-file CMS built in PHP. No database. Content is Markdown files on disk; the admin is a browser UI at `/admin`.

- **Docs:** https://frontpress.studio/docs
- **Releases:** https://github.com/krstivoja/frontpress-studio/releases

## Requirements

- PHP 8.1+
- Apache with `mod_rewrite` (or nginx with the equivalent rewrites)
- Composer (for source installs only)

## Install

### Shared hosting (zip)

Download `frontpress-studio-<version>.zip` from [Releases](https://github.com/krstivoja/frontpress-studio/releases) and unzip its contents into your domain's document root. Visit `/admin` and sign in with **`fpsadmin`** / **`fpspass`** — a persistent banner will nag you until you set a real password under **Settings → Security**.

### Source install (development)

```bash
git clone https://github.com/krstivoja/frontpress-studio.git
cd frontpress-studio/app
composer install --working-dir=cms

# Admin SPA (React + Vite)
cd src
npm install
npm run dev    # HMR on localhost:5173 — visit /admin/ on your PHP host
npm run build  # production assets to ../admin/assets/
```

See the [full docs](https://frontpress.studio/docs) for directory layout, theming, caching, and the extending guide.

## Using FrontPress with Claude Code

Every install ships two Claude skills under `.claude/skills/`:

- **`frontpress-theme`** — theme authoring, content modelling, front-matter schema, fields and forms configurator. Auto-loads when Claude works inside `site/themes/<name>/` or `site/content/`.
- **`frontpress-cms`** — framework internals: PHP classes under `cms/lib/`, REST controllers, the update + backup pipelines. Auto-loads when Claude touches `cms/` or root entry-point PHP.

Open your install's root directory in [Claude Code](https://claude.com/claude-code) and the skills auto-discover from `.claude/skills/` — no "connect site folder" step. Claude will know how the CMS works, how fields and taxonomies map to front matter, and how to build a theme without you having to re-explain it every session.

## Sponsor

FrontPress Studio is built and maintained by [Marko Krstić](https://markokrstic.com) in the open. If it saves you time, please consider sponsoring — it directly funds new features, docs, and maintenance.

- **Ko-fi:** https://ko-fi.com/dplugins
- **Buy Me a Coffee:** https://buymeacoffee.com/krstivoja
- **PayPal (one-time):** https://www.paypal.me/newinstockholm

Sponsors are credited in the changelog and on the docs site (opt-in).

## License

MIT — see [LICENSE](LICENSE).

[version]: https://img.shields.io/github/v/release/krstivoja/frontpress-studio?style=flat-square
[commit]: https://img.shields.io/github/last-commit/krstivoja/frontpress-studio?style=flat-square
[stars]: https://img.shields.io/github/stars/krstivoja/frontpress-studio?style=flat-square
