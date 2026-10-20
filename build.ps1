param([string]$OutputDirectory = (Join-Path $PSScriptRoot 'dist'))
$ErrorActionPreference = 'Stop'
dotnet test (Join-Path $PSScriptRoot 'tests/MediaHider.Tests.csproj') --configuration Release
if ($LASTEXITCODE -ne 0) { throw 'Server tests failed' }
node --test (Join-Path $PSScriptRoot 'tests/Client.test.cjs') (Join-Path $PSScriptRoot 'tests/FilterWarnings.test.cjs') (Join-Path $PSScriptRoot 'tests/WebExtras.test.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Web interface tests failed' }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$assembly = Join-Path $PSScriptRoot 'bin/Release/net10.0/Jellyfin.Plugin.MediaHider.dll'
$version = [Reflection.AssemblyName]::GetAssemblyName($assembly).Version.ToString()
$archive = Join-Path $OutputDirectory "JellyQoL_$version.zip"
$stage = Join-Path $OutputDirectory 'package-stage'
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Copy-Item -LiteralPath $assembly -Destination (Join-Path $stage 'Jellyfin.Plugin.MediaHider.dll') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'assets/jelly-qol.png') -Destination (Join-Path $stage 'logo.png') -Force
# Include the local manifest with the stable Jelly QoL name and plugin ID.
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'packaging/meta.json') -Destination (Join-Path $stage 'meta.json') -Force
Compress-Archive -LiteralPath (Join-Path $stage 'Jellyfin.Plugin.MediaHider.dll'), (Join-Path $stage 'logo.png'), (Join-Path $stage 'meta.json') -DestinationPath $archive -Force
Get-FileHash -LiteralPath $archive -Algorithm MD5
