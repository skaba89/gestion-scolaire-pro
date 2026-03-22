# SchoolFlow Pro — E2E test environment setup (Windows/PowerShell)
# Usage: .\tests\seed.ps1

$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $PSScriptRoot

Write-Host "`n🌱 SchoolFlow Pro — E2E Seed" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# 1) Run SQL seed
Write-Host "`n📦 Step 1/2 — Seeding PostgreSQL..." -ForegroundColor Yellow
docker exec -i schoolflow-pro-postgres-1 `
    psql -U schoolflow -d schoolflow `
    -f /dev/stdin < "$projectDir\tests\seed.sql"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ SQL seed failed." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Database seeded." -ForegroundColor Green

# 2) Run Keycloak setup
Write-Host "`n🔑 Step 2/2 — Setting up Keycloak users..." -ForegroundColor Yellow
python "$projectDir\tests\setup-keycloak.py"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Keycloak setup failed." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Keycloak users ready." -ForegroundColor Green

Write-Host "`n🚀 E2E environment ready! Run tests with:" -ForegroundColor Cyan
Write-Host "   npm run test:e2e" -ForegroundColor White
Write-Host "   npm run test:e2e -- --ui`n" -ForegroundColor White
