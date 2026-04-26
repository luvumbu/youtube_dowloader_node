param(
    [string]$TargetPath,
    [string]$WorkDir,
    [string]$IconPath
)

# Detecte TOUS les bureaux possibles (Windows classique + OneDrive en FR/EN)
$candidates = @(
    [Environment]::GetFolderPath("Desktop"),
    "$env:USERPROFILE\Desktop",
    "$env:USERPROFILE\OneDrive\Desktop",
    "$env:USERPROFILE\OneDrive\Bureau"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

if ($candidates.Count -eq 0) {
    Write-Host "Aucun bureau detecte."
    exit 1
}

$ws = New-Object -ComObject WScript.Shell
$created = 0
$existed = 0

foreach ($desktop in $candidates) {
    $shortcutPath = Join-Path $desktop "YouTube Downloader.lnk"
    if (Test-Path $shortcutPath) {
        Write-Host "Deja present : $shortcutPath"
        $existed++
        continue
    }
    try {
        $shortcut = $ws.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $TargetPath
        $shortcut.WorkingDirectory = $WorkDir
        $shortcut.IconLocation = "$IconPath,0"
        $shortcut.Description = "YouTube Downloader"
        $shortcut.Save()
        Write-Host "Cree : $shortcutPath"
        $created++
    } catch {
        Write-Host ("Echec sur " + $desktop + " : " + $_.Exception.Message)
    }
}

Write-Host ("Bilan : " + $created + " cree(s), " + $existed + " deja present(s).")
