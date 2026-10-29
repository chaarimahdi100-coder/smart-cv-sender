import test from "node:test";
import assert from "node:assert/strict";
import { searchCuratedUniversities, CURATED_UNIVERSITIES } from "../education/universities.ts";
import { searchDegrees } from "../education/degrees.ts";
import { sanitizeProfileData } from "../profile-utils.ts";

test("Education: searchCuratedUniversities finds institutions by acronym", () => {
  const insat = searchCuratedUniversities("INSAT");
  assert.ok(insat.length > 0, "Should find INSAT");
  assert.match(insat[0].name, /INSAT/i);

  const enit = searchCuratedUniversities("ENIT");
  assert.ok(enit.length > 0, "Should find ENIT");

  const epfl = searchCuratedUniversities("EPFL");
  assert.ok(epfl.length > 0, "Should find EPFL");
  assert.equal(epfl[0].country, "Switzerland");
});

test("Education: searchCuratedUniversities finds institutions by country and city keywords", () => {
  const tunisianSchools = searchCuratedUniversities("Tunisia", 50);
  assert.ok(tunisianSchools.length >= 10, "Should have rich coverage of Tunisian schools");
  assert.ok(tunisianSchools.every((u) => u.country === "Tunisia" || u.name.includes("Tunis")));

  const sorbonne = searchCuratedUniversities("Sorbonne");
  assert.ok(sorbonne.length > 0, "Should find Sorbonne");
  assert.equal(sorbonne[0].country, "France");
});

test("Education: searchCuratedUniversities returns defaults on empty string and enforces limit", () => {
  const all = searchCuratedUniversities("", 5);
  assert.equal(all.length, 5);
  assert.equal(all[0].name, CURATED_UNIVERSITIES[0].name);
});

test("Education: searchDegrees finds qualifications by name, category, and alias", () => {
  const ing = searchDegrees("ingénieur");
  assert.ok(ing.length > 0, "Should find engineering degrees");
  assert.match(ing[0].name, /ingénieur/i);

  const licence = searchDegrees("licence");
  assert.ok(licence.length >= 2, "Should find Licence Appliquée and Fondamentale");

  const bts = searchDegrees("BTS");
  assert.ok(bts.length > 0, "Should find BTS");
  assert.equal(bts[0].level, "Bac+2");

  const mba = searchDegrees("MBA");
  assert.ok(mba.length > 0, "Should find MBA");

  const phd = searchDegrees("Doctorat");
  assert.ok(phd.length > 0, "Should find PhD / Doctorat");
});

test("Education: searchDegrees matches aliases like 'Cycle Ingénieur' and 'Prépa'", () => {
  const cycleIng = searchDegrees("Cycle Ingénieur");
  assert.ok(cycleIng.length > 0, "Should match alias Cycle Ingénieur");

  const prepa = searchDegrees("Prépa");
  assert.ok(prepa.length > 0, "Should match alias Prépa for CPGE");
});

test("Education: Profile sanitization correctly persists both standard and custom school & degree values", () => {
  const user = { id: "user-test-789", email: "candidate@smartcv.dev" };

  // 1. Standard autocompleted values
  const fdStandard = new FormData();
  fdStandard.append("first_name", "Karim");
  fdStandard.append("last_name", "Mejri");
  fdStandard.append("school", "INSAT - Institut National des Sciences Appliquées et de Technologie");
  fdStandard.append("degree", "Diplôme d'ingénieur (National Engineering Degree)");

  const standardProfile = sanitizeProfileData(user, fdStandard);
  assert.equal(standardProfile.school, "INSAT - Institut National des Sciences Appliquées et de Technologie");
  assert.equal(standardProfile.degree, "Diplôme d'ingénieur (National Engineering Degree)");

  // 2. Custom institution and degree values
  const fdCustom = new FormData();
  fdCustom.append("first_name", "Sara");
  fdCustom.append("last_name", "Trabelsi");
  fdCustom.append("school", "International Institute of Advanced Studies (Custom Institute)");
  fdCustom.append("degree", "Specialized Professional Master in Cloud Architecture");

  const customProfile = sanitizeProfileData(user, fdCustom);
  assert.equal(customProfile.school, "International Institute of Advanced Studies (Custom Institute)");
  assert.equal(customProfile.degree, "Specialized Professional Master in Cloud Architecture");
});
