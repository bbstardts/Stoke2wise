/**
 * notify-config.js
 * ─────────────────────────────────────────────
 * Purpose: Sends YOU (the admin) an email whenever someone signs up,
 *          so you can approve them before they get access.
 *
 * This uses EmailJS — a free service that lets a plain website send
 * real emails without needing a backend server. You get 200 free
 * emails/month, which is plenty for signup notifications.
 *
 * ───────────── HOW TO SET THIS UP (one-time, ~5 minutes) ─────────────
 * 1. Go to https://www.emailjs.com and sign up (free).
 * 2. Add an "Email Service" → connect it to a Gmail account
 *    (you can use bbstarbobola@gmail.com). This gives you a SERVICE ID.
 * 3. Create an "Email Template". Use these variable names in the
 *    template body so they get filled in automatically:
 *      {{user_name}}   — the new user's name
 *      {{user_email}}  — the new user's email
 *      {{signup_time}} — when they signed up
 *    This gives you a TEMPLATE ID — that's "templateId" below (for YOU).
 * 4. Create a SECOND template, this one goes to the USER once you approve
 *    them, letting them know they can now log in. Use:
 *      {{user_name}}   — the user's name
 *      {{to_email}}    — the user's email (set "To Email" field to {{to_email}})
 *    Suggested content:
 *      "Hi {{user_name}}, your StockWise account has been approved!
 *       You can now sign in: [your login page link]"
 *    This gives you a second TEMPLATE ID — that's "approvedTemplateId" below.
 * 5. Go to "Account" → "General" and copy your PUBLIC KEY.
 * 6. Paste all values below.
 *
 * Until you fill these in, signup and approval will still work — you just
 * won't get email alerts. You can always check the "Team Members" table
 * in Settings to see who is pending approval.
 */

window.NOTIFY_CONFIG = {
  enabled:          true,
  serviceId:        'service_tk6m5jf',
  templateId:        'template_ol2g4tm',   // sent to YOU when someone signs up
  approvedTemplateId: 'YOUR_APPROVED_TEMPLATE_ID', // sent to the USER when you approve them
  publicKey:         'sUdG-0gzB0ec2xxIVXMDY',
  adminEmail:        'bbstarbobola@gmail.com',
};
