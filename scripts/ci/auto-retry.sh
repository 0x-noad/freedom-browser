#!/usr/bin/env bash
#
# Re-run the failed jobs of one CI/Release run — once, and only once.
#
# GitHub Actions has no native "retry a failed job", so a transient failure
# (a flaky Electron launch, a runner losing its network, a job hanging until
# `timeout-minutes` kills it) needs a human to open the run and press "Re-run
# failed jobs". This script is that press, driven by
# `.github/workflows/auto-retry.yml` on the `workflow_run` event.
#
# The rules, and why:
#
#   - Only `failure`, `cancelled` and `timed_out` runs. A job that hits
#     `timeout-minutes` reports as *cancelled* today (verified on run
#     35130040315), and a hang is exactly the case worth retrying; `timed_out`
#     is accepted alongside it because it is the conclusion the REST API
#     documents for that state and nothing but the accept-list decides whether
#     a hang is absorbed.
#   - Only `run_attempt == 1`. A run that fails twice is a real signal; a
#     retry loop would hide it and burn runner minutes.
#   - Not when a newer run for the same workflow, branch and event already
#     exists. `ci.yml` sets `cancel-in-progress` for every ref but `main`, so
#     the most common way to see a *cancelled* run here is a second push
#     superseding the first — resurrecting that run would re-test an
#     already-obsolete commit.
#   - `main` is retried like any other branch: `main` went red from a hang on
#     2026-09-16, which is precisely what this exists to absorb.
#   - One log line either way, naming the run URL and the jobs re-run. No PR
#     comments, no issues: the signal belongs on the run, not in someone's
#     notifications.
#   - Before re-running, one more line per job saying *why* it failed: the step
#     that failed (or "never started" when a job has no steps — a runner that
#     was never acquired, #535) and the job's failure annotation. Attempt 2
#     replaces attempt 1's log, but check-run annotations and this run's own
#     log and step summary survive, so this is the one durable record of what
#     flaked. `scripts/ci/flake-report.js` reads it back out across runs.
#
# Known limitation: a run a human cancelled on purpose looks identical to a
# timed-out one in the event payload, so it will be re-run once. Cancelling the
# second attempt sticks, since attempt 2 is never retried.
#
# Env (all supplied by the workflow):
#   GH_TOKEN      token with `actions: write`
#   GH_REPO       owner/name
#   RUN_ID, RUN_URL, RUN_ATTEMPT, CONCLUSION, WORKFLOW_ID, WORKFLOW_NAME,
#   HEAD_BRANCH, EVENT_NAME

set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN must be set}"
REPO="${GH_REPO:?GH_REPO must be set (owner/name)}"
RUN_ID="${RUN_ID:?RUN_ID must be set}"
RUN_URL="${RUN_URL:?RUN_URL must be set}"
RUN_ATTEMPT="${RUN_ATTEMPT:?RUN_ATTEMPT must be set}"
CONCLUSION="${CONCLUSION:?CONCLUSION must be set}"
WORKFLOW_ID="${WORKFLOW_ID:?WORKFLOW_ID must be set}"
WORKFLOW_NAME="${WORKFLOW_NAME:-workflow}"
HEAD_BRANCH="${HEAD_BRANCH:?HEAD_BRANCH must be set}"
EVENT_NAME="${EVENT_NAME:?EVENT_NAME must be set}"

log() { printf 'auto-retry: %s\n' "$*"; }

case "$CONCLUSION" in
  failure | cancelled | timed_out) ;;
  *)
    log "$WORKFLOW_NAME run $RUN_ID concluded '$CONCLUSION' — nothing to re-run. $RUN_URL"
    exit 0
    ;;
esac

if [ "$RUN_ATTEMPT" != "1" ]; then
  log "$WORKFLOW_NAME run $RUN_ID is attempt $RUN_ATTEMPT — a second failure is a real signal, leaving it red. $RUN_URL"
  exit 0
fi

