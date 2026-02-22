#!/bin/bash
# L5: Remove leaked Resend API key from Git history
# WARNING: Rewrites history. All collaborators must re-clone or reset.
# Run from repo root: ./scripts/rewrite-history-remove-secret.sh

set -e
SECRET_PATTERN="re_GgJnqapL_3pUMWZdvMnYHfuXq8R9m7XGH"

echo "=== L5 Git History Cleanup ==="
echo "This will rewrite history to remove leaked secret."
echo "Ensure you have a backup. Continue? (y/N)"
read -r confirm
[[ "$confirm" == "y" || "$confirm" == "Y" ]] || exit 1

# Check for git-filter-repo (preferred)
if command -v git-filter-repo &>/dev/null; then
  echo "Using git-filter-repo..."
  git filter-repo --replace-text <(echo "$SECRET_PATTERN==>REMOVED_BY_L5_CLEANUP") --force
else
  echo "git-filter-repo not found. Install: pip install git-filter-repo"
  echo "Or use BFG: https://rtyley.github.io/bfg-repo-cleaner/"
  exit 1
fi

echo "Done. Run: git push --force-with-lease"
echo "Collaborators: git fetch && git reset --hard origin/$(git branch --show-current)"
