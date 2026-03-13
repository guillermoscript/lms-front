/**
 * Certificate Generator
 * Generates HTML certificates for course completion
 * Design: Luxury credential aesthetic — engraving-inspired linework,
 * classical typography, and subtle guilloche patterns
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

  const primaryColor = data.designSettings?.primary_color || '#1a5632'
  const secondaryColor = data.designSettings?.secondary_color || '#0f2b1a'
  const issuer = escapeHtml(data.issuerName || 'LMS Platform')
  const logoUrl = data.logoUrl || data.designSettings?.logo_url || ''
  const sigName = data.signatureName ? escapeHtml(data.signatureName) : ''
  const sigTitle = data.signatureTitle ? escapeHtml(data.signatureTitle) : ''
  const sigImageUrl = data.signatureImageUrl || ''

  const scoreSection = data.score != null
    ? `<div class="score-badge">
        <span class="score-label">Achievement Score</span>
        <span class="score-value">${Math.round(data.score)}%</span>
      </div>`
    : ''

  const sealSection = logoUrl
    ? `<div class="org-seal"><img src="${escapeHtml(logoUrl)}" alt="Logo" class="org-logo" /></div>`
    : `<div class="org-seal">
        <div class="seal-ring">
          <div class="seal-inner">
            <span class="seal-monogram">${issuer.substring(0, 3).toUpperCase()}</span>
          </div>
        </div>
      </div>`

  const signatureSection = sigImageUrl
    ? `<img src="${escapeHtml(sigImageUrl)}" alt="Signature" class="sig-image" />`
    : ''

  const signerName = sigName || issuer
  const signerTitle = sigTitle || 'Official Issuer'

  // Generate a subtle SVG guilloche pattern based on primary color
  const guillochePattern = generateGuillocheSVG(primaryColor)

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Certificate - ${escapeHtml(data.certificateNumber)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    html, body {
      width: 100%; height: 100%;
      display: flex; align-items: center; justify-content: center;
      background: #e8e4df;
      font-family: 'DM Sans', system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    .certificate {
      width: 1056px; height: 816px;
      background: #fffef9;
      position: relative;
      overflow: hidden;
      box-shadow:
        0 1px 2px rgba(0,0,0,0.04),
        0 4px 8px rgba(0,0,0,0.04),
        0 16px 32px rgba(0,0,0,0.06),
        0 32px 64px rgba(0,0,0,0.08);
    }

    /* Guilloche background watermark */
    .guilloche-bg {
      position: absolute;
      inset: 0;
      opacity: 0.03;
      background-image: url("data:image/svg+xml,${encodeURIComponent(guillochePattern)}");
      background-size: 100% 100%;
      pointer-events: none;
    }

    /* Outer frame — fine double-line border */
    .frame-outer {
      position: absolute;
      inset: 20px;
      border: 1px solid ${primaryColor}40;
    }
    .frame-outer::after {
      content: '';
      position: absolute;
      inset: 4px;
      border: 1px solid ${primaryColor}25;
    }

    /* Inner decorative frame */
    .frame-inner {
      position: absolute;
      inset: 36px;
      border: 0.5px solid ${primaryColor}20;
    }

    /* Corner ornaments — L-shaped with a diamond accent */
    .ornament {
      position: absolute;
      width: 48px; height: 48px;
    }
    .ornament::before, .ornament::after {
      content: '';
      position: absolute;
      background: ${primaryColor};
    }
    .ornament-tl { top: 28px; left: 28px; }
    .ornament-tl::before { top: 0; left: 0; width: 48px; height: 1.5px; }
    .ornament-tl::after { top: 0; left: 0; width: 1.5px; height: 48px; }

    .ornament-tr { top: 28px; right: 28px; }
    .ornament-tr::before { top: 0; right: 0; width: 48px; height: 1.5px; }
    .ornament-tr::after { top: 0; right: 0; width: 1.5px; height: 48px; }

    .ornament-bl { bottom: 28px; left: 28px; }
    .ornament-bl::before { bottom: 0; left: 0; width: 48px; height: 1.5px; }
    .ornament-bl::after { bottom: 0; left: 0; width: 1.5px; height: 48px; }

    .ornament-br { bottom: 28px; right: 28px; }
    .ornament-br::before { bottom: 0; right: 0; width: 48px; height: 1.5px; }
    .ornament-br::after { bottom: 0; right: 0; width: 1.5px; height: 48px; }

    /* Diamond at each corner intersection */
    .diamond {
      position: absolute;
      width: 8px; height: 8px;
      background: ${primaryColor};
      transform: rotate(45deg);
    }
    .diamond-tl { top: 24px; left: 24px; }
    .diamond-tr { top: 24px; right: 24px; }
    .diamond-bl { bottom: 24px; left: 24px; }
    .diamond-br { bottom: 24px; right: 24px; }

    /* Top accent line */
    .top-rule {
      position: absolute;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      width: 180px;
      height: 2px;
      background: linear-gradient(90deg, transparent, ${primaryColor}, transparent);
    }
    .bottom-rule {
      position: absolute;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      width: 180px;
      height: 2px;
      background: linear-gradient(90deg, transparent, ${primaryColor}60, transparent);
    }

    /* Main content area */
    .content {
      position: absolute;
      inset: 56px 72px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 0;
    }

    /* Organization seal */
    .org-seal { margin-bottom: 18px; }

    .seal-ring {
      width: 76px; height: 76px;
      border: 2px solid ${primaryColor};
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      position: relative;
    }
    .seal-ring::before {
      content: '';
      position: absolute;
      width: 66px; height: 66px;
      border: 0.75px solid ${primaryColor}80;
      border-radius: 50%;
    }
    .seal-ring::after {
      content: '';
      position: absolute;
      width: 84px; height: 84px;
      border: 0.5px solid ${primaryColor}30;
      border-radius: 50%;
    }
    .seal-inner {
      width: 58px; height: 58px;
      display: flex; align-items: center; justify-content: center;
    }
    .seal-monogram {
      font-family: 'Cormorant Garamond', 'Georgia', serif;
      font-size: 20px;
      font-weight: 600;
      color: ${primaryColor};
      letter-spacing: 2px;
    }
    .org-logo {
      height: 72px; width: auto; max-width: 180px;
      object-fit: contain;
    }

    /* Issuer name */
    .issuer-name {
      font-family: 'DM Sans', sans-serif;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 5px;
      text-transform: uppercase;
      color: ${primaryColor};
      margin-bottom: 10px;
    }

    /* Main title */
    .cert-title {
      font-family: 'Cormorant Garamond', 'Georgia', serif;
      font-size: 48px;
      font-weight: 400;
      font-style: italic;
      color: ${secondaryColor};
      line-height: 1;
      margin-bottom: 4px;
    }

    /* Thin decorative rule under title */
    .title-rule {
      width: 280px;
      height: 1px;
      background: linear-gradient(90deg, transparent, ${primaryColor}60, transparent);
      margin: 10px auto 20px;
    }

    /* Preamble text */
    .preamble {
      font-family: 'DM Sans', sans-serif;
      font-size: 12px;
      font-weight: 400;
      color: #8a8578;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    /* Student name — the hero element */
    .student-name {
      font-family: 'Cormorant Garamond', 'Georgia', serif;
      font-size: 42px;
      font-weight: 600;
      color: ${secondaryColor};
      line-height: 1.1;
      margin-bottom: 6px;
    }

    /* Decorative flourish under name */
    .name-flourish {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }
    .flourish-line {
      width: 80px;
      height: 0.75px;
      background: ${primaryColor};
    }
    .flourish-diamond {
      width: 6px; height: 6px;
      background: ${primaryColor};
      transform: rotate(45deg);
      flex-shrink: 0;
    }

    /* Description text */
    .description {
      font-family: 'DM Sans', sans-serif;
      font-size: 13px;
      font-weight: 400;
      color: #6b6560;
      line-height: 1.6;
      margin-bottom: 6px;
    }

    /* Course title */
    .course-name {
      font-family: 'Cormorant Garamond', 'Georgia', serif;
      font-size: 24px;
      font-weight: 600;
      color: ${secondaryColor};
      margin-bottom: 18px;
    }

    /* Score badge */
    .score-badge {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      padding: 8px 24px;
      border: 1px solid ${primaryColor}30;
      margin-bottom: 18px;
    }
    .score-badge .score-label {
      font-size: 9px;
      font-weight: 500;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: #8a8578;
    }
    .score-badge .score-value {
      font-family: 'Cormorant Garamond', 'Georgia', serif;
      font-size: 26px;
      font-weight: 700;
      color: ${secondaryColor};
    }

    /* Footer signatures + date */
    .footer-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      width: 100%;
      max-width: 580px;
      margin-top: auto;
      padding-top: 12px;
    }

    .footer-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 160px;
    }

    .sig-image {
      height: 36px;
      width: auto;
      max-width: 140px;
      object-fit: contain;
      margin-bottom: 6px;
    }

    .footer-name {
      font-family: 'DM Sans', sans-serif;
      font-size: 12px;
      font-weight: 500;
      color: #3a3632;
      margin-bottom: 6px;
    }

    .footer-rule {
      width: 140px;
      height: 0.75px;
      background: #c5bfb6;
      margin-bottom: 6px;
    }

    .footer-label {
      font-family: 'DM Sans', sans-serif;
      font-size: 9px;
      font-weight: 500;
      letter-spacing: 2.5px;
      text-transform: uppercase;
      color: #9a948c;
    }

    /* Certificate number — watermark style */
    .cert-id {
      position: absolute;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%);
      font-family: 'DM Sans', sans-serif;
      font-size: 9px;
      font-weight: 400;
      color: #c5bfb6;
      letter-spacing: 2px;
    }

    /* Print styles */
    @media print {
      html, body { background: #fff; }
      .certificate { box-shadow: none; width: 100%; height: 100%; }
      .no-print { display: none !important; }
    }

    /* Action bar */
    .action-bar {
      position: fixed;
      top: 24px; right: 24px;
      z-index: 10;
    }
    .action-btn {
      padding: 10px 24px;
      border: none;
      background: ${secondaryColor};
      color: #fffef9;
      font-family: 'DM Sans', sans-serif;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.5px;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .action-btn:hover { opacity: 0.8; }
  </style>
</head>
<body>
  <div class="action-bar no-print">
    <button class="action-btn" onclick="window.print()">Print / Save as PDF</button>
  </div>

  <div class="certificate">
    <div class="guilloche-bg"></div>
    <div class="frame-outer"></div>
    <div class="frame-inner"></div>

    <div class="ornament ornament-tl"></div>
    <div class="ornament ornament-tr"></div>
    <div class="ornament ornament-bl"></div>
    <div class="ornament ornament-br"></div>

    <div class="diamond diamond-tl"></div>
    <div class="diamond diamond-tr"></div>
    <div class="diamond diamond-bl"></div>
    <div class="diamond diamond-br"></div>

    <div class="top-rule"></div>
    <div class="bottom-rule"></div>

    <div class="content">
      ${sealSection}
      <div class="issuer-name">${issuer}</div>
      <div class="cert-title">Certificate of Completion</div>
      <div class="title-rule"></div>

      <div class="preamble">This is to certify that</div>
      <div class="student-name">${escapeHtml(data.studentName)}</div>

      <div class="name-flourish">
        <div class="flourish-line"></div>
        <div class="flourish-diamond"></div>
        <div class="flourish-line"></div>
      </div>

      <div class="description">has successfully completed all requirements for the course</div>
      <div class="course-name">${escapeHtml(data.courseTitle)}</div>

      ${scoreSection}

      <div class="footer-row">
        <div class="footer-col">
          ${signatureSection}
          <div class="footer-name">${signerName}</div>
          <div class="footer-rule"></div>
          <div class="footer-label">${signerTitle}</div>
        </div>
        <div class="footer-col">
          <div class="footer-name">${formattedDate}</div>
          <div class="footer-rule"></div>
          <div class="footer-label">Date Issued</div>
        </div>
      </div>
    </div>

    <div class="cert-id">${escapeHtml(data.certificateNumber)}</div>
  </div>
</body>
</html>
  `
}

/**
 * Generate a subtle guilloche-style SVG pattern for the certificate background.
 * Creates overlapping sine-wave circles that mimic banknote security patterns.
 */
function generateGuillocheSVG(color: string): string {
  let paths = ''
  const cx = 528, cy = 408
  for (let i = 0; i < 36; i++) {
    const angle = (i * 10) * Math.PI / 180
    const r1 = 200 + Math.sin(angle * 3) * 60
    const r2 = 160 + Math.cos(angle * 5) * 40
    const x1 = cx + Math.cos(angle) * r1
    const y1 = cy + Math.sin(angle) * r1
    const x2 = cx + Math.cos(angle + 0.3) * r2
    const y2 = cy + Math.sin(angle + 0.3) * r2
    paths += `<ellipse cx="${cx}" cy="${cy}" rx="${r1}" ry="${r2}" transform="rotate(${i * 10} ${cx} ${cy})" fill="none" stroke="${color}" stroke-width="0.5" opacity="0.6"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1056 816">${paths}</svg>`
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
