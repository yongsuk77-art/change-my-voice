import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const packDir = path.join(root, "public", "toda-sheep-pack");
const pngDir = path.join(packDir, "png");
const sourcePath = path.join(packDir, "source-sheet.png");
const manualSourceCrops = new Map([
  [30, { left: 945, top: 740, width: 225, height: 245 }]
]);

const assets = [
  ["peaceful", "평안", "평안히 앉은 토다 양"],
  ["despair", "절망", "절망한 토다 양"],
  ["praying", "기도", "기도하는 토다 양"],
  ["surprised", "놀람", "놀란 토다 양"],
  ["hopeful", "소망", "소망을 보는 토다 양"],
  ["reading-bible", "말씀 읽기", "성경 읽는 토다 양"],
  ["comforting", "위로", "어린 양을 안아주는 토다 양"],
  ["celebrating", "기쁨", "기뻐 뛰는 토다 양"],
  ["thinking", "생각", "생각하는 토다 양"],
  ["sleeping", "쉼", "잠든 토다 양"],
  ["waving", "인사", "손 흔드는 토다 양"],
  ["heart", "사랑", "하트를 든 토다 양"],
  ["worshiping", "찬양", "찬양하는 토다 양"],
  ["teaching", "가르침", "말씀을 가르치는 토다 양"],
  ["listening", "경청", "가만히 듣는 토다 양"],
  ["walking", "동행", "걸어가는 토다 양"],
  ["running", "달림", "달려가는 토다 양"],
  ["umbrella", "보호", "우산 든 토다 양"],
  ["lantern", "인도", "등불 든 토다 양"],
  ["crying", "눈물", "눈물 흘리는 토다 양"],
  ["smiling", "웃음", "활짝 웃는 토다 양"],
  ["confused", "당황", "어리둥절한 토다 양"],
  ["thankful", "감사", "감사하는 토다 양"],
  ["holding-heart", "마음", "큰 하트를 안은 토다 양"],
  ["carrying-book", "책", "책을 안은 토다 양"],
  ["pointing-up", "하늘 보기", "위를 가리키는 토다 양"],
  ["writing", "기록", "글 쓰는 토다 양"],
  ["tea", "차 한잔", "차 마시는 토다 양"],
  ["kneeling", "무릎", "무릎 꿇고 기도하는 토다 양"],
  ["cheering", "응원", "응원하는 토다 양"]
].map(([slug, titleKo, labelKo], index) => ({
  index: index + 1,
  slug,
  titleKo,
  labelKo,
  fileBase: `${String(index + 1).padStart(2, "0")}-${slug}`
}));

await mkdir(packDir, { recursive: true });
await rm(pngDir, { recursive: true, force: true });
await rm(path.join(packDir, "svg"), { recursive: true, force: true });
await mkdir(pngDir, { recursive: true });

const sourceTransparent = await whiteToTransparent(await sharp(sourcePath).png().toBuffer());
const characterImages = await extractCharacterImages(sourceTransparent);
if (characterImages.length < assets.length) {
  throw new Error(`Expected at least ${assets.length} characters but found ${characterImages.length}`);
}

for (const asset of assets) {
  const manualCrop = manualSourceCrops.get(asset.index);
  const cleaned = manualCrop
    ? await sharp(sourceTransparent).extract(manualCrop).png().toBuffer()
    : characterImages[asset.index - 1];
  await sharp(cleaned)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
    .resize(440, 440, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: 36, right: 36, bottom: 36, left: 36, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(pngDir, `${asset.fileBase}.png`));
}

await makeContactSheet();
await writeManifest();
console.log(`Generated ${assets.length} full-body Toda sheep PNG assets in ${packDir}`);

async function whiteToTransparent(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const min = Math.min(r, g, b);
    const max = Math.max(r, g, b);

    if (min > 248 && max - min < 8) {
      data[index + 3] = 0;
    } else if (min > 240 && max - min < 12) {
      data[index + 3] = Math.min(data[index + 3], 90);
    }
  }

  return sharp(data, { raw: info }).png().toBuffer();
}

async function extractCharacterImages(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const components = findComponents(data, info, 20);
  const mainComponents = orderMainComponents(
    components.filter((component) => {
      const boxWidth = component.maxX - component.minX + 1;
      const boxHeight = component.maxY - component.minY + 1;
      return component.area > 5200 && boxWidth > 50 && boxHeight > 100;
    })
  );

  return Promise.all(
    mainComponents.slice(0, assets.length).map((main, mainIndex) => {
      const assigned = components.filter((component) => {
        const nearestIndex = nearestMainIndex(component, mainComponents);
        if (nearestIndex !== mainIndex) return false;
        const distance = Math.hypot(component.cx - main.cx, component.cy - main.cy);
        return distance < 135 || intersectsExpanded(main, component, 45);
      });
      return makeMaskedCharacter(data, info, assigned);
    })
  );
}

