// Tally mail relay: a tiny Google Apps Script web app.
//
// Why it exists: Render's free plan blocks the normal email ports (25, 465,
// 587), so the Tally server cannot talk to Gmail directly. Instead it sends
// the password-reset email to this script over ordinary HTTPS, and the script
// sends it from YOUR Gmail account.
//
// Setup: see DEPLOY.md ("Password reset emails"). Replace the secret below
// with your own long random value and put the same value in Render as
// EMAIL_RELAY_SECRET. Never commit your real secret.

const SECRET = "PASTE_YOUR_SECRET_HERE";
const ALLOWED_SUBJECT = "Reset your Tally password";

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.secret !== SECRET) return reply("forbidden");
    // The relay only ever sends the one kind of message Tally needs, so even
    // a leaked secret cannot be used to send arbitrary mail from your account.
    if (data.subject !== ALLOWED_SUBJECT) return reply("forbidden");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(data.to))) return reply("forbidden");
    MailApp.sendEmail({ to: data.to, subject: data.subject, body: String(data.body), name: "Tally" });
    return reply("ok");
  } catch (err) {
    return reply("error");
  }
}

function reply(text) {
  return ContentService.createTextOutput(text);
}
