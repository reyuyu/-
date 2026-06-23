$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot 'windows\FenbiHelperLauncher.cs'
$outputPath = Join-Path $projectRoot 'FenbiHelper.exe'

Add-Type `
    -Path $sourcePath `
    -ReferencedAssemblies @('System.Windows.Forms.dll') `
    -OutputAssembly $outputPath `
    -OutputType WindowsApplication

Write-Host "Built $outputPath"
