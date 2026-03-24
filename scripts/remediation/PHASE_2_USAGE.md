# Phase 2 remediation usage

1. Place these files at the root of your repository, preserving paths.
2. From the repository root on Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\remediation\apply_phase2.ps1
```

3. Review the changed files.
4. Then commit and push:

```bash
git add .
git commit -m "fix: apply phase 2 stabilization remediations"
git push -u origin chore/phase-2-stabilization
```
