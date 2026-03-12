/**
 * Certificate Generator
 * Generates HTML certificates for course completion
 */

interface CertificateData {
  certificateNumber: string
  studentName: string
  courseTitle: string
  completionDate: Date
  score?: number | null
  issuerName?: string
  designSettings?: {
    primary_color?: string
    secondary_color?: string
    show_qr_code?: boolean
    logo_url?: string
  } | null
  signatureName?: string | null
  signatureTitle?: string | null
  signatureImageUrl?: string | null
  logoUrl?: string | null
}

export function generateCertificateHTML(data: CertificateData): string {
  const formattedDate = data.completionDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const primaryColor = data.designSettings?.primary_color || '#b8860b'
  const secondaryColor = data.designSettings?.secondary_color || '#1a1a2e'
  const issuer = escapeHtml(data.issuerName || 'LMS Platform')
  const logoUrl = data.logoUrl || data.designSettings?.logo_url || ''
  const sigName = data.signatureName ? escapeHtml(data.signatureName) : ''
  const sigTitle = data.signatureTitle ? escapeHtml(data.signatureTitle) : ''
  const sigImageUrl = data.signatureImageUrl || ''

  const scoreSection = data.score != null
    ? `<div class="score">
        <span class="score-label">Final Score</span>
        <span class="score-value">${Math.round(data.score)}%</span>
      </div>`
    : ''

  const sealSection = logoUrl
    ? `<div class="logo"><img src="${escapeHtml(logoUrl)}" alt="Logo" class="logo-img" /></div>`
    : `<div class="seal">
        <span class="seal-icon">${issuer.substring(0, 3).toUpperCase()}</span>
      </div>`

  const signatureSection = sigImageUrl
    ? `<img src="${escapeHtml(sigImageUrl)}" alt="Signature" class="signature-img" />`
    : ''

  const signerName = sigName || issuer
  const signerTitle = sigTitle || 'Official Issuer'

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Certificate - ${escapeHtml(data.certificateNumber)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@300;400;500;600&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    html, body {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f0f0f0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }

    .certificate-wrapper {
      width: 1056px;
      height: 816px;
      background: #ffffff;
      position: relative;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
    }

    .border-outer {
      position: absolute;
      inset: 16px;
      border: 3px solid ${secondaryColor};
    }

    .border-inner {
      position: absolute;
      inset: 24px;
      border: 1px solid ${primaryColor};
    }

    .corner {
      position: absolute;
      width: 60px;
      height: 60px;
    }

    .corner-tl { top: 30px; left: 30px; border-top: 3px solid ${primaryColor}; border-left: 3px solid ${primaryColor}; }
    .corner-tr { top: 30px; right: 30px; border-top: 3px solid ${primaryColor}; border-right: 3px solid ${primaryColor}; }
    .corner-bl { bottom: 30px; left: 30px; border-bottom: 3px solid ${primaryColor}; border-left: 3px solid ${primaryColor}; }
    .corner-br { bottom: 30px; right: 30px; border-bottom: 3px solid ${primaryColor}; border-right: 3px solid ${primaryColor}; }

    .top-accent {
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 200px;
      height: 6px;
      background: linear-gradient(90deg, transparent, ${primaryColor}, transparent);
    }

    .content {
      position: absolute;
      inset: 50px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 20px 40px;
    }

    .seal {
      width: 80px;
      height: 80px;
      border: 3px solid ${primaryColor};
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 16px;
      position: relative;
    }

    .seal::before {
      content: '';
      position: absolute;
      width: 68px;
      height: 68px;
      border: 1px solid ${primaryColor};
      border-radius: 50%;
    }

    .seal-icon {
      font-size: 22px;
      color: ${primaryColor};
      font-weight: 700;
      font-family: 'Playfair Display', serif;
    }

    .logo {
      margin-bottom: 16px;
    }

    .logo-img {
      height: 80px;
      width: auto;
      max-width: 200px;
      object-fit: contain;
    }

    .header-text {
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 6px;
      text-transform: uppercase;
      color: ${primaryColor};
      margin-bottom: 6px;
    }

    .title {
      font-family: 'Playfair Display', serif;
      font-size: 44px;
      font-weight: 700;
      color: ${secondaryColor};
      margin-bottom: 8px;
      line-height: 1.1;
    }

    .subtitle {
      font-size: 14px;
      font-weight: 300;
      color: #666;
      margin-bottom: 28px;
      letter-spacing: 1px;
    }

    .awarded-to {
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 4px;
      text-transform: uppercase;
      color: #999;
      margin-bottom: 8px;
    }

    .student-name {
      font-family: 'Playfair Display', serif;
      font-size: 36px;
      font-weight: 600;
      color: ${secondaryColor};
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 2px solid ${primaryColor};
      min-width: 400px;
    }

    .description {
      font-size: 14px;
      font-weight: 400;
      color: #555;
      max-width: 560px;
      line-height: 1.7;
      margin-bottom: 8px;
    }

    .course-title {
      font-family: 'Playfair Display', serif;
      font-size: 22px;
      font-weight: 600;
      color: ${secondaryColor};
      margin-bottom: 24px;
    }

    .score {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 24px;
      padding: 10px 28px;
      border: 1px solid #e0d6c2;
      border-radius: 6px;
      background: #fdfbf7;
    }

    .score-label {
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: #999;
      margin-bottom: 2px;
    }

    .score-value {
      font-family: 'Playfair Display', serif;
      font-size: 28px;
      font-weight: 700;
      color: ${secondaryColor};
    }

    .footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      width: 100%;
      max-width: 640px;
      margin-top: auto;
    }

    .footer-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    .signature-img {
      height: 40px;
      width: auto;
      max-width: 160px;
      object-fit: contain;
      margin-bottom: 4px;
    }

    .footer-line { width: 160px; height: 1px; background: #ccc; }
    .footer-label { font-size: 11px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase; color: #999; }
    .footer-value { font-size: 13px; font-weight: 400; color: #333; }

    .cert-number {
      position: absolute;
      bottom: 36px;
      right: 50px;
      font-size: 10px;
      font-weight: 400;
      color: #bbb;
      letter-spacing: 1px;
    }

    @media print {
      html, body { background: #fff; }
      .certificate-wrapper { box-shadow: none; width: 100%; height: 100%; }
      .no-print { display: none; }
    }

    .action-bar {
      position: fixed;
      top: 20px;
      right: 20px;
      display: flex;
      gap: 8px;
      z-index: 10;
    }

    .action-btn {
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-print { background: ${secondaryColor}; color: #fff; }
    .btn-print:hover { opacity: 0.85; }
  </style>
</head>
<body>
  <div class="action-bar no-print">
    <button class="action-btn btn-print" onclick="window.print()">Print / Save as PDF</button>
  </div>

  <div class="certificate-wrapper">
    <div class="border-outer"></div>
    <div class="border-inner"></div>
    <div class="corner corner-tl"></div>
    <div class="corner corner-tr"></div>
    <div class="corner corner-bl"></div>
    <div class="corner corner-br"></div>
    <div class="top-accent"></div>

    <div class="content">
      ${sealSection}

      <div class="header-text">${issuer}</div>
      <div class="title">Certificate of Completion</div>
      <div class="subtitle">This is to certify that</div>

      <div class="awarded-to">Awarded To</div>
      <div class="student-name">${escapeHtml(data.studentName)}</div>

      <div class="description">
        has successfully completed all requirements for the course
      </div>
      <div class="course-title">${escapeHtml(data.courseTitle)}</div>

      ${scoreSection}

      <div class="footer">
        <div class="footer-item">
          ${signatureSection}
          <div class="footer-value">${signerName}</div>
          <div class="footer-line"></div>
          <div class="footer-label">${signerTitle}</div>
        </div>
        <div class="footer-item">
          <div class="footer-value">${formattedDate}</div>
          <div class="footer-line"></div>
          <div class="footer-label">Date</div>
        </div>
      </div>
    </div>

    <div class="cert-number">${escapeHtml(data.certificateNumber)}</div>
  </div>
</body>
</html>
  `
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
