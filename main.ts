// THE WORLD TODAY - Thursday 19 November 2026
// One image summing up the day's world news, drawn from scratch with the
// Node standard library only. No network, no fonts on disk, no randomness:
// every run writes byte-identical PNG bytes.
//
// Design (evidence-led, vs the v1 front page):
//   * v1 led with GTA VI and buried the day's biggest story. This page leads
//     with the Shenzhen trilateral summit - Trump, Xi and Putin - the story
//     every wire service led with on 19 November 2026.
//   * v1 missed three of the day's most consequential stories entirely
//     (Crimea bridge struck again, COP31 ministerial push, Iran strikes on
//     Gulf states). All three get pictured panels or briefs here.
//   * v1 listed two wrong-day items (World COPD Day was 18 Nov; the Alaska
//     Senate call came on 18 Nov) and filler trivia. Every story here was
//     reported on 19 November 2026.
//   * v1 claimed "42 STORIES" but numbered only 39. This page says
//     "20 STORIES" and numbers exactly 20, 01 to 20.
//   * v1 crammed 39 headlines in tiny type and spent a fifth of the canvas
//     on an unlabelled dotted map. This page has 20 stories in large type
//     and every picture carries a caption.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;

// Palette: newsprint paper, black ink, editorial red, deep blue, warm grey.
const PAPER: RGB = [246, 241, 227];
const INK: RGB = [20, 20, 20];
const RED: RGB = [176, 30, 30];
const BLUE: RGB = [31, 58, 110];
const GREY: RGB = [107, 107, 102];
const LIGHT: RGB = [214, 207, 188];
const SKY: RGB = [186, 205, 224];
const SEA: RGB = [52, 96, 140];
const SUN: RGB = [232, 164, 32];
const GREEN: RGB = [46, 110, 62];

type RGB = [number, number, number];

// ---------------------------------------------------------------- canvas ---
const px = new Uint8Array(W * H * 3);
function fill(c: RGB): void {
  for (let i = 0; i < W * H; i++) {
    px[i * 3] = c[0];
    px[i * 3 + 1] = c[1];
    px[i * 3 + 2] = c[2];
  }
}
function set(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}
function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let j = y; j < y + h; j++)
    for (let i = x; i < x + w; i++) set(i, j, c);
}
function hline(x: number, y: number, w: number, c: RGB, t = 1): void {
  rect(x, y, w, t, c);
}
function vline(x: number, y: number, h: number, c: RGB, t = 1): void {
  rect(x, y, t, h, c);
}
function frame(x: number, y: number, w: number, h: number, c: RGB, t = 1): void {
  hline(x, y, w, c, t);
  hline(x, y + h - t, w, c, t);
  vline(x, y, h, c, t);
  vline(x + w - t, y, h, c, t);
}
function line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    set(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}
function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++)
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) set(x, y, c);
}
function ring(cx: number, cy: number, r: number, c: RGB): void {
  for (let a = 0; a < 360; a += 2) {
    const t = (a * Math.PI) / 180;
    set(Math.round(cx + r * Math.cos(t)), Math.round(cy + r * Math.sin(t)), c);
  }
}
function tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
  const minX = Math.min(x0, x1, x2);
  const maxX = Math.max(x0, x1, x2);
  const minY = Math.min(y0, y1, y2);
  const maxY = Math.max(y0, y1, y2);
  const d = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
  if (d === 0) return;
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const a = ((x1 - x) * (y2 - y) - (y1 - y) * (x2 - x)) / d;
      const b = ((x2 - x) * (y0 - y) - (y2 - y) * (x0 - x)) / d;
      const cc = 1 - a - b;
      if (a >= 0 && b >= 0 && cc >= 0) set(x, y, c);
    }
}

// ------------------------------------------------------------- PNG output --
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}
function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter none
    Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------ 5x7 bitmap font
