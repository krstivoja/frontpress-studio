<?php

declare(strict_types=1);

use FrontPress\ThemeComponentRegistry;
use PHPUnit\Framework\TestCase;

class ThemeComponentRegistryTest extends TestCase
{
    private string $themesDir;
    private ThemeComponentRegistry $reg;

    protected function setUp(): void
    {
        $this->themesDir = sys_get_temp_dir() . '/fp_reg_' . uniqid();
        mkdir($this->themesDir . '/kit/templates/components', 0755, true);
        $this->reg = new ThemeComponentRegistry($this->themesDir);
    }

    protected function tearDown(): void
    {
        $this->rrmdir($this->themesDir);
    }

    private function tpl(string $rel, string $body = '<div></div>'): void
    {
        $abs = $this->themesDir . '/kit/' . $rel;
        @mkdir(dirname($abs), 0755, true);
        file_put_contents($abs, $body);
    }

    private function sidecar(string $rel, array $manifest): void
    {
        $abs = $this->themesDir . '/kit/' . $rel;
        @mkdir(dirname($abs), 0755, true);
        file_put_contents($abs, json_encode($manifest));
    }

    // ── Sidecar discovery ────────────────────────────────────────────────

    public function testScansSidecarAndResolvesSiblingTemplate(): void
    {
        $this->tpl('templates/components/button.twig');
        $this->sidecar('templates/components/button.json', [
            'name'   => 'Button',
            'inputs' => [
                ['name' => 'label', 'type' => 'text', 'default' => 'Button', 'bindable' => true],
                ['name' => 'variant', 'type' => 'enum', 'options' => ['primary', 'ghost']],
            ],
            'examples' => [['name' => 'Primary', 'props' => ['label' => 'Go']]],
        ]);

        $list = $this->reg->list('kit');
        $this->assertCount(1, $list);
        $c = $list[0];

        $this->assertSame('button', $c['id']); // id defaults to filename stem
        $this->assertSame('Button', $c['name']);
        $this->assertSame('Button', $c['tag']); // tag defaults to PascalCase(id)
        $this->assertSame('templates/components/button.twig', $c['template']);
        $this->assertTrue($c['template_exists']);
        $this->assertCount(2, $c['inputs']);
        $this->assertSame('enum', $c['inputs'][1]['type']);
        $this->assertSame(['primary', 'ghost'], $c['inputs'][1]['options']);
        // `sample` mirrors the first example's props for back-compat.
        $this->assertSame(['label' => 'Go'], $c['sample']);
    }

    public function testStripsLeadingUnderscoreForPartialId(): void
    {
        $this->tpl('templates/_header.twig');
        $this->sidecar('templates/_header.json', ['name' => 'Site header', 'category' => 'layout']);

        $c = $this->reg->find('kit', 'header');
        $this->assertNotNull($c);
        $this->assertSame('templates/_header.twig', $c['template']);
        $this->assertSame('layout', $c['category']);
    }

    public function testJsonWithoutSiblingTemplateIsIgnored(): void
    {
        $this->sidecar('templates/components/orphan.json', ['name' => 'Orphan']);
        $this->assertSame([], $this->reg->list('kit'));
    }

    public function testPrefersTwigOverPhpSibling(): void
    {
        $this->tpl('templates/components/card.twig');
        $this->tpl('templates/components/card.php');
        $this->sidecar('templates/components/card.json', ['name' => 'Card']);

        $this->assertSame('templates/components/card.twig', $this->reg->find('kit', 'card')['template']);
    }

    // ── Legacy central-file fallback ─────────────────────────────────────

    public function testLegacyCentralFileStillListsWhenNoSidecar(): void
    {
        $this->tpl('templates/_footer.twig');
        file_put_contents($this->themesDir . '/kit/theme.components.json', json_encode([
            'components' => [
                ['id' => 'footer', 'name' => 'Footer', 'template' => 'templates/_footer.twig', 'category' => 'layout'],
            ],
        ]));

        $c = $this->reg->find('kit', 'footer');
        $this->assertNotNull($c);
        $this->assertSame('templates/_footer.twig', $c['template']);
        $this->assertTrue($c['template_exists']);
    }

    public function testSidecarWinsOverLegacyForSameId(): void
    {
        $this->tpl('templates/components/hero.twig');
        $this->sidecar('templates/components/hero.json', ['name' => 'Hero (sidecar)']);
        file_put_contents($this->themesDir . '/kit/theme.components.json', json_encode([
            'components' => [
                ['id' => 'hero', 'name' => 'Hero (legacy)', 'template' => 'templates/components/hero.twig'],
            ],
        ]));

        $list = $this->reg->list('kit');
        $this->assertCount(1, $list);
        $this->assertSame('Hero (sidecar)', $list[0]['name']);
    }

