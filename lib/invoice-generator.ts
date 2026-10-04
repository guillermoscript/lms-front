/**
 * Invoice Generator
 * Generates PDF invoices for manual payments.
 *
 * The issuer is the invoice's own school (issue #777), not the platform: a
 * student's invoice must read the tenant's name, logo and brand colour the
 * same way certificates do (#765) — never `process.env.COMPANY_*`, which
 * printed "LMS Platform" on every school's invoice regardless of tenant.
 */

import { formatCurrency } from '@/lib/currency'
import { normalizeLogoUrl } from '@/lib/themes/brand-outputs'
import type { SchoolBrand } from '@/lib/themes/school-brand'

/** The invoice issuer — resolved from the invoice's own tenant via `getInvoiceConfig`. */
export interface InvoiceIssuer {
  name: string
  logoUrl: string | null
  address?: string
  email?: string
  phone?: string
  /** Literal `#RRGGBB` outputs from `deriveBrandOutputs` — safe to drop into inline styles. */
  brand: string
  brandText: string
  button: string
  buttonInk: string
}

export interface InvoiceData {
  invoiceNumber: string
  invoiceDate: Date
  dueDate?: Date

  // Student details
  studentName: string
  studentEmail: string
  studentPhone?: string

  // Product details
  productName: string
  productDescription?: string
  price: number
  currency: string

  // The school issuing this invoice
  issuer: InvoiceIssuer

  // Payment details
  paymentMethod?: string
  paymentInstructions?: string

  // Notes
  notes?: string
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (char) => map[char])
}

/**
 * Generate invoice HTML
 */
export function generateInvoiceHTML(data: InvoiceData): string {
  // Formatted in the request's own currency — COP, MXN and friends are not
  // euros, and zero-decimal currencies carry no cents (#727).
  const formattedPrice = formatCurrency(data.price, data.currency || 'usd')
  const formattedDate = data.invoiceDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
  const formattedDueDate = data.dueDate?.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${escapeHtml(data.invoiceNumber)}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 3px solid ${data.issuer.brand};
    }

    .company {
      flex: 1;
    }

    .company-logo {
      display: block;
      max-height: 40px;
      width: auto;
      margin-bottom: 10px;
    }

    .company h1 {
      font-size: 28px;
      margin-bottom: 10px;
      color: ${data.issuer.brandText};
    }

    .company p {
      color: #666;
      font-size: 14px;
    }

    .invoice-details {
      text-align: right;
    }

    .invoice-details h2 {
      font-size: 32px;
      color: ${data.issuer.brandText};
      margin-bottom: 10px;
    }

    .invoice-details p {
      font-size: 14px;
      color: #666;
    }

    .parties {
      display: flex;
      justify-content: space-between;
      margin-bottom: 40px;
    }

    .party {
      flex: 1;
    }

    .party h3 {
      font-size: 14px;
      text-transform: uppercase;
      color: #666;
      margin-bottom: 10px;
    }

    .party p {
      margin-bottom: 5px;
    }

    .items-table {
      width: 100%;
      margin-bottom: 40px;
      border-collapse: collapse;
    }

    .items-table thead {
      background: #f8f8f8;
    }

    .items-table th {
      padding: 12px;
      text-align: left;
      font-weight: 600;
      border-bottom: 2px solid #ddd;
    }

    .items-table td {
      padding: 15px 12px;
      border-bottom: 1px solid #eee;
    }

    .items-table .text-right {
      text-align: right;
    }

    .total-row {
      background: #f8f8f8;
      font-weight: 600;
      font-size: 18px;
    }

    .payment-info {
      background: #f8f8f8;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
    }

    .payment-info h3 {
      margin-bottom: 10px;
      font-size: 16px;
    }

    .payment-info p {
      margin-bottom: 8px;
      color: #555;
    }

    .notes {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      color: #666;
      font-size: 14px;
    }

    .footer {
      margin-top: 60px;
      text-align: center;
      color: #999;
      font-size: 12px;
    }

    @media print {
      body {
        padding: 0;
      }

      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company">
      ${data.issuer.logoUrl ? `<img class="company-logo" src="${escapeHtml(data.issuer.logoUrl)}" alt="${escapeHtml(data.issuer.name)}" />` : ''}
      <h1>${escapeHtml(data.issuer.name)}</h1>
      ${data.issuer.address ? `<p>${escapeHtml(data.issuer.address)}</p>` : ''}
      ${data.issuer.email ? `<p>Email: ${escapeHtml(data.issuer.email)}</p>` : ''}
      ${data.issuer.phone ? `<p>Phone: ${escapeHtml(data.issuer.phone)}</p>` : ''}
    </div>

    <div class="invoice-details">
      <h2>INVOICE</h2>
      <p><strong>Invoice #:</strong> ${escapeHtml(data.invoiceNumber)}</p>
      <p><strong>Date:</strong> ${formattedDate}</p>
      ${formattedDueDate ? `<p><strong>Due Date:</strong> ${formattedDueDate}</p>` : ''}
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>Bill To:</h3>
      <p><strong>${escapeHtml(data.studentName)}</strong></p>
      <p>${escapeHtml(data.studentEmail)}</p>
      ${data.studentPhone ? `<p>${escapeHtml(data.studentPhone)}</p>` : ''}
    </div>
  </div>

  <table class="items-table">
    <thead>
      <tr>
        <th>Description</th>
        <th class="text-right">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <strong>${escapeHtml(data.productName)}</strong>
          ${data.productDescription ? `<br><span style="color: #666; font-size: 14px;">${escapeHtml(data.productDescription)}</span>` : ''}
        </td>
        <td class="text-right">${escapeHtml(formattedPrice)}</td>
      </tr>
      <tr class="total-row">
        <td><strong>Total</strong></td>
        <td class="text-right"><strong>${escapeHtml(formattedPrice)}</strong></td>
      </tr>
    </tbody>
  </table>

  ${data.paymentInstructions ? `
  <div class="payment-info">
    <h3>Payment Instructions</h3>
    <p>${escapeHtml(data.paymentInstructions).replace(/\r?\n/g, '<br>')}</p>
    ${data.paymentMethod ? `<p><strong>Payment Method:</strong> ${escapeHtml(data.paymentMethod)}</p>` : ''}
  </div>
  ` : ''}

  ${data.notes ? `
  <div class="notes">
    <p><strong>Notes:</strong></p>
    <p>${escapeHtml(data.notes)}</p>
  </div>
  ` : ''}

  <div class="footer">
    <p>Thank you for your business!</p>
    <p>This invoice was generated automatically by ${escapeHtml(data.issuer.name)}</p>
  </div>
</body>
</html>
  `
}

/**
 * Resolves the invoice issuer from the invoice's own school brand (#777) — the
 * same `deriveBrandOutputs` colours certificates and transactional emails use
 * (#765), never `process.env.COMPANY_*`. A school with no theme falls back to
 * `tenants.name` and the platform brand, exactly like `getSchoolBrand` does.
 *
 * There is no `tenant_settings` key today for a school's own invoicing
 * address/email/phone, so those stay empty until one exists — nothing here
 * invents a column.
 */
export function getInvoiceConfig(brand: SchoolBrand): InvoiceIssuer {
  return {
    name: brand.name || 'School',
    logoUrl: normalizeLogoUrl(brand.logoUrl),
    brand: brand.outputs.brand,
    brandText: brand.outputs.brandText,
    button: brand.outputs.button,
    buttonInk: brand.outputs.buttonInk,
  }
}
