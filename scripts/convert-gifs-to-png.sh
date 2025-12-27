#!/bin/bash

# Convert all GIF files to PNG in the assets directory
# Uses macOS built-in 'sips' command (no dependencies needed!)

ASSETS_DIR="src/data/assets"
COUNT=0
SUCCESS=0
FAILED=0

echo "🔍 Searching for GIF files in $ASSETS_DIR..."
echo ""

# Find all .gif files and convert them
while IFS= read -r -d '' gif_file; do
    COUNT=$((COUNT + 1))
    png_file="${gif_file%.gif}.png"
    
    # Convert using macOS sips command
    if sips -s format png "$gif_file" --out "$png_file" >/dev/null 2>&1; then
        rel_path=$(echo "$gif_file" | sed "s|^$ASSETS_DIR/||")
        echo "✓ Converted: $rel_path"
        SUCCESS=$((SUCCESS + 1))
        
        # Uncomment to delete original GIF files
        # rm "$gif_file"
        # echo "  Deleted: $(basename "$gif_file")"
    else
        echo "✗ Failed: $(basename "$gif_file")"
        FAILED=$((FAILED + 1))
    fi
done < <(find "$ASSETS_DIR" -type f -iname "*.gif" -print0)

echo ""
echo "✅ Conversion complete!"
echo "   Found: $COUNT"
echo "   Success: $SUCCESS"
echo "   Failed: $FAILED"

if [ $SUCCESS -gt 0 ]; then
    echo ""
    echo "💡 Tip: Uncomment the 'rm' line in the script to delete original GIF files"
fi
