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
| `EMAIL_HOST` | `smtp.gmail.com` | for password-reset emails |
| `EMAIL_PORT` | `587` | |
| `EMAIL_HOST_USER` | your Gmail address | |
| `EMAIL_HOST_PASSWORD` | a Gmail **App Password** (16 characters, no spaces) | NOT your normal Gmail password |

Until the `EMAIL_*` values are set, password-reset emails are only printed to the server log (nothing reaches an inbox).
Until the `VAPID_*` values are set, notifications are silently skipped (everything else works).

## Getting a Gmail App Password
1. Your Google Account needs **2-Step Verification** switched on.
2. In your Google Account, search for **App passwords** and create one called `Tally`.
3. Copy the 16 characters Google shows (remove the spaces) into `EMAIL_HOST_PASSWORD`.

## Build / start commands (unchanged)
- Build: `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate`
- Start: `gunicorn tally.wsgi`

The build now includes one new migration (push subscriptions + a date index). It only adds things; existing data is untouched.

## Notifications on a phone
- **iPhone/iPad:** needs iOS 16.4 or newer, and Tally must be added to the Home Screen. Open it **from the Home Screen icon**, then tap **Enable** under *Security & notifications*. Notifications do not work from a normal Safari tab.
- **Android:** works in Chrome, installed or not. Tap **Enable** and allow the permission.

## Running the tests
`python manage.py test`