# A newer run for the same workflow/branch/event means this one was superseded
# (the concurrency group cancels the older run), not that it broke.
latest_run_id="$(
  gh api --method GET "repos/$REPO/actions/workflows/$WORKFLOW_ID/runs" \
    -f branch="$HEAD_BRANCH" -f event="$EVENT_NAME" -f per_page=1 \
    --jq '.workflow_runs[0].id // empty'
)"
if [ -n "$latest_run_id" ] && [ "$latest_run_id" != "$RUN_ID" ]; then
  log "$WORKFLOW_NAME run $RUN_ID was superseded by run $latest_run_id on $HEAD_BRANCH — not re-running an obsolete commit. $RUN_URL"
  exit 0
fi

# One TSV row per failed job: id, name, conclusion, first failed step (or
# "never started" for a job with no steps at all).
failed_rows="$(
  gh api --paginate "repos/$REPO/actions/runs/$RUN_ID/attempts/1/jobs?per_page=100" \
    --jq '.jobs[] | select(.conclusion == "failure" or .conclusion == "cancelled" or .conclusion == "timed_out")
      | [.id, .name, .conclusion,
         (if (.steps | length) == 0 then "never started"
          else ([.steps[] | select(.conclusion == "failure" or .conclusion == "cancelled" or .conclusion == "timed_out") | .name][0] // "unknown step") end)]
      | @tsv'
)"
failed_jobs="$(printf '%s\n' "$failed_rows" | cut -f2 | sed '/^$/d')"
if [ -z "$failed_jobs" ]; then
  log "$WORKFLOW_NAME run $RUN_ID has no failed, cancelled or timed-out jobs on attempt 1 — nothing to re-run. $RUN_URL"
  exit 0
fi

job_count="$(printf '%s\n' "$failed_jobs" | wc -l | tr -d ' ')"
job_list="$(printf '%s\n' "$failed_jobs" | paste -sd '|' -)"
log "re-running $job_count job(s) from $WORKFLOW_NAME run $RUN_ID ($CONCLUSION on attempt 1, branch $HEAD_BRANCH, event $EVENT_NAME): $job_list"

# Why each job failed. Best effort: a lookup that fails must never stop the
# re-run below, so every call here is guarded. The annotation preferred is the
# failing test's title from Playwright's `github` reporter, then any runner
# message other than the generic "Process completed with exit code N".
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    printf '### Re-ran %s job(s) of [%s run %s](%s)\n\n' "$job_count" "$WORKFLOW_NAME" "$RUN_ID" "$RUN_URL"
    printf 'Branch `%s`, event `%s`, attempt 1 concluded `%s`.\n\n' "$HEAD_BRANCH" "$EVENT_NAME" "$CONCLUSION"
    printf '| Job | Conclusion | Failed step | Annotation |\n|---|---|---|---|\n'
  } >>"$GITHUB_STEP_SUMMARY" || true
fi
while IFS=$'\t' read -r job_id job_name job_conclusion job_step; do
  [ -n "$job_id" ] || continue
  reason="$(
    gh api "repos/$REPO/check-runs/$job_id/annotations" \
      --jq '[.[] | select(.annotation_level == "failure")] as $f
        | ([$f[] | select((.title // "") | contains("›")) | .title] | unique) as $tests
        | if ($tests | length) > 0 then ($tests | join(" ; "))
          else ([$f[] | select(.message | startswith("Process completed with exit code") | not) | .message]
                + [$f[] | .message])[0] // "" end
        | gsub("[\\r\\n|]+"; " ")' 2>/dev/null || true
  )"
  reason="${reason:0:300}"
  log "failed job: $job_name — $job_conclusion at step '$job_step'${reason:+ — $reason}"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf '| %s | %s | %s | %s |\n' "$job_name" "$job_conclusion" "$job_step" "${reason:-—}" >>"$GITHUB_STEP_SUMMARY" || true
  fi
done <<<"$failed_rows"

gh run rerun "$RUN_ID" --failed
log "attempt 2 queued for $WORKFLOW_NAME run $RUN_ID — $RUN_URL"
