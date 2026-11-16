$ErrorActionPreference = 'Stop'
$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$clt = Join-Path $sdk 'cmdline-tools\latest'
$env:ANDROID_HOME = $sdk
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'

{
  $zip = Join-Path $env:TEMP 'commandlinetools-win.zip'
  Write-Host 'downloading cmdline-tools...'
  Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip' -OutFile $zip
  $tmp = Join-Path $env:TEMP 'clt-extract'
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  Expand-Archive -LiteralPath $zip -DestinationPath $tmp
  New-Item -ItemType Directory -Force -Path (Join-Path $sdk 'cmdline-tools') | Out-Null
  if (Test-Path $clt) { Remove-Item $clt -Recurse -Force }
  Move-Item -LiteralPath (Join-Path $tmp 'cmdline-tools') -Destination $clt
}

$sdkmanager = Join-Path $clt 'bin\sdkmanager.bat'
$prev = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
Write-Host 'accepting licenses...'
$yes = ("y`n" * 20)
$yes | & $sdkmanager --licenses 2>&1 | Out-Null
Write-Host 'installing NDK...'
& $sdkmanager --install 'ndk;27.0.12077973' 2>&1 | Select-Object -Last 5
$ErrorActionPreference = $prev
$ndk = Join-Path $sdk 'ndk\27.0.12077973'
Write-Host "NDK_HOME=$ndk exists=$(Test-Path $ndk)"
