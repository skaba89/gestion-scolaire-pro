$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Write-Utf8File {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$SourceRelativePath
    )

    $fullPath = Join-Path $repoRoot $Path
    $sourcePath = Join-Path $repoRoot $SourceRelativePath
    $dir = Split-Path $fullPath -Parent
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $content = Get-Content -Path $sourcePath -Raw -Encoding UTF8
    Set-Content -Path $fullPath -Value $content -Encoding utf8
    Write-Host "[OK] Wrote $Path"
}

Write-Utf8File -Path '.gitignore' -SourceRelativePath 'scripts/remediation/templates/.gitignore.clean'
Write-Utf8File -Path '.dockerignore' -SourceRelativePath 'scripts/remediation/templates/.dockerignore.clean'
Write-Utf8File -Path 'README.md' -SourceRelativePath 'scripts/remediation/templates/README.clean.md'
Write-Utf8File -Path '.env.example' -SourceRelativePath 'scripts/remediation/templates/.env.example.clean'
Write-Utf8File -Path '.env.docker.example' -SourceRelativePath 'scripts/remediation/templates/.env.docker.example.clean'
Write-Utf8File -Path 'backend/app/core/config.py' -SourceRelativePath 'scripts/remediation/templates/backend.app.core.config.clean.py'
Write-Utf8File -Path 'backend/app/db/session.py' -SourceRelativePath 'scripts/remediation/templates/backend.app.db.session.clean.py'
Write-Utf8File -Path 'backend/alembic/env.py' -SourceRelativePath 'scripts/remediation/templates/backend.alembic.env.clean.py'
Write-Utf8File -Path '.github/workflows/ci.yml' -SourceRelativePath 'scripts/remediation/templates/github.workflow.ci.clean.yml'

Write-Host ""
Write-Host "Phase 2 remediation files have been applied."
Write-Host "Next steps:"
Write-Host "  git add ."
Write-Host "  git commit -m 'fix: apply phase 2 stabilization remediations'"
Write-Host "  git push -u origin chore/phase-2-stabilization"
