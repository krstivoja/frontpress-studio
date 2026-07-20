<?php

declare(strict_types=1);

use FrontPress\MediaService;
use FrontPress\PathResolver;
use PHPUnit\Framework\TestCase;

class MediaServiceTest extends TestCase
{
    private string       $uploadsDir;
    private string       $contentDir;
    private MediaService $media;

    protected function setUp(): void
    {
        $base             = sys_get_temp_dir() . '/fp_media_' . uniqid();
        $this->uploadsDir = $base . '/uploads';
        $this->contentDir = $base . '/content';
        $cacheDir         = $base . '/cache';
        $themesDir        = $base . '/themes';
        mkdir($this->uploadsDir . '/media', 0755, true);
        mkdir($this->contentDir, 0755, true);
        mkdir($cacheDir, 0755, true);
        mkdir($themesDir, 0755, true);
        $paths       = new PathResolver($this->contentDir, $this->uploadsDir, $cacheDir, $themesDir);
        $this->media = new MediaService($this->uploadsDir, $paths, ['max_mb' => 1]);
    }

    protected function tearDown(): void
    {
        $this->rrmdir(dirname($this->uploadsDir));
    }

    private function rrmdir(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        foreach (scandir($dir) ?: [] as $e) {
            if ($e === '.' || $e === '..') {
                continue;
            }
            $p = $dir . '/' . $e;
            is_dir($p) ? $this->rrmdir($p) : unlink($p);
        }
        rmdir($dir);
    }

    private function makeTmpFile(string $content = 'data'): string
    {
        $tmp = tempnam(sys_get_temp_dir(), 'mdt_');
        file_put_contents($tmp, $content);
        return $tmp;
    }

    // ── upload() rejection ────────────────────────────────────────────────────

    public function testRejectsUploadError(): void
    {
        $result = $this->media->upload([
            'error'    => UPLOAD_ERR_PARTIAL,
            'size'     => 0,
            'tmp_name' => '',
            'name'     => 'test.jpg',
        ], '');
        $this->assertSame(400, $result['code']);
        $this->assertStringContainsString('upload error', strtolower($result['error']));
    }

    public function testRejectsOversizedFile(): void
    {
        $tmp    = $this->makeTmpFile(str_repeat('X', 10));
        $result = $this->media->upload([
            'error'    => 0,
            'size'     => 2 * 1024 * 1024, // 2 MB reported size, limit is 1 MB
            'tmp_name' => $tmp,
            'name'     => 'big.jpg',
        ], '');
        unlink($tmp);
        $this->assertSame(400, $result['code']);
        $this->assertStringContainsString('limit', strtolower($result['error']));
    }

    public function testRejectsForbiddenExtension(): void
    {
        $tmp    = $this->makeTmpFile('<?php echo "x"; ?>');
        $result = $this->media->upload([
            'error'    => 0,
            'size'     => 20,
            'tmp_name' => $tmp,
            'name'     => 'evil.php',
        ], '');
        unlink($tmp);
        // Extension .php is not in ALLOWED_EXTS — rejected with 400
        $this->assertSame(400, $result['code']);
        $this->assertStringContainsString('type', strtolower($result['error']));
    }

    public function testRejectsMismatchedMimeType(): void
    {
        // A file with .jpg extension but PHP content is rejected at the MIME check stage.
        $tmp    = $this->makeTmpFile('<?php echo "x"; ?>');
        $result = $this->media->upload([
            'error'    => 0,
            'size'     => 20,
            'tmp_name' => $tmp,
            'name'     => 'disguised.jpg',
        ], '');
        unlink($tmp);
        // Extension passes, but MIME (text/x-php) is not in MIME_MAP — rejected with 400
        $this->assertSame(400, $result['code']);
        $this->assertStringContainsString('type', strtolower($result['error']));
    }

    // ── list() ────────────────────────────────────────────────────────────────

    public function testListReturnsEmptyArrayWhenNoMedia(): void
    {
        $this->assertSame([], $this->media->list());
    }

    public function testListExcludesThumbnailFiles(): void
    {
        // MediaService::list() scans $uploadsDir directly, not a `/media`
        // subfolder (production wires it to site/uploads — see
        // ServiceFactory::media()). Writing into the never-scanned `/media`
        // subdir this test's setUp() happens to create was why the file
        // never showed up in list().
        $dir = $this->uploadsDir;
        file_put_contents($dir . '/aabbcc.jpg', 'img');
        file_put_contents($dir . '/aabbcc.thumb.jpg', 'thumb');
        $list  = $this->media->list();
        $names = array_column($list, 'name');
        $this->assertContains('aabbcc.jpg', $names);
        $this->assertNotContains('aabbcc.thumb.jpg', $names);
    }

    // ── delete() ──────────────────────────────────────────────────────────────

    public function testDeleteReturnsFalseForUnknownFile(): void
    {
        $this->assertFalse($this->media->delete('nonexistent.jpg'));
    }
}
