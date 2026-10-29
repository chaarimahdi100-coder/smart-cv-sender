import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAndExtractCV,
  extractUniversity,
  extractDegree,
  extractCandidateName,
} from "../cv-parser.ts";

/**
 * Creates a valid minimal single-page PDF with embedded text stream.
 */
function createSyntheticPdf(text: string): Uint8Array {
  const escaped = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const stream = `BT /F1 12 Tf 50 700 Td (${escaped}) Tj ET`;
  const streamBytes = Buffer.byteLength(stream, "utf-8");
  const pdfSource = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${streamBytes} >> stream
${stream}
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000117 00000 n 
0000000247 00000 n 
0000000341 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
419
%%EOF`;
  return new Uint8Array(Buffer.from(pdfSource, "utf-8"));
}

test("CV Parser: successfully parses valid PDF and extracts verifiable candidate data", async () => {
  const cvText = "Yassine Salem yassine.salem@example.com INSAT Diplome d'ingenieur Genie Logiciel Francais Anglais";
  const pdfBytes = createSyntheticPdf(cvText);

  const result = await parseAndExtractCV(pdfBytes);

  assert.equal(result.unreadable, false, "PDF should be readable");
  assert.equal(result.method, "local_pdf_text");
  assert.ok(result.rawTextLength > 0, "Should have positive text length");

  // Verified extracted fields
  assert.equal(result.data.email, "yassine.salem@example.com");
  assert.equal(result.data.first_name, "Yassine");
  assert.equal(result.data.last_name, "Salem");
  assert.match(result.data.school || "", /INSAT/i);
  assert.match(result.data.degree || "", /ingénieur/i);
  assert.equal(result.data.specialty, "Software Engineering");
  assert.deepEqual(result.data.languages, ["French", "English"]);
});

test("CV Parser: handles empty and unreadable PDF without inventing mock data", async () => {
  // Empty PDF stream with no text
  const emptyPdf = createSyntheticPdf("");
  const result = await parseAndExtractCV(emptyPdf);

  assert.equal(result.unreadable, true, "Empty PDF should be flagged unreadable");
  assert.equal(result.data.first_name, undefined, "Must NOT contain MockFirst");
  assert.equal(result.data.last_name, undefined, "Must NOT contain MockLast");
  assert.equal(result.data.school, undefined, "Must NOT contain Mock University");
  assert.equal(result.data.degree, undefined, "Must NOT contain Mock degree");
  assert.ok(result.warnings.length > 0, "Should contain warning for user");
});

test("CV Parser: handles missing fields cleanly and leaves them undefined", async () => {
  // PDF that only contains an email and no school or degree
  const partialText = "developer@example.com";
  const pdfBytes = createSyntheticPdf(partialText);

  const result = await parseAndExtractCV(pdfBytes);

  assert.equal(result.unreadable, false);
  assert.equal(result.data.email, "developer@example.com");
  assert.equal(result.data.school, undefined, "Missing school must remain undefined");
  assert.equal(result.data.degree, undefined, "Missing degree must remain undefined");
  assert.equal(result.data.specialty, undefined, "Missing specialty must remain undefined");
  assert.equal(result.data.languages, undefined, "Missing languages must remain undefined");
});

test("CV Parser: handles corrupted and invalid binary data gracefully", async () => {
  const corruptedBytes = new Uint8Array([0x00, 0x12, 0xff, 0xaa, 0xbb]);
  const result = await parseAndExtractCV(corruptedBytes);

  assert.equal(result.unreadable, true, "Corrupted data should be marked unreadable");
  assert.deepEqual(result.data, {}, "Data should be empty for corrupted input");
  assert.ok(result.warnings.length > 0, "Should include error warning");
});

test("CV Parser: extractCandidateName ignores section headers and labels", () => {
  const textWithHeaders = `CURRICULUM VITAE
EXPÉRIENCE PROFESSIONNELLE
FORMATION ACADÉMIQUE
Amine Gharbi
amine@test.com`;

  const { first_name, last_name } = extractCandidateName(textWithHeaders);
  assert.equal(first_name, "Amine");
  assert.equal(last_name, "Gharbi");
});

test("CV Parser: extractUniversity matches top Tunisian and international institutions", () => {
  assert.match(extractUniversity("Etudiant a l'INSAT en 5eme annee") || "", /INSAT/);
  assert.match(extractUniversity("Diplômé de SUP'COM") || "", /SUP'COM/);
  assert.match(extractUniversity("École Polytechnique (l'X) Paris") || "", /Polytechnique/);
  assert.match(extractUniversity("Études à l'EPFL Lausanne") || "", /EPFL/);
  assert.equal(extractUniversity("Some random unaccredited entity"), undefined);
});

test("CV Parser: extractDegree matches multiple international diploma types", () => {
  assert.match(extractDegree("Obtention du Cycle Ingénieur en 2024") || "", /ingénieur/i);
  assert.match(extractDegree("Titulaire d'un Master Professionnel") || "", /Master/i);
  assert.match(extractDegree("Licence Fondamentale en Informatique") || "", /Licence/i);
  assert.match(extractDegree("Diplôme de BTS Informatique") || "", /BTS/i);
  assert.match(extractDegree("Executive MBA Promotion 2023") || "", /MBA/i);
  assert.match(extractDegree("Doctorat en Informatique") || "", /Doctorat/i);
  assert.equal(extractDegree("Attestation de participation"), undefined);
});
