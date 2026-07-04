<?php

declare(strict_types=1);

namespace FrontPress\Api;

defined('FRONTPRESS_BOOT') || exit;

use FrontPress\Config;

class SettingsController
{
    /** @param array<string, mixed> $config */
    public static function handle(string $method, array $config): void
    {
        Router::requireAuth();
        /** @var Config $cfg */
        $cfg = $config['config'];

        if ($method === 'GET') {
            // Never echo the SMTP password back to the browser. The UI
            // shows a "(unchanged)" placeholder and only POSTs the
            // password when the operator types a fresh one.
            $all = $cfg->all();
            if (isset($all['email']) && is_array($all['email'])) {
                $all['email']['smtp_pass'] = ($all['email']['smtp_pass'] ?? '') !== '' ? '__SAVED__' : '';
            }
            \json_response(['ok' => true, 'settings' => $all]);
        }

        Router::requireCsrf();

        if ($method !== 'PUT') {
            \json_response(['ok' => false, 'error' => 'Method not allowed'], 405);
        }

        $body = Router::jsonBody();

        $site = [
            'name' => trim((string)($body['site']['name'] ?? '')),
            'base' => '/' . trim(trim((string)($body['site']['base'] ?? '/'), '/')),
        ];

        $taxonomies = [];
        foreach ((array)($body['taxonomies'] ?? []) as $slug => $tax) {
            $slug = preg_replace('/[^a-z0-9_-]/', '', strtolower((string)$slug));
            if (!$slug) continue;

            // One-shot migration: legacy taxonomy-level `multiple` is folded
            // into the first array-type field so existing config.json upgrades
            // silently on first save.
            $legacyMultiple = !empty($tax['multiple']);
            $folded = false;

            $fields = [];
            foreach ((array)($tax['fields'] ?? []) as $f) {
                $name = preg_replace('/[^a-z0-9_-]/', '', strtolower((string)($f['name'] ?? '')));
                if (!$name) continue;
                $type = (($f['type'] ?? '') === 'array') ? 'array' : 'single';
                $hidden = !empty($f['hidden']);
                if ($type === 'array') {
                    $widget = in_array($f['widget'] ?? '', ['select', 'checkbox', 'radio'], true) ? $f['widget'] : 'select';
                    $items  = array_values(array_filter(array_map(
                        fn ($v) => trim((string)$v),
                        (array)($f['items'] ?? [])
                    ), fn ($v) => $v !== ''));
                    $multiple = !empty($f['multiple']) || (!$folded && $legacyMultiple);
                    $folded   = $folded || $legacyMultiple;
                    $fields[] = ['name' => $name, 'type' => 'array', 'widget' => $widget, 'multiple' => $multiple, 'items' => $items, 'hidden' => $hidden];
                } else {
                    $fields[] = ['name' => $name, 'type' => 'single', 'value' => trim((string)($f['value'] ?? '')), 'hidden' => $hidden];
                }
            }

            $postTypes = array_values(array_filter(array_map(
                fn ($pt) => preg_replace('/[^a-z0-9_-]/', '', strtolower((string)$pt)),
                (array)($tax['post_types'] ?? [])
            )));

            $taxonomies[$slug] = [
                'label'      => trim((string)($tax['label'] ?? $slug)),
                'post_types' => $postTypes,
                'fields'     => $fields,
            ];
        }

        $uploads = [
            'max_mb'     => max(1, min(512, (int)($body['uploads']['max_mb']     ?? 5))),
            'max_width'  => max(0, min(20000, (int)($body['uploads']['max_width']  ?? 0))),
            'max_height' => max(0, min(20000, (int)($body['uploads']['max_height'] ?? 0))),
        ];

        // SEO toggles + defaults. Only persist when the payload mentions
        // them — front-end can save Site / Fields / Uploads independently
        // without zeroing the SEO block.
        $existingSeo = (array)($cfg->all()['seo'] ?? []);
        $seo = $existingSeo;
        if (is_array($body['seo'] ?? null)) {
            $in = $body['seo'];
            $seo = [
                'enabled'        => self::flag($in, 'enabled',       $existingSeo['enabled']       ?? true),
                'opengraph'      => self::flag($in, 'opengraph',     $existingSeo['opengraph']     ?? true),
                'twitter_card'   => self::flag($in, 'twitter_card',  $existingSeo['twitter_card']  ?? true),
                'json_ld'        => self::flag($in, 'json_ld',       $existingSeo['json_ld']       ?? true),
                'indexable'      => self::flag($in, 'indexable',     $existingSeo['indexable']     ?? true),
                'twitter_handle' => trim((string)($in['twitter_handle'] ?? $existingSeo['twitter_handle'] ?? '')),
                'default_image'  => trim((string)($in['default_image']  ?? $existingSeo['default_image']  ?? '')),
                'locale'         => trim((string)($in['locale']         ?? $existingSeo['locale']         ?? 'en_US')),
            ];
        }

        // Email (SMTP) — only persist when the payload mentions the block
        // so saves from other settings panes don't zero it out.
        $existingEmail = (array)($cfg->all()['email'] ?? []);
        $email = $existingEmail;
        if (is_array($body['email'] ?? null)) {
            $in = $body['email'];
            $enc = strtolower((string)($in['smtp_encryption'] ?? 'tls'));
            if (!in_array($enc, ['tls', 'ssl', 'none'], true)) $enc = 'tls';
            $port = (int)($in['smtp_port'] ?? 587);
            if ($port < 1 || $port > 65535) $port = 587;

            // smtp_pass empty in the payload OR equal to the masked
            // placeholder means "leave whatever's already saved alone".
            $rawPass = $in['smtp_pass'] ?? null;
            $newPass = (is_string($rawPass) && $rawPass !== '' && $rawPass !== '__SAVED__')
                ? $rawPass
                : (string)($existingEmail['smtp_pass'] ?? '');

            $email = [
                'smtp_host'        => trim((string)($in['smtp_host'] ?? '')),
                'smtp_port'        => $port,
                'smtp_user'        => trim((string)($in['smtp_user'] ?? '')),
                'smtp_pass'        => $newPass,
                'smtp_encryption'  => $enc,
                'from_address'     => filter_var(trim((string)($in['from_address'] ?? '')), FILTER_VALIDATE_EMAIL) ?: '',
                'from_name'        => trim((string)($in['from_name'] ?? '')),
                'fallback_to_mail' => self::flag($in, 'fallback_to_mail', !empty($existingEmail['fallback_to_mail'])),
            ];
        }

        // Forms — each form has a flat per-form spec. Field types are
        // taken from a small whitelist; the public-side submit handler
        // validates incoming POSTs against this exact list.
        $existingForms = (array)($cfg->all()['forms'] ?? []);
        $forms = $existingForms;
        if (is_array($body['forms'] ?? null)) {
            $forms = [];
            foreach ($body['forms'] as $name => $spec) {
                $slug = preg_replace('/[^a-z0-9_-]/', '', strtolower((string)$name));
                if (!$slug || !is_array($spec)) continue;
                $forms[$slug] = self::normalizeFormSpec($spec);
            }
        }

        $existingFolders = (array)($cfg->all()['folders'] ?? []);
        $folders = $existingFolders;
        if (is_array($body['folders'] ?? null)) {
            $folders = [];
            foreach ($body['folders'] as $name => $opts) {
                $slug = preg_replace('/[^a-z0-9_-]/', '', strtolower((string)$name));
                if (!$slug) continue;
                $sortMode = (($opts['sort_mode'] ?? 'date') === 'order') ? 'order' : 'date';
                $folders[$slug] = ['sort_mode' => $sortMode];
            }
        }

        $cfg->save(array_merge($cfg->all(), [
            'site'       => $site,
            'taxonomies' => $taxonomies,
            'uploads'    => $uploads,
            'seo'        => $seo,
            'email'      => $email,
            'forms'      => $forms,
            'folders'    => $folders,
        ]));

        // Mirror the GET-time password masking on the way back.
        $all = $cfg->all();
        if (isset($all['email']) && is_array($all['email'])) {
            $all['email']['smtp_pass'] = ($all['email']['smtp_pass'] ?? '') !== '' ? '__SAVED__' : '';
        }
        \json_response(['ok' => true, 'settings' => $all]);
    }

