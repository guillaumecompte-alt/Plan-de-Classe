import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

import {
  detectMapping,
  rowsToStudents,
  type ClassPlan,
  type Gender,
  type Mapping,
} from "@/lib/plan";

type Parsed = { fileName: string; rows: unknown[][]; mapping: Mapping };

const colLetter = (i: number) => {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

async function readRows(f: File): Promise<unknown[][]> {
  let wb: XLSX.WorkBook;
  if (/\.(csv|txt)$/i.test(f.name)) {
    // Excel enregistre souvent ses CSV en Windows-1252 : on essaie UTF-8 puis on se rabat dessus
    const buf = await f.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buf);
    wb = XLSX.read(text.replace(/^\uFEFF/, ""), { type: "string" });
  } else {
    wb = XLSX.read(await f.arrayBuffer());
  }
  const ws = wb.Sheets[wb.SheetNames[0] ?? ""];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });
}

type Props = {
  current: ClassPlan;
  onImport: (list: { name: string; gender: Gender }[], into: "current" | "new") => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onDeleteClass: () => void;
};

export function ImportPanel({
  current,
  onImport,
  onExportBackup,
  onImportBackup,
  onDeleteClass,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);

  const onFile = async (f: File) => {
    setError("");
    try {
      const rows = await readRows(f);
      if (!rows.length) throw new Error("vide");
      setParsed({ fileName: f.name, rows, mapping: detectMapping(rows) });
    } catch {
      setParsed(null);
      setError(
        `Impossible de lire « ${f.name} ». Choisissez un fichier Excel (.xlsx, .xls), LibreOffice (.ods) ou CSV.`,
      );
    }
  };

  const list = useMemo(() => (parsed ? rowsToStudents(parsed.rows, parsed.mapping) : []), [parsed]);
  const width = parsed
    ? Math.max(1, ...parsed.rows.map((r) => (Array.isArray(r) ? r.length : 0)))
    : 0;
  const headerRow =
    parsed && parsed.mapping.skip > 0 ? parsed.rows[parsed.mapping.skip - 1] : undefined;
  const firstData = parsed?.rows[parsed.mapping.skip];
  const colLabel = (i: number) => {
    const h = Array.isArray(headerRow) ? String(headerRow[i] ?? "").trim() : "";
    const sample = Array.isArray(firstData) ? String(firstData[i] ?? "").trim() : "";
    const hint = h || (sample ? `ex. ${sample}` : "");
    return `Colonne ${colLetter(i)}${hint ? ` — ${hint.slice(0, 28)}` : ""}`;
  };
  const setMap = (patch: Partial<Mapping>) =>
    parsed && setParsed({ ...parsed, mapping: { ...parsed.mapping, ...patch } });
  const genders = list.filter((s) => s.gender).length;
  const className = current.name.trim() || "cette classe";

  const select =
    "w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary";
  const btn = "rounded-md border px-4 py-2 text-sm font-semibold transition hover:bg-secondary";

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) void onFile(f);
        }}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed bg-card p-10 text-center outline-none transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary ${over ? "border-primary bg-secondary" : "border-primary/40"}`}
      >
        <p className="font-display text-xl">Déposez votre liste d'élèves ici</p>
        <p className="mt-2 text-sm text-muted-foreground">
          ou cliquez pour la choisir (.xlsx, .xls, .ods, .csv)
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Les colonnes du nom et du genre sont repérées automatiquement (export Pronote, ENT,
          tableur…) ; vous pourrez les corriger avant d'importer.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.ods,.csv,.txt"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/60 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {parsed && (
        <section className="rounded-xl border bg-card p-5" aria-labelledby="verif-title">
          <h2 id="verif-title" className="font-display text-lg font-semibold">
            Vérifier l'import —{" "}
            <span className="font-normal text-muted-foreground">{parsed.fileName}</span>
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Lignes de titre à ignorer</span>
              <select
                className={select}
                value={parsed.mapping.skip}
                onChange={(e) => setMap({ skip: Number(e.target.value) })}
              >
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? "Aucune" : `${n} ligne${n > 1 ? "s" : ""}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Nom (ou nom et prénom)</span>
              <select
                className={select}
                value={parsed.mapping.name}
                onChange={(e) => setMap({ name: Number(e.target.value) })}
              >
                {Array.from({ length: width }, (_, i) => (
                  <option key={i} value={i}>
                    {colLabel(i)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">
                Prénom, s'il est dans une autre colonne
              </span>
              <select
                className={select}
                value={parsed.mapping.firstName ?? ""}
                onChange={(e) =>
                  setMap({ firstName: e.target.value === "" ? null : Number(e.target.value) })
                }
              >
                <option value="">Aucune colonne</option>
                {Array.from({ length: width }, (_, i) => (
                  <option key={i} value={i}>
                    {colLabel(i)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Genre (F/M, fille/garçon…)</span>
              <select
                className={select}
                value={parsed.mapping.gender ?? ""}
                onChange={(e) =>
                  setMap({ gender: e.target.value === "" ? null : Number(e.target.value) })
                }
              >
                <option value="">Aucune colonne</option>
                {Array.from({ length: width }, (_, i) => (
                  <option key={i} value={i}>
                    {colLabel(i)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="mt-4 text-sm">
            <strong>{list.length} élèves</strong> trouvés
            {genders
              ? ` · ${list.filter((s) => s.gender === "F").length} filles, ${list.filter((s) => s.gender === "M").length} garçons`
              : " · genre non renseigné"}
            {genders > 0 && genders < list.length ? ` · ${list.length - genders} sans genre` : ""}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Aperçu">
            {list.slice(0, 12).map((s, i) => (
              <li
                key={i}
                className={`rounded-md border border-desk-edge/40 px-2 py-0.5 text-xs font-semibold text-tag-foreground ${s.gender === "F" ? "bg-tag-girl" : s.gender === "M" ? "bg-tag-boy" : "bg-tag"}`}
              >
                {s.name}
              </li>
            ))}
            {list.length > 12 && (
              <li className="px-1 text-xs text-muted-foreground">… et {list.length - 12} autres</li>
            )}
          </ul>

          {current.students.length > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">
              Importer dans « {className} » remplace sa liste actuelle ({current.students.length}{" "}
              élèves). Les élèves dont le nom n'a pas changé gardent leur place.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              disabled={!list.length}
              onClick={() => {
                onImport(list, "current");
                setParsed(null);
              }}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-accent disabled:opacity-40"
            >
              Importer dans « {className} »
            </button>
            {current.students.length > 0 && (
              <button
                disabled={!list.length}
                onClick={() => {
                  onImport(list, "new");
                  setParsed(null);
                }}
                className={`${btn} border-primary text-primary disabled:opacity-40`}
              >
                Dans une nouvelle classe
              </button>
            )}
            <button onClick={() => setParsed(null)} className={`${btn} text-muted-foreground`}>
              Annuler
            </button>
          </div>
        </section>
      )}

      <section className="rounded-xl border bg-card p-5" aria-labelledby="save-title">
        <h2 id="save-title" className="font-display text-lg font-semibold">
          Sauvegarde
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Vos classes sont enregistrées dans ce navigateur uniquement. Pour les retrouver sur un
          autre ordinateur ou les mettre à l'abri, exportez une sauvegarde puis importez-la de
          l'autre côté.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={onExportBackup} className={`${btn} border-primary text-primary`}>
            Exporter toutes les classes
          </button>
          <button onClick={() => backupRef.current?.click()} className={btn}>
            Importer une sauvegarde
          </button>
          <input
            ref={backupRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportBackup(f);
              e.target.value = "";
            }}
          />
        </div>
      </section>

      <div className="text-right">
        <button
          onClick={onDeleteClass}
          className="rounded-md px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
        >
          Supprimer la classe « {className} »
        </button>
      </div>
    </main>
  );
}
