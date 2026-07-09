<?php

declare(strict_types=1);

use FrontPress\ScssCompiler;
use PHPUnit\Framework\TestCase;

class ScssCompilerTest extends TestCase
{
    private string $themeDir;

    protected function setUp(): void
    {
        $this->themeDir = sys_get_temp_dir() . '/fp_scss_' . uniqid();
        mkdir($this->themeDir . '/assets', 0777, true);
    }

    protected function tearDown(): void
    {
        $this->rmrf($this->themeDir);
    }

    public function testAssetsMtimeReturnsZeroWithoutAssetsDir(): void
    {
        $bare = sys_get_temp_dir() . '/fp_scss_bare_' . uniqid();
        mkdir($bare, 0777, true);
        try {
            self::assertSame(0, (new ScssCompiler())->assetsMtime($bare));
        } finally {
            $this->rmrf($bare);
        }
    }

    public function testAssetsMtimeTracksNewestSource(): void
    {
        $compiler = new ScssCompiler();
        $scss     = $this->themeDir . '/assets/style.scss';

        file_put_contents($scss, 'body { color: red; }');
        touch($scss, 1_000);
        self::assertSame(1_000, $compiler->assetsMtime($this->themeDir));

        // A newer file anywhere under assets/ bumps the token — this is what
        // the live-reload poller compares against to trigger a stylesheet swap.
        $partial = $this->themeDir . '/assets/_tokens.scss';
        file_put_contents($partial, '$c: red;');
        touch($partial, 2_000);
        self::assertSame(2_000, $compiler->assetsMtime($this->themeDir));
    }

    public function testCompileThemeWritesSiblingCss(): void
    {
        file_put_contents($this->themeDir . '/assets/style.scss', 'body { color: red; }');

        $result = (new ScssCompiler())->compileTheme($this->themeDir);

        self::assertContains('style.css', $result['compiled']);
        self::assertSame([], $result['errors']);
        self::assertFileExists($this->themeDir . '/assets/style.css');
    }

    private function rmrf(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        $it = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($it as $f) {
            $f->isDir() ? rmdir($f->getPathname()) : unlink($f->getPathname());
        }
        rmdir($dir);
    }
}
