#!/usr/bin/env node

/**
 * Convert GIF files to PNG format
 *
 * This script finds all .gif files in the assets directory and converts them to .png
 * using the sharp library for image processing.
 *
 * Usage: node scripts/convert-gifs-to-png.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSETS_DIR = path.join(__dirname, "../src/data/assets");

/**
 * Recursively find all GIF files in a directory
 */
function findGifFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      findGifFiles(filePath, fileList);
    } else if (path.extname(file).toLowerCase() === ".gif") {
      fileList.push(filePath);
    }
  });

  return fileList;
}

/**
 * Convert a GIF file to PNG
 */
async function convertGifToPng(gifPath) {
  const pngPath = gifPath.replace(/\.gif$/i, ".png");

  try {
    await sharp(gifPath).png().toFile(pngPath);

    console.log(
      `✓ Converted: ${path.relative(ASSETS_DIR, gifPath)} → ${path.basename(
        pngPath
      )}`
    );

    // Optionally delete the original GIF
    // fs.unlinkSync(gifPath);
    // console.log(`  Deleted: ${path.basename(gifPath)}`);

    return true;
  } catch (error) {
    console.error(
      `✗ Failed to convert ${path.basename(gifPath)}:`,
      error.message
    );
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log("🔍 Searching for GIF files in assets directory...\n");

  const gifFiles = findGifFiles(ASSETS_DIR);

  if (gifFiles.length === 0) {
    console.log("No GIF files found.");
    return;
  }

  console.log(`Found ${gifFiles.length} GIF file(s)\n`);

  let successCount = 0;
  let failCount = 0;

  for (const gifPath of gifFiles) {
    const success = await convertGifToPng(gifPath);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log(`\n✅ Conversion complete!`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Failed: ${failCount}`);

  if (successCount > 0) {
    console.log(
      "\n💡 Tip: Uncomment the delete lines in the script to remove original GIF files"
    );
  }
}

// Run the script
main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
