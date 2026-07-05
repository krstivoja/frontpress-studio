// Provider quick-config for the SMTP form. Each provider knows its
// canonical host / port / encryption — clicking a tile snaps those
// three fields to the right values so the operator only types
// username + password.
//
// Logos are imported as ES modules so Vite fingerprints them into
// admin/assets/. Providers without a bundled logo (Brevo, Custom)
// fall back to the colored monogram tile.
//
// Real defaults vetted against each provider's docs (May 2026).

import phpIcon          from '../../assets/email/php.png';
import postmarkIcon     from '../../assets/email/postmark.png';
import mailgunIcon      from '../../assets/email/mailgun.png';
import sendgridIcon     from '../../assets/email/sendgrid.png';
import sesIcon          from '../../assets/email/amazon-ses.png';
import gmailIcon        from '../../assets/email/google-workspace.png';
import microsoft365Icon from '../../assets/email/microsoft-outlook.png';

const PROVIDERS = [
  {
    slug: 'php',
    name: 'PHP mail()',
    monogram: 'φ',
    accent: 'text-violet-700 bg-violet-100',
    icon: phpIcon,
    host: '',
    port: 587,
    encryption: 'tls',
    note: 'Use the server\'s built-in PHP mail() — no SMTP credentials needed. Fine for low-volume sites on hosts that have sendmail configured; deliverability is poorer than dedicated providers.',
  },
  {
    slug: 'postmark',
    name: 'Postmark',
    monogram: 'P',
    accent: 'text-amber-700 bg-amber-100',
    icon: postmarkIcon,
    host: 'smtp.postmarkapp.com',
    port: 587,
    encryption: 'tls',
    note: 'Server token as both username and password.',
  },
  {
    slug: 'mailgun',
    name: 'Mailgun',
    monogram: 'M',
    accent: 'text-red-700 bg-red-100',
    icon: mailgunIcon,
    host: 'smtp.mailgun.org',
    hosts: ['smtp.mailgun.org', 'smtp.eu.mailgun.org'],
    port: 587,
    encryption: 'tls',
    note: 'SMTP credentials from your Mailgun domain settings. US-region domains use smtp.mailgun.org; EU-region domains use smtp.eu.mailgun.org.',
  },
  {
    slug: 'sendgrid',
    name: 'SendGrid',
    monogram: 'S',
    accent: 'text-blue-700 bg-blue-100',
    icon: sendgridIcon,
    host: 'smtp.sendgrid.net',
    port: 587,
    encryption: 'tls',
    note: 'Username is the literal string "apikey". Password is your API key.',
  },
  {
    slug: 'ses',
    name: 'Amazon SES',
    monogram: 'A',
    accent: 'text-orange-700 bg-orange-100',
    icon: sesIcon,
    host: 'email-smtp.us-east-1.amazonaws.com',
    port: 587,
    encryption: 'tls',
    note: 'Replace the region in the host (us-east-1) with the one your SES domain is in. Credentials come from IAM "SMTP credentials".',
  },
  {
    slug: 'brevo',
    name: 'Brevo',
    monogram: 'B',
    accent: 'text-emerald-700 bg-emerald-100',
    host: 'smtp-relay.brevo.com',
    port: 587,
    encryption: 'tls',
    note: 'Username is your Brevo account email. Password is the SMTP key from Senders & IPs → SMTP.',
  },
  {
    slug: 'gmail',
    name: 'Gmail',
    monogram: 'G',
    accent: 'text-rose-700 bg-rose-100',
    icon: gmailIcon,
    host: 'smtp.gmail.com',
    port: 587,
    encryption: 'tls',
    note: 'Requires an app password (Google account → Security → 2-Step Verification → App passwords). Your account password won\'t work.',
  },
  {
    slug: 'microsoft365',
    name: 'Microsoft 365',
    monogram: 'O',
    accent: 'text-sky-700 bg-sky-100',
    icon: microsoft365Icon,
    host: 'smtp.office365.com',
    port: 587,
    encryption: 'tls',
    note: 'SMTP AUTH must be enabled for the mailbox. Use an app password if the account has MFA on.',
  },
];

// Pick the provider tile whose host the current config matches. SES is
// matched by prefix because operators change the region; everything
// else is a literal host match against the provider's canonical host or
// any regional alias in `hosts` (e.g. Mailgun US vs EU). Returns null when
// the host doesn't match any known provider — that's a legitimate state
// (self-hosted Postfix, ProtonMail Bridge, etc.), and no tile lighting up
// is the right signal.
export function detectProvider(host) {
  // Empty host = no SMTP configured = PHP mail() fallback. Surfacing this as
  // an active tile (rather than no selection) makes the default state legible
  // — users see at a glance which transport their site is actually using.
  if (!host) return PROVIDERS.find((p) => p.slug === 'php');
  const lower = String(host).toLowerCase();
  if (lower.startsWith('email-smtp.')) return PROVIDERS.find((p) => p.slug === 'ses');
  return PROVIDERS.find((p) => {
    const candidates = p.hosts || (p.host ? [p.host] : []);
    return candidates.some((h) => h.toLowerCase() === lower);
  }) || null;
}

export default function EmailProviderPicker({ activeHost, onPick }) {
  const active = detectProvider(activeHost);

  return (
    <div>
      <div className="mb-2 text-[13px] font-medium text-zinc-900">Provider</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PROVIDERS.map((p) => {
          const isActive = active && active.slug === p.slug;
          return (
            <button
              key={p.slug}
              type="button"
              onClick={() => onPick(p)}
              className={`flex items-center gap-2.5 rounded-md border px-3 py-2 text-left text-[13px] transition-colors ${
                isActive
                  ? 'border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 hover:border-zinc-800'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-900 hover:border-zinc-300 hover:bg-white'
              }`}
              title={p.note}
            >
              {p.icon ? (
                <img
                  src={p.icon}
                  alt=""
                  aria-hidden="true"
                  className="h-6 w-6 shrink-0 object-contain"
                />
              ) : (
                <span
                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded font-mono text-[12px] font-semibold ${p.accent}`}
                  aria-hidden="true"
                >
                  {p.monogram}
                </span>
              )}
              <span className="truncate font-medium">{p.name}</span>
            </button>
          );
        })}
      </div>
      {active && (
        <p className="mt-2 text-[12px] text-zinc-600">
          <span className="font-semibold">{active.name}:</span> {active.note}
        </p>
      )}
    </div>
  );
}
