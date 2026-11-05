#!/usr/bin/env bash
# merge-gate.sh <owner/repo> <PR number>
# Prints NO: lines for anything that blocks a merge, CHECK: lines for things
# to read by hand, and one OK: line when nothing blocks. Exits 0 when it
# could read everything (OK or NO), 1 when a GitHub read failed (nothing
# is known then: treat it as NO), 2 on wrong arguments.
# Gate: the pull request is open, not a draft, targets the default branch
# and GitHub does not report it blocked or conflicting; Copilot and
# CodeRabbit have reviewed the head; no review thread is unresolved; every
# bot thread has a reply from us; every check passes or is skipped; the
# head did not change while the gate ran.
set -u
if [ $# -ne 2 ]; then
  echo "usage: $0 <owner/repo> <PR number>" >&2
  exit 2
fi
repo=$1 n=$2
owner=${repo%%/*} name=${repo##*/}
# Review authors as the REST API names them (exact match, bots only).
COPILOT='copilot-pull-request-reviewer[bot]'
CODERABBIT='coderabbitai[bot]'
fail=0
no() { echo "NO: $*"; fail=1; }
# A mandatory read that fails leaves nothing to judge: stop, never OK.
die() {
  echo "ERROR: $* (could not read it from GitHub; not mergeable as far as this gate knows)" >&2
  exit 1
}

me=$(gh api user --jq .login) || die "the signed-in user"
pr=$(gh pr view "$n" -R "$repo" --json headRefOid,baseRefName,state,isDraft,mergeable,mergeStateStatus) || die "pull request $n"
field() { printf '%s' "$pr" | jq -r "$1"; }
head=$(field .headRefOid)
short=${head:0:7}

[ "$(field .state)" = OPEN ] || no "the pull request is $(field .state)"
[ "$(field .isDraft)" = true ] && no "the pull request is a draft"

# A pull request stacked on another one's branch merges into that branch,
# not the default branch; once that one has merged, nothing reaches main
# (#267 went into fix/declaration-parsing-1-0 after #261 had merged).
base=$(field .baseRefName)
default=$(gh repo view "$repo" --json defaultBranchRef --jq .defaultBranchRef.name) || die "the default branch"
if [ "$base" != "$default" ]; then
  parent=$(gh pr list -R "$repo" --state all --head "$base" --json number,state --jq '.[0]|"#\(.number) \(.state)"' 2>/dev/null)
  no "targets $base, not $default${parent:+ (the branch of $parent)}; retarget with gh pr edit $n -R $repo --base $default"
fi

# GitHub computes these lazily: UNKNOWN right after a push is not a
# conflict. BLOCKED: branch protection (required reviews or checks).
if [ "$(field .state)" = OPEN ]; then
  [ "$(field .mergeable)" = CONFLICTING ] && no "conflicts with its base branch"
  case "$(field .mergeStateStatus)" in
    BLOCKED) no "GitHub reports the merge blocked (branch protection)" ;;
    # Behind its base: blocks only where required checks must be run on an
    # up-to-date branch (a ruleset's strict policy or classic protection's
    # strict); elsewhere it is information.
    BEHIND)
      strict=$(gh api "repos/$repo/rules/branches/$base" --paginate \
        --jq '.[]|select(.type=="required_status_checks")|.parameters.strict_required_status_checks_policy' 2>/dev/null)
      classic=$(gh api "repos/$repo/branches/$base/protection/required_status_checks" --jq .strict 2>/dev/null)
      if printf '%s\n%s\n' "$strict" "$classic" | grep -qx true; then
        no "behind $base, which requires an up-to-date branch; update it (gh pr update-branch $n -R $repo)"
      else
        echo "CHECK: behind $base (no up-to-date requirement there)"
      fi
      ;;
    UNKNOWN) echo "CHECK: GitHub has not computed the merge state yet; run again" ;;
  esac
fi

# Reviews on the head: every body of each bot's, not only its last one.
reviews=$(gh api "repos/$repo/pulls/$n/reviews" --paginate \
  --jq '.[]|[.user.login, .commit_id, (.body|test("previously missed|Outside diff range|Nitpick";"i")|tostring)]|@tsv') || die "the reviews"
