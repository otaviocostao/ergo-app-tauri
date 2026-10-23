import assert from "node:assert/strict";
import test from "node:test";
import { birthDateBounds, birthDateValidationMessage, dateValue, displayBirthDate, parseBirthDate } from "../src/auth/birthDatePolicy.ts";

const today = new Date(2026, 9, 20, 12);

test("birth date is optional, including whitespace", () => {
  for (const value of ["", "   "]) assert.equal(birthDateValidationMessage(value, today), undefined);
});

test("impossible and incomplete dates receive the invalid-date message", () => {
  for (const value of ["31/02/2000", "29/02/2001", "31/04/2000", "00/01/2000", "01/00/2000", "01/13/2000", "01/01/0000", "20/10/", "not a date", "2000-02-31", "2000-2-01"]) {
    assert.equal(parseBirthDate(value), undefined, value);
    assert.equal(birthDateValidationMessage(value, today), "Informe uma data de nascimento válida no formato DD/MM/AAAA.", value);
  }
});

test("Brazilian and ISO dates round-trip without rolling over leap days", () => {
  for (const value of ["29/02/2000", "2000-02-29", " 29/02/2000 "]) {
    assert.equal(birthDateValidationMessage(value, today), undefined);
    assert.equal(dateValue(parseBirthDate(value)), "2000-02-29");
  }
  assert.equal(displayBirthDate("2000-02-29"), "29/02/2000");
  assert.equal(displayBirthDate("31/02/2000"), "31/02/2000");
});

test("future, too recent and too old dates have distinct messages", () => {
  assert.equal(birthDateValidationMessage("21/10/2026", today), "A data de nascimento não pode estar no futuro.");
  for (const value of ["20/10/2026", "01/01/2026", "21/10/2012"]) {
    assert.equal(birthDateValidationMessage(value, today), "A data de nascimento deve indicar pelo menos 14 anos.");
  }
  assert.equal(birthDateValidationMessage("20/10/1925", today), "A data de nascimento não pode indicar mais de 100 anos.");
});

test("exactly 14 and 100 years are allowed and adjacent dates are checked", () => {
  for (const value of ["2012-10-20", "1926-10-20", "2012-10-19", "1926-10-19", "1925-10-21"]) {
    assert.equal(birthDateValidationMessage(value, today), undefined, value);
  }
  const bounds = birthDateBounds(today);
  assert.equal(dateValue(bounds.earliest), "1925-10-21");
  assert.equal(dateValue(bounds.latest), "2012-10-20");
});

test("leap-day age cutoffs clamp to the last day of February", () => {
  const leapToday = new Date(2024, 1, 29, 12);
  const bounds = birthDateBounds(leapToday);
  assert.equal(dateValue(bounds.latest), "2010-02-28");
  assert.equal(dateValue(bounds.earliest), "1923-03-01");
  assert.equal(birthDateValidationMessage("2010-02-28", leapToday), undefined);
  assert.equal(birthDateValidationMessage("2010-03-01", leapToday), "A data de nascimento deve indicar pelo menos 14 anos.");
});
