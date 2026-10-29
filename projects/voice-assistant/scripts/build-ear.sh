#!/usr/bin/env bash
# jarvis-ear 를 Xcode 프로젝트 없이 swiftc 로 빌드한다.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p native/jarvis-ear/build
xcrun swiftc -O \
  -framework Speech -framework AVFoundation \
  -o native/jarvis-ear/build/jarvis-ear native/jarvis-ear/main.swift
echo "built native/jarvis-ear/build/jarvis-ear"