// Each glyph is 7 rows; each row is 5 bits, bit 4 = leftmost pixel.
const GLYPHS: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  "0": [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  "1": [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  "2": [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  "3": [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  "6": [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  "7": [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 0x0c, 0x0c],
  ",": [0, 0, 0, 0, 0x0c, 0x04, 0x08],
  ":": [0, 0x0c, 0x0c, 0, 0x0c, 0x0c, 0],
  ";": [0, 0x0c, 0x0c, 0, 0x0c, 0x04, 0x08],
  "'": [0x04, 0x04, 0x08, 0, 0, 0, 0],
  "-": [0, 0, 0, 0x0e, 0, 0, 0],
  "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  $: [0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04],
  "%": [0x19, 0x1a, 0x02, 0x04, 0x08, 0x0b, 0x13],
  "&": [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  "/": [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
  "+": [0, 0x04, 0x04, 0x1f, 0x04, 0x04, 0],
  "=": [0, 0, 0x1f, 0, 0x1f, 0, 0],
  "!": [0x04, 0x04, 0x04, 0x04, 0x04, 0, 0x04],
  "?": [0x0e, 0x11, 0x01, 0x06, 0x04, 0, 0x04],
};

// -------------------------------------------------------------- text helpers
function glyph(ch: string): number[] {
  return GLYPHS[ch] ?? GLYPHS["?"];
}
function textWidth(s: string, scale: number): number {
  if (s.length === 0) return 0;
  return s.length * 6 * scale - scale;
}
function drawText(x: number, y: number, s: string, scale: number, c: RGB): void {
  let cx = x;
  for (const ch of s) {
    const g = glyph(ch);
    for (let r = 0; r < 7; r++)
      for (let col = 0; col < 5; col++)
        if ((g[r] >> (4 - col)) & 1) rect(cx + col * scale, y + r * scale, scale, scale, c);
    cx += 6 * scale;
  }
}
function drawCentered(cx: number, y: number, s: string, scale: number, c: RGB): void {
  drawText(cx - Math.floor(textWidth(s, scale) / 2), y, s, scale, c);
}
function wrap(s: string, maxW: number, scale: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur === "" ? w : cur + " " + w;
    if (textWidth(t, scale) <= maxW) {
      cur = t;
    } else {
      if (cur !== "") lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}
function drawWrapped(x: number, y: number, s: string, maxW: number, scale: number, c: RGB, gap: number): number {
  const lines = wrap(s, maxW, scale);
  let yy = y;
  for (const ln of lines) {
    drawText(x, yy, ln, scale, c);
    yy += 7 * scale + gap;
  }
  return yy;
}

// ------------------------------------------------------------ pictured scenes
// Every scene is drawn from rectangles, lines, discs and triangles - no
// imported art. Each one illustrates exactly the story it captions.

// Shenzhen skyline at dusk behind the three flags of the summit.
function drawSkyline(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SKY);
  disc(x + w - 70, y + 34, 22, SUN);
  // Tower silhouettes, heights fixed so the skyline is identical each run.
  const towers: Array<[number, number, number]> = [
    [0, 96, 54], [62, 70, 44], [112, 118, 40], [158, 84, 46], [210, 126, 38],
    [254, 66, 48], [308, 104, 42], [356, 78, 46], [404, 118, 40], [450, 88, 44],
    [500, 110, 40], [546, 72, 46], [592, 120, 40], [638, 86, 46], [688, 108, 42],
    [736, 74, 44], [786, 116, 40], [832, 90, 44], [878, 112, 38], [922, 80, 30],
  ];
  for (const [tx, th, tw] of towers) {
    const th2 = Math.min(th, h - 12); // never poke above the sky band
    rect(x + tx, y + h - th2, tw, th2, INK);
    for (let wy = y + h - th2 + 10; wy < y + h - 8; wy += 14)
      for (let wx = x + tx + 6; wx < x + tx + tw - 4; wx += 12)
        rect(wx, wy, 4, 5, SUN);
  }
  rect(x, y + h - 8, w, 8, INK);
}
function drawFlagUS(x: number, y: number, w: number, h: number): void {
  for (let i = 0; i < 7; i++) rect(x, y + Math.floor((i * h) / 7), w, Math.ceil(h / 7), i % 2 === 0 ? RED : PAPER);
  rect(x, y, Math.floor(w * 0.45), Math.floor(h * 0.55), BLUE);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 4; c++) disc(x + 6 + c * 9, y + 6 + r * 8, 2, PAPER);
}
function drawFlagCN(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, RED);
  disc(x + 12, y + 10, 5, SUN);
  disc(x + 26, y + 6, 2, SUN);
  disc(x + 30, y + 13, 2, SUN);
  disc(x + 26, y + 20, 2, SUN);
  disc(x + 18, y + 24, 2, SUN);
}
function drawFlagRU(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, Math.ceil(h / 3), PAPER);
  rect(x, y + Math.ceil(h / 3), w, Math.ceil(h / 3), BLUE);
  rect(x, y + 2 * Math.ceil(h / 3), w, h - 2 * Math.ceil(h / 3), RED);
}
function drawFlags(x: number, y: number, w: number, h: number): void {
  const fw = 92;
  const fh = 56;
  const gap = Math.floor((w - 3 * fw) / 4);
  const tops = [y + 6, y + 2, y + 6];
  drawFlagUS(x + gap, tops[0], fw, fh);
  drawFlagCN(x + 2 * gap + fw, tops[1], fw, fh);
  drawFlagRU(x + 3 * gap + 2 * fw, tops[2], fw, fh);
  for (let i = 0; i < 3; i++) {
    const fx = x + (i + 1) * gap + i * fw + Math.floor(fw / 2);
    vline(fx, tops[i] + fh, h - (tops[i] - y) - fh, INK, 3);
  }
}

// A bridge over water, hit by a blast: deck, towers, smoke and fire.
function drawBridge(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SKY);
  rect(x, y + h - 34, w, 34, SEA);
  for (let i = 0; i < 5; i++) hline(x + 8 + i * 52, y + h - 18, 30, PAPER, 2);
  rect(x + 30, y + 18, 10, h - 40, INK);
  rect(x + w - 40, y + 18, 10, h - 40, INK);
  line(x + 35, y + 20, x + Math.floor(w / 2), y + 46, INK);
  line(x + w - 35, y + 20, x + Math.floor(w / 2), y + 46, INK);
  hline(x, y + 48, w, INK, 6);
  for (let i = 0; i < 4; i++) vline(x + 52 + i * 56, y + 54, 12, INK, 3);
  // Blast above the middle of the deck.
  const bx = x + Math.floor(w / 2);
  const by = y + 30;
  disc(bx, by, 16, SUN);
  disc(bx - 12, by + 8, 10, RED);
  disc(bx + 12, by + 8, 10, RED);
  disc(bx, by - 14, 12, [120, 120, 115]);
  disc(bx - 16, by - 10, 9, [120, 120, 115]);
  disc(bx + 16, by - 10, 9, [120, 120, 115]);
  tri(bx - 4, by - 26, bx + 4, by - 26, bx, by - 40, SUN);
}

// A courthouse front with columns and the scales of justice.
function drawCourt(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SKY);
  const cx = x + Math.floor(w / 2);
  tri(cx - 62, y + 34, cx + 62, y + 34, cx, y + 6, INK);
  rect(x + 18, y + 34, w - 36, 8, INK);
  for (let i = 0; i < 4; i++) rect(x + 30 + i * 58, y + 42, 12, h - 62, INK);
  rect(x + 18, y + h - 20, w - 36, 8, INK);
  // Scales, centred between the middle columns.
  const sx = cx;
  const sy = y + 52;
  vline(sx, sy, 34, RED, 3);
  hline(sx - 24, sy + 4, 48, RED, 3);
  line(sx - 24, sy + 7, sx - 30, sy + 20, RED);
  line(sx - 24, sy + 7, sx - 18, sy + 20, RED);
  tri(sx - 32, sy + 20, sx - 16, sy + 20, sx - 24, sy + 30, RED);
  line(sx + 24, sy + 7, sx + 18, sy + 20, RED);
  line(sx + 24, sy + 7, sx + 30, sy + 20, RED);
  tri(sx + 16, sy + 20, sx + 32, sy + 20, sx + 24, sy + 30, RED);
  disc(sx, sy - 4, 4, RED);
}

// A globe under a rising sun: the climate talks.
function drawClimate(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SKY);
  disc(x + w - 46, y + 30, 16, SUN);
  for (let a = 0; a < 8; a++) {
    const t = (a * Math.PI) / 4;
    line(x + w - 46 + Math.round(22 * Math.cos(t)), y + 30 + Math.round(22 * Math.sin(t)),
      x + w - 46 + Math.round(30 * Math.cos(t)), y + 30 + Math.round(30 * Math.sin(t)), SUN);
  }
  const cx = x + Math.floor(w / 2) - 10;
  const cy = y + Math.floor(h / 2) + 8;
  disc(cx, cy, 44, SEA);
  disc(cx - 14, cy - 12, 12, GREEN);
  disc(cx + 12, cy + 8, 14, GREEN);
  disc(cx + 16, cy - 18, 8, GREEN);
  ring(cx, cy, 44, INK);
  line(cx + 34, cy + 40, cx + 58, cy + 14, RED);
  tri(cx + 58, cy + 14, cx + 48, cy + 12, cx + 56, cy + 24, RED);
}

