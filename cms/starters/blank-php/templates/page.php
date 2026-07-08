<?php partial('header', ['page_title' => $meta['title'] ?? 'Page', 'meta' => $meta]); ?>

<article>
  <h1 class="page-title"><?= e($meta['title'] ?? '') ?></h1>
  <?= $html ?>
</article>

<?php partial('footer'); ?>
