import Mailgun from 'mailgun.js'
import FormData from 'form-data'

let _client: ReturnType<InstanceType<typeof Mailgun>['client']> | null = null

export function getMailgunClient() {
  if (_client) return _client
  const mailgun = new Mailgun(FormData)
  _client = mailgun.client({
    username: 'api',
    key: process.env.MAILGUN_API_KEY || '',
    url: process.env.MAILGUN_API_URL || 'https://api.mailgun.net',
  })
  return _client
}

export const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || ''
export const EMAIL_FROM = process.env.EMAIL_FROM || `noreply@${MAILGUN_DOMAIN}`