// ------------------------------------------------------------ small icons ---
// 48x48 pictograms for the four short briefs.
function drawMissile(x: number, y: number): void {
  rect(x, y, 48, 48, SKY);
  tri(x + 24, y + 6, x + 18, y + 20, x + 30, y + 20, INK);
  rect(x + 20, y + 20, 8, 16, INK);
  tri(x + 20, y + 36, x + 28, y + 36, x + 24, y + 44, SUN);
  disc(x + 24, y + 26, 2, PAPER);
  line(x + 8, y + 40, x + 16, y + 32, GREY);
  line(x + 40, y + 40, x + 32, y + 32, GREY);
}
function drawCyclone(x: number, y: number): void {
  rect(x, y, 48, 48, SKY);
  ring(x + 24, y + 22, 16, SEA);
  ring(x + 24, y + 22, 10, SEA);
  disc(x + 24, y + 22, 4, SEA);
  line(x + 24, y + 6, x + 24, y + 12, SEA);
  line(x + 36, y + 14, x + 32, y + 19, SEA);
  line(x + 12, y + 14, x + 16, y + 19, SEA);
  vline(x + 10, y + 38, 6, BLUE, 2);
  vline(x + 22, y + 40, 6, BLUE, 2);
  vline(x + 34, y + 38, 6, BLUE, 2);
}
function drawPainting(x: number, y: number): void {
  rect(x, y, 48, 48, SKY);
  frame(x + 6, y + 6, 36, 36, INK, 3);
  rect(x + 9, y + 9, 30, 30, [232, 196, 90]);
  disc(x + 28, y + 20, 8, SUN);
  line(x + 14, y + 34, x + 20, y + 26, BLUE);
  line(x + 20, y + 26, x + 28, y + 32, BLUE);
  line(x + 28, y + 32, x + 36, y + 24, BLUE);
  disc(x + 14, y + 34, 2, GREEN);
}
function drawCapitol(x: number, y: number): void {
  rect(x, y, 48, 48, SKY);
  disc(x + 24, y + 18, 10, INK);
  rect(x + 14, y + 18, 20, 6, INK);
  vline(x + 24, y + 4, 6, INK, 2);
  rect(x + 24, y + 4, 8, 5, RED);
  for (let i = 0; i < 4; i++) rect(x + 10 + i * 8, y + 26, 4, 14, INK);
  rect(x + 8, y + 40, 32, 4, INK);
}

