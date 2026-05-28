#!/bin/bash
# download-images.sh — Batch download product images and upload to DA for self-hosting.
#
# Usage:
#   bash tools/download-images.sh --input image-manifest.json --branch frescopa-2 --owner aem-growth-adoption --repo of1-demo
#
# Input format (image-manifest.json):
# [
#   {"productId": "house-blend-dark", "urls": ["https://site.com/img1.png", "https://site.com/img2.png"]},
#   {"productId": "morning-muse", "urls": ["https://site.com/img3.png"]}
# ]
#
# Output: image-mapping.json with DA URLs
#
# Options:
#   --input FILE          Path to image manifest JSON (required)
#   --branch BRANCH       Git branch (required)
#   --owner OWNER         GitHub org (required)
#   --repo REPO           GitHub repo (required)
#   --output FILE         Output mapping file (default: image-mapping.json)
#   --max-per-product N   Max images per product (default: 5)
#   --update-products     Also update of1/config/products.json with DA URLs

INPUT=""
BRANCH=""
OWNER=""
REPO=""
OUTPUT="image-mapping.json"
MAX_PER_PRODUCT=5
UPDATE_PRODUCTS=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --input) INPUT="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --owner) OWNER="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --output) OUTPUT="$2"; shift 2 ;;
    --max-per-product) MAX_PER_PRODUCT="$2"; shift 2 ;;
    --update-products) UPDATE_PRODUCTS=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Validate
if [ -z "$INPUT" ] || [ -z "$BRANCH" ] || [ -z "$OWNER" ] || [ -z "$REPO" ]; then
  echo "Usage: download-images.sh --input FILE --branch BRANCH --owner OWNER --repo REPO"
  exit 1
fi

if [ ! -f "$INPUT" ]; then
  echo "Error: input file not found: $INPUT"
  exit 1
fi

# Get IMS token
DA_TOKEN=$(oauth-token adobe 2>/dev/null)
if [ -z "$DA_TOKEN" ]; then
  echo "ERROR: Failed to get IMS token"
  exit 1
fi

# Create media directory
mkdir -p "/mnt/da/${BRANCH}/media" 2>/dev/null

# Read the manifest and process
TOTAL_DOWNLOADED=0
TOTAL_SKIPPED=0
TOTAL_PRODUCTS=$(jq length "$INPUT")

echo "Downloading images for ${TOTAL_PRODUCTS} products (max ${MAX_PER_PRODUCT} per product)..."

# Initialize output mapping
echo "{" > "$OUTPUT"
FIRST_PRODUCT=true

