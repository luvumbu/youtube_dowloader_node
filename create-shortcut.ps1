param(
    [string]$TargetPath,
    [string]$WorkDir,
    [string]$IconPath
)

$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "YouTube Downloader.lnk"

if (Test-Path $shortcutPath) {
    Write-Host "Raccourci deja present."
    exit 0
}

$ws = New-Object -ComObject WScript.Shell
$shortcut = $ws.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $TargetPath
$shortcut.WorkingDirectory = $WorkDir
$shortcut.IconLocation = "$IconPath,0"
$shortcut.Description = "YouTube Downloader"
$shortcut.Save()

Write-Host "Raccourci cree : $shortcutPath"
