# Deploying Tally (Render + Supabase, free tiers)

## Environment variables (Render -> your service -> Environment)

| Key | Value | Notes |
|---|---|---|
| `SECRET_KEY` | long random string | already set; never share it |
| `DEBUG` | `False` | turns on HTTPS-only cookies and security headers |
| `ALLOWED_HOSTS` | `tally-app-knot.onrender.com` | exact host, no `*`, no `https://` |
| `DATABASE_URL` | Supabase **Transaction pooler** URI (port 6543) | already set |
| `CORS_ALLOW_ALL` | `False` | the app and API share one address, so cross-site access isn't needed |
| `VAPID_PUBLIC_KEY` | from `python manage.py generate_vapid_keys` | lets phones subscribe to notifications |
| `VAPID_PRIVATE_KEY` | from the same command | **secret**: signs notifications; never commit it |
| `VAPID_CLAIM_EMAIL` | `mailto:you@example.com` | a contact address for push services |
| `EMAIL_RELAY_URL` | the "Web app URL" of your Apps Script (ends in `/exec`) | sends reset emails; see below |
| `EMAIL_RELAY_SECRET` | the secret you put in the script | must match the script exactly |

Until the two `EMAIL_RELAY_*` values are set, password-reset emails are only printed to the server log (nothing reaches an inbox), and the app says so on the Forgot password screen.
Until the `VAPID_*` values are set, notifications are silently skipped (everything else works).

## Password reset emails (important: Render's free plan blocks normal email)
Render's free web services cannot use the usual email ports (25, 465, 587), so
Gmail SMTP does not work there, even with a correct App Password. The free
route that does work sends over HTTPS through a tiny Google Apps Script that
you own; the email is sent by your own Gmail.

1. Open script.google.com and create a **New project**.
2. Delete the sample code and paste in `docs/mail-relay.gs`.
3. Replace `PASTE_YOUR_SECRET_HERE` with a long random value (the same value goes into Render as `EMAIL_RELAY_SECRET`).
4. Click **Deploy**, then **New deployment**, choose type **Web app**.
   Set **Execute as: Me** and **Who has access: Anyone**, then **Deploy**.
5. Approve the permission prompt (Google warns the app is unverified because it is your own script; choose Advanced, then continue).
6. Copy the **Web app URL** into Render as `EMAIL_RELAY_URL`.

Limits: a normal Gmail account can send roughly 100 emails a day this way, which is plenty for password resets.

## Build / start commands (unchanged)
- Build: `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate`
- Start: `gunicorn tally.wsgi`

The build now includes one new migration (push subscriptions + a date index). It only adds things; existing data is untouched.

## Notifications on a phone
- **iPhone/iPad:** needs iOS 16.4 or newer, and Tally must be added to the Home Screen. Open it **from the Home Screen icon**, then tap **Enable** under *Security & notifications*. Notifications do not work from a normal Safari tab.
- **Android:** works in Chrome, installed or not. Tap **Enable** and allow the permission.

## Running the tests
`python manage.py test`