# Process each product
jq -c '.[]' "$INPUT" | while read -r PRODUCT; do
  PRODUCT_ID=$(echo "$PRODUCT" | jq -r '.productId')
  URLS=$(echo "$PRODUCT" | jq -r '.urls[]' 2>/dev/null)

  if [ -z "$URLS" ]; then
    continue
  fi

  IMAGES_FOR_PRODUCT=()
  N=0

  while IFS= read -r URL; do
    N=$((N + 1))
    if [ $N -gt $MAX_PER_PRODUCT ]; then
      break
    fi

    FILENAME="product-${PRODUCT_ID}-${N}.png"
    TMP_FILE="/tmp/${FILENAME}"

    # Download
    HTTP_CODE=$(curl -sL -o "$TMP_FILE" -w "%{http_code}" \
      -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
      --max-time 30 \
      "$URL")

    if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "301" ] && [ "$HTTP_CODE" != "302" ]; then
      echo "  ${PRODUCT_ID} [${N}]: ✗ download failed (HTTP ${HTTP_CODE})"
      TOTAL_SKIPPED=$((TOTAL_SKIPPED + 1))
      continue
    fi

    # Verify size
    SIZE=$(wc -c < "$TMP_FILE" 2>/dev/null | tr -d ' ')
    if [ "$SIZE" -lt 10000 ]; then
      echo "  ${PRODUCT_ID} [${N}]: ✗ too small (${SIZE} bytes), skipping"
      TOTAL_SKIPPED=$((TOTAL_SKIPPED + 1))
      rm -f "$TMP_FILE"
      continue
    fi

    SIZE_KB=$((SIZE / 1024))

    # Upload to DA — try mount first
    MOUNT_PATH="/mnt/da/${BRANCH}/media/${FILENAME}"
    if cp "$TMP_FILE" "$MOUNT_PATH" 2>/dev/null; then
      echo "  ${PRODUCT_ID} [${N}]: ✓ ${SIZE_KB}KB → mount"
    else
      # Fallback to API
      UPLOAD_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
        -H "Authorization: Bearer ${DA_TOKEN}" \
        -H "Content-Type: image/png" \
        --data-binary "@${TMP_FILE}" \
        "https://admin.da.live/source/${OWNER}/${REPO}/${BRANCH}/media/${FILENAME}")

      if [ "$UPLOAD_CODE" = "200" ] || [ "$UPLOAD_CODE" = "201" ] || [ "$UPLOAD_CODE" = "204" ]; then
        echo "  ${PRODUCT_ID} [${N}]: ✓ ${SIZE_KB}KB → API"
      else
        echo "  ${PRODUCT_ID} [${N}]: ✗ upload failed (mount + API ${UPLOAD_CODE})"
        TOTAL_SKIPPED=$((TOTAL_SKIPPED + 1))
        rm -f "$TMP_FILE"
        continue
      fi
    fi

    TOTAL_DOWNLOADED=$((TOTAL_DOWNLOADED + 1))
    rm -f "$TMP_FILE"

  done <<< "$URLS"

done

echo ""
echo "Summary: ${TOTAL_DOWNLOADED} images uploaded to DA, ${TOTAL_SKIPPED} skipped."

# Generate the mapping JSON using jq
echo "Generating mapping file: $OUTPUT"
jq -c '.[]' "$INPUT" | jq -Rs '
  split("\n") | map(select(length > 0) | fromjson) |
  map({
    key: .productId,
    value: [range(.urls | length | if . > 5 then 5 else . end) | . + 1 |
      "https://content.da.live/'"${OWNER}"'/'"${REPO}"'/'"${BRANCH}"'/media/product-\(.productId // empty)-\(.).png"
    ]
  }) | from_entries
' < "$INPUT" > "${OUTPUT}.tmp" 2>/dev/null

# Simpler approach - build mapping with shell
python3 << 'PYEOF'
import json, sys

branch = "${BRANCH}" if "${BRANCH}" else sys.exit(1)
owner = "${OWNER}"
repo = "${REPO}"
max_per = int("${MAX_PER_PRODUCT}")

with open("${INPUT}") as f:
    manifest = json.load(f)

mapping = {}
for item in manifest:
    pid = item["productId"]
    urls = item.get("urls", [])[:max_per]
    da_urls = []
    for i, url in enumerate(urls, 1):
        da_urls.append(f"https://content.da.live/{owner}/{repo}/{branch}/media/product-{pid}-{i}.png")
    if da_urls:
        mapping[pid] = da_urls

with open("${OUTPUT}", "w") as f:
    json.dump(mapping, f, indent=2)

print(f"Mapping written to: ${OUTPUT}")
PYEOF

# Update products.json if requested
if [ "$UPDATE_PRODUCTS" = true ] && [ -f "of1/config/products.json" ]; then
  echo "Updating of1/config/products.json with DA URLs..."
  python3 << 'PYEOF'
import json

with open("${OUTPUT}") as f:
    mapping = json.load(f)

with open("of1/config/products.json") as f:
    products = json.load(f)

updated = 0
for product in products:
    pid = product.get("id", "")
    if pid in mapping:
        product["images"] = mapping[pid]
        updated += 1

with open("of1/config/products.json", "w") as f:
    json.dump(products, f, indent=2)

print(f"  ✓ {updated} products updated with DA image URLs.")
PYEOF
fi

echo "Done."
