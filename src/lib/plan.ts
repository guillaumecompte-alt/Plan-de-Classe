// Logique du plan de classe, sans interface : classes, salle, import Excel,
// placement automatique et enregistrement dans le navigateur. Tout est pur et testé (plan.test.ts).

export type Gender = "F" | "M" | null;
export type Student = { id: string; name: string; gender: Gender };

/** Salle : `cols` colonnes de tables, `rows` rangées, `per` places par table. */
export type Layout = { cols: number; rows: number; per: number };

/** Contraintes de placement automatique (identifiants d'élèves). */
export type Constraints = { front: string[]; apart: [string, string][] };

export type ClassPlan = {
  id: string;
  name: string;
  students: Student[];
  /** clé de place `c-r-s` → identifiant d'élève. La rangée r = 0 est la plus proche du bureau. */
  seats: Record<string, string>;
  layout: Layout;
  constraints: Constraints;
};

export type AppState = { classes: ClassPlan[]; currentId: string };

export const STORAGE_V1 = "plan-de-classe-v1";
export const STORAGE_V2 = "plan-de-classe-v2";

export const LIMITS = {
  cols: { min: 1, max: 6 },
  rows: { min: 1, max: 10 },
  per: { min: 1, max: 4 },
} as const;
export const DEFAULT_LAYOUT: Layout = { cols: 3, rows: 6, per: 2 };
/** Nombre de rangées considérées comme « devant » pour les élèves prioritaires. */
export const FRONT_ROWS = 2;

/** Classes proposées dans le menu « Nom de la classe », dans cet ordre. */
export const CLASS_NAMES = [
  "6A",
  "6D",
  "6R",
  "5A",
  "5D",
  "5R",
  "4A",
  "4D",
  "4R",
  "3A",
  "3D",
  "3R",
] as const;
export type ClassName = (typeof CLASS_NAMES)[number];

/**
 * Ramène un nom saisi librement (anciennes versions) à un nom de la liste :
 * « 3r », « 3 R », « 3e R », « 3ème R » → « 3R ». Renvoie null s'il ne correspond à aucune classe.
 */
export function canonicalClassName(name: string): ClassName | null {
  const n = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^(\d)(EME|E)(?=[A-Z]$)/, "$1");
  return (CLASS_NAMES as readonly string[]).includes(n) ? (n as ClassName) : null;
}

export const isValidClassName = (name: string) => (CLASS_NAMES as readonly string[]).includes(name);

