import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { ImportPanel } from "@/components/plan/ImportPanel";
import { AutoPlacePanel, RoomSettings } from "@/components/plan/PlanControls";
import { DragGhost, StudentTag } from "@/components/plan/StudentTag";
import { usePointerDrag } from "@/components/plan/use-pointer-drag";
import {
  applyImport,
  autoPlace,
  capacity,
  conflictSeats,
  loadState,
  moveStudent,
  normalizeClass,
  seatKey,
  STORAGE_V1,
  STORAGE_V2,
  CLASS_NAMES,
  isValidClassName,
  withLayout,
  type AppState,
  type ClassPlan,
  type Constraints,
  type Gender,
  type Layout,
  type PlaceMode,
} from "@/lib/plan";
import { downloadPlanPdf } from "@/lib/pdf";

type Notice = { text: string; tone: "info" | "error"; undo?: ClassPlan | undefined };

// Format A4 imprimable (marges de 10 mm), en pixels CSS
const A4_LONG = 1047;
const A4_SHORT = 718;
const SCREEN_SEAT_H = 56; // hauteur d'une place à l'écran (h-14)

function readSaved(): AppState {
  let v2: string | null = null;
  let v1: string | null = null;
  try {
    v2 = localStorage.getItem(STORAGE_V2);
    v1 = localStorage.getItem(STORAGE_V1);
  } catch {
    /* stockage indisponible (navigation privée stricte) */
  }
  return loadState(v2, v1);
}

