# Annual Self-Evaluation — how it works and where to change it

The yearly appraisal (January–December) inside the Team App. Two forms, one page:

- **Employee form** — copies the company's *Annual Self-Evaluation Form* (the PDF the
  employee fills).
- **Manager form** — copies the company's *Annual Manager Evaluation Form*
  (`Annual_Manager_Evaluation_Form_Jan-Dec_2026.docx`).

Live at **https://team.coacheasily.com/self-evaluation** (left sidebar → *Self-Evaluation*).
The Probation page is a separate feature and was not changed by any of this.

---

## 1. The flow

| Step | Who | What happens |
|---|---|---|
| 0. Open the year | HR / admin / developer | *2026 cycle* panel → last date → **Open 2026**. Everyone active gets a notification. **Close** stops filling; **Open again** reopens. |
| 1. Self-evaluation | The employee | Fills About you, Part A (goals), Part B (12 values), Part C (reflection), Part D (potential). Can **upload** the filled form (PDF / Word / photo) and the boxes fill themselves (AI). Attaches evidence per goal. Types their name and **Submit self-evaluation**. Their direct manager is notified. |
| 2. Manager evaluation | **Only the direct manager** (`profiles.manager_id`) | Below the employee form: the manager form — About this review, Part A + summary, Part B + summary, Part C, Part D, Part E, Recommendation. Types their name and **Sign off**. |
| 3. Complete | — | Sign-off completes it. Final rating = Part C manager ratings A and B at 50% each, rounded to the nearest rating (O 5 · EE 4 · FME 3 · PME 2 · DNME 1). The employee is notified, sees the manager form and can add *Comments on this evaluation*. |

HR / admin can **Reopen self-evaluation** (also reopens the manager part) or **Reopen manager
evaluation** at any time, including after it is complete.

Someone with **no manager** (`manager_id` empty): HR / admin fill and sign off their manager form.

## 2. Who sees what

| Who | Sees | Writes |
|---|---|---|
| Member | Only their own form | Their own form and uploads, until they submit; their comment after completion |
| Manager | Own form + people who report to them **directly** (not the whole chain) | The manager form of their direct team, until sign-off |
| Manager above the manager | Not the forms of their manager's team | — |
| HR / admin | Everyone | Open/close the year, reopen steps, fill the employee form on someone's behalf (before submit). **No ratings.** |
| Developer (email allowlist) | Everyone | Open/close the year; fill/correct anyone's employee form until complete (also after submit); upload / delete files on anyone's form. **No ratings.** Every action goes to `dev_audit_log`. |

The manager form is shown to the employee **only after sign-off**. Internal notes (old feature)
are never shown and no longer appear on the page.

## 3. Files

