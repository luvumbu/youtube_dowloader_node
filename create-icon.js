/**
 * Genere l'icone YouTube + tete de mort (48x48 ICO)
 * Lance automatiquement par start.bat
 */
const fs = require('fs');
const path = require('path');

const SIZE = 48;
const pixels = Buffer.alloc(SIZE * SIZE * 4); // BGRA

function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
    const i = (y * SIZE + x) * 4;
    pixels[i] = b;
    pixels[i + 1] = g;
    pixels[i + 2] = r;
    pixels[i + 3] = a;
}

function fillRect(x1, y1, x2, y2, r, g, b, a) {
    for (let y = y1; y <= y2; y++)
        for (let x = x1; x <= x2; x++)
            setPixel(x, y, r, g, b, a);
}

function fillCircle(cx, cy, radius, r, g, b, a) {
    for (let y = cy - radius; y <= cy + radius; y++)
        for (let x = cx - radius; x <= cx + radius; x++)
            if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2)
                setPixel(x, y, r, g, b, a);
}

function fillRoundRect(x1, y1, x2, y2, rad, r, g, b, a) {
    fillRect(x1 + rad, y1, x2 - rad, y2, r, g, b, a);
    fillRect(x1, y1 + rad, x2, y2 - rad, r, g, b, a);
    fillCircle(x1 + rad, y1 + rad, rad, r, g, b, a);
    fillCircle(x2 - rad, y1 + rad, rad, r, g, b, a);
    fillCircle(x1 + rad, y2 - rad, rad, r, g, b, a);
    fillCircle(x2 - rad, y2 - rad, rad, r, g, b, a);
}

// Triangle isocele pointant a droite (logo play YouTube)
function fillPlayTriangle(cx, cy, halfHeight, length, r, g, b, a) {
    const xLeft = cx - length / 2;
    for (let y = cy - halfHeight; y <= cy + halfHeight; y++) {
        const dy = Math.abs(y - cy);
        const ratio = 1 - dy / halfHeight;
        const xMax = xLeft + length * ratio;
        for (let x = xLeft; x <= xMax; x++) {
            setPixel(Math.round(x), Math.round(y), r, g, b, a);
        }
    }
}

// Fond transparent
pixels.fill(0);

// Logo YouTube en violet : rectangle arrondi (#9C27B0)
fillRoundRect(2, 8, 45, 39, 6, 156, 39, 176, 255);

// Triangle play blanc centre
fillPlayTriangle(24, 23, 9, 16, 255, 255, 255, 255);

// === Ecrire le fichier ICO ===
// ICO = ICONDIR header + ICONDIRENTRY + BMP data (sans file header)

// BMP info header (BITMAPINFOHEADER) - 40 bytes
const bmpHeader = Buffer.alloc(40);
bmpHeader.writeUInt32LE(40, 0);           // biSize
bmpHeader.writeInt32LE(SIZE, 4);           // biWidth
bmpHeader.writeInt32LE(SIZE * 2, 8);       // biHeight (x2 pour ICO : image + mask)
bmpHeader.writeUInt16LE(1, 12);            // biPlanes
bmpHeader.writeUInt16LE(32, 14);           // biBitCount (32 = BGRA)
bmpHeader.writeUInt32LE(0, 16);            // biCompression
bmpHeader.writeUInt32LE(SIZE * SIZE * 4, 20); // biSizeImage

// Pixels BMP (bottom-up)
const bmpPixels = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
    const srcRow = y * SIZE * 4;
    const dstRow = (SIZE - 1 - y) * SIZE * 4;
    pixels.copy(bmpPixels, dstRow, srcRow, srcRow + SIZE * 4);
}

// Mask (1 bit par pixel, bottom-up) - tout opaque si alpha > 0
const maskRowBytes = Math.ceil(SIZE / 8);
const maskRowPadded = Math.ceil(maskRowBytes / 4) * 4;
const mask = Buffer.alloc(maskRowPadded * SIZE, 0xFF);
for (let y = 0; y < SIZE; y++) {
    const bmpY = SIZE - 1 - y;
    for (let x = 0; x < SIZE; x++) {
        const alpha = pixels[(y * SIZE + x) * 4 + 3];
        if (alpha > 128) {
            // transparent = 0 dans le mask ICO (0 = opaque)
            const byteIdx = bmpY * maskRowPadded + Math.floor(x / 8);
            const bitIdx = 7 - (x % 8);
            mask[byteIdx] &= ~(1 << bitIdx);
        }
    }
}

const imageData = Buffer.concat([bmpHeader, bmpPixels, mask]);

// ICONDIR (6 bytes) + ICONDIRENTRY (16 bytes)
const ico = Buffer.alloc(6 + 16 + imageData.length);
ico.writeUInt16LE(0, 0);     // reserved
ico.writeUInt16LE(1, 2);     // type = ICO
ico.writeUInt16LE(1, 4);     // count = 1 image

// ICONDIRENTRY
ico.writeUInt8(SIZE, 6);     // width
ico.writeUInt8(SIZE, 7);     // height
ico.writeUInt8(0, 8);        // color palette
ico.writeUInt8(0, 9);        // reserved
ico.writeUInt16LE(1, 10);    // color planes
ico.writeUInt16LE(32, 12);   // bits per pixel
ico.writeUInt32LE(imageData.length, 14); // image size
ico.writeUInt32LE(22, 18);   // offset to image data

imageData.copy(ico, 22);

const outPath = path.join(__dirname, 'icon.ico');
fs.writeFileSync(outPath, ico);
console.log('Icone creee : ' + outPath);
