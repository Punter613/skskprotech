CLEANUP MOVES AND NEXT STEPS

Summary of changes on branch cleanup/strip-unneeded:

- Removed private key contents from ed25519 and replaced with a removal notice.
- Replaced ed25519.pub with a removal notice to avoid accidental reuse.
- Normalized .gitignore and added patterns to prevent committing secrets or build artifacts.
- Replaced the root "backend" file with a short README explaining the submodule usage.
- Added this CLEANUP.md describing what was changed and required follow-ups.

Urgent follow-ups (you must do these):
1) Rotate any keys that were exposed (the private key was present in the repo history). Remove and rotate any SSH keys, deploy keys, Render keys, or server authorized keys that used the removed key.

2) If you want the private key erased from repository history, I can perform a history rewrite (git filter-repo or BFG). This is destructive and requires force-pushing; confirm before proceeding.

3) Verify CI workflows can fetch submodules. If the backend submodule is private, ensure workflows use actions/checkout with:

   with:
     submodules: true
     persist-credentials: true
     fetch-depth: 0

4) Review the cleanup branch and open a Pull Request to merge these changes into main when satisfied.

What I did NOT do yet (need your confirmation):
- I did NOT rewrite git history to purge secrets permanently.
- I did NOT delete branches or force-push to main.

If you want me to proceed with history rewrite or embed the backend code instead of keeping a submodule, tell me and I will prepare the steps and required PRs.
