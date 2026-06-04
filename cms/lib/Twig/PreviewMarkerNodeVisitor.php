<?php

declare(strict_types=1);

namespace FrontPress\Twig;

defined('FRONTPRESS_BOOT') || exit;

use Twig\Environment;
use Twig\Node\Expression\ConstantExpression;
use Twig\Node\IncludeNode;
use Twig\Node\Node;
use Twig\NodeVisitor\NodeVisitorInterface;

/**
 * Makes `{% include 'partials/x.twig' %}` inspectable in the Theme Builder.
 *
 * The preview source-map only saw sections rendered through the `partial()`
 * helper (which emits `<!--fp:src:…-->` comment markers). Themes that compose
 * with Twig's native `{% include %}` produced no markers, so the click-to-
 * source inspector saw nothing. This visitor wraps each static include with
 * the same markers at compile time.
 *
 * Scope, deliberately narrow:
 *   - Exact `IncludeNode` only (via class check, not instanceof) so
 *     `{% embed %}` — an IncludeNode subclass with a different shape — is
 *     left untouched.
 *   - Only when the template name is a compile-time constant string.
 *     Dynamic `{% include someVar %}` can't be source-mapped, so it degrades
 *     gracefully (no markers, still renders).
 */
final class PreviewMarkerNodeVisitor implements NodeVisitorInterface
{
    public function enterNode(Node $node, Environment $env): Node
    {
        return $node;
    }

    public function leaveNode(Node $node, Environment $env): ?Node
    {
        if (get_class($node) !== IncludeNode::class) {
            return $node;
        }
        if (!$node->hasNode('expr')) {
            return $node;
        }
        $expr = $node->getNode('expr');
        if (!$expr instanceof ConstantExpression) {
            return $node;
        }
        $name = (string) $expr->getAttribute('value');
        if ($name === '') {
            return $node;
        }

        // Match the path shape partial() writes (`templates/<rel>`, escaped)
        // so the existing click-handler resolves both identically.
        $path = htmlspecialchars('templates/' . ltrim($name, '/'), ENT_QUOTES);

        return new PreviewMarkerNode($node, $path, $node->getTemplateLine());
    }

    public function getPriority(): int
    {
        // After Twig's own optimizers have run, so we wrap the final include.
        return 256;
    }
}
