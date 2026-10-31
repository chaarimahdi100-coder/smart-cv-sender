import test from "node:test";
import assert from "node:assert/strict";
import { validatePdfMagicBytes, extractRawPdfText } from "../cv-parser.ts";

test("Upload Security: validatePdfMagicBytes validates genuine %PDF- magic bytes header", () => {
  // 1. Standard PDF header %PDF-1.4
  const standardPdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  assert.equal(validatePdfMagicBytes(standardPdf), true);

  // 2. PDF header with leading UTF-8 BOM or whitespace within first 1024 bytes
  const pdfWithLeadingBytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  assert.equal(validatePdfMagicBytes(pdfWithLeadingBytes), true);

  // 3. Plain text file masquerading with .pdf extension
  const textMasquerade = new TextEncoder().encode("Hello, this is just plain text content.");
  assert.equal(validatePdfMagicBytes(textMasquerade), false);

  // 4. HTML script / webpage masquerading with .pdf extension
  const htmlMasquerade = new TextEncoder().encode("<!DOCTYPE html><html><body>Script</body></html>");
  assert.equal(validatePdfMagicBytes(htmlMasquerade), false);

  // 5. Windows executable (MZ header) masquerading with .pdf extension
  const exeMasquerade = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
  assert.equal(validatePdfMagicBytes(exeMasquerade), false);

  // 6. Empty buffer
  assert.equal(validatePdfMagicBytes(new Uint8Array([])), false);

  // 7. Truncated buffer (< 5 bytes)
  assert.equal(validatePdfMagicBytes(new Uint8Array([0x25, 0x50, 0x44])), false);
});

test("Upload Security: extractRawPdfText rejects files lacking genuine PDF magic bytes header", async () => {
  const fakePdf = new TextEncoder().encode("This is not a real PDF file.");

  await assert.rejects(
    async () => {
      await extractRawPdfText(fakePdf);
    },
    {
      message: /lacks genuine %PDF- magic bytes header/i,
    }
  );
});
