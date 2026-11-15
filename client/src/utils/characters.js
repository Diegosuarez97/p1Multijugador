import { AnimatedSprite, Texture } from "pixi.js";

// Wide enough for tails and capes in the side view; the sprite is anchored at its feet,
// so the extra width does not move the character on the map.
const FRAME_WIDTH = 108;
const FRAME_HEIGHT = 128;
const FIT_PADDING = 4;

// Each source sheet has three rows: profile, back, front. The row and frame
// counts differ between sheets, so describe each sheet independently.
const CHARACTERS = {
  Gryffindor: { file: "Gryffindor.png", frames: [7, 6, 6], rows: [[38, 148], [227, 335], [423, 530]] },
  Ravenclaw: { file: "Ravenclaw.png", frames: [6, 6, 6], rows: [[48, 161], [235, 343], [420, 530]] },
  Slytherin: { file: "Slytherin.png", frames: [6, 6, 6], rows: [[58, 169], [213, 328], [370, 488]] },
  Hufflepuff: { file: "Hufflepuff.png", frames: [6, 6, 6], rows: [[59, 169], [237, 339], [409, 516]] },
  Beauxbatons: { file: "Beauxbatons.png", frames: [6, 5, 5], rows: [[11, 146], [185, 323], [362, 500]] },
  Durmstrang: { file: "Durmstrang.png", frames: [8, 6, 6], rows: [[62, 170], [219, 324], [376, 494]] },
};

