const sharp = require("sharp");
const path = require("path");

async function cropImage(imagePath, topCrop, rightCrop) {
  const img = sharp(imagePath);
  const metadata = await img.metadata();
  const { width, height } = metadata;

  const left = 0;
  const top = Math.floor(topCrop * height);
  const cropWidth = Math.floor(width - rightCrop * width);
  const cropHeight = height - top;

  console.log(
    `Cropping ${path.basename(
      imagePath
    )}: ${width}x${height} -> ${cropWidth}x${cropHeight}`
  );
  console.log(
    `  Crop region: left=${left}, top=${top}, width=${cropWidth}, height=${cropHeight}`
  );

  await img
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .toFile(imagePath + ".tmp");

  // Replace original with cropped version
  const fs = require("fs");
  fs.renameSync(imagePath + ".tmp", imagePath);
}

async function main() {
  // Images 1-3: Cut in half vertically (start at height/2) and trim width/4 from right
  const imagesHalf = [
    "src/data/assets/Bretonian/Bretonian Knight Catcher.png",
    "src/data/assets/Bretonian/Bretonian Knight Thrower.png",
    "src/data/assets/Bretonian/Grail Knight.png",
  ];

  for (const imgPath of imagesHalf) {
    await cropImage(imgPath, 0.5, 0.25); // top at height/2, remove width/4 from right
  }

  // Image 4: Cut at height/3 and trim width/4 from right
  await cropImage(
    "src/data/assets/Bretonian/Bretonian Squire.png",
    1 / 3,
    0.25
  );

  console.log("\nAll images cropped successfully!");
}

main().catch(console.error);
