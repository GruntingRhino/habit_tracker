#!/usr/bin/env bash
# Setup script for Habit Coach on macOS
# Creates a venv, installs dependencies, and registers a LaunchAgent for startup.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"
PLIST_SRC="$SCRIPT_DIR/com.habitcoach.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.habitcoach.plist"
LOG_DIR="$HOME/Library/Logs/HabitCoach"

echo "========================================"
echo "  HABIT COACH — macOS Setup"
echo "========================================"

# macOS system Python 3 always has tkinter; Homebrew Python may not.
# We use /usr/bin/python3 as the venv base to guarantee tkinter works.
PYTHON="/usr/bin/python3"
if ! "$PYTHON" -c "import tkinter" 2>/dev/null; then
    echo "[ERROR] $PYTHON does not have tkinter. Please install python-tk."
    exit 1
fi

echo ""
echo "--> Creating virtualenv at $VENV_DIR"
"$PYTHON" -m venv "$VENV_DIR"

echo "--> Installing dependencies"
"$VENV_DIR/bin/pip" install --upgrade pip --quiet
"$VENV_DIR/bin/pip" install -r "$SCRIPT_DIR/requirements.txt" --quiet
echo "    Done."

echo ""
echo "--> Configuring .env"
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
    echo "    Created .env from template."
    echo "    Edit $SCRIPT_DIR/.env if you need to change credentials."
else
    echo "    .env already exists — skipping."
fi

echo ""
echo "--> Creating log directory"
mkdir -p "$LOG_DIR"

echo ""
echo "--> Installing LaunchAgent"
mkdir -p "$HOME/Library/LaunchAgents"

# Substitute placeholders in the plist template
VENV_PYTHON="$VENV_DIR/bin/python"
sed \
    -e "s|__SCRIPT_DIR__|$SCRIPT_DIR|g" \
    -e "s|__PYTHON__|$VENV_PYTHON|g" \
    -e "s|__HOME__|$HOME|g" \
    "$PLIST_SRC" > "$PLIST_DST"

# Unload if already loaded (ignore errors)
launchctl unload "$PLIST_DST" 2>/dev/null || true

# Load the agent
launchctl load -w "$PLIST_DST"

echo "    LaunchAgent installed: $PLIST_DST"
echo ""
echo "========================================"
echo "  Setup complete!"
echo ""
echo "  The coach will launch automatically"
echo "  on your next login."
echo ""
echo "  To start NOW without rebooting:"
echo "  launchctl start com.habitcoach"
echo ""
echo "  To stop it:"
echo "  launchctl stop com.habitcoach"
echo ""
echo "  To uninstall startup:"
echo "  launchctl unload -w $PLIST_DST"
echo "  rm $PLIST_DST"
echo "========================================"
