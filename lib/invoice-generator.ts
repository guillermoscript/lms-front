/**
 * Invoice Generator
 * Generates PDF invoices for manual payments
 */

interface InvoiceData {
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

  // Company details (from env or config)
  companyName: string
  companyAddress?: string
  companyEmail?: string
  companyPhone?: string

  // Payment details
  paymentMethod?: string
  paymentInstructions?: string

  // Notes
  notes?: string
}

/**
 * Generate invoice HTML
 */
export function generateInvoiceHTML(data: InvoiceData): string {
  const currencySymbol = data.currency === 'usd' ? '$' : '€'
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
  <title>Invoice ${data.invoiceNumber}</title>
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
      border-bottom: 3px solid #000;
    }

    .company {
      flex: 1;
    }

    .company h1 {
      font-size: 28px;
      margin-bottom: 10px;
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
      color: #000;
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
      <h1>${data.companyName}</h1>
      ${data.companyAddress ? `<p>${data.companyAddress}</p>` : ''}
      ${data.companyEmail ? `<p>Email: ${data.companyEmail}</p>` : ''}
      ${data.companyPhone ? `<p>Phone: ${data.companyPhone}</p>` : ''}
    </div>

    <div class="invoice-details">
      <h2>INVOICE</h2>
      <p><strong>Invoice #:</strong> ${data.invoiceNumber}</p>
      <p><strong>Date:</strong> ${formattedDate}</p>
      ${formattedDueDate ? `<p><strong>Due Date:</strong> ${formattedDueDate}</p>` : ''}
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>Bill To:</h3>
      <p><strong>${data.studentName}</strong></p>
      <p>${data.studentEmail}</p>
      ${data.studentPhone ? `<p>${data.studentPhone}</p>` : ''}
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
          <strong>${data.productName}</strong>
          ${data.productDescription ? `<br><span style="color: #666; font-size: 14px;">${data.productDescription}</span>` : ''}
        </td>
        <td class="text-right">${currencySymbol}${data.price.toFixed(2)}</td>
      </tr>
      <tr class="total-row">
        <td><strong>Total</strong></td>
        <td class="text-right"><strong>${currencySymbol}${data.price.toFixed(2)}</strong></td>
      </tr>
    </tbody>
  </table>

  ${data.paymentInstructions ? `
  <div class="payment-info">
    <h3>Payment Instructions</h3>
    <p>${data.paymentInstructions.replace(/\n/g, '<br>')}</p>
    ${data.paymentMethod ? `<p><strong>Payment Method:</strong> ${data.paymentMethod}</p>` : ''}
  </div>
  ` : ''}

  ${data.notes ? `
  <div class="notes">
    <p><strong>Notes:</strong></p>
    <p>${data.notes}</p>
  </div>
  ` : ''}

  <div class="footer">
    <p>Thank you for your business!</p>
    <p>This invoice was generated automatically by ${data.companyName}</p>
  </div>
</body>
</html>
  `
}

/**
 * Generate invoice configuration
 */
export function getInvoiceConfig() {
  return {
    companyName: process.env.COMPANY_NAME || 'LMS Platform',
    companyAddress: process.env.COMPANY_ADDRESS || '',
    companyEmail: process.env.COMPANY_EMAIL || '',
    companyPhone: process.env.COMPANY_PHONE || '',
  }
}
