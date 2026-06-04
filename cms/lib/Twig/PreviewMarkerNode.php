<?php

declare(strict_types=1);

namespace FrontPress\Twig;

defined('FRONTPRESS_BOOT') || exit;

use Twig\Compiler;
use Twig\Node\IncludeNode;
use Twig\Node\Node;

/**
 * Wraps a compiled `{% include %}` with the same `<!--fp:src:…-->` markers
 * the `partial()` helper emits, so the Theme Builder's preview click-handler
 * can map a clicked element back to the included template.
 *
 * The markers are emitted behind a RUNTIME check on
 * `$GLOBALS['fp_template_preview']` — not unconditionally — because Twig
 * caches one compiled template and serves it to both preview and public
 * requests. A bare echo would leak the comments to live visitors; the
 * conditional keeps public output clean while still instrumenting preview
 * renders. (Same contract as `partial()` in template_helpers.php.)
 */
final class PreviewMarkerNode extends Node
{
    public function __construct(IncludeNode $include, string $path, int $lineno)
    {
        // `$path` is pre-escaped + already prefixed with `templates/` by the
        // visitor, matching what partial() writes.
        parent::__construct(['include' => $include], ['fp_path' => $path], $lineno);
    }

    public function compile(Compiler $compiler): void
    {
        $path  = (string) $this->getAttribute('fp_path');
        $start = "<!--fp:src:{$path}:start-->";
        $end   = "<!--fp:src:{$path}:end-->";

        $compiler
            ->write("if (!empty(\$GLOBALS['fp_template_preview'])) {\n")
            ->indent()
            ->write('echo ')->repr($start)->raw(";\n")
            ->outdent()
            ->write("}\n")
            ->subcompile($this->getNode('include'))
            ->write("if (!empty(\$GLOBALS['fp_template_preview'])) {\n")
            ->indent()
            ->write('echo ')->repr($end)->raw(";\n")
            ->outdent()
            ->write("}\n");
    }
}
