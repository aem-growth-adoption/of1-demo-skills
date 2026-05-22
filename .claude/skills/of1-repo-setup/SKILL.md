---
name: of1-repo-setup
description: Set up an AEM EDS repository for the OF1 demo — either use an existing repo or create a new one from the boilerplate template.
user-invocable: false
---

# OF1 Repo Setup — Setup AEM/DA Repo

This step ensures the user has a working AEM Edge Delivery Services repository connected to DA.live. There are two paths:

1. **Bring your own repo** — user provides an existing EDS GitHub repo URL
2. **Create a new one** — create a new repo from the `of1-boilerplate` template

The step is considered **done** when:
- The repo is cloned locally
- DA is mounted in SLICC
- A preview URL (`https://main--{repo}--{owner}.aem.page/`) returns a valid page

## Inputs

- `DOMAIN`: The target domain for the demo (e.g., `eu.patagonia.com`)

**All other inputs MUST be asked from the user interactively.** Do NOT assume or default any values.

## Flow

### Ask the user

The orchestrator MUST ask the user the following questions before proceeding:

**Question 1:** Do you have an existing AEM EDS repository, or should I create a new one?

- **Option A:** Provide the GitHub URL of your existing EDS repo (e.g., `https://github.com/myorg/mysite`)
- **Option B:** I'll create a new one for you.

**If Option B (create new):**

**Question 2:** What GitHub account or organization should I create the repo under? (e.g., `QuentinVecchio`, `myorg`)

**Question 3:** What should the repo be named? (e.g., `patagonia-eu-demo`, `my-demo-site`)

Do NOT proceed until the user has answered all required questions. Never assume a default org or repo name.

### Path A: Existing Repo

1. Parse owner and repo from the URL
2. Clone the repo locally
3. Verify it has the EDS structure (`scripts/aem.js`, `scripts/scripts.js`, `styles/styles.css`)
4. Check if AEM Code Sync is installed (test preview URL)
5. Mount DA
6. Verify preview works

### Path B: Create New Repo

#### Step 1: Create repo from template

Use the GitHub API to create a new repository from the `of1-boilerplate` template:

```bash
# Extract token from git credentials
TOKEN=$(cat ~/.git-credentials 2>/dev/null | grep github.com | sed 's|https://||' | sed 's|@github.com||' | cut -d: -f2)

# Create repo from template
curl -s -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/aem-growth-adoption/of1-boilerplate/generate" \
  -d '{
    "owner": "{REPO_OWNER}",
    "name": "{REPO_NAME}",
    "description": "OF1 demo site for {DOMAIN}",
    "private": false
  }'
```

Wait for the repo to be ready (poll until the repo exists and has content):

```bash
# Poll until repo is accessible
for i in $(seq 1 30); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: token $TOKEN" \
    "https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}")
  if [ "$STATUS" = "200" ]; then
    echo "Repo created successfully"
    break
  fi
  sleep 2
done
```

#### Step 2: Install AEM Code Sync GitHub App

The AEM Code Sync GitHub App must be installed on the repository. This is done via the GitHub App installation flow.

**Check if already installed:**
```bash
# Test if the preview URL returns something (Code Sync is working)
curl -s -o /dev/null -w "%{http_code}" "https://main--{REPO_NAME}--{REPO_OWNER}.aem.page/"
```

If the preview URL returns 404 or is not accessible, the user needs to install the AEM Code Sync app:

**Tell the user:**
> I've created your repository at `https://github.com/{REPO_OWNER}/{REPO_NAME}`
>
> To complete setup, you need to install the AEM Code Sync GitHub App on this repo:
> 1. Visit: https://github.com/apps/aem-code-sync/installations/new
> 2. Select your organization/account: `{REPO_OWNER}`
> 3. Choose "Only select repositories" and pick `{REPO_NAME}`
> 4. Click "Install"
>
> Let me know once you've done this and I'll verify it's working.

**Wait and verify:**
After the user confirms, poll the preview URL until it responds:

