<?php

defined('FRONTPRESS_BOOT') || exit;
/** @var string $cmsRoot */
$appRoot         = dirname(__DIR__, 2);
$srcRoot         = $appRoot . '/src';
$adminAssetsRoot = $appRoot . '/admin/assets';
$vite            = new FrontPress\Vite($srcRoot, $adminAssetsRoot);
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FrontPress Admin</title>
<?= $vite->tags('main.jsx') ?>
</head>
<body>
<div id="root"></div>
</body>
</html>
