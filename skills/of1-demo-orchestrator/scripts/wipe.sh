#!/usr/bin/env bash
# Phase 0a full wipe for a repo previously built by the of1-demo-orchestrator.
# Destructive: removes Stage 1/2 output, OF1-owned git paths, and DA /of1/** + /templates/**.
# Run as ONE invocation with OF1_DEMO_WIPE=1 set on the same command line, e.g.
#   OF1_DEMO_WIPE=1 OF1_STATE_DIR="$OF1_STATE_DIR" bash scripts/wipe.sh
# Never export OF1_DEMO_WIPE from inside this file. All guards fail closed.

# Token goes via stdin config (curl -K -), never on the command line.
da_curl() {
  local x=$-
  set +x
  case "$DA_TOKEN" in
    ''|*[\"\\[:cntrl:]]*) echo "✗ refusing DA token with quote, backslash or control characters" >&2; return 1 ;;
  esac
  local rc=0
  printf '%s\n' "header = \"Authorization: Bearer $DA_TOKEN\"" | curl -K - "$@" || rc=$?
  case "$x" in *x*) set -x ;; esac
  return $rc
}

da_delete_tree() {
  local dir="$1"   # repo-relative, e.g. "/of1/config"
  case "$dir" in
    /of1|/of1/*|/templates|/templates/*) ;;
    *) echo "✗ refusing to delete outside /of1, /templates: $dir" >&2; return 1 ;;
  esac
  case "$dir" in
    *//*|*/../*|*/..|*/./*|*/.)
      echo "✗ refusing to delete path with empty or dot segments: $dir" >&2; return 1 ;;
  esac
  local list
  list=$(da_curl -s --connect-timeout 10 --max-time 30 \
    "https://admin.da.live/list/${OWNER}/${REPO}${dir}" 2>/dev/null || echo "[]")
  echo "$list" | jq -r '.[]? | [.name, (.ext // "")] | @tsv' 2>/dev/null |
  while IFS=$'\t' read -r name ext; do
    case "$name" in
      ''|.|..|*/*|*[[:cntrl:]]*)
        echo "✗ skipping unsafe DA listing name under $dir: '$name'" >&2; continue ;;
    esac
    if [ -z "$ext" ]; then
      da_delete_tree "${dir}/${name}"            # folder -> recurse
    else
      da_curl -s -o /dev/null --connect-timeout 10 --max-time 30 -X DELETE \
        "https://admin.da.live/source/${OWNER}/${REPO}${dir}/${name}.${ext}"
    fi
  done
  # Remove the (now empty) folder itself; best-effort.
  da_curl -s -o /dev/null --connect-timeout 10 --max-time 30 -X DELETE \
    "https://admin.da.live/source/${OWNER}/${REPO}${dir}" || true
}

wipe_main() {
  [ "$OF1_DEMO_WIPE" = "1" ] || { echo "refusing full wipe outside the demo pipeline (OF1_DEMO_WIPE=1 not set)" >&2; return 1; }

  # Fail closed: only wipe a repo this orchestrator previously built.
  [ -n "$OF1_STATE_DIR" ] || { echo "refusing full wipe: OF1_STATE_DIR is not set" >&2; return 1; }
  [ -d "$OF1_STATE_DIR" ] || { echo "refusing full wipe: state dir $OF1_STATE_DIR not found" >&2; return 1; }
  [ -f "$OF1_STATE_DIR/setup.json" ] || { echo "refusing full wipe: $OF1_STATE_DIR/setup.json not found (no prior orchestrator run)" >&2; return 1; }
  [ -f "$OF1_STATE_DIR/repo-config.json" ] || { echo "refusing full wipe: $OF1_STATE_DIR/repo-config.json not found (no prior orchestrator run)" >&2; return 1; }

  # Never let a git op block on an interactive credential prompt.
  export GIT_TERMINAL_PROMPT=0
  export GIT_ASKPASS=true GIT_HTTP_LOW_SPEED_LIMIT=1000 GIT_HTTP_LOW_SPEED_TIME=20

  SETUP=$(cat "$OF1_STATE_DIR/setup.json")
  OWNER=$(echo "$SETUP" | jq -r .owner)
  REPO=$(echo "$SETUP" | jq -r .repo)
  BRANCH=$(echo "$SETUP" | jq -r .branch)
  REPO_DIR=$(echo "$SETUP" | jq -r .of1Repo)

  [ -n "$REPO_DIR" ] && [ "$REPO_DIR" != "null" ] && [ -d "$REPO_DIR/.git" ] \
    || { echo "refusing full wipe: setup.json of1Repo '$REPO_DIR' is not a git checkout (no .git directory)" >&2; return 1; }
  CFG_REPO_DIR=$(jq -r '.repoDir // empty' "$OF1_STATE_DIR/repo-config.json")
  REAL_REPO_DIR=$(cd "$REPO_DIR" && pwd -P) || { echo "refusing full wipe: cannot resolve $REPO_DIR" >&2; return 1; }
  REAL_CFG_DIR=$( [ -n "$CFG_REPO_DIR" ] && cd "$CFG_REPO_DIR" 2>/dev/null && pwd -P ) || REAL_CFG_DIR=""
  [ -n "$REAL_CFG_DIR" ] && [ "$REAL_CFG_DIR" = "$REAL_REPO_DIR" ] \
    || { echo "refusing full wipe: repo-config.json repoDir '$CFG_REPO_DIR' does not match setup.json of1Repo '$REPO_DIR'" >&2; return 1; }
  git -C "$REPO_DIR" ls-tree -d HEAD stardust 2>/dev/null | grep -q . \
    || { echo "refusing full wipe: $REPO_DIR has no Stage-2 output (stardust/) committed in HEAD — not a repo built by this orchestrator" >&2; return 1; }
  CUR_BRANCH=$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null)
  [ -n "$BRANCH" ] && [ "$CUR_BRANCH" = "$BRANCH" ] \
    || { echo "refusing full wipe: checked-out branch '$CUR_BRANCH' != recorded branch '$BRANCH'" >&2; return 1; }

  if [ "$(echo "$SETUP" | jq -r .tokenFromEnv)" = "true" ]; then
    DA_TOKEN="$ADOBE_IMS_TOKEN"
  else
    DA_TOKEN=$(jq -r .access_token "$(echo "$SETUP" | jq -r .tokenFile)")
  fi

  # Clean slate: remove previous demo artifacts but preserve EDS boilerplate
  # (styles/styles.css, scripts/, blocks/{header,footer,fragment}/, head.html).
  cd "$REPO_DIR" || return 1
  rm -rf stardust/ deliverables/ templates/ fragments/ content/ drafts/ \
         gallery/ of1/config/ blocks/of1/ tools/ output/ screenshots/ tmp/ da/
  rm -rf styles/of1-*.css styles/prototype-*.css
  rm -f PRODUCT.md

  # Clean prior state
  rm -rf "$OF1_STATE_DIR"/of1-*-status.json
  rm -f "$OF1_STATE_DIR/discovery.html"

  # Stage ONLY the cleaned paths (scoped `-A -- <pathspec>`, never a bare `git add -A`/`.`;
  # see common-pitfalls.md § 6). Quoted globs are expanded by git against tracked files.
  # One pathspec per call: a single unmatched pathspec makes `git add` stage nothing at all.
  for p in stardust deliverables templates fragments content drafts gallery of1/config blocks/of1 \
           tools output screenshots tmp da PRODUCT.md 'styles/of1-*.css' 'styles/prototype-*.css'; do
    git add -A -- "$p" 2>/dev/null || true
  done
  if ! git diff --cached --quiet; then
    git commit -m "chore: clean slate for ${BRANCH}"
    git push origin "$BRANCH"
    echo "✓ Clean slate committed + pushed"
  else
    echo "✓ Branch already clean"
  fi

  # DA: recursive delete of OF1-owned trees (path-guarded to /of1 and /templates).
  da_delete_tree /of1
  da_delete_tree /templates

  # DA: top-level root *.html pages of the previous demo.
  DA_LIST=$(da_curl -s --connect-timeout 10 --max-time 30 \
    "https://admin.da.live/list/${OWNER}/${REPO}" 2>/dev/null || echo "[]")
  echo "$DA_LIST" | jq -r '.[] | select(.ext == "html") | .name' 2>/dev/null | while read -r name; do
    [ -n "$name" ] || continue
    da_curl -s --connect-timeout 10 --max-time 30 -X DELETE \
      "https://admin.da.live/source/${OWNER}/${REPO}/${name}.html" >/dev/null
  done
  echo "✓ DA content cleaned"
}

# Run only when executed, not when sourced (tests source it to call da_delete_tree).
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  wipe_main "$@" || exit 1
fi
