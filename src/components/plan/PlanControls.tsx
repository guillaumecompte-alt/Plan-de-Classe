import { useState } from "react";

import {
  capacity,
  LIMITS,
  type ClassPlan,
  type Constraints,
  type Layout,
  type PlaceMode,
} from "@/lib/plan";

// ---------------------------------------------------------------------------
// Dimensions de la salle

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const b =
    "grid h-8 w-8 place-items-center rounded-md border text-base font-semibold leading-none transition hover:bg-secondary disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1" role="group" aria-label={label}>
        <button
          className={b}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          aria-label={`${label} : moins`}
        >
          −
        </button>
        <output className="w-6 text-center text-sm font-semibold tabular-nums" aria-live="polite">
          {value}
        </output>
        <button
          className={b}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          aria-label={`${label} : plus`}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function RoomSettings({
  layout,
  students,
  onChange,
}: {
  layout: Layout;
  students: number;
  onChange: (l: Partial<Layout>) => void;
}) {
  const cap = capacity(layout);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-card/80 px-3 py-2 print:hidden">
      <Stepper
        label="Colonnes"
        value={layout.cols}
        min={LIMITS.cols.min}
        max={LIMITS.cols.max}
        onChange={(cols) => onChange({ cols })}
      />
      <Stepper
        label="Rangées"
        value={layout.rows}
        min={LIMITS.rows.min}
        max={LIMITS.rows.max}
        onChange={(rows) => onChange({ rows })}
      />
      <Stepper
        label="Places par table"
        value={layout.per}
        min={LIMITS.per.min}
        max={LIMITS.per.max}
        onChange={(per) => onChange({ per })}
      />
      <span
        className={`ml-auto text-sm ${students > cap ? "font-semibold text-destructive" : "text-muted-foreground"}`}
      >
        {cap} places · {students} élèves
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placement automatique et contraintes

type AutoProps = {
  cls: ClassPlan;
  onPlace: (mode: PlaceMode, keepPlaced: boolean) => void;
  onConstraints: (c: Constraints) => void;
};

export function AutoPlacePanel({ cls, onPlace, onConstraints }: AutoProps) {
  const [mode, setMode] = useState<PlaceMode>("random");
  const [keep, setKeep] = useState(false);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [frontPick, setFrontPick] = useState("");
  const byId = new Map(cls.students.map((s) => [s.id, s]));
  const sorted = [...cls.students].sort((x, y) => x.name.localeCompare(y.name, "fr"));
  const hasGender = cls.students.some((s) => s.gender);
  const { front, apart } = cls.constraints;
  const name = (id: string) => byId.get(id)?.name ?? "?";
  const select =
    "min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary";
  const chip =
    "inline-flex max-w-full items-center gap-1 rounded-md border bg-secondary px-2 py-0.5 text-xs";
  const x = "rounded px-1 text-muted-foreground hover:text-destructive";

  if (!cls.students.length) return null;

  return (
    <section className="mt-4 border-t pt-4" aria-labelledby="auto-title">
      <h3 id="auto-title" className="font-display text-base font-semibold">
        Placement automatique
      </h3>
      <fieldset className="mt-2 space-y-1 text-sm">
        <legend className="sr-only">Mode</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="mode"
            checked={mode === "random"}
            onChange={() => setMode("random")}
            className="accent-primary"
          />
          Au hasard
        </label>
        <label className={`flex items-center gap-2 ${hasGender ? "" : "opacity-50"}`}>
          <input
            type="radio"
            name="mode"
            disabled={!hasGender}
            checked={mode === "alternate"}
            onChange={() => setMode("alternate")}
            className="accent-primary"
          />
          Alterner filles et garçons
        </label>
        <label className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            checked={keep}
            onChange={(e) => setKeep(e.target.checked)}
            className="accent-primary"
          />
          Garder les élèves déjà placés
        </label>
      </fieldset>
      <button
        onClick={() => onPlace(mode, keep)}
        className="mt-3 w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-accent"
      >
        Placer les élèves
      </button>

      <details
        className="mt-3 text-sm"
        open={front.length > 0 || apart.length > 0 ? true : undefined}
      >
        <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
          Contraintes {front.length + apart.length ? `(${front.length + apart.length})` : ""}
        </summary>

        <div className="mt-2">
          <p className="text-xs font-semibold text-muted-foreground">
            À placer devant (2 premières rangées)
          </p>
          <div className="mt-1 flex gap-1">
            <select
              className={select}
              value={frontPick}
              onChange={(e) => setFrontPick(e.target.value)}
              aria-label="Élève à placer devant"
            >
              <option value="">Choisir un élève…</option>
              {sorted
                .filter((s) => !front.includes(s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
            <button
              disabled={!frontPick}
              onClick={() => {
                onConstraints({ front: [...front, frontPick], apart });
                setFrontPick("");
              }}
              className="rounded-md border px-2 text-sm font-semibold hover:bg-secondary disabled:opacity-30"
              aria-label="Ajouter"
            >
              +
            </button>
          </div>
          <ul className="mt-1 flex flex-wrap gap-1">
            {front.map((id) => (
              <li key={id} className={chip}>
                <span className="truncate">{name(id)}</span>
                <button
                  className={x}
                  aria-label={`Retirer ${name(id)}`}
                  onClick={() => onConstraints({ front: front.filter((f) => f !== id), apart })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-3">
          <p className="text-xs font-semibold text-muted-foreground">À ne pas mettre côte à côte</p>
          <div className="mt-1 flex flex-col gap-1">
            <select
              className={select}
              value={a}
              onChange={(e) => setA(e.target.value)}
              aria-label="Premier élève"
            >
              <option value="">Premier élève…</option>
              {sorted.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div className="flex gap-1">
              <select
                className={select}
                value={b}
                onChange={(e) => setB(e.target.value)}
                aria-label="Second élève"
              >
                <option value="">Second élève…</option>
                {sorted
                  .filter((s) => s.id !== a)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
              <button
                disabled={!a || !b || a === b}
                onClick={() => {
                  onConstraints({ front, apart: [...apart, [a, b]] });
                  setB("");
                }}
                className="rounded-md border px-2 text-sm font-semibold hover:bg-secondary disabled:opacity-30"
                aria-label="Ajouter la paire"
              >
                +
              </button>
            </div>
          </div>
          <ul className="mt-1 flex flex-col gap-1">
            {apart.map(([p, q], i) => (
              <li key={`${p}|${q}`} className={chip}>
                <span className="truncate">
                  {name(p)} ↮ {name(q)}
                </span>
                <button
                  className={`${x} ml-auto`}
                  aria-label={`Retirer la paire ${name(p)} et ${name(q)}`}
                  onClick={() => onConstraints({ front, apart: apart.filter((_, j) => j !== i) })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">
            Voisins : même table, à côté, devant, derrière ou en diagonale.
          </p>
        </div>
      </details>
    </section>
  );
}