for bot in "$COPILOT" "$CODERABBIT"; do
  on_head=$(printf '%s\n' "$reviews" | awk -F'\t' -v b="$bot" -v h="$head" '$1==b && $2==h')
  if [ -n "$on_head" ]; then
    printf '%s\n' "$on_head" | awk -F'\t' '$3=="true"' | grep -q . \
      && echo "CHECK: read ${bot}'s review bodies on $short (nitpicks / outside diff / previously missed)"
    continue
  fi
  if [ "$bot" = "$COPILOT" ]; then
    no "no Copilot review on $short"
    continue
  fi
  # No CodeRabbit review on the head: its check run says why. Success with
  # nothing to say passes (its summary covers it); a skip, a rate limit or
  # anything else blocks.
  # (each response read whole and checked before its first row is taken:
  # in a pipeline into head, a failed gh api goes unnoticed)
  # Only CodeRabbit's own app (slug coderabbitai) and account count: any
  # integration can name a check run or a status CodeRabbit.
  runs=$(gh api "repos/$repo/commits/$head/check-runs" --paginate \
    --jq '.check_runs[]|select(.name=="CodeRabbit" and .app.slug=="coderabbitai")|[.status, (.conclusion // ""), (.output.title // "")]|@tsv') \
    || die "CodeRabbit's check run"
  if [ -z "$runs" ]; then
    runs=$(gh api "repos/$repo/commits/$head/statuses" --paginate \
      --jq '.[]|select((.context|test("CodeRabbit")) and .creator.login=="coderabbitai[bot]")|["completed", .state, (.description // "")]|@tsv') \
      || die "CodeRabbit's commit status"
  fi
  IFS=$'\t' read -r status conclusion title <<<"${runs%%$'\n'*}"
  if [ "$status" = completed ] && [ "$conclusion" = success ] && ! printf '%s' "$title" | grep -qiE 'skip|limit'; then
    echo "CHECK: no CodeRabbit review on $short but its check is success (${title:-no title}); its summary covers it"
  else
    no "no CodeRabbit review on $short (check: ${status:-none} ${conclusion:-} ${title:-}); ask with a '@coderabbitai review' comment"
  fi
done

# Every review thread and every comment in it, all pages (a thread with
# more than 100 comments blocks: its replies cannot all be read here).
threads=$(gh api graphql --paginate -F owner="$owner" -F name="$name" -F n="$n" -f query='
  query($owner: String!, $name: String!, $n: Int!, $endCursor: String) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $n) {
        reviewThreads(first: 100, after: $endCursor) {
          pageInfo { hasNextPage endCursor }
          nodes { isResolved comments(first: 100) { pageInfo { hasNextPage } nodes { databaseId author { login } } } }
        }
      }
    }
  }' --jq '.data.repository.pullRequest.reviewThreads.nodes[]
    | [(.isResolved|tostring), (.comments.nodes[0].databaseId|tostring), (.comments.nodes[0].author.login // ""),
       ([.comments.nodes[].author.login // ""]|join(",")), (.comments.pageInfo.hasNextPage|tostring)] | @tsv') \
  || die "the review threads"
unres=$(printf '%s\n' "$threads" | awk -F'\t' '$1=="false"' | grep -c . || true)
[ "$unres" -gt 0 ] && no "$unres unresolved review threads"
long=$(printf '%s\n' "$threads" | awk -F'\t' '$5=="true" {printf "%s ", $2}')
[ -n "$long" ] && no "threads with more than 100 comments, read them by hand: $long"
# GraphQL names the bots without [bot]; a thread a bot opened needs a reply
# from us.
noreply=$(printf '%s\n' "$threads" | awk -F'\t' -v me="$me" \
  '($3=="copilot-pull-request-reviewer" || $3=="coderabbitai") && index(","$4",", ","me",")==0 {printf "%s ", $2}')
[ -n "$noreply" ] && no "bot review threads without a reply from us: $noreply"

# gh pr checks exits nonzero for failing or pending checks too, so judge
# by its output: none at all means the read failed.
checks=$(gh pr checks "$n" -R "$repo" --json name,bucket --jq '.[]|[.name, .bucket]|@tsv' 2>/dev/null)
[ -z "$checks" ] && die "the checks"
bad=$(printf '%s\n' "$checks" | awk -F'\t' '$2!="pass" && $2!="skipping" {print $1}')
[ -n "$bad" ] && no "$(printf '%s\n' "$bad" | grep -c .) checks not passing: $(printf '%s' "$bad" | tr '\n' ' ')"

# A push while the gate ran: what it read may be about two heads.
now=$(gh pr view "$n" -R "$repo" --json headRefOid --jq .headRefOid) || die "the head again"
[ "$now" != "$head" ] && no "the head moved from $short to ${now:0:7} while the gate ran; run it again"

[ $fail -eq 0 ] && echo "OK: $repo#$n $short may be merged (after reading any CHECK lines)"
exit 0
