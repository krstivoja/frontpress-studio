<?php

declare(strict_types=1);

use FrontPress\Config;
use FrontPress\ThemeFiles;
use PHPUnit\Framework\TestCase;

class ThemeFilesTest extends TestCase
{
    private string $appRoot;
    private ThemeFiles $files;

    protected function setUp(): void
    {
        $this->appRoot = sys_get_temp_dir() . '/fp_theme_files_' . uniqid();
        mkdir($this->appRoot . '/site/themes/blank/templates', 0755, true);
        mkdir($this->appRoot . '/site/themes/blank/assets', 0755, true);
        file_put_contents($this->appRoot . '/site/config.json', json_encode(['active_theme' => 'blank']));
        file_put_contents($this->appRoot . '/site/themes/blank/templates/page.twig', '<main>Page</main>');
        file_put_contents($this->appRoot . '/site/themes/blank/assets/style.css', 'body{}');

        $config = new Config($this->appRoot . '/site/config.json');
        $this->files = new ThemeFiles($this->appRoot, $config);
    }

    protected function tearDown(): void
    {
        $this->rrmdir($this->appRoot);
    }

    public function testListReturnsEditableTemplateAndAssetFiles(): void
    {
        $result = $this->files->list(null);
        $paths = array_column($result['files'], 'path');

        $this->assertTrue($result['ok']);
        $this->assertSame('blank', $result['theme']);
        $this->assertContains('templates/page.twig', $paths);
        $this->assertContains('assets/style.css', $paths);
    }

    public function testReadAndWriteExistingThemeFile(): void
    {
        $read = $this->files->read('blank', 'templates/page.twig');
        $this->assertSame('<main>Page</main>', $read['content']);

        $write = $this->files->write('blank', 'templates/page.twig', '<main>Changed</main>');
        $this->assertTrue($write['ok']);

        $again = $this->files->read('blank', 'templates/page.twig');
        $this->assertSame('<main>Changed</main>', $again['content']);
    }

    public function testCreateNewThemeFile(): void
    {
        $result = $this->files->create('blank', 'templates/landing.twig', '<main>Landing</main>');

        $this->assertTrue($result['ok']);
        $this->assertSame('templates/landing.twig', $result['path']);
        $this->assertSame(
            '<main>Landing</main>',
            file_get_contents($this->appRoot . '/site/themes/blank/templates/landing.twig')
        );
    }

    public function testCreateRefusesExistingThemeFile(): void
    {
        $result = $this->files->create('blank', 'templates/page.twig', '<main>Clobber</main>');

        $this->assertFalse($result['ok']);
        $this->assertSame('Destination already exists', $result['error']);
    }

    public function testRejectsPathTraversal(): void
    {
        $this->expectException(RuntimeException::class);
        $this->files->read('blank', '../config.json');
    }

    private function rrmdir(string $dir): void
    {
        if (!is_dir($dir)) return;
        foreach (glob($dir . '/*') ?: [] as $file) {
            is_dir($file) ? $this->rrmdir($file) : unlink($file);
        }
        rmdir($dir);
    }
}
