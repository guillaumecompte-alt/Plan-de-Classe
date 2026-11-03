import { useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";

import type { Student } from "@/lib/plan";

// Tailles d'écriture essayées pour une étiquette posée, de la plus grande à la plus petite
const TAG_FS = [17, 16, 15, 14, 13, 12, 11, 10, 9, 8];
const SOFT_MIN = 6; // au-delà de 6 lettres, un mot peut être coupé
const SOFT_EVERY = 5; // coupure possible toutes les 5 lettres (le tiret n'apparaît que si le mot est coupé)

// Tirets mous : un nom très long se coupe avec un tiret au lieu d'être tronqué en plein milieu
function softHyphenate(word: string) {
  if (word.length <= SOFT_MIN || word.includes("-")) return word;
  const parts: string[] = [];
  for (let i = 0; i < word.length; i += SOFT_EVERY) parts.push(word.slice(i, i + SOFT_EVERY));
  return parts.join("­");
}
const softName = (name: string) => name.trim().split(/\s+/).map(softHyphenate).join(" ");

/**
 * Nom écrit le plus grand possible dans sa place : on mesure réellement le texte,
 * ce qui marche quelle que soit la taille de la salle (nombre de colonnes, places par table).
 */
function FitName({ name, fitKey }: { name: string; fitKey: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    const cs = getComputedStyle(box);
    const availW = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (availW <= 0 || availH <= 0) return;
    const largest = (hyphens: "none" | "manual") => {
      el.style.hyphens = hyphens;
      for (const fs of TAG_FS) {
        el.style.setProperty("--tag-fs", `${fs}px`);
        if (el.scrollWidth <= availW + 0.5 && el.scrollHeight <= availH + 0.5) return fs;
      }
      return 0;
    };
    // On préfère garder les mots entiers ; on ne coupe un nom (avec un tiret)
    // que si cela permet d'écrire nettement plus gros.
    const cut = largest("manual");
    const whole = largest("none");
    const useWhole = whole > 0 && whole >= cut - 3;
    el.style.hyphens = useWhole ? "none" : "manual";
    el.style.setProperty("--tag-fs", `${useWhole ? whole : cut || (TAG_FS.at(-1) ?? 8)}px`);
  }, [name, fitKey]);
  return (
    <span ref={ref} className="tag-name">
      {softName(name)}
    </span>
  );
}

type Props = {
  student: Student;
  seated?: boolean | undefined;
  selected?: boolean | undefined;
  dragging?: boolean | undefined;
  conflict?: boolean | undefined;
  fitKey?: string | undefined;
  onPointerDown?: ((e: PointerEvent<HTMLElement>) => void) | undefined;
  onActivate?: (() => void) | undefined;
};

export function StudentTag({
  student: s,
  seated,
  selected,
  dragging,
  conflict,
  fitKey = "",
  onPointerDown,
  onActivate,
}: Props) {
  const color = s.gender === "F" ? "bg-tag-girl" : s.gender === "M" ? "bg-tag-boy" : "bg-tag";
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      onActivate?.();
    }
  };
  return (
    <div
      role="button"
      tabIndex={onActivate ? 0 : -1}
      aria-pressed={selected ? true : undefined}
      aria-label={`${s.name}${s.gender === "F" ? ", fille" : s.gender === "M" ? ", garçon" : ""}${selected ? ", sélectionné" : ""}`}
      title={s.name}
      onPointerDown={onPointerDown}
      onClick={(e) => {
        e.stopPropagation();
        onActivate?.();
      }}
      onKeyDown={onKey}
      className={`student-tag cursor-grab touch-manipulation select-none rounded-md border font-semibold text-tag-foreground shadow-sm outline-none transition-[box-shadow,opacity] hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing ${color} ${
        conflict
          ? "border-destructive border-2 print:border-desk-edge/40 print:border"
          : "border-desk-edge/40"
      } ${selected ? "ring-[3px] ring-primary ring-offset-1 ring-offset-card" : ""} ${dragging ? "opacity-35" : ""} ${
        seated
          ? "tag-seated flex h-full w-full items-center justify-center overflow-hidden px-1 py-0.5 text-center print:shadow-none"
          : "break-words px-2 py-1 text-xs leading-tight"
      }`}
    >
      {seated ? <FitName name={s.name} fitKey={fitKey} /> : s.name}
    </div>
  );
}

/** Copie de l'étiquette qui suit le doigt / la souris pendant un glissement. */
export function DragGhost({
  student,
  w,
  h,
  seated,
  ghostRef,
}: {
  student: Student;
  w: number;
  h: number;
  seated: boolean;
  ghostRef: (el: HTMLDivElement | null) => void;
}) {
  const color =
    student.gender === "F" ? "bg-tag-girl" : student.gender === "M" ? "bg-tag-boy" : "bg-tag";
  return (
    <div
      ref={ghostRef}
      aria-hidden
      className={`pointer-events-none fixed left-0 top-0 z-50 flex items-center justify-center rounded-md border border-desk-edge/60 px-1 text-center font-semibold leading-tight text-tag-foreground shadow-xl ${color} ${seated ? "text-[13px]" : "text-xs"}`}
      style={{ width: w, height: h, rotate: "-2deg" }}
    >
      <span className="line-clamp-3 break-words hyphens-manual">{softName(student.name)}</span>
    </div>
  );
}
