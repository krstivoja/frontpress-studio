<?php

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

defined('FRONTPRESS_BOOT') || define('FRONTPRESS_BOOT', true);
require_once __DIR__ . '/../lib/template_helpers.php';

/**
 * Covers asset_url() cache-busting: css/js get an ?v=<mtime> fingerprint so a
 * new build can't be served stale by a CDN; fonts/images stay bare so relative
 * url() references inside CSS keep matching.
 */
class AssetUrlTest extends TestCase
{
    private string $themeDir;
    private ?string $prevTemplateDir;

    protected function setUp(): void
    {
        $this->themeDir = sys_get_temp_dir() . '/fp-asset-' . uniqid();
        mkdir($this->themeDir . '/assets/fonts', 0777, true);
        mkdir($this->themeDir . '/templates', 0777, true);
        file_put_contents($this->themeDir . '/assets/style.css', 'body{}');
        file_put_contents($this->themeDir . '/assets/app.js', 'void 0;');
        file_put_contents($this->themeDir . '/assets/fonts/Inter.woff2', 'x');

        $this->prevTemplateDir = $GLOBALS['fp_template_dir'] ?? null;
        $GLOBALS['fp_template_dir'] = $this->themeDir . '/templates';
    }

    protected function tearDown(): void
    {
        if ($this->prevTemplateDir === null) {
            unset($GLOBALS['fp_template_dir']);
        } else {
            $GLOBALS['fp_template_dir'] = $this->prevTemplateDir;
        }
        // best-effort cleanup
        @array_map('unlink', glob($this->themeDir . '/assets/fonts/*') ?: []);
        @array_map('unlink', glob($this->themeDir . '/assets/*') ?: []);
        @rmdir($this->themeDir . '/assets/fonts');
        @rmdir($this->themeDir . '/assets');
        @rmdir($this->themeDir . '/templates');
        @rmdir($this->themeDir);
    }

    public function testCssIsFingerprintedWithMtime(): void
    {
        $mtime = filemtime($this->themeDir . '/assets/style.css');
        $this->assertSame("/assets/style.css?v={$mtime}", asset_url('style.css'));
    }

    public function testJsIsFingerprinted(): void
    {
        $mtime = filemtime($this->themeDir . '/assets/app.js');
        $this->assertSame("/assets/app.js?v={$mtime}", asset_url('app.js'));
    }

    public function testNestedCssPathResolves(): void
    {
        mkdir($this->themeDir . '/assets/sub', 0777, true);
        file_put_contents($this->themeDir . '/assets/sub/x.css', 'a{}');
        $mtime = filemtime($this->themeDir . '/assets/sub/x.css');
        $this->assertSame("/assets/sub/x.css?v={$mtime}", asset_url('sub/x.css'));
        unlink($this->themeDir . '/assets/sub/x.css');
        rmdir($this->themeDir . '/assets/sub');
    }

    public function testFontsAndImagesAreNotFingerprinted(): void
    {
        $this->assertSame('/assets/fonts/Inter.woff2', asset_url('fonts/Inter.woff2'));
        $this->assertSame('/assets/hero.webp', asset_url('hero.webp'));
    }

    public function testMissingCssFallsBackToBareUrl(): void
    {
        $this->assertSame('/assets/nope.css', asset_url('nope.css'));
    }

    public function testLeadingSlashIsNormalized(): void
    {
        $mtime = filemtime($this->themeDir . '/assets/style.css');
        $this->assertSame("/assets/style.css?v={$mtime}", asset_url('/style.css'));
    }
}