    /**
     * Validate / normalise a single form spec. Accepts both the rich
     * field-object shape and the legacy bare-string shape (a hand-edited
     * `["name","email","message"]`) — the bare-string variant gets
     * heuristically typed.
     *
     * @param array<string, mixed> $spec
     * @return array<string, mixed>
     */
    private static function normalizeFormSpec(array $spec): array
    {
        $fields = [];
        foreach ((array)($spec['fields'] ?? []) as $f) {
            if (is_string($f)) {
                $name = preg_replace('/[^a-z0-9_-]/', '', strtolower($f));
                if (!$name) continue;
                $fields[] = [
                    'name'        => $name,
                    'label'       => ucfirst(str_replace('_', ' ', $name)),
                    'type'        => self::guessTypeFromName($name),
                    'required'    => true,
                    'placeholder' => '',
                ];
                continue;
            }
            if (!is_array($f)) continue;
            $name = preg_replace('/[^a-z0-9_-]/', '', strtolower((string)($f['name'] ?? '')));
            if (!$name) continue;
            $type = (string)($f['type'] ?? 'text');
            if (!in_array($type, ['text', 'email', 'tel', 'url', 'textarea', 'select', 'checkbox'], true)) {
                $type = 'text';
            }
            $row = [
                'name'        => $name,
                'label'       => trim((string)($f['label'] ?? ucfirst(str_replace('_', ' ', $name)))),
                'type'        => $type,
                'required'    => !empty($f['required']),
                'placeholder' => trim((string)($f['placeholder'] ?? '')),
            ];
            if ($type === 'select') {
                $row['choices'] = array_values(array_filter(array_map(
                    fn ($v) => trim((string)$v),
                    (array)($f['choices'] ?? [])
                ), fn ($v) => $v !== ''));
            }
            if ($type === 'checkbox') {
                $row['cb_label'] = trim((string)($f['cb_label'] ?? $row['label']));
            }
            $fields[] = $row;
        }

        return [
            'to'                  => filter_var(trim((string)($spec['to'] ?? '')), FILTER_VALIDATE_EMAIL) ?: '',
            'subject_prefix'      => trim((string)($spec['subject_prefix'] ?? '')),
            'fields'              => $fields,
            'honeypot_field'      => preg_replace('/[^a-z0-9_-]/', '', strtolower((string)($spec['honeypot_field'] ?? 'website'))) ?: 'website',
            'rate_limit_per_hour' => max(0, min(1000, (int)($spec['rate_limit_per_hour'] ?? 5))),
            'success_redirect'    => trim((string)($spec['success_redirect'] ?? '/?sent=1')),
            'store_submissions'   => self::flag($spec, 'store_submissions', true),
        ];
    }

    private static function guessTypeFromName(string $name): string
    {
        if ($name === 'email')   return 'email';
        if ($name === 'phone' || $name === 'tel') return 'tel';
        if ($name === 'url' || $name === 'website') return 'url';
        if (in_array($name, ['message', 'body', 'comment', 'notes'], true)) return 'textarea';
        return 'text';
    }

    /**
     * Read a boolean toggle out of a settings payload — accept true/false,
     * 1/0, "1"/"0", "on"/"off" so JSON-from-React and form-submit both work.
     *
     * @param array<string, mixed> $payload
     */
    private static function flag(array $payload, string $key, bool $default): bool
    {
        if (!array_key_exists($key, $payload)) return $default;
        $v = $payload[$key];
        if (is_bool($v)) return $v;
        if (is_int($v))  return $v !== 0;
        if (is_string($v)) {
            $l = strtolower(trim($v));
            return $l !== '' && !in_array($l, ['0', 'false', 'off', 'no'], true);
        }
        return $default;
    }
}
