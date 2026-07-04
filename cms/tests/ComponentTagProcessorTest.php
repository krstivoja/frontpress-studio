<?php

declare(strict_types=1);

use PHPUnit\Framework\TestCase;
use FrontPress\ComponentTagProcessor;

defined('FRONTPRESS_BOOT') || define('FRONTPRESS_BOOT', true);

/**
 * Covers JSX-like component tag conversion, including the new
 * expression-attribute form `attr={expr}` added alongside the
 * kit-twig starter (composite components reuse <Button …/> with vars).
 */
class ComponentTagProcessorTest extends TestCase
{
    // --- string attributes (unchanged behaviour) --------------------------

    public function testTwigStringAttrs(): void
    {
        $out = ComponentTagProcessor::processTwig('<Hero title="Welcome" image="/a.jpg" />');
        $this->assertSame(
            "{{ component('hero', {'title': 'Welcome', 'image': '/a.jpg'}) }}",
            $out
        );
    }

    public function testPhpStringAttrs(): void
    {
        $out = ComponentTagProcessor::processPhp('<Hero title="Welcome" />');
        $this->assertSame("<?php component('hero', ['title' => 'Welcome']); ?>", $out);
    }

    // --- expression attributes (new) --------------------------------------

    public function testTwigExpressionAttrPassesThroughVerbatim(): void
    {
        // This is exactly what hero.twig ships: <Button label={cta_label|default('Get started')} … />
        $out = ComponentTagProcessor::processTwig(
            "<Button label={cta_label|default('Get started')} variant=\"primary\" href={cta_href|default('#')} />"
        );
        $this->assertSame(
            "{{ component('button', {'label': (cta_label|default('Get started')), 'variant': 'primary', 'href': (cta_href|default('#'))}) }}",
            $out
        );
    }

    public function testPhpExpressionAttrUsesPhpSyntaxVerbatim(): void
    {
        $in       = <<<'TXT'
        <Card title={$post['title']} />
        TXT;
        $expected = <<<'TXT'
        <?php component('card', ['title' => ($post['title'])]); ?>
        TXT;
        $this->assertSame($expected, ComponentTagProcessor::processPhp($in));
    }

    public function testExpressionAttrWrappedInParensForPrecedence(): void
    {
        $out = ComponentTagProcessor::processTwig('<Stat value={a + b} />');
        $this->assertStringContainsString("'value': (a + b)", $out);
    }

    public function testEmptyExpressionIsSkipped(): void
    {
        // `{}` carries no value — it must not emit `'label': ()` which would be a parse error.
        $twig = ComponentTagProcessor::processTwig('<Button label={} variant="primary" />');
        $this->assertSame("{{ component('button', {'variant': 'primary'}) }}", $twig);

        $php = ComponentTagProcessor::processPhp('<Button label={} variant="primary" />');
        $this->assertSame("<?php component('button', ['variant' => 'primary']); ?>", $php);
    }

    public function testMixedStringAndExpressionAttrs(): void
    {
        $out = ComponentTagProcessor::processTwig('<Button label="Save" href={url} variant="ghost" />');
        $this->assertSame(
            "{{ component('button', {'label': 'Save', 'href': (url), 'variant': 'ghost'}) }}",
            $out
        );
    }

    // --- markdown: expressions can't be evaluated, inner text passes through as string

    public function testMarkdownPassesExpressionInnerTextAsString(): void
    {
        $captured = [];
        $out = ComponentTagProcessor::processMarkdown(
            '<Button label={cta_label} variant="primary" />',
            function (string $name, array $attrs) use (&$captured): string {
                $captured = [$name, $attrs];
                return "[$name]";
            }
        );
        $this->assertSame('[button]', $out);
        $this->assertSame('button', $captured[0]);
        $this->assertSame(['label' => 'cta_label', 'variant' => 'primary'], $captured[1]);
    }

    // --- safe fallbacks ----------------------------------------------------

    public function testLowercaseTagsPassThroughUntouched(): void
    {
        $src = '<button label={x} />';
        $this->assertSame($src, ComponentTagProcessor::processTwig($src));
    }

    public function testStringValuesAreEscaped(): void
    {
        $out = ComponentTagProcessor::processTwig('<Hero title="O\'Brien" />');
        $this->assertStringContainsString("O\\'Brien", $out);
    }
}
