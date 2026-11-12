import { describe, expect, it } from "vitest";

import {
  applyImport,
  autoPlace,
  canonicalClassName,
  CLASS_NAMES,
  conflictPairs,
  detectMapping,
  emptyClass,
  frontMisses,
  loadState,
  moveStudent,
  parseGender,
  pdfFileName,
  rowsToStudents,
  seatKey,
  withLayout,
  type ClassPlan,
  type Student,
} from "./plan";

// Générateur pseudo-aléatoire déterministe pour des tests reproductibles
function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function classWith(students: Student[], extra: Partial<ClassPlan> = {}): ClassPlan {
  return { ...emptyClass("5e B"), students, ...extra };
}

const kids = (n: number): Student[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    name: `Élève ${i}`,
    gender: i % 2 ? "M" : "F",
  }));

describe("import Excel", () => {
  it("garde les élèves dont le nom commence par « Nom » ou « Élève » (ancien bug)", () => {
    const rows = [
      ["Nom et prénom", "", "", "Sexe"],
      ["NOMENJANAHARY Tiana", "", "", "F"],
      ["NOMURA Ken", "", "", "M"],
      ["ELEVELD Sara", "", "", "Féminin"],
      ["DUPONT Léa", "", "", "Fille"],
    ];
    const m = detectMapping(rows);
    expect(m).toEqual({ skip: 1, name: 0, firstName: null, gender: 3 });
    expect(rowsToStudents(rows, m).map((s) => s.name)).toEqual([
      "NOMENJANAHARY Tiana",
      "NOMURA Ken",
      "ELEVELD Sara",
      "DUPONT Léa",
    ]);
  });

  it("sans ligne de titres, ne saute aucune ligne et trouve la colonne du genre", () => {
    const rows = [
      ["Nomura Ken", "12/03/2013", "5B", "Masculin"],
      ["Martin Zoé", "01/02/2013", "5B", "Féminin"],
    ];
    const m = detectMapping(rows);
    expect(m.skip).toBe(0);
    const list = rowsToStudents(rows, m);
    expect(list).toEqual([
      { name: "Nomura Ken", gender: "M" },
      { name: "Martin Zoé", gender: "F" },
    ]);
  });

  it("repère un en-tête sous une ligne de titre, des colonnes Nom / Prénom séparées et le genre G/F", () => {
    const rows = [
      ["Liste des élèves — 5e B"],
      ["N°", "Nom", "Prénom", "Sexe", "Né(e) le"],
      [1, "DURAND", "Paul", "G", ""],
      [2, "BERNARD", "Inès", "F", ""],
      ["Total : 2 élèves"],
    ];
    const m = detectMapping(rows);
    expect(m).toEqual({ skip: 2, name: 1, firstName: 2, gender: 3 });
    expect(rowsToStudents(rows, m)).toEqual([
      { name: "DURAND Paul", gender: "M" },
      { name: "BERNARD Inès", gender: "F" },
    ]);
  });

  it("ne prend pas un prénom commençant par M pour un genre", () => {
    expect(parseGender("Martin")).toBeNull();
    expect(parseGender("Fabien")).toBeNull();
    expect(parseGender(" f ")).toBe("F");
    expect(parseGender("Garçon")).toBe("M");
  });

  it("réimporter la liste garde les places des élèves inchangés", () => {
    const cls = classWith(
      [
        { id: "a", name: "Léa Dupont", gender: "F" },
        { id: "b", name: "Paul Durand", gender: "M" },
      ],
      { seats: { [seatKey(0, 0, 0)]: "a", [seatKey(0, 0, 1)]: "b" } },
    );
    const { cls: next, kept } = applyImport(cls, [
      { name: "Léa Dupont", gender: "F" },
      { name: "Inès Bernard", gender: "F" },
    ]);
    expect(kept).toBe(1);
    const lea = next.students.find((s) => s.name === "Léa Dupont");
    expect(next.seats[seatKey(0, 0, 0)]).toBe(lea?.id);
    expect(Object.keys(next.seats)).toHaveLength(1);
  });
});

describe("déplacements et salle", () => {
  it("échange deux élèves quand on pose sur une place occupée", () => {
    const seats = moveStudent({ "0-0-0": "a", "0-0-1": "b" }, "a", "0-0-1");
    expect(seats).toEqual({ "0-0-0": "b", "0-0-1": "a" });
  });

  it("réduire la salle remet dans la liste les élèves des places supprimées, en gardant l'avant", () => {
    const cls = classWith(kids(3), { seats: { "0-0-0": "s0", "0-5-0": "s1", "2-0-1": "s2" } });
    const { cls: next, removed } = withLayout(cls, { rows: 3, cols: 2 });
    expect(removed).toBe(2);
    expect(next.seats).toEqual({ "0-0-0": "s0" });
  });

  it("borne les dimensions de la salle", () => {
    const { cls } = withLayout(emptyClass(), { rows: 99, cols: 0, per: 3 });
    expect(cls.layout).toEqual({ rows: 10, cols: 1, per: 3 });
  });
});

