$VcpkgRoot = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\vcpkg"
$BuildDir  = "build\cmake"

if (Test-Path $BuildDir) {
    Write-Host ">> Cleaning old build..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $BuildDir
}

Write-Host ">> Configuring..." -ForegroundColor Cyan
cmake -B $BuildDir `
      -DCMAKE_BUILD_TYPE=Release `
      -DCMAKE_TOOLCHAIN_FILE="$VcpkgRoot\scripts\buildsystems\vcpkg.cmake" `
      -DVCPKG_TARGET_TRIPLET="x64-windows-static"

if ($LASTEXITCODE -ne 0) { Write-Error "CMake config failed"; exit 1 }

Write-Host ">> Building..." -ForegroundColor Cyan
cmake --build $BuildDir --config Release

if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }

Write-Host ""
Write-Host ">> Done! Output: .\build\license-win32-x64.exe" -ForegroundColor Green