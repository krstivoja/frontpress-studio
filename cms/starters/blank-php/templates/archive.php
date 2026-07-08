<?php
$folderLabel = ucfirst($folder ?? 'Blog');
partial('header', ['page_title' => $folderLabel]);
?>

<h1 class="page-title"><?= e($folderLabel) ?></h1>

<?php if (!empty($intro['html'])): ?>
  <div><?= $intro['html'] ?></div>
<?php endif; ?>

<?php if (!empty($posts) && is_iterable($posts)): ?>
  <ul class="archive-list">
    <?php foreach ($posts as $post): ?>
      <li class="archive-item">
        <a href="<?= e($post['url']) ?>"><?= e($post['title']) ?></a>
        <?php if (!empty($post['date'])): ?>
          <div class="archive-meta"><time><?= e($post['date']) ?></time></div>
        <?php endif; ?>
      </li>
    <?php endforeach; ?>
  </ul>

  <?= paginate((int)($page ?? 1), (int)($total_pages ?? 1), '/' . ($folder ?? '')) ?>
<?php else: ?>
  <p>No posts yet.</p>
<?php endif; ?>

<?php partial('footer'); ?>
