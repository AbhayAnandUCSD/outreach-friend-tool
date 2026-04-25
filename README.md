# Outreach · Directory Resolver

Static web tool that resolves PhD-student email addresses by querying the
Google Workspace directory of a friend's school. Runs entirely in the
friend's browser. No backend, no data exfiltration.

## How it works

1. Friend visits the deployed URL.
2. Picks their school from a dropdown.
3. Signs in with their school Google account (Google Identity Services
   client-side OAuth, scope `directory.readonly`).
4. Page fetches the pre-baked CSV for that school (`public/data/<slug>.csv`).
5. For each row, calls the People API `searchDirectoryPeople` endpoint with
   the friend's access token. Scores returned candidates against the row's
   lab + role + photo and either auto-decides or queues for friend review.
6. Friend clicks through any review cards.
7. Friend downloads `decisions_<slug>_<YYYYMMDD>.json` and sends it back.

The main repo's `scripts/merge_friend_decisions.py` consumes that file and
applies updates to `outreach_fullrun_v3.db`, moving any replaced emails into
an `email_history` audit column.

## Deploy from main repo

The CSVs in `public/data/` and the index `public/schools.json` are generated
by the main Outreach repo:

```bash
# from main repo root
python3 scripts/generate_friend_csv.py \
  --db outreach_fullrun_v3.db \
  --all \
  --out-dir friend-tool/public/data/
```

Re-run this whenever you've added new researchers to the DB. Then commit
and push the friend-tool repo — the GitHub Action deploys to Pages.

## Local development

```bash
cp .env.example .env
# fill in VITE_GOOGLE_CLIENT_ID
npm install
npm run dev    # → http://127.0.0.1:5174
```

## Setting up the Google OAuth client (one-time)

1. Open the Google Cloud Console for the same project that hosts the
   main app's OAuth client.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   Type: **Web application**.
3. **Authorized JavaScript origins**:
   - `http://127.0.0.1:5174` (local dev)
   - `https://<your-username>.github.io` (production)
4. **Authorized redirect URIs**: leave empty — Google Identity Services uses
   the popup flow, no redirect needed.
5. Copy the resulting client ID into `.env` as `VITE_GOOGLE_CLIENT_ID` and
   into the GitHub repo secret of the same name (used by the deploy
   workflow).
6. **OAuth consent screen → Scopes**: ensure
   `https://www.googleapis.com/auth/directory.readonly` is added.
7. **Audience**: keep the project in **Testing** mode. Add each friend as a
   **Test user** (cap 100). This bypasses the verification process for the
   sensitive `directory.readonly` scope.
8. **Enable People API** under APIs & Services → Library.

## Scoring algorithm

For each (DB row, directory candidate):

| Signal | Score |
|---|---|
| Directory email matches DB email | +30 (instant lock) |
| Directory department keyword overlaps `lab_name` | +20 |
| Directory title matches `role` (PhD ≈ Graduate Student, etc.) | +15 |
| Last-name token shared between DB row and candidate | required floor |
| Directory dept clearly mismatched (Music dept vs AI lab) | −20 |

Routing:
- top score ≥ 30 → auto-pick
- top score ≥ 20 AND gap to runner-up ≥ 15 → auto-pick
- otherwise → friend review (top 3 ranked, with photo + dept + title)

When the DB already has an email and the directory disagrees, the decision
depends on the existing email's confidence: low/pattern_guess → auto-replace;
high → friend review (could be a same-name collision, an alias, or our scrape
caught the wrong person).

## Output format

Single JSON array of decisions, one per researcher processed:

```json
[
  {
    "researcher_id": 123,
    "decision": "auto_accept | auto_replace | verified | friend_picked | operator_review | no_hit | skip",
    "email": "x@school.edu",
    "source": "workspace_directory_school.edu",
    "score": 30,
    "confidence": "high",
    "old_email": "y@school.edu",
    "old_source": "search_scrape",
    "old_confidence": "high",
    "candidates": [...]
  }
]
```

`old_email` only appears on replaces. `candidates` only appears on
`operator_review` rows so the operator can decide later.
