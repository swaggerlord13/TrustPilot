/**
 * Professional HTML email templates for TrustPilot Africa
 *
 * All emails share the same branded wrapper:
 *   - Company logo at the top
 *   - Clean white card on a light grey background
 *   - Consistent button styling
 *   - Footer with company info
 */

const BRAND = {
  name: "TrustPilot Africa",
  url: "https://trustpilotafrica.com",
  logo: "https://trustpilotafrica.com/trustpilotafricalogo.png",
  primaryColor: "#0052CC",
  buttonColor: "#0052CC",
  textColor: "#1f2937",
  mutedColor: "#6b7280",
  lightBg: "#f3f4f6",
  year: new Date().getFullYear(),
};

/**
 * Wraps any email body content in the branded layout
 */
function wrapInLayout(bodyContent) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${BRAND.name}</title>
</head>
<body style="margin:0; padding:0; background-color:${BRAND.lightBg}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.lightBg}; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">

          <!-- Logo header -->
          <tr>
            <td align="center" style="padding: 32px 32px 16px 32px;">
              <a href="${BRAND.url}" style="text-decoration:none;">
                <img src="${BRAND.logo}" alt="${BRAND.name}" width="56" height="56" style="display:block; border-radius:12px;" />
              </a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 0 32px 24px 32px;">
              <span style="font-size:18px; font-weight:700; color:${BRAND.primaryColor}; letter-spacing:-0.3px;">${BRAND.name}</span>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 32px;">
              <div style="border-top:1px solid #e5e7eb;"></div>
            </td>
          </tr>

          <!-- Body content -->
          <tr>
            <td style="padding: 28px 32px 32px 32px;">
              ${bodyContent}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 0 32px;">
              <div style="border-top:1px solid #e5e7eb;"></div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 20px 32px 28px 32px;">
              <p style="margin:0 0 6px 0; font-size:12px; color:${BRAND.mutedColor};">
                &copy; ${BRAND.year} ${BRAND.name}. All rights reserved.
              </p>
              <p style="margin:0; font-size:12px; color:${BRAND.mutedColor};">
                <a href="${BRAND.url}" style="color:${BRAND.primaryColor}; text-decoration:none;">trustpilotafrica.com</a>
              </p>
            </td>
          </tr>
        </table>

        <!-- Sub-footer -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <tr>
            <td align="center" style="padding:16px 32px 0 32px;">
              <p style="margin:0; font-size:11px; color:#9ca3af; line-height:1.5;">
                This email was sent by ${BRAND.name}. If you didn't request this, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Brand colored button
 */
function button(text, href) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px auto;">
      <tr>
        <td align="center" style="border-radius:8px; background-color:${BRAND.buttonColor};">
          <a href="${href}" target="_blank" style="display:inline-block; padding:14px 36px; color:#ffffff; font-size:15px; font-weight:600; text-decoration:none; border-radius:8px; letter-spacing:0.2px;">
            ${text}
          </a>
        </td>
      </tr>
    </table>`;
}

// ─── Individual email templates ───────────────────────────────

/**
 * Password reset email
 */
function passwordReset({ userName, resetUrl }) {
  const body = `
    <h2 style="margin:0 0 8px 0; font-size:22px; font-weight:700; color:${BRAND.textColor}; text-align:center;">
      Password Reset
    </h2>
    <p style="margin:0 0 20px 0; font-size:14px; color:${BRAND.mutedColor}; text-align:center;">
      We received a request to reset your password
    </p>

    <p style="margin:0 0 6px 0; font-size:15px; color:${BRAND.textColor}; line-height:1.6;">
      Hi ${userName},
    </p>
    <p style="margin:0 0 4px 0; font-size:15px; color:${BRAND.textColor}; line-height:1.6;">
      Someone requested a password reset for your TrustPilot Africa account. Click the button below to choose a new password.
    </p>

    ${button("Reset My Password", resetUrl)}

    <p style="margin:0 0 6px 0; font-size:13px; color:${BRAND.mutedColor}; line-height:1.5;">
      This link will expire in <strong>30 minutes</strong>. If you didn't request this, no action is needed — your password will stay the same.
    </p>

    <p style="margin:16px 0 0 0; font-size:12px; color:#9ca3af; line-height:1.5; word-break:break-all;">
      If the button doesn't work, copy and paste this link into your browser:<br/>
      <a href="${resetUrl}" style="color:${BRAND.primaryColor}; text-decoration:underline;">${resetUrl}</a>
    </p>`;

  return wrapInLayout(body);
}

/**
 * Email verification for new signups
 */
function emailVerification({ userName, verifyUrl }) {
  const body = `
    <h2 style="margin:0 0 8px 0; font-size:22px; font-weight:700; color:${BRAND.textColor}; text-align:center;">
      Verify Your Email
    </h2>
    <p style="margin:0 0 20px 0; font-size:14px; color:${BRAND.mutedColor}; text-align:center;">
      One last step to activate your account
    </p>

    <p style="margin:0 0 6px 0; font-size:15px; color:${BRAND.textColor}; line-height:1.6;">
      Hi ${userName},
    </p>
    <p style="margin:0 0 4px 0; font-size:15px; color:${BRAND.textColor}; line-height:1.6;">
      Welcome to TrustPilot Africa! To start leaving reviews and exploring trusted companies across Africa, please verify your email address.
    </p>

    ${button("Verify My Email", verifyUrl)}

    <p style="margin:0 0 6px 0; font-size:13px; color:${BRAND.mutedColor}; line-height:1.5;">
      This link will expire in <strong>24 hours</strong>. After that, you can request a new verification email from the login page.
    </p>

    <p style="margin:16px 0 0 0; font-size:12px; color:#9ca3af; line-height:1.5; word-break:break-all;">
      If the button doesn't work, copy and paste this link into your browser:<br/>
      <a href="${verifyUrl}" style="color:${BRAND.primaryColor}; text-decoration:underline;">${verifyUrl}</a>
    </p>`;

  return wrapInLayout(body);
}

/**
 * Welcome email (sent after successful verification)
 */
function welcomeEmail({ userName }) {
  const body = `
    <h2 style="margin:0 0 8px 0; font-size:22px; font-weight:700; color:${BRAND.textColor}; text-align:center;">
      Welcome to TrustPilot Africa!
    </h2>
    <p style="margin:0 0 20px 0; font-size:14px; color:${BRAND.mutedColor}; text-align:center;">
      Your email has been verified
    </p>

    <p style="margin:0 0 6px 0; font-size:15px; color:${BRAND.textColor}; line-height:1.6;">
      Hi ${userName},
    </p>
    <p style="margin:0 0 16px 0; font-size:15px; color:${BRAND.textColor}; line-height:1.6;">
      Your account is now fully active. Here's what you can do:
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;">
      <tr>
        <td style="padding:10px 0; font-size:14px; color:${BRAND.textColor}; line-height:1.5;">
          &#x2705;&nbsp;&nbsp;Browse and review companies across Africa
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0; font-size:14px; color:${BRAND.textColor}; line-height:1.5;">
          &#x2705;&nbsp;&nbsp;Help others make informed decisions
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0; font-size:14px; color:${BRAND.textColor}; line-height:1.5;">
          &#x2705;&nbsp;&nbsp;Build your reviewer reputation
        </td>
      </tr>
    </table>

    ${button("Start Exploring", BRAND.url)}`;

  return wrapInLayout(body);
}

module.exports = {
  passwordReset,
  emailVerification,
  welcomeEmail,
};
