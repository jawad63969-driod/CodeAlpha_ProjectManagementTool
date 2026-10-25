/**
 * Content sniffing from the bytes themselves. The client-declared Content-Type
 * is never trusted for anything that affects rendering — that is how a "PNG"
 * turns out to be an HTML file that runs in someone's browser.
 */
const startsWith = (buffer: Buffer, signature: number[], offset = 0): boolean =>
  signature.every((byte, index) => buffer[offset + index] === byte);

export const sniffMimeType = (buffer: Buffer, declared?: string): string => {
  if (buffer.length >= 8 && startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (buffer.length >= 3 && startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (buffer.length >= 6 && (startsWith(buffer, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith(buffer, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))) return 'image/gif';
  if (buffer.length >= 12 && startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (buffer.length >= 5 && startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  if (buffer.length >= 4 && startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) return 'application/zip';

  // Plain text is safe to serve; anything else we cannot identify is a download.
  const sample = buffer.subarray(0, 512);
  const printable = sample.every((byte) => byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte < 127));
  if (printable && sample.length > 0) {
    if (declared === 'text/csv') return 'text/csv';
    if (declared === 'application/json') return 'application/json';
    return 'text/plain';
  }
  return 'application/octet-stream';
};

/** Only these render inline; everything else is forced to download. */
export const isInlineSafe = (mimeType: string): boolean =>
  ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'].includes(mimeType);
