import { jsPDF } from "jspdf";
import { describe, expect, it } from "vitest";

import { buildPlanPdf, commonNameSize, fitName, pdfSafe, wrapName } from "./pdf";
import { emptyClass, seatKey, type ClassPlan, type Student } from "./plan";

const students: Student[] = [
  { id: "a", name: "DUPONT Léa", gender: "F" },
  { id: "b", name: "DE LA FONTAINE-SAINT-AUBERT Maximilien", gender: "M" },
  { id: "c", name: "ŁUKASIEWICZ Zoë", gender: null },
];

function plan(extra: Partial<ClassPlan> = {}): ClassPlan {
  return {
    ...emptyClass("6A"),
    students,
    seats: { [seatKey(0, 0, 0)]: "a", [seatKey(2, 5, 1)]: "b", [seatKey(1, 3, 0)]: "c" },
    ...extra,
  };
}

describe("export PDF", () => {
  it("crée une page A4 portrait avec le nom de la classe et tous les élèves placés", () => {
    const doc = buildPlanPdf(jsPDF, plan());
    expect(doc.getNumberOfPages()).toBe(1);
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(210, 0);
    const raw = doc.output();
    for (const t of [
      "6A",
      "Plan de classe",
      "Bureau du professeur",
      "DUPONT",
      "Maximilien",
      "LUKASIEWICZ",
    ])
      expect(raw).toContain(t);
  });

  it("passe en paysage quand la salle est large", () => {
    const doc = buildPlanPdf(jsPDF, plan({ layout: { cols: 4, rows: 5, per: 3 } }));
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(297, 0);
  });

  it("tient sur une page même pour la plus grande salle", () => {
    const many: Student[] = Array.from({ length: 240 }, (_, i) => ({
      id: `s${i}`,
      name: `ÉLÈVE N°${i} Prénom`,
      gender: i % 2 ? "M" : "F",
    }));
    const seats: Record<string, string> = {};
    let i = 0;
    for (let c = 0; c < 6; c++)
      for (let r = 0; r < 10; r++) for (let s = 0; s < 4; s++) seats[seatKey(c, r, s)] = `s${i++}`;
    const doc = buildPlanPdf(jsPDF, {
      ...emptyClass("3R"),
      students: many,
      seats,
      layout: { cols: 6, rows: 10, per: 4 },
    });
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it("écrit le nom le plus grand possible sans couper les mots", () => {
    const doc = new jsPDF({ unit: "mm" });
    doc.setFont("helvetica", "bold");
    const short = fitName(doc, "MURIN Noa", 30, 12);
    const long = fitName(doc, "DE LA FONTAINE-SAINT-AUBERT Maximilien", 30, 12);
    expect(short.size).toBeGreaterThan(long.size);
    expect(short.lines).toEqual(["MURIN Noa"]);
    expect(long.lines.join(" ").replace(/- /g, "-")).toBe("DE LA FONTAINE-SAINT-AUBERT Maximilien");
  });

  it("garde les accents français et remplace les lettres hors alphabet latin", () => {
    expect(pdfSafe("Éloïse Cœur Françoise")).toBe("Éloïse Cœur Françoise");
    expect(pdfSafe("Łukasz Şahin")).toBe("Lukasz Sahin");
  });

  it("coupe un nom composé au trait d'union plutôt qu'au milieu d'un mot", () => {
    const doc = new jsPDF({ unit: "mm" });
    doc.setFont("helvetica", "bold");
    const lines = wrapName(doc, "FONTAINE-SAINT-AUBERT", 20, 10);
    expect(lines.join("")).toBe("FONTAINE-SAINT-AUBERT");
    expect(lines.every((l) => /^[A-Z]+-?$|^[A-Z]+-[A-Z]+-?$/.test(l))).toBe(true);
  });

  it("utilise une taille commune : seuls les noms les plus longs sont plus petits", () => {
    // 6 noms sur 8 tiennent en 11 ou plus
    expect(commonNameSize([14, 14, 13, 12, 12, 11, 9, 6])).toBe(11);
    expect(commonNameSize([])).toBe(14);
  });
});