export function App() {
  // Les classes sont relues depuis le navigateur dès l'ouverture de la page
  const [app, setApp] = useState<AppState>(readSaved);
  const [tab, setTab] = useState<"import" | "plan">(() => {
    const cur = app.classes.find((c) => c.id === app.currentId);
    return cur?.students.length ? "plan" : "import";
  });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [planW, setPlanW] = useState(0);
  const [fontsReady, setFontsReady] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  const cls = app.classes.find((c) => c.id === app.currentId) ?? (app.classes[0] as ClassPlan);

  // --- Enregistrement dans le navigateur à chaque modification
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_V2, JSON.stringify(app));
    } catch {
      setNotice({
        text: "Enregistrement impossible dans ce navigateur : vos changements seront perdus en fermant la page.",
        tone: "error",
      });
    }
  }, [app]);
  // Les noms sont remesurés une fois la police chargée
  useEffect(() => {
    document.fonts?.ready.then(() => setFontsReady((n) => n + 1)).catch(() => {});
  }, []);

  // --- Largeur du plan, pour ajuster la taille des noms
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(
      ([entry]) => entry && setPlanW(Math.round(entry.contentRect.width)),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [tab]);

  // --- Modifications
  const updateClass = (fn: (c: ClassPlan) => ClassPlan, undoable?: string) => {
    setApp((prev) => ({
      ...prev,
      classes: prev.classes.map((c) => (c.id === prev.currentId ? fn(c) : c)),
    }));
    if (undoable) setNotice({ text: undoable, tone: "info", undo: cls });
  };
  const undo = () => {
    const prev = notice?.undo;
    if (!prev) return;
    setApp((a) => ({ ...a, classes: a.classes.map((c) => (c.id === prev.id ? prev : c)) }));
    setNotice(null);
  };

  const place = (id: string, target: string | null) => {
    setSelected(null);
    updateClass((c) => ({ ...c, seats: moveStudent(c.seats, id, target) }));
  };
  const drag = usePointerDrag(place);

  const onImport = (list: { name: string; gender: Gender }[]) => {
    const { cls: c, kept } = applyImport(cls, list);
    updateClass(() => c);
    setNotice({
      text: `${list.length} élèves importés.${kept ? ` ${kept} gardent leur place.` : ""}`,
      tone: "info",
      undo: cls.students.length ? cls : undefined,
    });
    setSelected(null);
    setTab("plan");
  };

  const changeLayout = (l: Partial<Layout>) => {
    const { cls: next, removed } = withLayout(cls, l);
    updateClass(
      () => next,
      removed ? `${removed} élève${removed > 1 ? "s remis" : " remis"} dans la liste.` : undefined,
    );
    if (!removed) setNotice(null);
  };
  const setConstraints = (c: Constraints) =>
    updateClass((x) => normalizeClass({ ...x, constraints: c }));
  const runPlacement = (mode: PlaceMode, keepPlaced: boolean) => {
    const r = autoPlace(cls, { mode, keepPlaced });
    const parts = [`${Object.keys(r.seats).length} élèves placés.`];
    if (r.left) parts.push(`${r.left} sans place : agrandissez la salle.`);
    if (r.conflicts)
      parts.push(`${r.conflicts} paire${r.conflicts > 1 ? "s" : ""} à séparer n'a pas pu l'être.`);
    if (mode === "alternate" && r.sameGenderPairs)
      parts.push(
        `${r.sameGenderPairs} table${r.sameGenderPairs > 1 ? "s" : ""} sans alternance (effectifs inégaux).`,
      );
    updateClass((c) => ({ ...c, seats: r.seats }), parts.join(" "));
    setSelected(null);
  };

  // --- Sélection au toucher / clavier : toucher un élève, puis une place
  const activateTag = (id: string, seat: string | null) => {
    if (drag.clickWasDrag()) return;
    if (selected === id) return setSelected(null);
    if (selected && seat) return place(selected, seat);
    setSelected(id);
  };
  const activateSeat = (seat: string) => {
    if (drag.clickWasDrag() || !selected) return;
    place(selected, seat);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // --- Données dérivées
  const byId = useMemo(() => new Map(cls.students.map((s) => [s.id, s])), [cls.students]);
  const placed = new Set(Object.values(cls.seats));
  const unplaced = cls.students.filter((s) => !placed.has(s.id));
  const conflicts = useMemo(() => conflictSeats(cls), [cls]);
  const selectedStudent = selected ? byId.get(selected) : undefined;
  const draggedStudent = drag.dragId ? byId.get(drag.dragId) : undefined;
  const { cols, rows, per } = cls.layout;
  const fitKey = `${planW}-${cols}-${per}-${fontsReady}`;

  // Impression : paysage si la salle est large, hauteur des places adaptée au nombre de rangées
  const landscape = cols * per > 8;
  const printW = landscape ? A4_LONG : A4_SHORT;
  const printH = landscape ? A4_SHORT : A4_LONG;
  const printSeatH = Math.max(24, Math.min(48, Math.floor((printH - 190) / rows - 20)));
  // Largeur d'une place : colonnes séparées par `gap`, table = bordure 2px + marge 4px de chaque côté, places espacées de 4px
  const seatW = (total: number, gap: number) =>
    ((total - (cols - 1) * gap) / cols - 12 - (per - 1) * 4) / per;
  const screenGap = typeof window !== "undefined" && window.innerWidth >= 640 ? 16 : 12;
  const widthRatio = planW ? seatW(printW, 12) / seatW(planW, screenGap) : 0.74;
  // Petite marge de sécurité : à l'impression, les arrondis de mise en page diffèrent de l'écran
  const printScale = 0.94 * Math.min(1, (printSeatH - 4) / (SCREEN_SEAT_H - 4), widthRatio);

  // --- Export PDF : le nom de la classe est obligatoire
  const nameRef = useRef<HTMLSelectElement>(null);
  const [nameMissing, setNameMissing] = useState(false);
  const hasName = isValidClassName(cls.name);
  const print = () => {
    if (!isValidClassName(cls.name)) {
      setNameMissing(true);
      setNotice({
        text: "Choisissez le nom de la classe avant d'exporter en PDF.",
        tone: "error",
      });
      nameRef.current?.focus();
      return;
    }
    setNameMissing(false);
    setSelected(null);
    // Le PDF est créé dans la page et téléchargé directement (pas de fenêtre d'impression)
    downloadPlanPdf(cls)
      .then((fileName) => setNotice({ text: `PDF téléchargé : ${fileName}`, tone: "info" }))
      .catch((e: unknown) => {
        console.error(e);
        setNotice({ text: "La création du PDF a échoué. Réessayez.", tone: "error" });
      });
  };
  // Ctrl+P / Cmd+P crée aussi le PDF, avec la même vérification que le bouton
  const printRef = useRef(print);
  printRef.current = print;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        printRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const field =
    "rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="min-h-screen">
      <style>{`@media print { @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 10mm; } }`}</style>
      <header className="border-b bg-card print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <h1 className="font-display text-2xl font-semibold text-primary">Plan de classe</h1>
          <div className="flex flex-wrap items-center gap-2">
            <select
              ref={nameRef}
              value={hasName ? cls.name : ""}
              onChange={(e) => {
                const name = e.target.value;
                updateClass((c) => ({ ...c, name }));
                if (name) {
                  setNameMissing(false);
                  setNotice(null);
                }
              }}
              aria-label="Nom de la classe"
              aria-invalid={nameMissing && !hasName ? true : undefined}
              required
              className={`rounded-md border bg-background px-3 py-1.5 text-sm outline-none w-44 ${
                nameMissing && !hasName
                  ? "border-destructive ring-2 ring-destructive"
                  : "focus:ring-2 focus:ring-primary"
              }`}
            >
              <option value="" disabled>
                {cls.name.trim() && !hasName
                  ? `Nom (était « ${cls.name.trim()} »)`
                  : "Nom de la classe…"}
              </option>
              {[6, 5, 4, 3].map((level) => (
                <optgroup key={level} label={`${level}e`}>
                  {CLASS_NAMES.filter((n) => n.startsWith(String(level))).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              onClick={print}
              title={hasName ? undefined : "Choisissez d'abord le nom de la classe"}
              className="rounded-md border border-primary px-4 py-1.5 text-sm font-semibold text-primary hover:bg-secondary"
            >
              Exporter en PDF
            </button>
            <nav className="flex gap-1 rounded-lg bg-muted p-1" aria-label="Onglets">
              {(["import", "plan"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  aria-current={tab === t ? "page" : undefined}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold transition sm:px-4 ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t === "import" ? "Importer une liste" : "Plan de la classe"}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={`mx-auto mt-4 flex max-w-7xl flex-wrap items-center gap-3 px-4 text-sm sm:px-6 print:hidden ${notice.tone === "error" ? "text-destructive" : "text-primary"}`}
        >
          <p className="font-semibold">{notice.text}</p>
          {notice.undo && (
            <button
              onClick={undo}
              className="rounded-md border border-current px-2 py-0.5 text-xs font-semibold hover:bg-secondary"
            >
              Annuler
            </button>
          )}
          <button
            onClick={() => setNotice(null)}
            className="ml-auto text-muted-foreground hover:text-foreground"
            aria-label="Fermer le message"
          >
            ×
          </button>
        </div>
      )}

      {tab === "import" ? (
        <ImportPanel current={cls} onImport={onImport} />
      ) : (
        <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row print:block print:max-w-none print:p-0">
          <aside
            data-drop="list"
            onClick={() => selected && placed.has(selected) && place(selected, null)}
            className={`print:hidden w-full shrink-0 rounded-xl border bg-card p-4 transition lg:sticky lg:top-4 lg:w-64 lg:self-start ${drag.over === "list" ? "border-primary ring-2 ring-primary" : ""}`}
          >
            <h2 className="font-display text-lg">Élèves à placer ({unplaced.length})</h2>
            <div className="mt-3 flex max-h-[40vh] flex-wrap gap-1.5 overflow-auto lg:max-h-[50vh] lg:flex-col lg:flex-nowrap">
              {unplaced.map((s) => (
                <StudentTag
                  key={s.id}
                  student={s}
                  selected={selected === s.id}
                  dragging={drag.dragId === s.id}
                  onPointerDown={(e) => drag.begin(e, s.id)}
                  onActivate={() => activateTag(s.id, null)}
                />
              ))}
              {!cls.students.length && (
                <p className="text-sm text-muted-foreground">
                  Importez d'abord une liste dans l'onglet{" "}
                  <button
                    className="font-semibold text-primary underline"
                    onClick={() => setTab("import")}
                  >
                    Importer
                  </button>
                  .
                </p>
              )}
              {cls.students.length > 0 && !unplaced.length && (
                <p className="text-sm text-muted-foreground">Tout le monde est placé.</p>
              )}
            </div>
            {cls.students.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Glissez un élève sur une place (au doigt : appui long), ou touchez-le puis touchez
                une place.
              </p>
            )}
            {placed.size > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateClass(
                    (c) => ({ ...c, seats: {} }),
                    "Tous les élèves ont été retirés du plan.",
                  );
                  setSelected(null);
                }}
                className="mt-3 w-full rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              >
                Tout retirer
              </button>
            )}
            <div onClick={(e) => e.stopPropagation()}>
              <AutoPlacePanel cls={cls} onPlace={runPlacement} onConstraints={setConstraints} />
            </div>
          </aside>

          <section
            className="plan-print floor-pattern min-w-0 flex-1 rounded-xl border p-4 shadow-inner sm:p-6 print:border-0 print:p-0 print:shadow-none"
            style={
              { "--print-scale": printScale, "--print-seat-h": `${printSeatH}px` } as CSSProperties
            }
          >
            <RoomSettings
              layout={cls.layout}
              students={cls.students.length}
              onChange={changeLayout}
            />
            {selectedStudent && (
              <p className="mb-3 text-sm text-primary print:hidden" role="status">
                <strong>{selectedStudent.name}</strong> sélectionné·e : touchez une place
                {placed.has(selectedStudent.id) ? " ou la liste pour l'y remettre" : ""}. Échap pour
                annuler.
              </p>
            )}
            {conflicts.size > 0 && (
              <p className="mb-3 text-sm text-destructive print:hidden">
                Des élèves à séparer sont voisins (encadrés en rouge).
              </p>
            )}
            <div className="mb-4 hidden text-center print:block">
              {cls.name.trim() && (
                <p className="font-display text-2xl font-semibold">{cls.name.trim()}</p>
              )}
              <p className="font-display text-lg">Plan de classe</p>
            </div>

            <div
              ref={gridRef}
              className="grid gap-3 sm:gap-4 print:gap-3"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: cols }, (_, c) => (
                <div key={c} className="flex min-w-0 flex-col gap-2">
                  {/* rangée 0 = la plus proche du bureau : affichée en bas */}
                  {Array.from({ length: rows }, (_, i) => rows - 1 - i).map((r) => (
                    <div
                      key={r}
                      className="grid gap-1 rounded-md border-2 border-desk-edge bg-desk p-1 shadow"
                      style={{ gridTemplateColumns: `repeat(${per}, minmax(0, 1fr))` }}
                    >
                      {Array.from({ length: per }, (_, s) => {
                        const k = seatKey(c, r, s);
                        const id = cls.seats[k];
                        const st = id ? byId.get(id) : undefined;
                        const isOver = drag.over === k;
                        return (
                          <div
                            key={s}
                            data-drop={k}
                            role={selected ? "button" : undefined}
                            tabIndex={selected && !st ? 0 : -1}
                            aria-label={
                              selected
                                ? `Place rangée ${r + 1} depuis le bureau, colonne ${c + 1}, place ${s + 1}${st ? `, occupée par ${st.name}` : ", libre"}`
                                : undefined
                            }
                            onClick={() => activateSeat(k)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                activateSeat(k);
                              }
                            }}
                            className={`seat h-14 min-w-0 rounded-sm p-0.5 outline-none transition focus-visible:ring-2 focus-visible:ring-primary ${
                              isOver
                                ? "bg-primary/30 ring-2 ring-primary"
                                : selected && !st
                                  ? "cursor-pointer bg-card/60 hover:bg-primary/25"
                                  : "bg-card/40"
                            }`}
                          >
                            {st && (
                              <StudentTag
                                student={st}
                                seated
                                fitKey={fitKey}
                                selected={selected === st.id}
                                dragging={drag.dragId === st.id}
                                conflict={conflicts.has(k)}
                                onPointerDown={(e) => drag.begin(e, st.id)}
                                onActivate={() => activateTag(st.id, k)}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="mt-8 flex justify-center print:mt-5">
              <div className="teacher-desk w-full max-w-xs rounded-md border-2 border-desk-edge bg-desk py-4 text-center font-display font-semibold text-white shadow-lg print:py-3">
                Bureau du professeur
              </div>
            </div>
            {cls.students.length > capacity(cls.layout) && (
              <p className="mt-4 text-center text-sm font-semibold text-destructive print:hidden">
                Il manque {cls.students.length - capacity(cls.layout)} places : ajoutez des rangées
                ou des places par table.
              </p>
            )}
          </section>
        </main>
      )}

      {draggedStudent && drag.ghost && (
        <DragGhost
          student={draggedStudent}
          w={drag.ghost.w}
          h={drag.ghost.h}
          seated={placed.has(draggedStudent.id)}
          ghostRef={drag.ghostRef}
        />
      )}
    </div>
  );
}
