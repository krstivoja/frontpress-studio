<?php

namespace FrontPress\Twig;

defined('FRONTPRESS_BOOT') || exit;

use Twig\Loader\FilesystemLoader;
use Twig\Source;
use FrontPress\ComponentTagProcessor;

/**
 * Twig loader that pre-processes JSX-like component tags before Twig compiles a template.
 *
 * Wraps FilesystemLoader — isFresh() and findTemplate() are inherited unchanged,
 * so Twig's mtime-based cache invalidation works correctly. The regex runs once
 * per template change; compiled output is stored in the Twig cache as normal.
 */
final class ComponentTagLoader extends FilesystemLoader
{
    public function getSourceContext(string $name): Source
    {
        $source    = parent::getSourceContext($name);
        $processed = ComponentTagProcessor::processTwig($source->getCode());
        return new Source($processed, $source->getName(), $source->getPath());
    }
}
