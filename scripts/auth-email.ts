/** Setup and diagnose Auth's Resend hook without printing credentials. */
import { loadEnvConfig } from '@next/env'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { getMailerStatus } from '../lib/email/status'
import { sendEmail } from '../lib/email/send'

loadEnvConfig(process.cwd())
const args = process.argv.slice(2)
const switches = new Set(['--setup', '--local', '--restart', '--help'])
const values = new Set(['--to', '--recovery', '--origin'])
const flags = new Set<string>()
const options = new Map<string, string>()
for (let index = 0; index < args.length; index++) {
  const arg = args[index]
  if (switches.has(arg)) flags.add(arg)
  else if (values.has(arg) && args[index + 1] && !args[index + 1].startsWith('--')) options.set(arg, args[++index])
  else throw new Error(`Unknown or incomplete argument: ${arg}`)
}

function saveLocalEnv(name: string, value: string) {
  const path = '.env.local'
  const content = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const expression = new RegExp(`^${name}=.*$`, 'm')
  const line = `${name}=${JSON.stringify(value)}`
  writeFileSync(path, expression.test(content) ? content.replace(expression, () => line) : `${content.trimEnd()}\n${line}\n`, { mode: 0o600 })
  process.env[name] = value
}

async function main() {
  if (flags.has('--help')) {
    console.log('email:check                          Check configuration (no email sent)')
    console.log('email:setup                         Generate hook secret if missing')
    console.log('email:setup -- --local --restart     Enable hook and restart local Supabase, preserving data')
    console.log('email:check -- --to you@example.com  Send one transport test')
    console.log('email:check -- --recovery you@example.com --origin https://school.example.com')
    return
  }
  if (flags.has('--local') && !flags.has('--setup')) throw new Error('--local requires --setup')
  if (flags.has('--local') && !flags.has('--restart')) throw new Error('Use --local --restart to load the hook into the local instance.')
  if (flags.has('--restart') && !flags.has('--local')) throw new Error('--restart requires --setup --local')
  if (options.has('--to') && options.has('--recovery')) throw new Error('Choose --to or --recovery, not both')

  if (flags.has('--setup')) {
    const from = process.env.EMAIL_FROM?.trim()
    if (from && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(from)) {
      saveLocalEnv('EMAIL_FROM', `LMS <noreply@${from}>`)
      console.log('Converted EMAIL_FROM domain to a complete sender address.')
    }
    if (!process.env.SEND_EMAIL_HOOK_SECRET?.trim()) {
      saveLocalEnv('SEND_EMAIL_HOOK_SECRET', `v1,whsec_${randomBytes(32).toString('base64')}`)
      console.log('Generated SEND_EMAIL_HOOK_SECRET in .env.local; value hidden.')
    }
  }

  const required = ['RESEND_API_KEY', 'EMAIL_FROM', 'SEND_EMAIL_HOOK_SECRET', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
  const missing = required.filter((key) => !process.env[key]?.trim())
  for (const key of required) console.log(`${missing.includes(key) ? 'MISSING' : 'OK'} ${key}`)
  if (missing.length) throw new Error('Complete .env.local, then run npm run email:setup. See docs/AUTH_EMAIL_SETUP.md.')
  const status = getMailerStatus()
  if (!status.configured) throw new Error('EMAIL_FROM must be an email address, e.g. LMS <noreply@your-verified-domain.com>.')
  const secret = process.env.SEND_EMAIL_HOOK_SECRET!.trim()
  if (!/^v1,whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret)) throw new Error('Use the Supabase hook signing secret, in v1,whsec_... format.')
  console.log(`Sender: ${status.from}`)

  if (flags.has('--local')) {
    const hostname = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname
    if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) throw new Error('--local only configures a local Supabase project.')
    const path = 'supabase/config.toml'
    const content = readFileSync(path, 'utf8')
    const block = '[auth.hook.send_email]\nenabled = true\nuri = "http://host.docker.internal:3000/api/auth/send-email-hook"\nsecrets = "env(SEND_EMAIL_HOOK_SECRET)"'
    const expression = /(?:# )?\[auth\.hook\.send_email\]\n(?:# )?enabled = (?:true|false)\n(?:# )?uri = "[^"\n]+"\n(?:# )?secrets = "[^"\n]+"/
    if (!expression.test(content)) throw new Error('Send Email hook config block was not found; see the setup guide.')
    // Enable the hook just while the CLI reads the startup configuration.
    // Restore source config afterwards so CI and other developers retain
    // Mailpit as their credential-free default.
    writeFileSync(path, content.replace(expression, block))
    try {
      // CLI output includes Auth keys. Capture it and never echo it.
      for (const command of ['stop', 'start']) {
        console.log(`Running supabase ${command}; database volumes are preserved.`)
        const result = spawnSync('supabase', [command], { env: process.env, encoding: 'utf8' })
        if (result.error || result.status !== 0) throw new Error(`supabase ${command} failed. Run it manually to inspect the diagnostics.`)
      }
    } finally {
      writeFileSync(path, content)
    }
    console.log('Local hook is active; repository config restored to its default. Keep the app running on port 3000.')
  }

  if (options.has('--to')) {
    const to = options.get('--to')!
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error('--to must be an email address')
    const sent = await sendEmail({ to, subject: 'LMS — email delivery test', html: '<p>Your LMS can send email using Resend.</p><p>This is a delivery test; it does not change your account.</p>' })
    if (!sent) throw new Error('Resend did not accept the email. Check the verified sending domain, key permissions, and Resend logs.')
    console.log('Resend accepted the test. Check delivery status in Resend and the recipient inbox.')
  } else if (options.has('--recovery')) {
    const originValue = options.get('--origin')
    if (!originValue) throw new Error('--recovery needs --origin with your school URL')
    const origin = new URL(originValue)
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) throw new Error('Use an HTTP(S) school origin')
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await supabase.auth.resetPasswordForEmail(options.get('--recovery')!, { redirectTo: `${origin.origin}/es/auth/update-password` })
    if (error) throw new Error(`Recovery failed (${error.code ?? error.status}). Check Supabase Auth logs and hook configuration.`)
    console.log('Recovery request accepted. An existing account receives a link; unknown addresses receive nothing. Check Resend logs to confirm the hook handled it.')
  } else console.log(flags.has('--local')
    ? 'Local configuration and hook activation are complete. For hosted setup, see docs/AUTH_EMAIL_SETUP.md.'
    : 'Environment configuration is valid. Check hook activation and domain verification; see docs/AUTH_EMAIL_SETUP.md.')
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Email check failed')
  process.exitCode = 1
})
