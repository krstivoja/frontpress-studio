# Documentation

This folder is the source for the FrontPress Studio documentation site, published via GitHub Pages with Jekyll and the [just-the-docs](https://github.com/just-the-docs/just-the-docs) remote theme.

**Live site:** https://frontpress.studio/docs

## Local preview (optional)

```bash
cd docs
bundle init
echo 'gem "jekyll"'          >> Gemfile
echo 'gem "jekyll-remote-theme"' >> Gemfile
echo 'gem "jekyll-seo-tag"'  >> Gemfile
bundle install
bundle exec jekyll serve
```

## Structure

- `_config.yml` — Jekyll site configuration
- `index.md` — landing page (install + structure)
- `content.md`, `templates.md`, `caching.md`, `admin.md`, `extending.md` — individual doc pages

Edit any `.md` file and push to `main`; GitHub Pages rebuilds automatically.
