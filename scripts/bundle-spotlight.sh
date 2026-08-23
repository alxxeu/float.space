#!/bin/bash

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

SOURCE="$PROJECT_ROOT/src-tauri/native/FloatspaceSpotlightBridge.swift"
OUTPUT="$PROJECT_ROOT/src-tauri/native/libFloatspaceSpotlightBridge.dylib"

echo "========================================"
echo "Floatspace Spotlight Bridge"
echo "========================================"
echo "Source:"
echo "$SOURCE"
echo
echo "Output:"
echo "$OUTPUT"
echo

if [ ! -f "$SOURCE" ]; then
    echo "ERROR: Swift source not found:"
    echo "$SOURCE"
    exit 1
fi

rm -f "$OUTPUT"

echo "Building Swift bridge..."

swiftc \
    -emit-library \
    -O \
    -module-name FloatspaceSpotlightBridge \
    -Xlinker -install_name \
    -Xlinker @rpath/libFloatspaceSpotlightBridge.dylib \
    "$SOURCE" \
    -o "$OUTPUT"

if [ ! -f "$OUTPUT" ]; then
    echo "ERROR: Swift bridge was not created"
    exit 1
fi

echo
echo "SPOTLIGHT BRIDGE: SUCCESS"
ls -lh "$OUTPUT"

echo
echo "Checking architecture:"
file "$OUTPUT"

echo
echo "Checking install name:"
otool -D "$OUTPUT"

echo "========================================"
