#!/bin/bash
# da-upload.sh — Upload HTML files to Adobe Document Authoring (DA) and trigger EDS preview.
#
# Usage:
#   bash tools/da-upload.sh --branch frescopa-2 --owner aem-growth-adoption --repo of1-demo file1.html file2.html ...
#
# Options:
#   --branch BRANCH   Git branch name (required)
#   --owner OWNER     GitHub org (required)
#   --repo REPO       GitHub repo name (required)
#   --skip-verify     Skip HTTP 200 verification
#   --no-preview      Skip preview trigger (just upload)

BRANCH=""
OWNER=""
REPO=""
SKIP_VERIFY=false
NO_PREVIEW=false
FILES=()

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --branch) BRANCH="$2"; shift 2 ;;
    --owner) OWNER="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --skip-verify) SKIP_VERIFY=true; shift ;;
    --no-preview) NO_PREVIEW=true; shift ;;
    -*) echo "Unknown option: $1"; exit 1 ;;
    *) FILES+=("$1"); shift ;;
  esac
done

# Validate required args
if [ -z "$BRANCH" ] || [ -z "$OWNER" ] || [ -z "$REPO" ]; then
  echo "Usage: da-upload.sh --branch BRANCH --owner OWNER --repo REPO file1.html [file2.html ...]"
  exit 1
fi

if [ ${#FILES[@]} -eq 0 ]; then
  echo "Error: no files specified"
  exit 1
fi

# Get IMS token
DA_TOKEN=$(oauth-token adobe 2>/dev/null)
if [ -z "$DA_TOKEN" ]; then
  echo "ERROR: Failed to get IMS token (oauth-token adobe returned empty)"
  exit 1
fi

echo "Uploading ${#FILES[@]} file(s) to DA (branch: ${BRANCH})..."

UPLOAD_OK=0
UPLOAD_FAIL=0

for FILE in "${FILES[@]}"; do
  if [ ! -f "$FILE" ]; then
    echo "  ✗ $FILE — file not found"
    UPLOAD_FAIL=$((UPLOAD_FAIL + 1))
    continue
  fi

  BASENAME=$(basename "$FILE")
  MOUNT_PATH="/mnt/da/${BRANCH}/${BASENAME}"

  # Try mount first
  if cp "$FILE" "$MOUNT_PATH" 2>/dev/null; then
    echo "  ✓ ${BASENAME} → mount"
    UPLOAD_OK=$((UPLOAD_OK + 1))
  else
    # Fallback to API
    HTTP_CODE=$(cat "$FILE" | curl -s -o /dev/null -w "%{http_code}" -X PUT \
      -H "Authorization: Bearer ${DA_TOKEN}" \
      -H "Content-Type: text/html" \
      --data-binary @- \
      "https://admin.da.live/source/${OWNER}/${REPO}/${BRANCH}/${BASENAME}")

    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "204" ]; then
      echo "  ✓ ${BASENAME} → API (${HTTP_CODE})"
      UPLOAD_OK=$((UPLOAD_OK + 1))
    else
      echo "  ✗ ${BASENAME} — mount failed, API returned ${HTTP_CODE}"
      UPLOAD_FAIL=$((UPLOAD_FAIL + 1))
    fi
  fi
done

echo ""

# Trigger preview
if [ "$NO_PREVIEW" = false ] && [ $UPLOAD_OK -gt 0 ]; then
  echo "Triggering preview..."
  for FILE in "${FILES[@]}"; do
    [ ! -f "$FILE" ] && continue
    BASENAME=$(basename "$FILE")
    SLUG="${BASENAME%.html}"

    RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
      -H "Authorization: Bearer ${DA_TOKEN}" \
      -H "x-content-source-authorization: Bearer ${DA_TOKEN}" \
      "https://admin.hlx.page/preview/${OWNER}/${REPO}/${BRANCH}/${BRANCH}/${SLUG}")

    echo "  preview ${BRANCH}/${SLUG}: ${RESP}"
  done
  echo ""
fi

# Verify pages return 200
if [ "$SKIP_VERIFY" = false ] && [ "$NO_PREVIEW" = false ] && [ $UPLOAD_OK -gt 0 ]; then
  echo "Verifying pages (waiting 2s)..."
  sleep 2

  VERIFY_OK=0
  for FILE in "${FILES[@]}"; do
    [ ! -f "$FILE" ] && continue
    BASENAME=$(basename "$FILE")
    SLUG="${BASENAME%.html}"
    URL="https://${BRANCH}--${REPO}--${OWNER}.aem.page/${BRANCH}/${SLUG}"

    CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
    if [ "$CODE" = "200" ]; then
      echo "  ✓ ${URL}: ${CODE}"
      VERIFY_OK=$((VERIFY_OK + 1))
    else
      echo "  ⚠ ${URL}: ${CODE}"
    fi
  done
  echo ""
  echo "Done: ${UPLOAD_OK}/${#FILES[@]} uploaded, ${VERIFY_OK}/${UPLOAD_OK} verified."
else
  echo "Done: ${UPLOAD_OK}/${#FILES[@]} uploaded."
fi

# Exit code
if [ $UPLOAD_FAIL -gt 0 ]; then
  exit 1
fi
exit 0