const TEAM_CHARACTERS = [
  "Gryffindor", "Ravenclaw", "Slytherin", "Hufflepuff", "Beauxbatons", "Durmstrang",
];

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load character sheet: ${file}`));
    image.src = `/assets/characters/${file}`;
  });
}

function getOpaqueBounds(context, x, y, width, height) {
  const pixels = context.getImageData(x, y, width, height).data;
  let left = width, top = height, right = -1, bottom = -1;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      if (pixels[(py * width + px) * 4 + 3] === 0) continue;
      left = Math.min(left, px);
      top = Math.min(top, py);
      right = Math.max(right, px);
      bottom = Math.max(bottom, py);
    }
  }
  return right < 0 ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

const ALPHA_MIN = 32; // fainter pixels are anti-aliasing noise
const ATTACH_MARGIN = 6; // pieces this close to the body (wand, sparkles) belong to the character

// The AI sheets are not cut on a perfect grid, so a cell can contain stray pixels from the
// neighbouring frame. Keep the biggest connected blob (the character) plus anything touching
// its box, and erase the rest so it neither shows up nor shrinks the frame.
function removeStrayPixels(context, width, height) {
  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const label = new Int32Array(width * height).fill(-1);
  const blobs = [];
  const stack = [];
  for (let start = 0; start < width * height; start++) {
    if (label[start] !== -1 || pixels[start * 4 + 3] < ALPHA_MIN) continue;
    const blob = { size: 0, left: width, top: height, right: -1, bottom: -1 };
    const id = blobs.push(blob) - 1;
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const index = stack.pop();
      const x = index % width;
      const y = (index - x) / width;
      blob.size++;
      blob.left = Math.min(blob.left, x);
      blob.right = Math.max(blob.right, x);
      blob.top = Math.min(blob.top, y);
      blob.bottom = Math.max(blob.bottom, y);
      for (const next of [index - 1, index + 1, index - width, index + width]) {
        if (next < 0 || next >= width * height || label[next] !== -1) continue;
        if ((next === index - 1 && x === 0) || (next === index + 1 && x === width - 1)) continue;
        if (pixels[next * 4 + 3] < ALPHA_MIN) continue;
        label[next] = id;
        stack.push(next);
      }
    }
  }
  if (blobs.length === 0) return null;

  const main = blobs.reduce((best, blob) => (blob.size > best.size ? blob : best));
  // Pieces of the neighbouring frame are cut by the cell edge, so they touch its left or right side.
  const touchesSide = (blob) => blob.left === 0 || blob.right === width - 1;
  const keep = blobs.map((blob) => blob === main || (
    !touchesSide(blob)
    && blob.right >= main.left - ATTACH_MARGIN && blob.left <= main.right + ATTACH_MARGIN
    && blob.bottom >= main.top - ATTACH_MARGIN && blob.top <= main.bottom + ATTACH_MARGIN
  ));
  for (let index = 0; index < width * height; index++) {
    const id = label[index];
    if (id === -1 ? pixels[index * 4 + 3] > 0 : !keep[id]) pixels[index * 4 + 3] = 0;
  }
  context.putImageData(imageData, 0, 0);
  return getOpaqueBounds(context, 0, 0, width, height);
}

// Step 1: cut one cell of the sheet and find the character inside it.
function scanFrame(image, sourceX, sourceY, sourceWidth, sourceHeight) {
  const scan = document.createElement("canvas");
  scan.width = Math.ceil(sourceWidth);
  scan.height = Math.ceil(sourceHeight);
  const scanContext = scan.getContext("2d", { willReadFrequently: true });
  scanContext.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, scan.width, scan.height);
  return { scan, bounds: removeStrayPixels(scanContext, scan.width, scan.height) };
}

// Step 2: draw it with its animation's scale, centred and standing on the bottom edge.
// Using one scale for every frame stops the sprite from growing and shrinking while it walks.
function drawFrame({ scan, bounds }, scale) {
  const canvas = document.createElement("canvas");
  canvas.width = FRAME_WIDTH;
  canvas.height = FRAME_HEIGHT;
  if (bounds) {
    const width = bounds.width * scale;
    const height = bounds.height * scale;
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = false;
    context.drawImage(
      scan,
      bounds.left, bounds.top, bounds.width, bounds.height,
      (FRAME_WIDTH - width) / 2, FRAME_HEIGHT - height, width, height,
    );
  }
  return Texture.from(canvas);
}

// The largest scale at which every frame of one animation still fits in the 88 x 128 box.
// It is per row because the AI sheets draw each direction at a slightly different size;
// per frame (the old approach) made the sprite pulse while walking.
function rowScale(frames) {
  let scale = Infinity;
  for (const { bounds } of frames) {
    if (!bounds) continue;
    scale = Math.min(
      scale,
      (FRAME_WIDTH - FIT_PADDING * 2) / bounds.width,
      (FRAME_HEIGHT - FIT_PADDING) / bounds.height,
    );
  }
  return Number.isFinite(scale) ? scale : 1;
}

export async function loadCharacterAnimations() {
  const animations = {};
  await Promise.all(Object.entries(CHARACTERS).map(async ([name, sheet]) => {
    const image = await loadImage(sheet.file);
    const rowNames = ["profile", "back", "front"];
    const scannedRows = sheet.rows.map(([top, bottom], rowIndex) => {
      const count = sheet.frames[rowIndex];
      const frames = [];
      for (let frame = 0; frame < count; frame++) {
        const left = Math.round(frame * image.width / count);
        const right = Math.round((frame + 1) * image.width / count);
        frames.push(scanFrame(image, left, top, right - left, bottom - top + 1));
      }
      return frames;
    });
    const rows = {};
    scannedRows.forEach((frames, rowIndex) => {
      const scale = rowScale(frames);
      rows[rowNames[rowIndex]] = frames.map((frame) => drawFrame(frame, scale));
    });
    animations[name] = rows;
  }));
  return animations;
}

export function characterNameForTeam(team) {
  return TEAM_CHARACTERS[team - 1] ?? TEAM_CHARACTERS[0];
}

export function makeCharacterSprite(animations, team) {
  const rows = animations[characterNameForTeam(team)];
  const sprite = new AnimatedSprite(rows.front);
  sprite.anchor.set(0.5, 1);
  sprite.animationSpeed = 0.12;
  sprite.loop = true;
  sprite.stop();
  sprite.label = "player-character";
  sprite._rows = rows;
  sprite._walkDirection = null;
  sprite._baseScaleX = 1;
  return sprite;
}

export function setCharacterWalking(sprite, dx, dy, walking) {
  if (!walking) {
    sprite.gotoAndStop(0);
    sprite._walkDirection = null;
    return;
  }

  // Grid X uses the profile view; grid Y uses the front/back views.
  const direction = dx !== 0 ? "profile" : dy > 0 ? "front" : "back";
  const scaleX = direction === "profile" && dx < 0 ? -1 : 1;
  sprite.scale.x = scaleX;
  if (sprite._walkDirection === direction) return;
  sprite._walkDirection = direction;
  sprite.textures = sprite._rows[direction];
  sprite.gotoAndPlay(0);
}