describe("placement automatique", () => {
  it("place tout le monde, de l'avant vers le fond", () => {
    const cls = classWith(kids(10));
    const r = autoPlace(cls, { mode: "random", keepPlaced: false, rng: seeded() });
    expect(r.left).toBe(0);
    expect(Object.keys(r.seats)).toHaveLength(10);
    // 3 colonnes × 2 places = 6 places par rangée → rangées 0 et 1 seulement
    expect(Object.keys(r.seats).every((k) => Number(k.split("-")[1]) <= 1)).toBe(true);
  });

  it("signale les élèves sans place quand la salle est trop petite", () => {
    const cls = classWith(kids(40));
    expect(autoPlace(cls, { mode: "random", keepPlaced: false, rng: seeded() }).left).toBe(4);
  });

  it("ne met jamais côte à côte les élèves à séparer", () => {
    const students = kids(30);
    const apart: [string, string][] = [
      ["s0", "s1"],
      ["s0", "s2"],
      ["s3", "s4"],
      ["s5", "s6"],
      ["s7", "s8"],
    ];
    for (let seed = 1; seed < 20; seed++) {
      const cls = classWith(students, { constraints: { front: [], apart } });
      const r = autoPlace(cls, { mode: "alternate", keepPlaced: false, rng: seeded(seed) });
      expect(conflictPairs({ ...cls, seats: r.seats })).toBe(0);
    }
  });

  it("met devant les élèves prioritaires", () => {
    const cls = classWith(kids(30), { constraints: { front: ["s20", "s25", "s29"], apart: [] } });
    const r = autoPlace(cls, { mode: "random", keepPlaced: false, rng: seeded(7) });
    expect(frontMisses({ ...cls, seats: r.seats })).toEqual([]);
  });

  it("alterne filles et garçons à la même table quand c'est possible", () => {
    const cls = classWith(kids(24));
    const r = autoPlace(cls, { mode: "alternate", keepPlaced: false, rng: seeded(3) });
    expect(r.sameGenderPairs).toBe(0);
  });

  it("garde les élèves déjà placés si on le demande", () => {
    const cls = classWith(kids(6), { seats: { "2-5-1": "s0" } });
    const r = autoPlace(cls, { mode: "random", keepPlaced: true, rng: seeded() });
    expect(r.seats["2-5-1"]).toBe("s0");
    expect(Object.keys(r.seats)).toHaveLength(6);
  });
});

describe("enregistrement dans le navigateur", () => {
  it("convertit l'ancien plan (rangée 5 = devant) vers le nouveau format", () => {
    const v1 = JSON.stringify({
      className: "4e A",
      students: [{ id: "0-Léa", name: "Léa", gender: "F" }],
      seats: { "1-5-0": "0-Léa", "1-8-0": "0-Léa" },
    });
    const state = loadState(null, v1);
    expect(state.classes).toHaveLength(1);
    const cls = state.classes[0] as ClassPlan;
    expect(cls.name).toBe("4A"); // ancien nom libre ramené à la liste
    expect(cls.seats).toEqual({ "1-0-0": "0-Léa" });
  });
});

describe("nom de la classe et export PDF", () => {
  it("propose les 12 classes dans l'ordre demandé", () => {
    expect(CLASS_NAMES.join(";")).toBe("6A;6D;6R;5A;5D;5R;4A;4D;4R;3A;3D;3R");
  });

  it("ramène les anciens noms libres à la liste quand c'est possible", () => {
    expect(canonicalClassName("3R")).toBe("3R");
    expect(canonicalClassName(" 3r ")).toBe("3R");
    expect(canonicalClassName("6e A")).toBe("6A");
    expect(canonicalClassName("5ème D")).toBe("5D");
    expect(canonicalClassName("5e B")).toBeNull();
    expect(canonicalClassName("Nouvelle classe")).toBeNull();
  });

  it("nomme le fichier Classe_plandeclasse_JJ.MM.AAAA", () => {
    expect(pdfFileName("6A", new Date(2026, 10, 9))).toBe("6A_plandeclasse_09.11.2026");
    expect(pdfFileName("3R", new Date(2027, 0, 25))).toBe("3R_plandeclasse_25.01.2027");
  });
});
