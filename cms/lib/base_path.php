<?php

declare(strict_types=1);

defined('FRONTPRESS_BOOT') || exit;

if (!function_exists('fp_base_path')) {
    /**
     * Install subfolder FrontPress is running from, derived from SCRIPT_NAME
     * so no config is needed for `https://host/peach/` style installs.
     * Root installs return ''. Both front controllers (index.php and
     * admin/index.php, one directory apart) resolve to the same value.
     *
     * @param array<string, mixed> $server Usually $_SERVER
     */
    function fp_base_path(array $server): string
    {
        $script = str_replace('\\', '/', (string)($server['SCRIPT_NAME'] ?? ''));
        $dir    = rtrim(dirname($script), '/');
        if ($dir === '' || $dir === '.') {
            return '';
        }
        if ($dir === '/admin' || str_ends_with($dir, '/admin')) {
            $dir = substr($dir, 0, -strlen('/admin'));
        }
        return $dir;
    }
}