    // ── Write path (sidecar CRUD) ────────────────────────────────────────

    public function testAddWritesSidecarNextToTemplate(): void
    {
        $this->tpl('templates/components/stat.twig');
        $saved = $this->reg->add('kit', [
            'id'       => 'stat',
            'name'     => 'Stat',
            'template' => 'templates/components/stat.twig',
            'category' => 'content',
            'sample'   => ['value' => '99%'],
        ]);

        $this->assertSame('stat', $saved['id']);
        $this->assertFileExists($this->themesDir . '/kit/templates/components/stat.json');
        // legacy `sample` payload becomes examples[0].props
        $this->assertSame(['value' => '99%'], $saved['sample']);
        $this->assertSame([['name' => 'Default', 'props' => ['value' => '99%']]], $saved['examples']);
    }

    public function testAddRejectsDuplicateId(): void
    {
        $this->tpl('templates/components/badge.twig');
        $this->sidecar('templates/components/badge.json', ['name' => 'Badge']);

        $this->expectException(RuntimeException::class);
        $this->reg->add('kit', ['id' => 'badge', 'template' => 'templates/components/badge.twig']);
    }

    public function testAddRejectsMissingTemplate(): void
    {
        $this->expectException(RuntimeException::class);
        $this->reg->add('kit', ['id' => 'ghost', 'template' => 'templates/components/ghost.twig']);
    }

    public function testAddRejectsPathTraversal(): void
    {
        $this->expectException(RuntimeException::class);
        $this->reg->add('kit', ['id' => 'x', 'template' => '../../etc/passwd']);
    }

    public function testUpdateRewritesSidecar(): void
    {
        $this->tpl('templates/components/alert.twig');
        $this->sidecar('templates/components/alert.json', ['name' => 'Alert']);

        $updated = $this->reg->update('kit', 'alert', [
            'id'       => 'alert',
            'name'     => 'Alert renamed',
            'template' => 'templates/components/alert.twig',
        ]);
        $this->assertSame('Alert renamed', $updated['name']);
        $this->assertSame('Alert renamed', $this->reg->find('kit', 'alert')['name']);
    }

    public function testUpdateMigratesLegacyEntryToSidecarAndPrunesCentral(): void
    {
        $this->tpl('templates/components/cta.twig');
        $central = $this->themesDir . '/kit/theme.components.json';
        file_put_contents($central, json_encode([
            'components' => [
                ['id' => 'cta', 'name' => 'CTA', 'template' => 'templates/components/cta.twig'],
                ['id' => 'keep', 'name' => 'Keep', 'template' => 'templates/components/cta.twig'],
            ],
        ]));

        $this->reg->update('kit', 'cta', ['id' => 'cta', 'name' => 'CTA v2', 'template' => 'templates/components/cta.twig']);

        $this->assertFileExists($this->themesDir . '/kit/templates/components/cta.json');
        $central = json_decode((string)file_get_contents($this->themesDir . '/kit/theme.components.json'), true);
        $ids = array_column($central['components'], 'id');
        $this->assertNotContains('cta', $ids); // pruned from central
        $this->assertContains('keep', $ids);
        $this->assertSame('CTA v2', $this->reg->find('kit', 'cta')['name']);
    }

    public function testDeleteRemovesSidecar(): void
    {
        $this->tpl('templates/components/feature.twig');
        $this->sidecar('templates/components/feature.json', ['name' => 'Feature']);

        $this->assertTrue($this->reg->delete('kit', 'feature'));
        $this->assertFileDoesNotExist($this->themesDir . '/kit/templates/components/feature.json');
        $this->assertNull($this->reg->find('kit', 'feature'));
    }

    public function testDeleteUnknownReturnsFalse(): void
    {
        $this->assertFalse($this->reg->delete('kit', 'nope'));
    }

    public function testListIsOrderedByCategoryThenName(): void
    {
        $this->tpl('templates/components/z.twig');
        $this->tpl('templates/components/a.twig');
        $this->tpl('templates/_header.twig');
        $this->sidecar('templates/components/z.json', ['name' => 'Zebra', 'category' => 'content']);
        $this->sidecar('templates/components/a.json', ['name' => 'Apple', 'category' => 'content']);
        $this->sidecar('templates/_header.json', ['name' => 'Header', 'category' => 'layout']);

        $ids = array_column($this->reg->list('kit'), 'id');
        // layout before content; within content, Apple before Zebra
        $this->assertSame(['header', 'a', 'z'], $ids);
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
