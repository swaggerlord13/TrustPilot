const { Resend } = require("resend");

// Created on first use, so the server (and tests) can start without the key;
// a missing key then shows up as a clear error when an email is sent
let resend = null;

/**
 * Send one email through Resend. Throws if it was not accepted, so callers'
 * catch blocks really run (Resend reports failures in its return value
 * instead of throwing, which used to make every failure silent).
 */
const sendEmail = async (options) => {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set");
  }
  // One client for the whole process
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    from: "Trustpilotafrica <noreply@trustpilotafrica.com>",
    to: options.email,
    subject: options.subject,
    html: options.html,
  });

  // Rejected (bad key, unverified domain, invalid address...): surface it
  if (error) {
    throw new Error(`Email not sent: ${error.name || "error"}: ${error.message || "unknown reason"}`);
  }
  return data;
};

module.exports = sendEmail;