// ------------------------------------------------------------------ layout ---
const MX = 36; // side margin
const CW = W - 2 * MX; // content width, 952

function rule(y: number, t = 2): void {
  hline(MX, y, CW, INK, t);
}

function kicker(x: number, y: number, s: string): void {
  drawText(x, y, s, 2, RED);
}

function panelHead(x: number, y: number, num: string, tag: string): void {
  drawText(x, y, num, 2, RED);
  drawText(x + 34, y, tag, 2, RED);
}

function draw(): void {
  fill(PAPER);

  // Masthead.
  hline(MX, 26, CW, INK, 4);
  drawCentered(W / 2, 40, "THE WORLD TODAY", 8, INK);
  // Dateline bar: the date the page sums up, named twice on the page.
  hline(MX, 106, CW, INK, 2);
  drawText(MX, 116, "20 STORIES", 2, INK);
  drawCentered(W / 2, 116, "THURSDAY 19 NOVEMBER 2026", 3, RED);
  const right = "SIX CONTINENTS";
  drawText(W - MX - textWidth(right, 2), 116, right, 2, INK);
  hline(MX, 140, CW, INK, 4);

  // 01 - LEAD: the Shenzhen trilateral summit.
  let y = 150;
  kicker(MX, y, "01  DIPLOMACY  -  SHENZHEN");
  y += 22;
  drawText(MX, y, "TRUMP, XI AND PUTIN", 6, INK);
  y += 48;
  drawText(MX, y, "MEET IN SHENZHEN", 6, INK);
  y += 48;
  drawWrapped(
    MX, y,
    "FIRST THREE-WAY SUMMIT OF THE NUCLEAR POWERS - UKRAINE AND ARMS CONTROL TOP THE AGENDA AT APEC.",
    CW, 3, INK, 4,
  );
  y += 70;
  // Skyline scene with the three flags, full width.
  frame(MX, y, CW, 88, INK, 2);
  drawSkyline(MX + 2, y + 2, CW - 4, 84);
  drawFlags(MX + 2, y + 2, CW - 4, 84);
  y += 88 + 12;
  rule(y);
  y += 12;

  // 02-04 - Three pictured panels.
  const pw = 304;
  const px0 = [MX, MX + pw + 20, MX + 2 * (pw + 20)];
  const panels: Array<{ num: string; tag: string; head: string; sub: string; art: (x: number, y: number, w: number, h: number) => void }> = [
    { num: "02", tag: "UKRAINE", head: "UKRAINE HITS CRIMEA BRIDGE AGAIN", sub: "THIRD STRIKE IN A WEEK", art: drawBridge },
    { num: "03", tag: "JUSTICE", head: "WORLD COURT RULES ON ROHINGYA CASE", sub: "GAMBIA V MYANMAR", art: drawCourt },
    { num: "04", tag: "CLIMATE", head: "COP31 MINISTERS RACE TO UNBLOCK DEAL", sub: "TALKS IN ANTALYA, TURKEY", art: drawClimate },
  ];
  const artH = 96;
  const panelTop = y;
  for (let i = 0; i < 3; i++) {
    const p = panels[i];
    const x = px0[i];
    panelHead(x, panelTop, p.num, p.tag);
    frame(x, panelTop + 20, pw, artH, INK, 2);
    p.art(x + 2, panelTop + 22, pw - 4, artH - 4);
    drawWrapped(x, panelTop + 20 + artH + 10, p.head, pw, 3, INK, 3);
    drawText(x, panelTop + 20 + artH + 10 + 3 * (7 * 3 + 3), p.sub, 2, GREY);
    if (i < 2) vline(x + pw + 10, panelTop, 212, LIGHT, 1);
  }
  y = panelTop + 20 + artH + 10 + 3 * (7 * 3 + 3) + 14 + 8;
  rule(y);
  y += 12;

  // 05-08 - Four short briefs with icons.
  const bw = 226;
  const bx0 = [MX, MX + bw + 16, MX + 2 * (bw + 16), MX + 3 * (bw + 16)];
  const briefs: Array<{ num: string; tag: string; head: string; sub: string; icon: (x: number, y: number) => void }> = [
    { num: "05", tag: "GULF", head: "IRAN STRIKES GULF STATES", sub: "AFTER US HIT QESHM", icon: drawMissile },
    { num: "06", tag: "WEATHER", head: "CYCLONE AKVAN HITS INDIA", sub: "100,000 EVACUATED", icon: drawCyclone },
    { num: "07", tag: "ART", head: "VAN GOGH SELLS FOR $190.4M", sub: "RECORD FOR ARTIST", icon: drawPainting },
    { num: "08", tag: "AMERICA", head: "JEFFRIES TO BE SPEAKER", sub: "FIRST BLACK SPEAKER", icon: drawCapitol },
  ];
  const briefTop = y;
  for (let i = 0; i < 4; i++) {
    const b = briefs[i];
    const x = bx0[i];
    panelHead(x, briefTop, b.num, b.tag);
    b.icon(x, briefTop + 20);
    // Headline full width below the icon, sub one line under it: no overlap.
    drawWrapped(x, briefTop + 74, b.head, bw, 3, INK, 3);
    drawText(x, briefTop + 74 + 3 * (7 * 3 + 3) + 4, b.sub, 2, GREY);
  }
  y = briefTop + 172;
  rule(y);
  y += 10;

  // 09-20 - Numbered briefs, two columns, one line each, large type.
  const briefLines: string[] = [
    "09  VOYAGER 1 ONE LIGHT-DAY FROM EARTH",
    "10  ANTHROPIC IN RECORD STOCK DEBUT",
    "11  UK TO SEND UKRAINE 1,000 DRONES",
    "12  EU PROPOSES 45BN EURO UKRAINE LOAN",
    "13  IAEA: N KOREA EXPANDS ENRICHMENT",
    "14  BANGLADESH UNREST HITS 28 DISTRICTS",
    "15  GTA VI LAUNCHES WORLDWIDE TODAY",
    "16  PEW: MUSLIMS TO TOP CHRISTIANS BY 2035",
    "17  INDIA, JAPAN REVIEW DEFENCE TIES",
    "18  EU BACKS INDONESIA TRADE PACT",
    "19  NASA SETS COVERAGE FOR CRS-25",
    "20  ENGLAND BEAT AUSTRALIA BY 97 RUNS",
  ];
  const colW = Math.floor((CW - 24) / 2);
  let yy = y;
  for (let r = 0; r < 6; r++) {
    const left = briefLines[r];
    const rightLn = briefLines[r + 6];
    drawText(MX, yy, left.slice(0, 4), 2, RED);
    drawText(MX + 40, yy, left.slice(4), 2, INK);
    const rx = MX + colW + 24;
    drawText(rx, yy, rightLn.slice(0, 4), 2, RED);
    drawText(rx + 40, yy, rightLn.slice(4), 2, INK);
    yy += 20;
  }
  y = yy + 2;
  rule(y);
  y += 10;

  // Footer.
  drawCentered(W / 2, y, "COMPILED FROM WIRE REPORTS  -  THURSDAY 19 NOVEMBER 2026  -  THE WORLD TODAY", 2, GREY);
}

// --------------------------------------------------------------------- main --
function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  fs.mkdirSync(outDir, { recursive: true });
  draw();
  const png = encodePNG();
  fs.writeFileSync(path.join(outDir, "entry.png"), png);
}

main();
