# Deploying Tally for free (so it works on your phone, for anyone)

Recommended combo: **Render** (hosts the app, free) + **Supabase** (free
Postgres that doesn't expire — Render's own free database expires after 30
days, which would defeat the point of "remembers everyone's data").

## Step 1 — Get a database (Supabase)
1. In Supabase, create a new project (free tier).
2. Once it's ready, go to Project Settings → Database → Connection string
   → copy the **URI** (starts with `postgresql://...`). This is your
   `DATABASE_URL`.

## Step 2 — Push this folder to a GitHub repo
Render deploys from a Git repo. Create a new repo (public or private) and
push everything in this `tally-app/` folder to it — this whole folder is
the app.

## Step 3 — Create the web service on Render
1. New → Web Service → connect the repo you just pushed.
2. Build command: `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate`
3. Start command: `gunicorn tally.wsgi`
4. Add environment variables:
   - `SECRET_KEY` — any long random string
   - `DEBUG` — `False`
   - `ALLOWED_HOSTS` — `*.onrender.com` (or your custom domain later)
   - `DATABASE_URL` — the Supabase connection string from Step 1
   - `CORS_ALLOW_ALL` — `True` (safe here since the frontend and API are
     the same origin anyway — this only matters if you ever split them again)
5. Deploy. Render gives you a live HTTPS URL like `https://tally-xyz.onrender.com`.

Open that URL on your phone — sign up, and you're using the real thing.

## Notes
- Free web services sleep after 15 minutes idle; the first visit after
  that takes ~30-60 seconds to wake up. Totally normal for a free tier —
  not a bug, and fine for demoing to friends or in an interview.
- If you'd rather I do the actual provisioning for you instead of the
  dashboard, connect the Render option from the card I showed earlier in
  this chat — once it's connected I can create the web service and set
  the env vars directly instead of you clicking through the dashboard.
