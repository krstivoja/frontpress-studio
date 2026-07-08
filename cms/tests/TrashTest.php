<?php

declare(strict_types=1);

use FrontPress\Trash;
use PHPUnit\Framework\TestCase;

class TrashTest extends TestCase
{
    private string $root;
    private string $contentDir;
    private string $cacheDir;
    private Trash $trash;

    protected function setUp(): void
    {
        $this->root       = sys_get_temp_dir() . '/fp_trash_' . uniqid();
        $this->contentDir = $this->root . '/site/content';
        $this->cacheDir   = $this->root . '/site/cache';
        mkdir($this->contentDir . '/blog', 0755, true);
        mkdir($this->cacheDir, 0755, true);

        file_put_contents(
            $this->contentDir . '/blog/hello.md',
            "---\ntitle: Hello\n---\nBody.\n",
        );

        $this->trash = new Trash($this->cacheDir, $this->contentDir);
    }

    protected function tearDown(): void
    {
        $this->rrmdir($this->root);
    }

    public function testMoveRemovesSourceAndReturnsToken(): void
    {
        $token = $this->trash->move('blog/hello');

        $this->assertNotNull($token);
        $this->assertFileDoesNotExist($this->contentDir . '/blog/hello.md');
        $this->assertFileExists($this->cacheDir . '/trash/' . $token . '/hello.md');
        $this->assertFileExists($this->cacheDir . '/trash/' . $token . '/manifest.json');
    }

    public function testMoveCarriesPerPostAssetsDir(): void
    {
        mkdir($this->contentDir . '/blog/hello', 0755, true);
        file_put_contents($this->contentDir . '/blog/hello/cover.jpg', 'fake-jpeg');

        $token = $this->trash->move('blog/hello');

        $this->assertNotNull($token);
        $this->assertDirectoryDoesNotExist($this->contentDir . '/blog/hello');
        $this->assertFileExists($this->cacheDir . '/trash/' . $token . '/hello/cover.jpg');
    }

    /**
     * Regression: a bad empty-slug save can leave a stray `pages.md` beside the
     * `pages/` content folder. Deleting that page must NOT sweep the folder —
     * the sibling dir holds other pages, not the page's uploads. It should move
     * only the stray `.md` and leave every child page on disk.
     */
    public function testMoveDoesNotSweepSiblingContentFolder(): void
    {
        mkdir($this->contentDir . '/pages', 0755, true);
        file_put_contents($this->contentDir . '/pages/about.md', "---\ntitle: About\n---\n");
        file_put_contents($this->contentDir . '/pages/contact.md', "---\ntitle: Contact\n---\n");
        file_put_contents($this->contentDir . '/pages.md', "---\ntitle: Stray\n---\n");

        $token = $this->trash->move('pages');

        $this->assertNotNull($token);
        $this->assertFileDoesNotExist($this->contentDir . '/pages.md');
        // The content folder and its children must survive.
        $this->assertDirectoryExists($this->contentDir . '/pages');
        $this->assertFileExists($this->contentDir . '/pages/about.md');
        $this->assertFileExists($this->contentDir . '/pages/contact.md');
    }

    public function testRestoreReversesTheMove(): void
    {
        $token = $this->trash->move('blog/hello');
        $this->assertNotNull($token);

        $restored = $this->trash->restore($token);
        $this->assertSame('blog/hello', $restored);
        $this->assertFileExists($this->contentDir . '/blog/hello.md');
        $this->assertDirectoryDoesNotExist($this->cacheDir . '/trash/' . $token);
    }

    public function testRestoreReturnsNullWhenDestinationAlreadyExists(): void
    {
        $token = $this->trash->move('blog/hello');
        $this->assertNotNull($token);

        // Recreate a file at the original path before restore — the restore
        // should refuse rather than clobber.
        file_put_contents($this->contentDir . '/blog/hello.md', 'new content');

        $this->assertNull($this->trash->restore($token));
        $this->assertSame('new content', file_get_contents($this->contentDir . '/blog/hello.md'));
    }

    public function testRestoreRejectsSuspiciousToken(): void
    {
        $this->assertNull($this->trash->restore('../../etc/passwd'));
    }

    public function testPurgeRemovesEntriesOlderThanCutoff(): void
    {
        $token = $this->trash->move('blog/hello');
        $this->assertNotNull($token);

        // Backdate the manifest so the purge considers it stale.
        $manifest = $this->cacheDir . '/trash/' . $token . '/manifest.json';
        $stale    = time() - (Trash::MAX_AGE_SECONDS + 60);
        file_put_contents($manifest, (string)json_encode(['deleted_at' => $stale, 'rel_path' => 'blog/hello']));

        $count = $this->trash->purgeStale();
        $this->assertSame(1, $count);
        $this->assertDirectoryDoesNotExist($this->cacheDir . '/trash/' . $token);
    }

    public function testPurgeLeavesFreshEntries(): void
    {
        $token = $this->trash->move('blog/hello');
        $this->assertNotNull($token);

        $this->assertSame(0, $this->trash->purgeStale());
        $this->assertDirectoryExists($this->cacheDir . '/trash/' . $token);
    }

    private function rrmdir(string $dir): void
    {
        if (!is_dir($dir)) return;
        $iter = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST,
        );
        foreach ($iter as $f) {
            $f->isDir() ? rmdir($f->getPathname()) : unlink($f->getPathname());
        }
        rmdir($dir);
    }
}
