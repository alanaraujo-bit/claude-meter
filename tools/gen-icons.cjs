#!/usr/bin/env node
'use strict';
/**
 * Gera os PNGs do PWA sem depender de nenhuma biblioteca de imagem.
 *
 * O ícone é desenhado por pixel: fundo quase-preto com cantos arredondados,
 * um anel violeta (a marca) e um ponteiro — a leitura de "medidor de tempo"
 * que o app representa. Antialiasing por amostragem de distância.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BG = [10, 10, 12];
const ACCENT = [124, 108, 246];
const FG = [244, 244, 245];

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const mix = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));

/** Cobertura suave de uma borda: 1 dentro, 0 fora, transição de ~1.5px. */
const edge = (dist, soft = 1.5) => clamp01(0.5 - dist / soft);

function drawIcon(size, { padded = true } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const pad = padded ? size * 0.1 : 0;          // margem de segurança (maskable)
  const radius = (size - pad * 2) / 2;
  const corner = size * 0.22;

  const ringOuter = radius * 0.72;
  const ringWidth = size * 0.062;
  const ringInner = ringOuter - ringWidth;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;

      // Fundo com cantos arredondados (squircle via distância de caixa).
      const bx = Math.abs(dx) - (size / 2 - pad - corner);
      const by = Math.abs(dy) - (size / 2 - pad - corner);
      const boxDist =
        Math.hypot(Math.max(bx, 0), Math.max(by, 0)) + Math.min(Math.max(bx, by), 0) - corner;
      const inCard = edge(boxDist);
      if (inCard <= 0) {
        px[i] = px[i + 1] = px[i + 2] = px[i + 3] = 0;
        continue;
      }

      let color = BG;
      const r = Math.hypot(dx, dy);

      // Anel: trilho apagado + arco de marca cobrindo ~72% da volta.
      const inRing = edge(Math.abs(r - (ringOuter + ringInner) / 2) - ringWidth / 2);
      if (inRing > 0) {
        // Ângulo a partir do topo, sentido horário.
        let ang = Math.atan2(dx, -dy);
        if (ang < 0) ang += Math.PI * 2;
        const filled = ang <= Math.PI * 2 * 0.72;
        const ringColor = filled ? ACCENT : mix(BG, FG, 0.12);
        color = mix(color, ringColor, inRing);
      }

      // Ponteiro apontando para o fim do arco.
      const handLen = ringInner * 0.82;
      const t = clamp01((dx * Math.sin(0) + dy * -1) / handLen);
      const hx = dx - 0 * t * handLen;
      const hy = dy + t * handLen;
      const handDist = Math.hypot(hx, hy) - size * 0.026;
      const inHand = dy <= 0 ? edge(handDist) : 0;
      if (inHand > 0) color = mix(color, FG, inHand);

      // Miolo central.
      const inHub = edge(r - size * 0.042);
      if (inHub > 0) color = mix(color, FG, inHub);

      px[i] = color[0];
      px[i + 1] = color[1];
      px[i + 2] = color[2];
      px[i + 3] = Math.round(255 * inCard);
    }
  }
  return px;
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtro "none"
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bits por canal
  ihdr[9] = 6;   // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let TABLE = null;
function crc32(buf) {
  if (!TABLE) {
    TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

const out = path.join(__dirname, '..', 'public');
for (const [name, size, opts] of [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['apple-icon.png', 180, { padded: false }], // iOS já aplica a máscara
  ['badge.png', 96, { padded: false }],
]) {
  fs.writeFileSync(path.join(out, name), encodePng(size, size, drawIcon(size, opts)));
  console.log('gerado', name, size + 'px');
}
