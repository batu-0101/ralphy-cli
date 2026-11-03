# Dependency security repair

Reviewed the open landing dependency PR against current main. Its Next.js target is older than main, and the PR conflicts. The current landing dependency audit is clear.

Updated the CLI's simple-git, Zod and YAML dependencies and patched node-notifier's UUID dependency. Migrated all six simple-git imports to the named export and retained nested config defaults using Zod prefault. Added regression coverage for empty and partially specified configuration.

Verification: Bun audit reports no vulnerabilities; 127 tests pass (302 assertions), CLI build and --help pass. A disposable real Git repository passed init, commit, status and branch operations through simple-git 4. The node-notifier module and its UUID v4 consumer load successfully.

This is a source repair candidate. No release, production deployment, merge or PR closure was performed.
