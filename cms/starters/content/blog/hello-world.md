---
title: Hello, world
date: 2026-04-30
tags: [welcome]
categories: [news]
excerpt: A starter post showing front matter, Markdown body, and taxonomy. Edit or delete from the admin.
---

# Hello, world

This is a starter post — feel free to **edit** or **delete** it from the admin at [/admin/](/admin/).

## What this file demonstrates

- **Front matter.** The YAML block at the top of this file (look at the source) defines the post's `title`, `date`, `tags`, `categories`, and an `excerpt` shown on archive pages. Add any custom field you like; it'll be available in templates.
- **Markdown body.** Everything below the front matter is plain Markdown — headings, lists, [links](https://frontpress.studio/docs), `inline code`, images, and code blocks all work.
- **Automatic taxonomy archives.** Click [#welcome](/tags/welcome) to see a tag archive, or [news](/categories/news) for the category archive — both routes are generated from the front matter, no setup required.

## Where to go next

- Edit this post: [/admin/blog/hello-world](/admin/blog/hello-world)
- Create a new post: click **New** in the admin sidebar
- Customize the archive intro: edit [`site/content/blog/_index.md`](/admin/blog/_index)
- Read the docs: <https://frontpress.studio/docs>

```php
// Templates can query posts directly:
$recent = posts(['folder' => 'blog', 'limit' => 3]);
```

Happy writing.