function findComponents(data, info, alphaThreshold) {
  const { width, height, channels } = info;
  const visited = new Uint8Array(width * height);
  const components = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = y * width + x;
      if (visited[offset] || data[offset * channels + 3] < 35) continue;

      const queue = [offset];
      visited[offset] = 1;
      let area = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      const pixels = [];

      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const current = queue[cursor];
        const currentX = current % width;
        const currentY = Math.floor(current / width);
        pixels.push(current);
        area += 1;
        minX = Math.min(minX, currentX);
        maxX = Math.max(maxX, currentX);
        minY = Math.min(minY, currentY);
        maxY = Math.max(maxY, currentY);

        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (!dx && !dy) continue;
            const nextX = currentX + dx;
            const nextY = currentY + dy;
            if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
            const next = nextY * width + nextX;
            if (visited[next] || data[next * channels + 3] < 35) continue;
            visited[next] = 1;
            queue.push(next);
          }
        }
      }

      if (area > 8) {
        components.push({
          area,
          minX,
          maxX,
          minY,
          maxY,
          cx: (minX + maxX) / 2,
          cy: (minY + maxY) / 2,
          pixels
        });
      }
    }
  }

  return components;
}

function orderMainComponents(components) {
  const rows = [];
  for (const component of components.sort((a, b) => a.cy - b.cy)) {
    const row = rows.find((candidate) => Math.abs(candidate.cy - component.cy) < 95);
    if (row) {
      row.items.push(component);
      row.cy = row.items.reduce((sum, item) => sum + item.cy, 0) / row.items.length;
    } else {
      rows.push({ cy: component.cy, items: [component] });
    }
  }

  return rows
    .sort((a, b) => a.cy - b.cy)
    .flatMap((row) => row.items.sort((a, b) => a.cx - b.cx));
}

function nearestMainIndex(component, mainComponents) {
  let nearest = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < mainComponents.length; index += 1) {
    const main = mainComponents[index];
    const distance = Math.hypot(component.cx - main.cx, component.cy - main.cy);
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function intersectsExpanded(main, component, padding) {
  return !(
    component.maxX < main.minX - padding ||
    component.minX > main.maxX + padding ||
    component.maxY < main.minY - padding ||
    component.minY > main.maxY + padding
  );
}

async function makeMaskedCharacter(data, info, components) {
  const { width, height, channels } = info;
  const pad = 18;
  const minX = Math.max(0, Math.min(...components.map((component) => component.minX)) - pad);
  const minY = Math.max(0, Math.min(...components.map((component) => component.minY)) - pad);
  const maxX = Math.min(width - 1, Math.max(...components.map((component) => component.maxX)) + pad);
  const maxY = Math.min(height - 1, Math.max(...components.map((component) => component.maxY)) + pad);
  const outputWidth = maxX - minX + 1;
  const outputHeight = maxY - minY + 1;
  const output = new Uint8Array(outputWidth * outputHeight * channels);

  for (const component of components) {
    for (const pixel of component.pixels) {
      const sourceX = pixel % width;
      const sourceY = Math.floor(pixel / width);
      if (sourceX < minX || sourceX > maxX || sourceY < minY || sourceY > maxY) continue;
      const targetX = sourceX - minX;
      const targetY = sourceY - minY;
      const sourceOffset = pixel * channels;
      const targetOffset = (targetY * outputWidth + targetX) * channels;
      for (let channel = 0; channel < channels; channel += 1) {
        output[targetOffset + channel] = data[sourceOffset + channel];
      }
    }
  }

  return sharp(output, { raw: { width: outputWidth, height: outputHeight, channels } }).png().toBuffer();
}

async function makeContactSheet() {
  const tile = 180;
  const cols = 6;
  const rows = Math.ceil(assets.length / cols);
  const composites = await Promise.all(
    assets.map(async (asset, index) => ({
      input: await sharp(path.join(pngDir, `${asset.fileBase}.png`)).resize(154, 154, { fit: "contain" }).png().toBuffer(),
      left: (index % cols) * tile + 13,
      top: Math.floor(index / cols) * tile + 13
    }))
  );

  await sharp({
    create: {
      width: cols * tile,
      height: rows * tile,
      channels: 4,
      background: "#fffdfb"
    }
  })
    .composite(composites)
    .png()
    .toFile(path.join(packDir, "contact-sheet.png"));
}

async function writeManifest() {
  await writeFile(
    path.join(packDir, "manifest.json"),
    JSON.stringify(
      assets.map((asset) => ({
        id: asset.fileBase,
        titleKo: asset.titleKo,
        labelKo: asset.labelKo,
        png: `png/${asset.fileBase}.png`
      })),
      null,
      2
    ),
    "utf8"
  );
}
