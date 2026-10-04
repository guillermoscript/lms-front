import { deflateSync } from 'node:zlib'

/**
 * Deterministic image fixtures, generated at run time.
 *
 * The attachment tests need multi-megabyte images, and committing those as
 * binaries would put ~50 MB in the repo to assert on a size ceiling. A PNG of
 * incompressible noise is the cheapest way to get a real, decodable image of a
 * chosen byte size: deflate cannot shrink random bytes, so the file lands at
 * roughly `edge * edge * 3`.
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** A square RGB PNG of pseudo-random noise. Same seed → same bytes. */
export function noisePng(edge: number, seed = 1): Buffer {
  // Row-major scanlines, each prefixed with filter byte 0 (None).
  const raw = Buffer.alloc(edge * (edge * 3 + 1))
  let state = seed >>> 0
  let offset = 0
  for (let y = 0; y < edge; y++) {
    raw[offset++] = 0
    for (let x = 0; x < edge * 3; x++) {
      // xorshift32 — fast, dependency-free, and incompressible enough.
      state ^= state << 13
      state ^= state >>> 17
      state ^= state << 5
      raw[offset++] = state & 0xff
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(edge, 0)
  ihdr.writeUInt32BE(edge, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 1 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** A syntactically valid but content-free PDF, for the "not an image" case. */
export const tinyPdf = (): Buffer =>
  Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
      '2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
    'ascii'
  )
