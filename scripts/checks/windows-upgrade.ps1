$ErrorActionPreference = 'Stop'
$legacyTag = 'v0.2.1-beta'
$legacyName = "bbb-notepad_$($legacyTag.Substring(1))_x64-setup.exe"
$legacyInstaller = Join-Path $env:RUNNER_TEMP $legacyName
Invoke-WebRequest "https://github.com/BeepBoopBit/bbb-notepad/releases/download/$legacyTag/$legacyName" -OutFile $legacyInstaller
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$newInstaller = Get-Item "src-tauri/target/release/bundle/nsis/bnote_${version}_x64-setup.exe"
if ((Get-Item "$($newInstaller.FullName).sig").Length -eq 0) { throw 'Release signature is empty' }

$uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
$database = Join-Path $env:APPDATA 'dev.bbb.notes\notes.sqlite3'
$env:BNOTE_UPGRADE_DATABASE = $database

function Install-App($installer, $arguments) {
    $process = Start-Process $installer -ArgumentList $arguments -PassThru -Wait
    if ($process.ExitCode -ne 0) { throw "Installer exited with $($process.ExitCode)" }
}

function Start-App($product) {
    $install = Get-ItemProperty -LiteralPath (Join-Path $uninstallKey $product)
    Start-Process (Join-Path $install.InstallLocation "$product.exe") -PassThru
}

function Wait-ForDatabase($process, $schemaVersion) {
    for ($try = 0; $try -lt 40; $try++) {
        if ($process.HasExited) { throw "App exited before initializing its database" }
        if ((Test-Path $database) -and (python -c "import os, sqlite3; print(sqlite3.connect(os.environ['BNOTE_UPGRADE_DATABASE'], timeout=1).execute('PRAGMA user_version').fetchone()[0])") -eq "$schemaVersion") {
            return
        }
        Start-Sleep -Milliseconds 500
    }
    throw "App did not initialize schema version $schemaVersion"
}

Install-App $legacyInstaller '/S'
$legacyApp = Start-App 'bbb-notepad'
try { Wait-ForDatabase $legacyApp 2 } finally { Stop-Process -Id $legacyApp.Id -ErrorAction SilentlyContinue }
@'
import os
import sqlite3
with sqlite3.connect(os.environ["BNOTE_UPGRADE_DATABASE"]) as db:
    db.execute("INSERT INTO notes VALUES (?, ?, ?)", ("upgrade-note", "Windows upgrade note", 1))
    db.execute("INSERT INTO session VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET tabs=excluded.tabs,active=excluded.active", ('["upgrade-note"]', "upgrade-note"))
'@ | python -
if ($LASTEXITCODE -ne 0) { throw 'Could not seed the upgrade fixture' }

Install-App $newInstaller.FullName '/P /UPDATE'
if (Test-Path -LiteralPath (Join-Path $uninstallKey 'bbb-notepad')) { throw 'Old Installed Apps entry remains' }

$programs = [Environment]::GetFolderPath('Programs')
$shell = New-Object -ComObject WScript.Shell
foreach ($name in @('bnote', 'bnote Sticky Note')) {
    $shortcut = Get-ChildItem $programs -Recurse -Filter "$name.lnk" | Select-Object -First 1
    if (!$shortcut) { throw "Missing Start menu shortcut $name" }
    $link = $shell.CreateShortcut($shortcut.FullName)
    if (!(Test-Path -LiteralPath $link.TargetPath) -or (Split-Path $link.TargetPath -Leaf) -ne 'bnote.exe') { throw "Invalid shortcut $name" }
    if ($name -eq 'bnote Sticky Note' -and $link.Arguments -ne '--sticky') { throw 'Sticky shortcut is missing its launch argument' }
}

$newApp = Start-App 'bnote'
try {
    Wait-ForDatabase $newApp 3
    @'
import os
import sqlite3
with sqlite3.connect(os.environ["BNOTE_UPGRADE_DATABASE"]) as db:
    assert db.execute("SELECT content FROM notes WHERE id='upgrade-note'").fetchone() == ("Windows upgrade note",)
    assert db.execute("SELECT tabs, active FROM session WHERE id=1").fetchone() == ('["upgrade-note"]', "upgrade-note")
'@ | python -
    if ($LASTEXITCODE -ne 0) { throw 'Upgrade did not preserve the note and tab session' }
} finally {
    Stop-Process -Id $newApp.Id -ErrorAction SilentlyContinue
}
