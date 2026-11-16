# 本地构建 ddl-desktop Android APK（需 Android Studio SDK；NDK 缺失时自动安装）。
# 用法：powershell -File scripts/build-android.ps1
$ErrorActionPreference = 'Stop'
$env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-msvc'
$env:CARGO_PROFILE_DEV_DEBUG = '0'
$env:CARGO_PROFILE_DEV_STRIP = 'symbols'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$env:ANDROID_HOME = $sdk
$ndk = Join-Path $sdk 'ndk\27.0.12077973'
if (-not (Test-Path $ndk)) {
  & (Join-Path $PSScriptRoot 'install-ndk.ps1')
}
$env:NDK_HOME = $ndk
# Gradle 需 Java 17/21；优先找已安装的 17/21，否则用 Studio JBR。
$jbr = 'C:\Program Files\Android\Android Studio\jbr'
$env:JAVA_HOME = $jbr
foreach ($cand in @('C:\Program Files\Eclipse Adoptium\jdk-17*', 'C:\Program Files\Java\jdk-17*', 'C:\Program Files\Eclipse Adoptium\jdk-21*')) {
  $hit = Get-Item $cand -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($hit) { $env:JAVA_HOME = $hit.FullName; break }
}
rustup target add aarch64-linux-android --toolchain stable-x86_64-pc-windows-msvc

Push-Location $Root
if (-not (Test-Path (Join-Path $Root 'src-tauri\gen\android'))) {
  npx --yes @tauri-apps/cli@^2 android init
}
try {
  npx --yes @tauri-apps/cli@^2 android build --apk --debug --target aarch64
} catch {
  Write-Host 'tauri build 中断（Windows 符号链接限制？），改用手动复制 .so + Gradle 打包'
}
# Windows 未开开发者模式时 tauri 的 jniLibs 符号链接会失败，手动复制 .so 后直接 Gradle。
$so = Join-Path $Root '..\target\aarch64-linux-android\debug\libddl_desktop_lib.so'
$jni = Join-Path $Root 'src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a'
if (Test-Path $so) {
  New-Item -ItemType Directory -Force -Path $jni | Out-Null
  Copy-Item -LiteralPath $so -Destination (Join-Path $jni 'libddl_desktop_lib.so') -Force
  $strip = Join-Path $env:NDK_HOME 'toolchains\llvm\prebuilt\windows-x86_64\bin\llvm-strip.exe'
  if (Test-Path $strip) { & $strip (Join-Path $jni 'libddl_desktop_lib.so') }
}
Push-Location (Join-Path $Root 'src-tauri\gen\android')
.\gradlew.bat :app:assembleArm64Debug --no-daemon -PabiList=arm64-v8a -ParchList=arm64 -PtargetList=aarch64 -x rustBuildUniversalDebug -x rustBuildArm64Debug
Pop-Location
Pop-Location
$apk = Get-ChildItem -Path (Join-Path $Root 'src-tauri\gen\android\app\build\outputs\apk\arm64') -Recurse -Filter '*.apk' | Select-Object -First 1
if (-not $apk) { throw '未找到 APK 产物' }
$release = Join-Path $Root 'release'
New-Item -ItemType Directory -Force -Path $release | Out-Null
$dest = Join-Path $release 'ddl-desktop_android-arm64.apk'
Copy-Item -LiteralPath $apk.FullName -Destination $dest -Force
Write-Host "APK: $dest"
