import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Plan de classe — glisser-déposer les élèves" },
      { name: "description", content: "Importez votre liste Excel et placez vos élèves dans la classe par glisser-déposer." },
      { property: "og:title", content: "Plan de classe" },
      { property: "og:description", content: "Importez une liste Excel et créez votre plan de classe en glisser-déposer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const COLS = 3;
const ROWS = 6;
const PER = 2;
const STORAGE = "plan-de-classe-v1";

type Gender = "F" | "M" | null;
type Student = { id: string; name: string; gender: Gender };
type State = { students: Student[]; seats: Record<string, string>; className: string }; // seatKey -> studentId

const seatKey = (c: number, r: number, s: number) => `${c}-${r}-${s}`;

// Écriture la plus grande qui tient dans une étiquette posée (toutes de taille identique)
const TAG_FS = [17, 16, 15, 14, 13, 12, 11, 10, 9, 8];
const TAG_W = 124; // largeur utile d'une étiquette posée, en px
const TAG_H = 46; // hauteur utile d'une étiquette posée, en px
const SOFT_MIN = 6; // au-delà de 6 lettres, un mot peut être coupé
const SOFT_EVERY = 5; // coupure tous les 5 lettres (le tiret n'apparaît que si le mot est coupé)

// Tirets mous : un nom très long se coupe avec un tiret au lieu d'être tronqué en plein milieu
function softHyphenate(word: string) {
  if (word.length <= SOFT_MIN || word.includes("-")) return word;
  const parts: string[] = [];
  for (let i = 0; i < word.length; i += SOFT_EVERY) parts.push(word.slice(i, i + SOFT_EVERY));
  return parts.join("\u00AD");
}
const softName = (name: string) => name.trim().split(/\s+/).map(softHyphenate).join(" ");

function seatedFontSize(name: string) {
  const words = softName(name).split(/[\s\u00AD]+/).filter(Boolean);
  for (const fs of TAG_FS) {
    const perLine = Math.max(1, Math.floor(TAG_W / (fs * 0.6)));
    if (words.some((w) => w.length > perLine)) continue;
    let lines = 0;
    let cur = "";
    for (const w of words) {
      const cand = cur ? `${cur} ${w}` : w;
      if (cand.length > perLine) { lines++; cur = w; } else { cur = cand; }
    }
    if (cur) lines++;
    if (lines * fs * 1.12 <= TAG_H) return fs;
  }
  return TAG_FS[TAG_FS.length - 1];
}

function Index() {
  const [tab, setTab] = useState<"import" | "plan">("import");
  const [state, setState] = useState<State>({ students: [], seats: {}, className: "" });
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState("");
  const [over, setOver] = useState<string | null>(null); // seatKey surbrillé, "list" pour la liste
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) {
        const s = JSON.parse(raw) as State;
        // Les places au-delà des 6 rangées actuelles sont libérées (anciens plans à 11 rangées)
        const seats: Record<string, string> = {};
        for (const [k, v] of Object.entries(s.seats ?? {})) {
          if (Number(k.split("-")[1]) < ROWS) seats[k] = v;
        }
        setState({ students: s.students ?? [], seats, className: s.className ?? "" });
        if (s.students?.length) setTab("plan");
      }
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE, JSON.stringify(state));
  }, [state, loaded]);

  const onFile = async (f: File) => {
    const wb = XLSX.read(await f.arrayBuffer());
    const ws = wb.Sheets[wb.SheetNames[0] ?? ""];
    if (!ws) return setMsg("Fichier illisible.");
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
    const parseGender = (v: unknown): Gender => {
      const g = String(v ?? "").trim().toLowerCase();
      if (/^(f|f[ée]minin|fille)/.test(g)) return "F";
      if (/^(m|masculin|gar[çc]on|h|homme)/.test(g)) return "M";
      return null;
    };
    const students = rows
      .map((r) => ({ name: String((r as unknown[])[0] ?? "").trim(), gender: parseGender((r as unknown[])[3]) }))
      .filter((s) => s.name && !/^(nom|élève|eleve|nom\s*(et|\/)?\s*pr[ée]nom)/i.test(s.name));
    setState((prev) => ({ ...prev, students: students.map((s, i) => ({ id: `${i}-${s.name}`, ...s })), seats: {} }));
    setMsg(`${students.length} élèves importés.`);
    setTab("plan");
  };

  const byId = new Map(state.students.map((s) => [s.id, s]));
  const placed = new Set(Object.values(state.seats));
  const unplaced = state.students.filter((s) => !placed.has(s.id));

  const drop = (target: string | null) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    setState((prev) => {
      const seats = { ...prev.seats };
      const from = Object.keys(seats).find((k) => seats[k] === id);
      if (from) delete seats[from];
      if (target) {
        const occupant = seats[target];
        if (occupant && from) seats[from] = occupant; // échange
        seats[target] = id;
      }
      return { ...prev, seats };
    });
  };

  const Tag = ({ s, seated }: { s: Student; seated?: boolean }) => (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", s.id);
        e.dataTransfer.effectAllowed = "move";
        // Image de déplacement = uniquement cette étiquette (évite le « fantôme » d'un autre élève)
        const el = e.currentTarget;
        const rect = el.getBoundingClientRect();
        e.dataTransfer.setDragImage(el, e.clientX - rect.left, e.clientY - rect.top);
      }}
      onDragEnd={() => setOver(null)}
      className={`cursor-grab active:cursor-grabbing select-none rounded-md border border-desk-edge/40 font-semibold text-tag-foreground shadow-sm hover:shadow-md ${
        s.gender === "F" ? "bg-tag-girl" : s.gender === "M" ? "bg-tag-boy" : "bg-tag"
      } ${
        seated
          ? "tag-seated flex h-full w-full items-center justify-center px-1 py-0.5 text-center print:shadow-none"
          : "break-words px-2 py-1 text-xs leading-tight"
      }`}
      style={seated ? ({ "--tag-fs": `${seatedFontSize(s.name)}px` } as CSSProperties) : undefined}
      title={s.name}
    >
      {seated ? <span className="line-clamp-3 break-words hyphens-auto">{softName(s.name)}</span> : s.name}
    </div>
  );

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card print:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <h1 className="font-display text-2xl font-semibold text-primary">Plan de classe</h1>
          <div className="flex items-center gap-3">
          <input
            value={state.className}
            onChange={(e) => setState((p) => ({ ...p, className: e.target.value }))}
            placeholder="Nom de la classe"
            aria-label="Nom de la classe"
            className="w-44 rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={() => {
              setTab("plan");
              const prevTitle = document.title;
              const label = state.className.trim();
              setTimeout(() => {
                document.title = label ? `Plan de classe — ${label}` : prevTitle;
                window.print();
                document.title = prevTitle;
              }, 100);
            }}
            className="rounded-md border border-primary px-4 py-1.5 text-sm font-semibold text-primary hover:bg-secondary"
          >
            Exporter en PDF
          </button>
          <nav className="flex gap-1 rounded-lg bg-muted p-1">
            {(["import", "plan"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {t === "import" ? "Importer la liste" : "Plan de la classe"}
              </button>
            ))}
          </nav>
          </div>
        </div>
      </header>

      {tab === "import" ? (
        <main className="mx-auto max-w-xl px-6 py-16">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
            onClick={() => fileRef.current?.click()}
            className="cursor-pointer rounded-xl border-2 border-dashed border-primary/40 bg-card p-12 text-center hover:bg-secondary"
          >
            <p className="font-display text-xl">Déposez votre fichier Excel ici</p>
            <p className="mt-2 text-sm text-muted-foreground">ou cliquez pour le choisir (.xlsx, .xls, .csv)</p>
            <p className="mt-4 text-xs text-muted-foreground">Nom et prénom dans la première colonne, genre (Masculin/Féminin) dans la quatrième.</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
          </div>
          {msg && <p className="mt-4 text-center text-sm font-semibold text-primary">{msg}</p>}
        </main>
      ) : (
        <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6 lg:flex-row print:block print:max-w-none print:p-0">
          <aside
            onDragOver={(e) => { e.preventDefault(); if (over !== "list") setOver("list"); }}
            onDragLeave={() => setOver(null)}
            onDrop={drop(null)}
            className={`print:hidden w-full shrink-0 rounded-xl border bg-card p-4 transition lg:w-60 lg:self-start lg:sticky lg:top-4 ${over === "list" ? "ring-2 ring-primary border-primary" : ""}`}
          >
            <h2 className="font-display text-lg">Élèves à placer ({unplaced.length})</h2>
            <div className="mt-3 flex max-h-[70vh] flex-col gap-1.5 overflow-auto">
              {unplaced.map((s) => <Tag key={s.id} s={s} />)}
              {!state.students.length && <p className="text-sm text-muted-foreground">Importez d'abord une liste.</p>}
            </div>
            {placed.size > 0 && (
              <button onClick={() => setState((p) => ({ ...p, seats: {} }))} className="mt-4 w-full rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
                Tout retirer
              </button>
            )}
          </aside>

          <section className="plan-print floor-pattern flex-1 rounded-xl border p-6 shadow-inner print:border-0 print:p-0 print:shadow-none">
            <div className="mb-4 hidden text-center print:block">
              {state.className.trim() && (
                <p className="font-display text-2xl font-semibold">{state.className.trim()}</p>
              )}
              <p className="font-display text-lg">Plan de classe</p>
            </div>
            <div className="grid grid-cols-3 gap-4 print:gap-3">
              {Array.from({ length: COLS }, (_, c) => (
                <div key={c} className="flex flex-col gap-2">
                  {Array.from({ length: ROWS }, (_, r) => (
                    <div key={r} className="grid grid-cols-2 gap-1 rounded-md border-2 border-desk-edge bg-desk p-1 shadow">
                      {Array.from({ length: PER }, (_, s) => {
                        const k = seatKey(c, r, s);
                        const st = state.seats[k] ? byId.get(state.seats[k]) : undefined;
                        return (
                          <div
                            key={s}
                            onDragOver={(e) => { e.preventDefault(); if (over !== k) setOver(k); }}
                            onDragLeave={() => setOver((o) => (o === k ? null : o))}
                            onDrop={drop(k)}
                            className={`h-14 min-w-0 rounded-sm p-0.5 transition print:h-12 ${over === k ? "bg-primary/30 ring-2 ring-primary" : "bg-card/40"}`}
                          >
                            {st && <Tag s={st} seated />}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="mt-10 grid grid-cols-3 gap-4 print:mt-6">
              <div className="col-start-2 rounded-md border-2 border-desk-edge bg-desk py-4 text-center font-display font-semibold text-tag-foreground shadow-lg">
                Bureau du professeur
              </div>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
