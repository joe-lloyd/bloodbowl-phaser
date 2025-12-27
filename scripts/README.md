# Utility Scripts

This directory contains utility scripts for the Blood Bowl project.

## convert-gifs-to-png.js

Converts all GIF files in the assets directory to PNG format.

### Prerequisites

Install the required dependency:

```bash
npm install sharp
```

### Usage

```bash
node scripts/convert-gifs-to-png.js
```

### What it does

1. Recursively scans `src/data/assets/` for `.gif` files
2. Converts each GIF to PNG format using the sharp library
3. Saves the PNG with the same filename (but `.png` extension)
4. Reports success/failure for each conversion

### Options

By default, the script keeps the original GIF files. To automatically delete them after conversion, uncomment these lines in the script:

```javascript
// fs.unlinkSync(gifPath);
// console.log(`  Deleted: ${path.basename(gifPath)}`);
```

### Example Output

```
🔍 Searching for GIF files in assets directory...

Found 5 GIF file(s)

✓ Converted: Human/Blitzers.gif → Blitzers.png
✓ Converted: Orc/Linemen.gif → Linemen.png
✓ Converted: Dwarf/Blockers.gif → Blockers.png
✓ Converted: Elf/Catchers.gif → Catchers.png
✓ Converted: Goblin/Sneaky-Git.gif → Sneaky-Git.png

✅ Conversion complete!
   Success: 5
   Failed: 0

💡 Tip: Uncomment the delete lines in the script to remove original GIF files
```
