# Bundle the editor into one self-contained HTML file: editor\dist\KLWP Desktop Editor.html
# Same job as build.py, for Windows machines without Python.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Read-Source([string]$relative) {
    return [System.IO.File]::ReadAllText((Join-Path $here $relative), $utf8)
}

$parts = @(
    @('/*CSS*/', 'src\style.css'),
    @('/*JSZIP*/', 'vendor\jszip.min.js'),
    @('/*LABELS*/', 'src\labels.js'),
    @('/*BUILTIN*/', 'src\builtin.js'),
    @('/*DEFAULTS*/', 'src\defaults.js'),
    @('/*LIVE*/', 'src\live.js'),
    @('/*FORMULA*/', 'src\formula.js'),
    @('/*SCHEMA*/', 'src\schema.js'),
    @('/*RENDER*/', 'src\render.js'),
    @('/*APP*/', 'src\app.js')
)

$page = Read-Source 'src\index.html'
foreach ($part in $parts) {
    $placeholder = $part[0]
    $at = $page.IndexOf($placeholder, [System.StringComparison]::Ordinal)
    if ($at -lt 0) { throw "placeholder $placeholder not found in src\index.html" }
    $page = $page.Substring(0, $at) + (Read-Source $part[1]) + $page.Substring($at + $placeholder.Length)
}

$outDir = Join-Path $here 'dist'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$out = Join-Path $outDir 'KLWP Desktop Editor.html'
[System.IO.File]::WriteAllText($out, $page, $utf8)
Write-Host "wrote $out"
