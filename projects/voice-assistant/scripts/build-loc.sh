#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p native/jarvis-loc/build
xcrun swiftc -O -framework CoreLocation -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker native/jarvis-loc/Info.plist -o native/jarvis-loc/build/jarvis-loc native/jarvis-loc/main.swift
echo "built native/jarvis-loc/build/jarvis-loc"