| What | File |
|---|---|
| The page | `src/routes/_authenticated/self-evaluation.tsx` |
| Manager form (UI) | `src/components/selfeval/ManagerEvaluation.tsx` |
| Upload + autofill box | `src/components/selfeval/FormUpload.tsx` |
| Auto-saving text box | `src/components/selfeval/AutoSaveCell.tsx` (own copy; Probation's is untouched) |
| Data hooks (reads, writes, uploads) | `src/hooks/useSelfEvaluation.ts` |
| Rules, lists, ratings, autofill merge | `src/lib/selfEvaluation.ts` (+ `selfEvaluation.test.ts`) |
| **Employee form wording** (intro, examples, tip, sign-off text) | `src/lib/employeeFormText.ts` |
| **Manager form wording** (intro, examples, column help) | `src/lib/managerFormText.ts` |
| PDF of both forms | `src/lib/selfEvalPdf.ts` |
| AI reading of an uploaded form | `src/lib/selfEvaluation.functions.ts` |
| Reading a Word (.docx) file in the browser | `src/lib/docxText.ts` |
| Making uploads smaller (lossless for documents) | `src/lib/shrinkFile.ts` (+ test) |
| Developer powers (server, allowlist-checked) | `src/lib/selfEvaluationDev.functions.ts` |
| Sidebar tab | `src/components/AppShell.tsx` (one line in `BASE_TABS`) |

To **change form text**, edit only `employeeFormText.ts` / `managerFormText.ts` — the page and
the PDF both read from them. Goal/value/reflection/potential questions live in
`selfEvaluation.ts` (`VALUES`, `REFLECTION`, `POTENTIAL`, `MANAGER_FEEDBACK`, `RECOMMENDATIONS`).
If you add or rename a key there, the database whitelists (below) must allow it too.

## 4. Database

Migrations (in order; never edit an applied one — add a new migration instead):

| Migration | What |
|---|---|
| `20261117130000_self_evaluations.sql` | Tables, read policies, save / submit / reopen / file functions, bucket `self-evaluation` (private, 20MB) |
| `20261117150000_self_eval_developer.sql` | Service-role-only `self_eval_dev_*` functions for developers |
| `20261117170000_self_eval_direct_manager.sql` | `is_direct_manager_of()`; only the direct manager sees/rates |
| `20261117190000_self_eval_manager_form.sql` | Manager form: `self_eval_reviews.extra`, `self_evaluations.member_comment`, `self_eval_manager_save`, `self_eval_member_comment`, sign-off completes it, HR/admin no longer rate |

Tables:

| Table | Holds |
|---|---|
| `self_eval_cycles` | One row per org + year: opened / closed / last date |
| `self_evaluations` | One row per person + year: About you, `goals`, `value_answers`, `reflection`, `potential` (JSON), sign-off, step dates, `final_rating`, `member_comment` |
| `self_eval_reviews` | The manager form (`kind = 'manager'`): per-goal / per-value rating + remarks (`goal_ratings`, `value_ratings`) and everything else in `extra` (discussion date, summaries, Part C, Part D, Part E, recommendation, signature). Rows with `kind` `hr` / `sir` are from the old design and are not shown. |
| `self_eval_notes` | Old internal notes (not shown) |
| `self_eval_files` | Uploaded files; `removed_at` hides a file (never deleted); `encoding = 'gzip'` = stored compressed |
| `self_eval_log` | Every change (HR / admin / developer see it as *History*) |

Nothing can be deleted: there is no DELETE grant or policy on any table or on the files.

All writes go through functions that check who may write what:
`self_eval_save` (employee boxes), `self_eval_review_save` (per-goal/value manager rating and
remarks), `self_eval_manager_save` (all other manager boxes — the allowed paths are listed in
it), `self_eval_submit` (employee submit / manager sign-off), `self_eval_reopen`,
`self_eval_member_comment`, `self_eval_open_cycle` / `self_eval_close_cycle`,
`self_eval_file_add` / `self_eval_file_remove`.

Who-checks: `can_view_self_eval()`, `is_direct_manager_of()`, `self_eval_is_rater()`,
`can_write_self_eval_review()`.

Tests: `supabase/tests/self_evaluations.sql` (65 checks; run against a database with all
migrations applied — it rolls back). Code tests: `bun test src/lib`.

## 5. Uploads and autofill

- Limit 20MB. Photos are resized to at most 2560px and saved at high quality; PDF / Word /
  Excel are gzipped (lossless) only when that saves at least 5%. Files open as the original.
- Autofill reads PDFs and photos up to 4MB with the AI (Google Vertex on the server) and Word
  files as text. The person chooses *Fill the empty boxes* or *Replace with the upload*.
- The AI needs the server's credential file `/opt/gcp/gcp-wif.json` to be readable by the app
  container (uid 1000). It was root-only until 17 Nov 2026 and was fixed with
  `sudo chgrp 1000 /opt/gcp/gcp-wif.json && sudo chmod 640 /opt/gcp/gcp-wif.json`.
  If autofill says *"The AI helper could not be reached"*, read the server log line starting
  with `[ai]` — it gives the reason.

## 6. Deploying a change

Same as every team-app change (see `deploy/SKILL.md`): commit on `weekly-off-shift` → merge
into `coach-warriors-hub` `main` → `ce-deploy.sh team-check` → `team-migrate` (rehearsal on a
copy, then live) → `team-deploy`.

## 7. Known choices (ask before changing)

- Signature is the typed name ("signed in the Team App").
- The employee's per-goal / per-value self-ratings are copied into the manager form
  automatically; the summary and Part C self-ratings are entered by the manager, as on the form.
- Employee Part D offers Low, Low–Moderate, Moderate, Moderate–High, High (people wrote
  "Moderate–High" on paper); the manager's Part D is Low / Moderate / High, as on the form.
- The PDF shows the recommendation tick as **X** (the PDF font has no ✓).
