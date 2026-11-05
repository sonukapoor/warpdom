#!/usr/bin/env bash
# merge-gate.sh <owner/repo> <PR number>
# Prints NO: lines for anything that blocks a merge, CHECK: lines for things
# to read by hand, and one OK: line when nothing blocks.
# Gate: the pull request targets the default branch, Copilot and CodeRabbit
# have reviewed the head, no unresolved review threads, every bot thread
# has a reply from us, all checks pass.
set -u
if [ $# -ne 2 ]; then
  echo "usage: $0 <owner/repo> <PR number>" >&2
  exit 2
fi
repo=$1 n=$2
owner=${repo%%/*} name=${repo##*/}
me=$(gh api user --jq .login)
head=$(gh pr view "$n" -R "$repo" --json headRefOid --jq .headRefOid)
short=${head:0:7}
fail=0
no() { echo "NO: $*"; fail=1; }

# A pull request stacked on another one's branch merges into that branch,
# not the default branch; once that one has merged, nothing reaches main
# (#267 went into fix/declaration-parsing-1-0 after #261 had merged). Retarget
# it first: gh pr edit N --base <default branch>.
base=$(gh pr view "$n" -R "$repo" --json baseRefName --jq .baseRefName)
default=$(gh repo view "$repo" --json defaultBranchRef --jq .defaultBranchRef.name)
if [ "$base" != "$default" ]; then
  parent=$(gh pr list -R "$repo" --state all --head "$base" --json number,state --jq '.[0]|"#\(.number) \(.state)"' 2>/dev/null)
  no "targets $base, not $default${parent:+ (the branch of $parent)}; retarget with gh pr edit $n -R $repo --base $default"
fi

# A conflict with the base blocks too (GitHub computes it lazily: UNKNOWN
# right after a push is not a conflict).
mergeable=$(gh pr view "$n" -R "$repo" --json mergeable --jq .mergeable)
[ "$mergeable" = CONFLICTING ] && no "conflicts with its base branch"

reviews=$(gh api "repos/$repo/pulls/$n/reviews" --paginate --jq '.[]|"\(.user.login)\t\(.commit_id)\t\(.body|length)\t\(.body|test("previously missed|Outside diff range|Nitpick";"i"))"')
for bot in copilot-pull-request-reviewer coderabbitai; do
  line=$(printf '%s\n' "$reviews" | awk -F'\t' -v b="$bot" -v h="$head" 'index($1,b)==1 && $2==h' | tail -1)
  if [ -z "$line" ]; then
    if [ "$bot" = coderabbitai ]; then
      st=$(gh api "repos/$repo/commits/$head/status" --jq '.statuses[]|select(.context|test("CodeRabbit"))|.state' 2>/dev/null | head -1)
      # CodeRabbit may report as a check run instead of a commit status.
      [ -z "$st" ] && st=$(gh pr checks "$n" -R "$repo" --json name,bucket --jq '.[]|select(.name=="CodeRabbit")|if .bucket=="pass" then "success" else .bucket end' 2>/dev/null | head -1)
      if [ "$st" = success ]; then echo "CHECK: no CodeRabbit review on $short but its status is success (summary covers it)"
      else no "CodeRabbit status on $short is ${st:-none}"; fi
    else
      no "no Copilot review on $short"
    fi
  else
    flag=$(printf '%s' "$line" | cut -f4)
    [ "$flag" = true ] && echo "CHECK: read ${bot}'s review body on $short (nitpicks / outside diff / previously missed)"
  fi
done

threads=$(gh api graphql -f query="query{repository(owner:\"$owner\",name:\"$name\"){pullRequest(number:$n){reviewThreads(first:100){nodes{isResolved comments(first:50){nodes{databaseId author{login}}}}}}}}" \
  --jq '.data.repository.pullRequest.reviewThreads.nodes[]|"\(.isResolved)\t\(.comments.nodes[0].databaseId)\t\(.comments.nodes[0].author.login)\t\([.comments.nodes[].author.login]|join(","))"')
unres=$(printf '%s\n' "$threads" | awk -F'\t' '$1=="false"' | grep -c . || true)
[ "$unres" -gt 0 ] && no "$unres unresolved review threads"
noreply=$(printf '%s\n' "$threads" | awk -F'\t' -v me="$me" '$3!="" && $3!=me && index(","$4",", ","me",")==0 {printf "%s ", $2}')
[ -n "$noreply" ] && no "review threads without a reply from us: $noreply"

bad=$(gh pr checks "$n" -R "$repo" --json name,bucket --jq '.[]|select(.bucket!="pass" and .bucket!="skipping")|.name' 2>/dev/null)
[ -n "$bad" ] && no "$(printf '%s\n' "$bad" | grep -c .) checks not passing: $(printf '%s' "$bad" | tr '\n' ' ')"

[ $fail -eq 0 ] && echo "OK: $repo#$n $short may be merged (after reading any CHECK lines)"
exit 0
