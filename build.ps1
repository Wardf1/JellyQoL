param([string]$OutputDirectory = (Join-Path $PSScriptRoot 'dist'))
$ErrorActionPreference = 'Stop'
dotnet test (Join-Path $PSScriptRoot 'tests/MediaHider.Tests.csproj') --configuration Release
if ($LASTEXITCODE -ne 0) { throw 'Server tests failed' }
node --test (Join-Path $PSScriptRoot 'tests/Client.test.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Web interface tests failed' }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$assembly = Join-Path $PSScriptRoot 'bin/Release/net10.0/Jellyfin.Plugin.MediaHider.dll'
$version = [Reflection.AssemblyName]::GetAssemblyName($assembly).Version.ToString()
$archive = Join-Path $OutputDirectory "MediaHider_$version.zip"
$stage = Join-Path $OutputDirectory 'package-stage'
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Copy-Item -LiteralPath $assembly -Destination (Join-Path $stage 'Jellyfin.Plugin.MediaHider.dll') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'assets/thumbnail.png') -Destination (Join-Path $stage 'logo.png') -Force
Compress-Archive -LiteralPath (Join-Path $stage 'Jellyfin.Plugin.MediaHider.dll'), (Join-Path $stage 'logo.png') -DestinationPath $archive -Force
Get-FileHash -LiteralPath $archive -Algorithm MD5
