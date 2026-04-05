#!/bin/bash
set -e

cd "$(dirname "$0")"

APP_NAME="DevDock MenuBar"
BUNDLE_ID="com.devdock.menubar"
BINARY_NAME="DevDockMenuBar"
APP_DIR="${APP_NAME}.app"

# Build release binary
swift build -c release 2>&1

# Create .app bundle structure
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

# Copy binary
cp ".build/release/$BINARY_NAME" "$APP_DIR/Contents/MacOS/$BINARY_NAME"

# Create Info.plist
cat > "$APP_DIR/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>DevDock MenuBar</string>
    <key>CFBundleDisplayName</key>
    <string>DevDock MenuBar</string>
    <key>CFBundleIdentifier</key>
    <string>com.devdock.menubar</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleExecutable</key>
    <string>DevDockMenuBar</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>LSMinimumSystemVersion</key>
    <string>14.0</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLIST

echo "Built: $(pwd)/$APP_DIR"
echo "To install: cp -r \"$APP_DIR\" /Applications/"
