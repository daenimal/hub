import { deflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([length, typeBuf, data, crc]);
}

// Minimal true-color PNG (color type 2), gradient-ish stripes so median-cut
// has something to work with.
function makePng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // color type: truecolor
  header[10] = 0; // compression
  header[11] = 0; // filter
  header[12] = 0; // interlace

  const raw: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const i = 1 + x * 3;
      row[i] = (x * 255) / Math.max(1, width - 1);
      row[i + 1] = 128;
      row[i + 2] = (y * 255) / Math.max(1, height - 1);
    }
    raw.push(row);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.concat(raw))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

test("texture optimizer runs the pipeline and produces a preview", async ({
  page,
}) => {
  await page.goto("/tools/texture-optimizer");

  const png = makePng(64, 48);
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "test-texture.png", mimeType: "image/png", buffer: png });

  await expect(page.getByText("test-texture.png")).toBeVisible();

  await page.getByRole("button", { name: "Optimize" }).click();

  await expect(page.getByText("Optimized")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByAltText("Optimized image preview")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download PNG" }),
  ).toBeVisible();
});

test("texture optimizer cancel stops a running job", async ({ page }) => {
  await page.goto("/tools/texture-optimizer");

  const png = makePng(256, 256);
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "cancel-test.png", mimeType: "image/png", buffer: png });

  await page.getByRole("button", { name: "Optimize" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByText("Optimization canceled.")).toBeVisible({
    timeout: 15_000,
  });
});

test("anonymous visitors see locked advanced settings", async ({ page }) => {
  await page.goto("/tools/texture-optimizer");

  const panel = page.locator("section", {
    has: page.getByRole("heading", { name: "Advanced settings" }),
  });
  await expect(panel.getByText("Sign in to unlock")).toBeVisible();
  await expect(
    panel.getByLabel("Colors (quantization)"),
  ).toBeDisabled();
});

test("free preset applies a fixed configuration", async ({ page }) => {
  await page.goto("/tools/texture-optimizer");
  await page.getByRole("button", { name: /PS1 Classic/i }).click();

  const settings = page.locator(
    "section",
    { has: page.getByRole("heading", { name: "Advanced settings" }) },
  );
  await expect(settings.getByText("32 colors", { exact: true })).toBeVisible();
});