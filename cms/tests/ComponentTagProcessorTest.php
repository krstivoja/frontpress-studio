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

    // --- paired tags / children slot --------------------------------------

    public function testTwigPairedCapturesChildren(): void
    {
        $out = ComponentTagProcessor::processTwig('<Button variant="primary">Save</Button>');
        $this->assertSame(
            "{% set _fpc0 %}Save{% endset %}{{ component('button', {'variant': 'primary', 'children': _fpc0}) }}",
            $out
        );
    }

    public function testPhpPairedCapturesChildren(): void
    {
        $out = ComponentTagProcessor::processPhp('<Button variant="primary">Save</Button>');
        $this->assertSame(
            "<?php ob_start(); ?>Save<?php \$__fpc0 = ob_get_clean(); "
            . "component('button', ['variant' => 'primary', 'children' => \$__fpc0]); ?>",
            $out
        );
    }

    public function testTwigPairedWithNoAttrs(): void
    {
        $out = ComponentTagProcessor::processTwig('<Card>hi</Card>');
        $this->assertSame(
            "{% set _fpc0 %}hi{% endset %}{{ component('card', {'children': _fpc0}) }}",
            $out
        );
    }

    public function testTwigNestedSelfClosingInsidePairIsConvertedFirst(): void
    {
        $out = ComponentTagProcessor::processTwig('<Button variant="primary"><Icon name="star" /> Save</Button>');
        $this->assertSame(
            "{% set _fpc0 %}{{ component('icon', {'name': 'star'}) }} Save{% endset %}"
            . "{{ component('button', {'variant': 'primary', 'children': _fpc0}) }}",
            $out
        );
    }

    public function testTwigNestedPairedTagsResolveInnermostFirst(): void
    {
        // Card wraps a Button that wraps its own text; both get their own slot.
        $out = ComponentTagProcessor::processTwig('<Card><Button>x</Button></Card>');
        $this->assertSame(
            "{% set _fpc1 %}{% set _fpc0 %}x{% endset %}"
            . "{{ component('button', {'children': _fpc0}) }}{% endset %}"
            . "{{ component('card', {'children': _fpc1}) }}",
            $out
        );
    }

    public function testPhpNestedSelfClosingInsidePair(): void
    {
        $out = ComponentTagProcessor::processPhp('<Button><Icon name="star" /></Button>');
        $this->assertSame(
            "<?php ob_start(); ?><?php component('icon', ['name' => 'star']); ?>"
            . "<?php \$__fpc0 = ob_get_clean(); component('button', ['children' => \$__fpc0]); ?>",
            $out
        );
    }

    public function testPairedExpressionAttrPassesThrough(): void
    {
        $out = ComponentTagProcessor::processTwig('<Button href={url}>Go</Button>');
        $this->assertSame(
            "{% set _fpc0 %}Go{% endset %}{{ component('button', {'href': (url), 'children': _fpc0}) }}",
            $out
        );
    }

    public function testMarkdownPairedPassesRenderedChildren(): void
    {
        $out = ComponentTagProcessor::processMarkdown(
            '<Button variant="primary"><Icon name="star" /> Save</Button>',
            function (string $name, array $attrs): string {
                if ($name === 'icon') {
                    return '[icon:' . $attrs['name'] . ']';
                }
                return '<button>' . ($attrs['children'] ?? '') . '</button>';
            }
        );
        $this->assertSame('<button>[icon:star] Save</button>', $out);
    }

    public function testPairedLowercaseTagPassesThrough(): void
    {
        $src = '<button>Save</button>';
        $this->assertSame($src, ComponentTagProcessor::processTwig($src));
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
