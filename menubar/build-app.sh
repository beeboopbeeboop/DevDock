#!/bin/bash
set -e

cd "$(dirname "$0")"

APP_NAME="DevDock"
BUNDLE_ID="com.devdock.menubar"
BINARY_NAME="DevDockMenuBar"
APP_DIR="${APP_NAME}.app"
INSTALL_DIR="/Applications/${APP_DIR}"

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
    <string>DevDock</string>
    <key>CFBundleDisplayName</key>
    <string>DevDock</string>
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
    <key>CFBundleURLTypes</key>
    <array>
        <dict>
            <key>CFBundleURLName</key>
            <string>DevDock URL Scheme</string>
            <key>CFBundleURLSchemes</key>
            <array>
                <string>devdock</string>
            </array>
        </dict>
    </array>
</dict>
</plist>
PLIST

# Codesign with stable ad-hoc identity
codesign --force --deep --sign - "$APP_DIR" 2>/dev/null

# Install to /Applications (preserves TCC/Accessibility by keeping same bundle ID + signature approach)
if [ "$1" = "--install" ]; then
    # Kill running instance first
    pkill -f "DevDockMenuBar" 2>/dev/null || true
    sleep 0.5
    rm -rf "$INSTALL_DIR"
    cp -r "$APP_DIR" "$INSTALL_DIR"
    echo "Installed to $INSTALL_DIR"
    echo "NOTE: You may need to re-grant Accessibility permission after install."
    open "$INSTALL_DIR"
else
    echo "Built: $(pwd)/$APP_DIR"
    echo "Run with --install to copy to /Applications and launch"
fi
