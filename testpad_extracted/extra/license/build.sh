#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build/cmake"

export CC=/usr/bin/clang
export CXX=/usr/bin/clang++

ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    OPENSSL_DIR="/opt/homebrew/opt/openssl@3"
    OUT_NAME="license-darwin-arm64"
else
    OPENSSL_DIR="/usr/local/opt/openssl@3"
    OUT_NAME="license-darwin-x64"
fi

echo ">> Starting build (arch: $ARCH)..."

if [ -d "$BUILD_DIR" ]; then
  echo ">> Cleaning old build..."
  rm -rf "$BUILD_DIR"
fi

echo ">> Configuring..."
cmake -B "$BUILD_DIR" \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_OSX_DEPLOYMENT_TARGET=10.15 \
      -DCMAKE_CXX_STANDARD=20 \
      -DCMAKE_CXX_STANDARD_REQUIRED=ON \
      -DCMAKE_CXX_EXTENSIONS=OFF \
      -DOPENSSL_ROOT_DIR="$OPENSSL_DIR" \
      -DOPENSSL_USE_STATIC_LIBS=TRUE

if [ $? -ne 0 ]; then echo "CMake config failed"; exit 1; fi

echo ">> Building..."
cmake --build "$BUILD_DIR" --config Release

if [ $? -ne 0 ]; then echo "Build failed"; exit 1; fi

echo ">> Stripping binary..."
strip "$SCRIPT_DIR/build/$OUT_NAME"

echo ""
echo ">> Done! Output: $SCRIPT_DIR/build/$OUT_NAME"