```bash
# Poll preview URL until Code Sync activates
for i in $(seq 1 60); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://main--{REPO_NAME}--{REPO_OWNER}.aem.page/")
  if [ "$STATUS" = "200" ]; then
    echo "AEM Code Sync is active — preview is working!"
    break
  fi
  sleep 5
done
```

#### Step 3: Clone the repo locally

```bash
REPO_DIR="/workspace/{REPO_NAME}"
git clone "https://github.com/{REPO_OWNER}/{REPO_NAME}.git" "$REPO_DIR"
cd "$REPO_DIR" && git status
```

#### Step 4: Mount DA

DA.live automatically creates a content space for new AEM repos. Mount it:

```bash
mount --source "da://{REPO_OWNER}/{REPO_NAME}" /mnt/da
```

Verify the mount works:
```bash
ls /mnt/da && echo "DA mount OK"
```

#### Step 5: Verify end-to-end preview

The setup is complete when we can:
1. See content in DA (`ls /mnt/da`)
2. Access the preview URL (`https://main--{REPO_NAME}--{REPO_OWNER}.aem.page/`)

```bash
# Verify preview is live
PREVIEW_URL="https://main--{REPO_NAME}--{REPO_OWNER}.aem.page/"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PREVIEW_URL")
echo "Preview URL: $PREVIEW_URL"
echo "Status: $STATUS"

if [ "$STATUS" = "200" ]; then
  echo "SUCCESS: EDS repo is fully set up and previewing!"
else
  echo "WARN: Preview returned $STATUS — may need to wait for Code Sync or preview content"
fi
```

#### Step 6: Create a test page (optional, if no content exists)

If DA is empty or the preview returns 404 for the index page, create a minimal test page:

```bash
# Write a simple test page to DA
cat > /mnt/da/index.html << 'EOF'
<body>
  <header></header>
  <main>
    <div>
      <h1>Hello World</h1>
      <p>This is a test page for the OF1 demo.</p>
    </div>
  </main>
  <footer></footer>
</body>
EOF
echo "Test page created at /mnt/da/index.html"
```

Then trigger a preview:
```bash
# Preview the page via AEM Admin API
curl -s -X POST "https://admin.hlx.page/preview/{REPO_OWNER}/{REPO_NAME}/main/index" \
  -H "Authorization: token $TOKEN"
```

Wait and verify:
```bash
sleep 5
curl -s -o /dev/null -w "%{http_code}" "https://main--{REPO_NAME}--{REPO_OWNER}.aem.page/"
```

## Output

Write the repo configuration to a shared location for subsequent steps:

```bash
mkdir -p /shared/of1-demo
cat > /shared/of1-demo/repo-config.json << EOF
{
  "owner": "{REPO_OWNER}",
  "repo": "{REPO_NAME}",
  "repoUrl": "https://github.com/{REPO_OWNER}/{REPO_NAME}",
  "previewUrl": "https://main--{REPO_NAME}--{REPO_OWNER}.aem.page/",
  "daSource": "da://{REPO_OWNER}/{REPO_NAME}",
  "repoDir": "/workspace/{REPO_NAME}",
  "domain": "{DOMAIN}"
}
EOF
```

## Completion

If everything works (repo cloned, DA mounted, preview accessible):
```bash
mkdir -p /shared/of1-demo
echo '{"step":2,"status":"done","summary":"Repo: {REPO_OWNER}/{REPO_NAME} | Preview: https://main--{REPO_NAME}--{REPO_OWNER}.aem.page/"}' > /shared/of1-demo/step-2-status.json
```

If the user needs to install AEM Code Sync (waiting for user action):
```bash
mkdir -p /shared/of1-demo
echo '{"step":2,"status":"review","summary":"Please install AEM Code Sync on the repo. Visit: https://github.com/apps/aem-code-sync/installations/new","deliverable":"https://github.com/apps/aem-code-sync/installations/new"}' > /shared/of1-demo/step-2-status.json
```

If setup fails:
```bash
mkdir -p /shared/of1-demo
echo '{"step":2,"status":"failed","error":"[describe what went wrong]"}' > /shared/of1-demo/step-2-status.json
```

Do NOT call `sprinkle send` — only the of1-demo orchestrator may do that.
