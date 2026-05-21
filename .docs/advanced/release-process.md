# Release process

How a new version of FrontPress Studio goes from `main` to a downloadable zip on GitHub Releases.

## Versioning

Single source of truth: `cms/VERSION`. One line, semver (`MAJOR.MINOR.PATCH`).

Every commit that changes user-visible behaviour:

1. Bumps `cms/VERSION`.
2. Adds an entry to `docs/changelog.md` under a new `## [X.Y.Z] — YYYY-MM-DD` heading.

Pre-`1.0` we're staying in `0.0.x` — every meaningful change is a patch bump, even breaking ones. Once the API surface stabilises we'll cut a `0.1.0` and start respecting semver more strictly.

## Local release build

```bash
cd app
./scripts/build-release.sh
```

What it does:

1. Reads `cms/VERSION`.
2. Switches `composer install` to `--no-dev` to drop test deps from the bundled vendor tree.
3. Builds the React admin (`cd src && npm run build`).
4. Zips the production-shaped tree to `dist/frontpress-studio-<version>.zip`.
5. Restores the dev composer install at the end so your working tree isn't left in `--no-dev` state.

The script mirrors what GitHub Actions does for tagged releases, so running it locally is the cheapest way to verify a release won't break in CI.

## What ships in the zip

```
frontpress-studio-<version>.zip
├── .htaccess
├── index.php
├── admin.php
├── admin/
│   └── assets/                    ← built React bundle
├── bootstrap.php
├── config.example.php             ← gets copied to config.php on first install
├── cms/
│   ├── lib/
│   ├── starters/                  ← bundled starter themes
│   ├── tests/                     ← left in for reference, not for production
│   ├── vendor/                    ← composer install --no-dev
│   ├── composer.json
│   ├── composer.lock
│   └── VERSION
├── router.php                     ← PHP built-in server dev helper
└── site/                          ← skeleton (empty content folder, default config)
    ├── config.example.json
    └── themes/                    ← empty; first run installs blank-twig
```

**Not in the zip:**

- `src/` (React source). Already built into `admin/assets/`.
- `node_modules/`, `cms/vendor-bin/`, dev composer deps.
- `docs/` Jekyll site (lives on GitHub Pages, not in the app).
- `.docs/`, `tests/`, `.git*`, `.editorconfig`, CI configs.
- Anyone's local `config.php`, `site/cache/`, or anything under `site/content/`.

## GitHub Actions

`.github/workflows/release.yml` triggers on a `v*` tag push:

1. `composer install --no-dev` in `cms/`.
2. `npm ci && npm run build` in `src/`.
3. `zip -r frontpress-studio-<version>.zip` of the production layout.
4. SHA-256 the zip.
5. Create the release on GitHub with the zip attached. Body is the changelog excerpt for that version.
6. Update `release-manifest.json` on a separate `manifest` branch — used by the in-admin self-update flow to verify downloads.

Tag, push, walk away.

```bash
# After bumping VERSION + changelog
git commit -am "v0.0.78"
git tag v0.0.78
git push origin main --tags
```

Actions does the rest.

## Manual release (when CI can't)

Same `./scripts/build-release.sh` locally, then:

1. Upload `dist/frontpress-studio-<version>.zip` to <https://github.com/krstivoja/frontpress-studio/releases/new>.
2. Tag it `v<version>` matching `cms/VERSION`.
3. Paste the changelog excerpt as the release body.
4. Compute the SHA-256 (`shasum -a 256 dist/frontpress-studio-<version>.zip`).
5. Update `release-manifest.json` on the `manifest` branch with the new entry:

   ```json
   {
     "version": "0.0.78",
     "tag": "v0.0.78",
     "zip": "https://github.com/krstivoja/frontpress-studio/releases/download/v0.0.78/frontpress-studio-0.0.78.zip",
     "sha256": "...",
     "changelog_excerpt": "..."
   }
   ```

6. Push.

The in-admin update flow polls `release-manifest.json` (not the GitHub Releases API directly), so this is the gate that controls whether an update appears in users' admins.

## Verifying a release before tagging

```bash
# 1. Build locally
./scripts/build-release.sh

# 2. Unzip into a scratch directory
mkdir /tmp/fp-test && cd /tmp/fp-test
unzip /path/to/repo/dist/frontpress-studio-<version>.zip

# 3. Spin up PHP
php -S localhost:8080 router.php

# 4. Visit http://localhost:8080/admin/, log in with fpsadmin/fpspass,
#    walk through: create a page, upload media, install a theme,
#    take a backup, restore it. Every screen should work.
```

If anything's broken, fix it on `main`, bump VERSION again, re-build.

## Skip list

Before tagging, verify:

- `cms/VERSION` matches the changelog's top entry.
- The changelog entry has actual content (not "TBD").
- `cms/tests` is green: `cd app/public/cms && ./vendor/bin/phpunit --no-progress`.
- PHPStan is clean: `php -d memory_limit=512M ./cms/vendor/bin/phpstan analyse --no-progress` (4 baseline errors expected; anything more is a regression).
- The release script exits 0.
- A fresh `unzip` + `php -S` install + manual smoke test passes.
- No console errors in the admin on a fresh install with the bundled defaults.

## Hotfixes

Bug fixes ship as the next patch version, not as a `.X.Y.Z-hotfix1`. The shortest possible turnaround is the goal — a regression in 0.0.77 is fixed in 0.0.78, not in `0.0.77.1`. Users running 0.0.77 update straight to 0.0.78 and the fix is live.
