<?php

declare(strict_types=1);

use FrontPress\Env;
use PHPUnit\Framework\TestCase;

class EnvTest extends TestCase
{
    private string $tmp;

    protected function setUp(): void
    {
        // Reset the in-memory cache between tests via reflection
        $r = new ReflectionProperty(Env::class, 'loaded');
        $r->setAccessible(true);
        $r->setValue(null, []);

        $this->tmp = tempnam(sys_get_temp_dir(), 'mdcfg_') . '.php';
    }

    protected function tearDown(): void
    {
        if (is_file($this->tmp)) {
            unlink($this->tmp);
        }
    }

    private function seedLoaded(array $values): void
    {
        $r = new ReflectionProperty(Env::class, 'loaded');
        $r->setAccessible(true);
        $r->setValue(null, $values);
    }

    public function testGetReturnsDefaultWhenKeyAbsent(): void
    {
        $this->assertSame('fallback', Env::get('MISSING', 'fallback'));
        $this->assertNull(Env::get('MISSING'));
    }

    public function testGetReturnsSeededValue(): void
    {
        $this->seedLoaded(['ADMIN_USER' => 'dev']);
        $this->assertSame('dev', Env::get('ADMIN_USER'));
    }

    public function testMissingFileIsNoOp(): void
    {
        Env::load('/nonexistent/config.php');
        $this->assertNull(Env::get('ANYTHING'));
    }

    public function testUpgradePlaintextPasswordReplacesHashAndRemovesPlaintext(): void
    {
        // Fresh-install shape: shipped config.php uses FPS_* names.
        file_put_contents($this->tmp, <<<'PHP'
<?php
defined('FRONTPRESS_BOOT') || exit;
define('FPS_ADMIN_USER', 'admin');
define('FPS_ADMIN_PASS', 'admin');
define('FPS_ADMIN_PASS_HASH', '');
define('FPS_APP_ENV', 'dev');
PHP);
        $hash = '$2y$10$dummyhashvaluefortest1234567890123456789012';
        $this->assertTrue(Env::upgradePlaintextPassword($this->tmp, $hash));

        $out = (string)file_get_contents($this->tmp);
        $this->assertStringContainsString("define('FPS_ADMIN_PASS_HASH', '" . addslashes($hash) . "');", $out);
        $this->assertStringNotContainsString("FPS_ADMIN_PASS,", $out);
        $this->assertStringNotContainsString("'FPS_ADMIN_PASS'", $out);
        $this->assertSame($hash, Env::get('ADMIN_PASS_HASH'));
        $this->assertNull(Env::get('ADMIN_PASS'));
    }

    public function testUpgradeMigratesLegacyMdConstantsToFps(): void
    {
        // Pre-rename install: config.php still uses MD_* names. First
        // rewrite (e.g. password rotate) should migrate them to FPS_*.
        file_put_contents($this->tmp, <<<'PHP'
<?php
defined('FRONTPRESS_BOOT') || exit;
define('MD_ADMIN_USER', 'admin');
define('MD_ADMIN_PASS', 'admin');
define('MD_ADMIN_PASS_HASH', '');
PHP);
        $hash = '$2y$10$dummyhashvaluefortest1234567890123456789012';
        $this->assertTrue(Env::upgradePlaintextPassword($this->tmp, $hash));

        $out = (string)file_get_contents($this->tmp);
        // New name written.
        $this->assertStringContainsString("define('FPS_ADMIN_PASS_HASH', '" . addslashes($hash) . "');", $out);
        // Legacy hash define replaced (not duplicated).
        $this->assertSame(0, preg_match('/define\(\s*[\'"]MD_ADMIN_PASS_HASH[\'"]/', $out));
        // Legacy plaintext line scrubbed.
        $this->assertSame(0, preg_match('/define\(\s*[\'"]MD_ADMIN_PASS[\'"]/', $out));
    }

