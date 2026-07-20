<?php

defined('FRONTPRESS_BOOT') || exit;
/** @var string $cmsRoot */
$appRoot         = dirname(__DIR__, 2);
$srcRoot         = $appRoot . '/src';
$adminAssetsRoot = $appRoot . '/admin/assets';
// Install subfolder (see cms/lib/base_path.php), '' for root installs.
$basePath        = (string)($GLOBALS['fp_base_path'] ?? '');
$vite            = new FrontPress\Vite($srcRoot, $adminAssetsRoot, $basePath . '/admin/assets/');
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FrontPress Admin</title>
<script>window.__FP_BASE__ = <?= json_encode($basePath) ?>;</script>
<?= $vite->tags('main.jsx') ?>
</head>
<body>
<div id="root"></div>
</body>
</html>
