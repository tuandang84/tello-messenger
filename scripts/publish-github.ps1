<#
.SYNOPSIS
  Publish this working copy as a public GitHub repository.

.DESCRIPTION
  Maintainer helper for Tello Messenger. It expects the GitHub CLI (gh) to be
  installed or present at %LOCALAPPDATA%\Programs\GitHubCLI\bin\gh.exe, asks you
  to log in if needed, makes sure the first commit exists, then creates the
  repository, pushes `main`, and sets topics.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/publish-github.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/publish-github.ps1 -Repo tello-messenger
#>
[CmdletBinding()]
param(
  [string]$Repo = "tello-messenger",
  [string]$Description = "Tello Messenger - hộp thư hợp nhất Telegram + Zalo cho Windows (Tauri v2, React, Bun)",
  [string]$Visibility = "public"
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Test-Path ".git")) {
  throw "Chưa có git repository. Chạy script từ bản sao của dự án Tello."
}

$gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
if (-not $gh) {
  $portable = Join-Path $env:LOCALAPPDATA "Programs\GitHubCLI\bin\gh.exe"
  if (Test-Path $portable) {
    $gh = $portable
  } else {
    throw "Không tìm thấy GitHub CLI. Cài bằng 'winget install GitHub.cli' hoặc tải bản portable từ https://cli.github.com"
  }
}

& $gh auth status --hostname github.com *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Chưa đăng nhập GitHub. Mở trình duyệt để xác thực..." -ForegroundColor Cyan
  & $gh auth login --hostname github.com --git-protocol https --web
  if ($LASTEXITCODE -ne 0) { throw "Đăng nhập GitHub thất bại." }
}

$login = (& $gh api user --jq ".login").Trim()
$userId = (& $gh api user --jq ".id").Trim()
if (-not $login) { throw "Không lấy được tài khoản GitHub." }

$existingName = (git config --get user.name) 2>$null
$existingEmail = (git config --get user.email) 2>$null
if (-not $existingName) { git config user.name $login }
if (-not $existingEmail) { git config user.email "$userId+$login@users.noreply.github.com" }

git rev-parse --verify HEAD *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Tạo commit đầu tiên..." -ForegroundColor Cyan
  git add -A
  git commit -m "feat: Tello Messenger 0.1.0 - unified Telegram + Zalo inbox"
}

$hasOrigin = (git remote) -contains "origin"
if ($hasOrigin) {
  Write-Host "Đã có remote origin, chỉ push..." -ForegroundColor Cyan
  git push -u origin main
} else {
  Write-Host "Tạo repository $login/$Repo ($Visibility)..." -ForegroundColor Cyan
  & $gh repo create $Repo --source . --remote origin --push --$Visibility --description $Description
}

& $gh repo edit "$login/$Repo" `
  --description $Description `
  --add-topic tauri,telegram,zalo,react,typescript,windows,desktop,messaging | Out-Null

Write-Host ""
Write-Host "Xong: https://github.com/$login/$Repo" -ForegroundColor Green