    public function testUpgradePreservesDollarSignsInBcryptHash(): void
    {
        // Regression: preg_replace was interpreting `$2`, `$10` in bcrypt
        // hashes as capture-group backreferences and silently stripping
        // them, mangling the hash so password_verify always failed.
        file_put_contents($this->tmp, <<<'PHP'
<?php
defined('FRONTPRESS_BOOT') || exit;
define('FPS_ADMIN_PASS_HASH', '');
PHP);
        // Real bcrypt hash for 'admin' — contains `$2y$10$` which is the
        // exact pattern that triggered the bug.
        $realHash = '$2y$10$AHxA3GCxYYTXhKqRRJVvZumiM5Sw2DL6/GYzxZPxMvOpYso1GXgvi';
        $this->assertTrue(Env::upgradePlaintextPassword($this->tmp, $realHash));

        $out = (string)file_get_contents($this->tmp);
        $this->assertStringContainsString("'" . $realHash . "'", $out);
        $this->assertSame($realHash, Env::get('ADMIN_PASS_HASH'));
    }

    public function testUpgradeHandlesGetenvFallbackForm(): void
    {
        // Regression: when the operator opts into the plaintext
        // FPS_ADMIN_PASS shape using `getenv(...) ?: '...'`, the upgrade
        // must rewrite that line, not append a duplicate `define()`
        // (which PHP would warn about and ignore).
        file_put_contents($this->tmp, <<<'PHP'
<?php
defined('FRONTPRESS_BOOT') || exit;
define('FPS_ADMIN_USER',      getenv('FPS_ADMIN_USER')      ?: 'admin');
define('FPS_ADMIN_PASS',      getenv('FPS_ADMIN_PASS')      ?: 'admin');
define('FPS_ADMIN_PASS_HASH', getenv('FPS_ADMIN_PASS_HASH') ?: '');
PHP);
        $hash = '$2y$10$AHxA3GCxYYTXhKqRRJVvZumiM5Sw2DL6/GYzxZPxMvOpYso1GXgvi';
        $this->assertTrue(Env::upgradePlaintextPassword($this->tmp, $hash));
        $out = (string)file_get_contents($this->tmp);
        $this->assertStringContainsString("define('FPS_ADMIN_PASS_HASH', '" . $hash . "');", $out);
        // Should be exactly one FPS_ADMIN_PASS_HASH define after upgrade.
        $this->assertSame(1, substr_count($out, 'FPS_ADMIN_PASS_HASH'));
        // Plaintext line gone.
        $this->assertSame(0, preg_match('/define\(\s*[\'"]FPS_ADMIN_PASS[\'"]/', $out));
    }

    public function testUpgradeAppendsHashWhenAbsent(): void
    {
        file_put_contents($this->tmp, <<<'PHP'
<?php
defined('FRONTPRESS_BOOT') || exit;
define('FPS_ADMIN_USER', 'admin');
PHP);
        $hash = '$2y$10$dummyhashvaluefortest1234567890123456789012';
        $this->assertTrue(Env::upgradePlaintextPassword($this->tmp, $hash));
        $this->assertStringContainsString("define('FPS_ADMIN_PASS_HASH', '" . addslashes($hash) . "');", (string)file_get_contents($this->tmp));
    }

    public function testIsPasswordDefaultTrueWhenHashVerifiesAdmin(): void
    {
        $this->seedLoaded(['ADMIN_PASS_HASH' => password_hash('admin', PASSWORD_BCRYPT)]);
        $this->assertTrue(Env::isPasswordDefault());
    }

    public function testIsPasswordDefaultFalseForOtherPassword(): void
    {
        $this->seedLoaded(['ADMIN_PASS_HASH' => password_hash('something-else', PASSWORD_BCRYPT)]);
        $this->assertFalse(Env::isPasswordDefault());
    }

    public function testIsPasswordDefaultFalseWhenHashEmpty(): void
    {
        $this->seedLoaded([]);
        $this->assertFalse(Env::isPasswordDefault());
    }
}
