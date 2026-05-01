# Re-scan ./drawings (repo-hosted; sync from DBM workspace) + refresh index JSON/JS.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Join-Path $here "drawings"
if (!(Test-Path $root)) {
  Write-Error "drawings folder not found under coil-code-app: $root"
}

function Infer-BigSizesApp([string]$name) {
  $n = $name.ToUpperInvariant()
  if ($n -match 'COOLING') { return 'Cooler' }
  if ($n -match 'HEATING') { return 'Heater' }
  # Match Calc98 folder spelling "Evapurator" so filters align with hyphen-code logic
  if ($n -match 'EVAP') { return 'Evapurator' }
  if ($n -match 'CONDENS') { return 'Condenser' }
  if ($n -match 'CHANGEOVER') { return 'Changeover' }
  return 'General'
}

$files = Get-ChildItem $root -Recurse -File
$entries = foreach ($f in $files) {
  $rel = $f.FullName.Substring($root.Length).TrimStart('\')
  $parts = $rel -split '\\'
  $geometry = $parts[0]
  $application = $null
  if ($geometry -eq 'Big Sizes (35-44)') {
    $application = Infer-BigSizesApp $f.Name
  } elseif ($geometry -eq 'Reference') {
    # Shared PDFs (tube tables, etc.) — always listed with decode output
    $application = 'Reference'
  } elseif ($parts.Length -ge 2) {
    $application = $parts[1]
  } else {
    $application = 'General'
  }
  [pscustomobject]@{
    geometry    = $geometry
    application = $application
    name        = $f.Name
    relPath     = ($rel -replace '\\','/')
    ext         = $f.Extension.ToLowerInvariant()
  }
}

$jsonPath = Join-Path $here "coils-drawings-index.json"
$jsPath = Join-Path $here "coilsDrawingsIndex.js"

$entries | Sort-Object geometry, application, name | ConvertTo-Json -Depth 5 |
  Set-Content -Encoding UTF8 $jsonPath

$raw = Get-Content -Raw -Encoding UTF8 $jsonPath
"window.DBMM_COILS_DRAWINGS_INDEX = $raw;" | Set-Content -Encoding UTF8 $jsPath

Write-Host "Indexed $($entries.Count) files → $jsonPath"
