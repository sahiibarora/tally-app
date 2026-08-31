# Tally — one deployable app

A personal finance tracker with real accounts (name + email + password),
multi-account tracking, custom categories, budgets, recurring entries,
search/filter, insights, alerts, a savings goal, dark mode, CSV/JSON export,
and a shareable snapshot — all backed by a real database, so your data
follows you to any device (phone included).

This is **one Django app**. It serves the React frontend (already built,
in `frontend_dist/` + `templates/index.html`) *and* the REST API from the
same server on the same URL — there's nothing separate to run or deploy.

## Folder layout
```
tally-app/
  manage.py, tally/, users/, finance/   # Django project + API
  templates/index.html                  # the built React app's HTML shell
  frontend_dist/assets/                 # the built React app's JS + CSS
  frontend_source/                      # the EDITABLE React source (Vite project)
```
You only need `frontend_source/` if you want to change the UI later. To
ship a UI change: edit files in `frontend_source/src`, then from inside
`frontend_source/` run `npm install && npm run build`, then copy
`dist/assets` → `../frontend_dist/assets` and `dist/index.html` →
`../templates/index.html`. Everything else (the whole Django app) stays as-is.

## Run it locally — one command, one server
```bash
python -m venv venv && source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```
Open **http://127.0.0.1:8000** — that's the whole app: sign up, log in, use it.

## Deploy it for real (so it works on your phone, from anywhere)
See `DEPLOY.md` for the exact free-hosting steps.

## Honest scope notes
- Auth is email + password + token — no password reset or email verification yet.
- No automated tests yet.
- Free hosting tiers spin a sleeping app back up in ~30-60 seconds on first
  visit after being idle — normal for free tiers, not a bug.