/** Nom du fichier PDF : « 6A_plandeclasse_09.11.2026 » (date du jour de l'export). */
export function pdfFileName(className: string, date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${className}_plandeclasse_${dd}.${mm}.${date.getFullYear()}`;
}

export const seatKey = (c: number, r: number, s: number) => `${c}-${r}-${s}`;

export function parseSeatKey(k: string): { c: number; r: number; s: number } | null {
  const m = /^(\d+)-(\d+)-(\d+)$/.exec(k);
  if (!m) return null;
  return { c: Number(m[1]), r: Number(m[2]), s: Number(m[3]) };
}

export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)));

export function clampLayout(l: Partial<Layout>): Layout {
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    cols: clamp(num(l.cols, DEFAULT_LAYOUT.cols), LIMITS.cols.min, LIMITS.cols.max),
    rows: clamp(num(l.rows, DEFAULT_LAYOUT.rows), LIMITS.rows.min, LIMITS.rows.max),
    per: clamp(num(l.per, DEFAULT_LAYOUT.per), LIMITS.per.min, LIMITS.per.max),
  };
}

export const capacity = (l: Layout) => l.cols * l.rows * l.per;

export function emptyClass(name = ""): ClassPlan {
  return {
    id: newId(),
    name,
    students: [],
    seats: {},
    layout: { ...DEFAULT_LAYOUT },
    constraints: { front: [], apart: [] },
  };
}

// ---------------------------------------------------------------------------
// Cohérence d'une classe

/** Retire les places hors salle, les élèves inconnus, les doublons et les contraintes orphelines. */
export function normalizeClass(cls: ClassPlan): ClassPlan {
  const ids = new Set(cls.students.map((s) => s.id));
  const seats: Record<string, string> = {};
  const used = new Set<string>();
  for (const [k, id] of Object.entries(cls.seats)) {
    const p = parseSeatKey(k);
    if (!p || !ids.has(id) || used.has(id)) continue;
    if (p.c >= cls.layout.cols || p.r >= cls.layout.rows || p.s >= cls.layout.per) continue;
    seats[k] = id;
    used.add(id);
  }
  const front = [...new Set(cls.constraints.front.filter((id) => ids.has(id)))];
  const seen = new Set<string>();
  const apart: [string, string][] = [];
  for (const [a, b] of cls.constraints.apart) {
    if (a === b || !ids.has(a) || !ids.has(b)) continue;
    const key = [a, b].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    apart.push([a, b]);
  }
  return { ...cls, seats, constraints: { front, apart } };
}

/** Change la salle ; renvoie aussi le nombre d'élèves remis dans la liste. */
export function withLayout(
  cls: ClassPlan,
  layout: Partial<Layout>,
): { cls: ClassPlan; removed: number } {
  const next = normalizeClass({ ...cls, layout: clampLayout({ ...cls.layout, ...layout }) });
  return { cls: next, removed: Object.keys(cls.seats).length - Object.keys(next.seats).length };
}

/** Pose un élève sur une place (null = le remettre dans la liste). Échange si la place est prise. */
export function moveStudent(seats: Record<string, string>, id: string, target: string | null) {
  const next = { ...seats };
  const from = Object.keys(next).find((k) => next[k] === id);
  if (from === target) return next;
  if (from) delete next[from];
  if (target) {
    const occupant = next[target];
    if (occupant && from) next[from] = occupant;
    next[target] = id;
  }
  return next;
}

// ---------------------------------------------------------------------------
// Lecture des données enregistrées dans le navigateur

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function readGender(v: unknown): Gender {
  return v === "F" || v === "M" ? v : null;
}

/** Valide une classe venant de l'extérieur ; null si inutilisable. */
export function sanitizeClass(raw: unknown): ClassPlan | null {
  if (!isObj(raw)) return null;
  const studentsRaw = Array.isArray(raw["students"]) ? raw["students"] : [];
  const students: Student[] = [];
  const ids = new Set<string>();
  for (const s of studentsRaw) {
    if (!isObj(s)) continue;
    const name = typeof s["name"] === "string" ? s["name"].trim() : "";
    let id = typeof s["id"] === "string" && s["id"] ? s["id"] : newId();
    if (!name) continue;
    if (ids.has(id)) id = newId();
    ids.add(id);
    students.push({ id, name, gender: readGender(s["gender"]) });
  }
  const seats: Record<string, string> = {};
  if (isObj(raw["seats"])) {
    for (const [k, v] of Object.entries(raw["seats"])) if (typeof v === "string") seats[k] = v;
  }
  const layout = clampLayout(isObj(raw["layout"]) ? (raw["layout"] as Partial<Layout>) : {});
  const c = isObj(raw["constraints"]) ? raw["constraints"] : {};
  const front = Array.isArray(c["front"])
    ? c["front"].filter((x): x is string => typeof x === "string")
    : [];
  const apart = Array.isArray(c["apart"])
    ? c["apart"].filter(
        (p): p is [string, string] =>
          Array.isArray(p) &&
          p.length === 2 &&
          typeof p[0] === "string" &&
          typeof p[1] === "string",
      )
    : [];
  return normalizeClass({
    id: typeof raw["id"] === "string" && raw["id"] ? raw["id"] : newId(),
    // Les anciens noms libres (« 3r », « 3e R ») sont ramenés à la liste quand c'est possible
    name:
      typeof raw["name"] === "string"
        ? (canonicalClassName(raw["name"]) ?? raw["name"].trim())
        : "",
    students,
    seats,
    layout,
    constraints: { front, apart },
  });
}

/** Ancien format (une seule classe, 3×6×2, rangée 5 = devant). */
export function migrateV1(raw: unknown): ClassPlan | null {
  if (!isObj(raw)) return null;
  const seats: Record<string, string> = {};
  if (isObj(raw["seats"])) {
    for (const [k, v] of Object.entries(raw["seats"])) {
      const p = parseSeatKey(k);
      // Les places au-delà des 6 rangées sont libérées (anciens plans à 11 rangées)
      if (!p || p.r >= 6 || typeof v !== "string") continue;
      seats[seatKey(p.c, 5 - p.r, p.s)] = v;
    }
  }
  return sanitizeClass({
    name: typeof raw["className"] === "string" ? raw["className"] : "",
    students: raw["students"],
    seats,
    layout: DEFAULT_LAYOUT,
  });
}

export function loadState(v2: string | null, v1: string | null): AppState {
  const parse = (t: string | null): unknown => {
    if (!t) return null;
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  };
  const data = parse(v2);
  if (isObj(data) && Array.isArray(data["classes"])) {
    const classes = data["classes"].map(sanitizeClass).filter((c): c is ClassPlan => c !== null);
    if (classes.length) {
      const cur = typeof data["currentId"] === "string" ? data["currentId"] : "";
      const first = classes[0] as ClassPlan;
      return { classes, currentId: classes.some((c) => c.id === cur) ? cur : first.id };
    }
  }
  const old = migrateV1(parse(v1));
  const cls = old ?? emptyClass();
  return { classes: [cls], currentId: cls.id };
}

// ---------------------------------------------------------------------------
// Import d'une liste Excel / CSV

/** Correspondance des colonnes : `skip` lignes ignorées en haut (titres), index de colonnes. */
export type Mapping = {
  skip: number;
  name: number;
  firstName: number | null;
  gender: number | null;
};

const norm = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[:.*]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

const NAME_HEADERS = new Set([
  "nom",
  "noms",
  "eleve",
  "eleves",
  "nom et prenom",
  "nom et prenoms",
  "nom prenom",
  "nom prenoms",
  "nom/prenom",
  "nom / prenom",
  "nom - prenom",
  "nom, prenom",
  "nom de l'eleve",
  "nom de l’eleve",
  "nom eleve",
  "nom complet",
  "identite",
  "apprenant",
  "apprenants",
]);
const FIRST_NAME_HEADERS = new Set(["prenom", "prenoms"]);
const GENDER_HEADERS = new Set([
  "sexe",
  "genre",
  "s",
  "g",
  "f/m",
  "f/g",
  "m/f",
  "g/f",
  "fille/garcon",
  "sexe (f/m)",
]);
const isGenderHeader = (h: string) =>
  GENDER_HEADERS.has(h) || h.startsWith("sexe") || h.startsWith("genre");

export function parseGender(v: unknown): Gender {
  const g = norm(v);
  if (!g) return null;
  if (["f", "fille", "femme", "feminin", "fem"].includes(g) || g.startsWith("feminin")) return "F";
  if (
    ["m", "g", "h", "garcon", "homme", "masculin", "masc"].includes(g) ||
    g.startsWith("masculin")
  )
    return "M";
  return null;
}

const cellsOf = (row: unknown) => (Array.isArray(row) ? (row as unknown[]) : []);

/** Devine la ligne de titres (dans les 5 premières lignes) et les colonnes utiles. */
export function detectMapping(rows: unknown[][]): Mapping {
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const cells = cellsOf(rows[i]).map(norm);
    const name = cells.findIndex((h) => NAME_HEADERS.has(h));
    const first = cells.findIndex((h) => FIRST_NAME_HEADERS.has(h));
    if (name === -1 && first === -1) continue;
    const gender = cells.findIndex(isGenderHeader);
    const nameCol = name !== -1 ? name : first;
    const separateFirst =
      name !== -1 && first !== -1 && cells[name] !== undefined && /^noms?$/.test(cells[name] ?? "");
    return {
      skip: i + 1,
      name: nameCol,
      firstName: separateFirst ? first : null,
      gender: gender === -1 ? guessGenderColumn(rows.slice(i + 1), nameCol) : gender,
    };
  }
  return { skip: 0, name: 0, firstName: null, gender: guessGenderColumn(rows, 0) };
}

/** Colonne dont la plupart des valeurs sont F/M/fille/garçon… (de préférence la 4e, l'ancien format). */
function guessGenderColumn(rows: unknown[][], nameCol: number): number | null {
  const width = Math.max(0, ...rows.map((r) => cellsOf(r).length));
  const order = [3, ...Array.from({ length: width }, (_, i) => i).filter((i) => i !== 3)];
  for (const col of order) {
    if (col === nameCol || col >= width) continue;
    let filled = 0;
    let genders = 0;
    for (const r of rows) {
      const v = cellsOf(r)[col];
      if (norm(v) === "") continue;
      filled++;
      if (parseGender(v)) genders++;
    }
    if (filled >= Math.max(1, rows.length / 2) && genders / filled >= 0.8) return col;
  }
  return null;
}

export function rowsToStudents(rows: unknown[][], m: Mapping): { name: string; gender: Gender }[] {
  const out: { name: string; gender: Gender }[] = [];
  for (const row of rows.slice(m.skip)) {
    const cells = cellsOf(row);
    const clean = (v: unknown) =>
      String(v ?? "")
        .replace(/\s+/g, " ")
        .trim();
    const parts = [clean(cells[m.name])];
    if (m.firstName !== null) parts.push(clean(cells[m.firstName]));
    const name = parts.filter(Boolean).join(" ");
    if (!name) continue;
    const n = norm(name);
    // Lignes de total en bas d'export (« Total : 28 élèves », « Effectif 28 »)
    if (/^(total|effectif)/.test(n) && /\d/.test(n)) continue;
    out.push({ name, gender: m.gender === null ? null : parseGender(cells[m.gender]) });
  }
  return out;
}

/** Remplace la liste d'une classe ; garde la place des élèves dont le nom n'a pas changé. */
export function applyImport(
  cls: ClassPlan,
  list: { name: string; gender: Gender }[],
): { cls: ClassPlan; kept: number } {
  const pool = new Map<string, Student[]>();
  for (const s of cls.students) {
    const k = norm(s.name);
    pool.set(k, [...(pool.get(k) ?? []), s]);
  }
  const idMap = new Map<string, string>(); // ancien id → nouvel id
  const students: Student[] = list.map((s) => {
    const prev = pool.get(norm(s.name))?.shift();
    const id = newId();
    if (prev) idMap.set(prev.id, id);
    return { id, name: s.name, gender: s.gender };
  });
  const seats: Record<string, string> = {};
  for (const [k, id] of Object.entries(cls.seats)) {
    const nid = idMap.get(id);
    if (nid) seats[k] = nid;
  }
  const remap = (id: string) => idMap.get(id);
  const front = cls.constraints.front.map(remap).filter((x): x is string => !!x);
  const apart = cls.constraints.apart
    .map(([a, b]) => [remap(a), remap(b)] as const)
    .filter((p): p is readonly [string, string] => !!p[0] && !!p[1])
    .map(([a, b]) => [a, b] as [string, string]);
  const next = normalizeClass({ ...cls, students, seats, constraints: { front, apart } });
  return { cls: next, kept: Object.keys(next.seats).length };
}

// ---------------------------------------------------------------------------
// Placement automatique

type Pos = { key: string; x: number; y: number; desk: string };

/** Places de la salle, de l'avant vers le fond. x : position dans la rangée, toutes tables confondues. */
export function seatList(l: Layout): Pos[] {
  const out: Pos[] = [];
  for (let r = 0; r < l.rows; r++)
    for (let c = 0; c < l.cols; c++)
      for (let s = 0; s < l.per; s++)
        out.push({ key: seatKey(c, r, s), x: c * l.per + s, y: r, desk: `${c}-${r}` });
  return out;
}

/** Deux places sont voisines si elles se touchent (côte à côte, devant/derrière ou en diagonale). */
export function neighborMap(l: Layout): Map<string, string[]> {
  const list = seatList(l);
  const map = new Map<string, string[]>();
  for (const a of list) {
    map.set(
      a.key,
      list
        .filter((b) => b.key !== a.key && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1)
        .map((b) => b.key),
    );
  }
  return map;
}

function apartSets(cls: ClassPlan) {
  const m = new Map<string, Set<string>>();
  for (const [a, b] of cls.constraints.apart) {
    m.set(a, (m.get(a) ?? new Set()).add(b));
    m.set(b, (m.get(b) ?? new Set()).add(a));
  }
  return m;
}

/** Places où deux élèves « à séparer » sont voisins. */
export function conflictSeats(cls: ClassPlan): Set<string> {
  const apart = apartSets(cls);
  const out = new Set<string>();
  if (!apart.size) return out;
  const neigh = neighborMap(cls.layout);
  for (const [k, id] of Object.entries(cls.seats)) {
    const avoid = apart.get(id);
    if (!avoid) continue;
    for (const n of neigh.get(k) ?? []) {
      const other = cls.seats[n];
      if (other && avoid.has(other)) {
        out.add(k);
        out.add(n);
      }
    }
  }
  return out;
}

/** Nombre de paires « à séparer » assises côte à côte. */
export function conflictPairs(cls: ClassPlan): number {
  const where = new Map(Object.entries(cls.seats).map(([k, id]) => [id, k]));
  const neigh = neighborMap(cls.layout);
  return cls.constraints.apart.filter(([a, b]) => {
    const ka = where.get(a);
    const kb = where.get(b);
    return !!ka && !!kb && (neigh.get(ka) ?? []).includes(kb);
  }).length;
}

/** Élèves prioritaires « devant » placés hors des premières rangées. */
export function frontMisses(cls: ClassPlan): string[] {
  const where = new Map(Object.entries(cls.seats).map(([k, id]) => [id, k]));
  return cls.constraints.front.filter((id) => {
    const k = where.get(id);
    const p = k ? parseSeatKey(k) : null;
    return !p || p.r >= FRONT_ROWS;
  });
}

export type PlaceMode = "random" | "alternate";
export type PlaceOptions = {
  mode: PlaceMode;
  keepPlaced: boolean;
  rng?: () => number;
  tries?: number;
};
export type PlaceResult = {
  seats: Record<string, string>;
  left: number;
  conflicts: number;
  sameGenderPairs: number;
};

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/**
 * Place les élèves en remplissant la salle de l'avant vers le fond.
 * Respecte au mieux : élèves prioritaires devant, élèves à séparer jamais voisins,
 * et en mode « alterner » des voisins de table de genres différents.
 * Plusieurs essais aléatoires ; le meilleur est gardé.
 */
export function autoPlace(cls: ClassPlan, opts: PlaceOptions): PlaceResult {
  const rng = opts.rng ?? Math.random;
  const tries = opts.tries ?? 400;
  const seats = seatList(cls.layout);
  const neigh = neighborMap(cls.layout);
  const gender = new Map(cls.students.map((s) => [s.id, s.gender]));
  const apart = apartSets(cls);
  const front = new Set(cls.constraints.front);

  const base: Record<string, string> = opts.keepPlaced ? { ...normalizeClass(cls).seats } : {};
  const placed = new Set(Object.values(base));
  const toPlace = cls.students.filter((s) => !placed.has(s.id)).map((s) => s.id);
  const free = seats.filter((s) => !base[s.key]);

  const conflictWith = (cur: Record<string, string>, key: string, id: string) => {
    const avoid = apart.get(id);
    if (!avoid) return false;
    return (neigh.get(key) ?? []).some((n) => {
      const o = cur[n];
      return o !== undefined && avoid.has(o);
    });
  };
  const leftNeighbor = (cur: Record<string, string>, p: Pos) => {
    // voisin dans la même table, juste à gauche
    const k = seats.find((s) => s.desk === p.desk && s.x === p.x - 1)?.key;
    return k ? cur[k] : undefined;
  };
  const preferredGender = (cur: Record<string, string>, p: Pos, remaining: string[]): Gender => {
    const left = leftNeighbor(cur, p);
    const lg = left ? gender.get(left) : null;
    if (lg) return lg === "F" ? "M" : "F";
    const aheadKey = seats.find((s) => s.x === p.x && s.y === p.y - 1)?.key;
    const ag = aheadKey && cur[aheadKey] ? gender.get(cur[aheadKey] as string) : null;
    if (ag) return ag === "F" ? "M" : "F";
    const f = remaining.filter((id) => gender.get(id) === "F").length;
    const m = remaining.filter((id) => gender.get(id) === "M").length;
    return f === m ? null : f > m ? "F" : "M";
  };
  const sameGenderPairs = (cur: Record<string, string>) => {
    let n = 0;
    for (const p of seats) {
      const a = cur[p.key];
      const b = leftNeighbor(cur, p);
      if (!a || !b) continue;
      const ga = gender.get(a);
      if (ga && ga === gender.get(b)) n++;
    }
    return n;
  };

  let best: PlaceResult | null = null;
  let bestScore = Infinity;
  for (let t = 0; t < Math.max(1, tries); t++) {
    const cur = { ...base };
    const groups = [
      shuffle(
        toPlace.filter((id) => front.has(id)),
        rng,
      ),
      shuffle(
        toPlace.filter((id) => !front.has(id)),
        rng,
      ),
    ];
    let conflicts = 0;
    for (const p of free) {
      const group = groups.find((g) => g.length);
      if (!group) break;
      const ok = (id: string) => !conflictWith(cur, p.key, id);
      const want = opts.mode === "alternate" ? preferredGender(cur, p, group) : null;
      let idx = group.findIndex(
        (id) => ok(id) && (!want || gender.get(id) === want || !gender.get(id)),
      );
      if (idx === -1) idx = group.findIndex(ok);
      if (idx === -1) {
        idx = 0;
        conflicts++;
      }
      const [id] = group.splice(idx, 1);
      if (id) cur[p.key] = id;
    }
    const left = groups.reduce((n, g) => n + g.length, 0);
    const misses = frontMisses({ ...cls, seats: cur }).length;
    const pairs = opts.mode === "alternate" ? sameGenderPairs(cur) : 0;
    const score = conflicts * 10000 + misses * 100 + pairs;
    if (score < bestScore) {
      bestScore = score;
      best = {
        seats: cur,
        left,
        conflicts: conflictPairs({ ...cls, seats: cur }),
        sameGenderPairs: pairs,
      };
      if (score === 0) break;
    }
  }
  return best as PlaceResult;
}
