// Export du plan en PDF, dessiné directement (formes et texte vectoriels) avec jsPDF :
// le fichier est téléchargé tout de suite, sans passer par la fenêtre d'impression.
import type { jsPDF as JsPDF } from "jspdf";

import { pdfFileName, seatKey, type ClassPlan } from "./plan";

type JsPDFCtor = typeof JsPDF;
type RGB = [number, number, number];

const COLORS = {
  text: [40, 32, 57] as RGB,
  desk: [236, 235, 245] as RGB,
  deskEdge: [109, 100, 184] as RGB,
  seat: [255, 255, 255] as RGB,
  tagEdge: [150, 144, 196] as RGB,
  girl: [255, 224, 235] as RGB,
  boy: [220, 233, 255] as RGB,
  other: [255, 244, 194] as RGB,
};

const MARGIN = 10; // mm
const PT = 0.3528; // 1 point typographique en mm
const LINE = 1.15; // interligne
const NAME_SIZES = [14, 13, 12, 11, 10, 9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5, 5];

// Caractères des polices PDF standard (Helvetica, codage WinAnsi) en plus du Latin-1
const WIN_ANSI_EXTRA = new Set("ŒœŠšŸŽžƒ–—‘’‚“”„†‡•…‰‹›€™ˆ˜");

/** Les polices PDF standard ne connaissent que l'alphabet latin : « Łukasz » → « Lukasz ». */
export function pdfSafe(text: string): string {
  let out = "";
  for (const ch of text) {
    if (ch.charCodeAt(0) <= 0xff || WIN_ANSI_EXTRA.has(ch)) out += ch;
    else {
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      const map: Record<string, string> = {
        ł: "l",
        Ł: "L",
        đ: "d",
        Đ: "D",
        ı: "i",
        ø: "o",
        Ø: "O",
      };
      out += base.length === 1 && base.charCodeAt(0) <= 0xff ? base : (map[ch] ?? "?");
    }
  }
  return out;
}

/**
 * Découpe un nom en lignes à une taille donnée : coupure aux espaces, ou après
 * un trait d'union (« FONTAINE- / SAINT-AUBERT ») ; jamais au milieu d'un mot.
 */
export function wrapName(doc: JsPDF, name: string, w: number, fs: number): string[] {
  doc.setFontSize(fs);
  const parts: { text: string; space: boolean }[] = [];
  name
    .split(/\s+/)
    .filter(Boolean)
    .forEach((word, i) =>
      word.split(/(?<=-)/).forEach((text, j) => parts.push({ text, space: i > 0 && j === 0 })),
    );
  const lines: string[] = [];
  for (const { text, space } of parts) {
    const last = lines[lines.length - 1];
    const joined = last === undefined ? text : `${last}${space ? " " : ""}${text}`;
    if (last !== undefined && doc.getTextWidth(joined) <= w) lines[lines.length - 1] = joined;
    else lines.push(text);
  }
  return lines;
}

const fits = (doc: JsPDF, lines: string[], w: number, h: number, fs: number) =>
  lines.every((l) => doc.getTextWidth(l) <= w) && lines.length * fs * PT * LINE <= h;

/** Plus grande taille d'écriture pour que le nom tienne dans la place. */
export function fitName(
  doc: JsPDF,
  name: string,
  w: number,
  h: number,
  maxSize = NAME_SIZES[0] ?? 14,
): { size: number; lines: string[] } {
  for (const fs of NAME_SIZES) {
    if (fs > maxSize) continue;
    const lines = wrapName(doc, name, w, fs);
    if (fits(doc, lines, w, h, fs)) return { size: fs, lines };
  }
  // Dernier recours : couper les mots trop longs à la plus petite taille
  const fs = NAME_SIZES[NAME_SIZES.length - 1] ?? 5;
  doc.setFontSize(fs);
  const lines = doc.splitTextToSize(name, w) as string[];
  const max = Math.max(1, Math.floor(h / (fs * PT * LINE)));
  return { size: fs, lines: lines.slice(0, max) };
}

/**
 * Taille commune à tous les noms, pour un plan homogène : celle qui convient à 3 noms sur 4.
 * Les noms plus longs sont seuls à être écrits plus petit.
 */
export function commonNameSize(sizes: number[]): number {
  if (!sizes.length) return NAME_SIZES[0] ?? 14;
  const sorted = [...sizes].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 4)] ?? sorted[0] ?? 14;
}

/** Dessine le plan d'une classe sur une page A4 (paysage si la salle est large). */
export function buildPlanPdf(JsPDFClass: JsPDFCtor, cls: ClassPlan): JsPDF {
  const { cols, rows, per } = cls.layout;
  const landscape = cols * per > 8;
  const doc = new JsPDFClass({
    orientation: landscape ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const byId = new Map(cls.students.map((s) => [s.id, s]));
  const title = cls.name.trim();

  doc.setProperties({
    title: pdfFileName(title || "Classe"),
    subject: "Plan de classe",
    creator: "Plan de classe",
  });
  doc.setTextColor(...COLORS.text);

  // En-tête
  let y = MARGIN + 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(pdfSafe(title), pageW / 2, y, { align: "center" });
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text("Plan de classe", pageW / 2, y, { align: "center" });
  const gridTop = y + 6;

  // Grille de tables puis bureau du professeur, centrés ensemble sous l'en-tête
  const deskH = 11;
  const deskW = Math.min(75, pageW - 2 * MARGIN);
  const deskGap = 8;
  const colGap = cols > 1 ? Math.min(6, 30 / (cols - 1)) : 0;
  const rowGap = rows > 6 ? 2.5 : 3.5;
  const colW = (pageW - 2 * MARGIN - (cols - 1) * colGap) / cols;
  const avail = pageH - MARGIN - gridTop;
  const tableH = Math.min(28, (avail - deskGap - deskH - (rows - 1) * rowGap) / rows);
  const gridH = rows * tableH + (rows - 1) * rowGap;
  const top = gridTop + Math.max(0, (avail - (gridH + deskGap + deskH)) / 2);
  const deskY = top + gridH + deskGap;
  const pad = 1.2;
  const seatGap = 1.2;
  const seatW = (colW - 2 * pad - (per - 1) * seatGap) / per;
  const seatH = tableH - 2 * pad;
  const radius = Math.min(1.5, seatH / 6);
  const inner = 1;

  // Taille d'écriture commune (voir commonNameSize)
  doc.setFont("helvetica", "bold");
  const placed = Object.values(cls.seats)
    .map((id) => byId.get(id))
    .filter((s): s is NonNullable<typeof s> => !!s);
  const nameSize = commonNameSize(
    placed.map((st) => fitName(doc, pdfSafe(st.name), seatW - 2 * inner, seatH - 2 * inner).size),
  );

  doc.setLineWidth(0.35);
  for (let c = 0; c < cols; c++) {
    const x = MARGIN + c * (colW + colGap);
    for (let r = 0; r < rows; r++) {
      const ty = top + (rows - 1 - r) * (tableH + rowGap);
      doc.setFillColor(...COLORS.desk);
      doc.setDrawColor(...COLORS.deskEdge);
      doc.setLineWidth(0.5);
      doc.roundedRect(x, ty, colW, tableH, radius, radius, "FD");
      doc.setLineWidth(0.25);
      for (let s = 0; s < per; s++) {
        const sx = x + pad + s * (seatW + seatGap);
        const sy = ty + pad;
        const student = byId.get(cls.seats[seatKey(c, r, s)] ?? "");
        if (!student) {
          doc.setFillColor(...COLORS.seat);
          doc.setDrawColor(...COLORS.desk);
          doc.roundedRect(sx, sy, seatW, seatH, radius, radius, "F");
          continue;
        }
        const fill =
          student.gender === "F" ? COLORS.girl : student.gender === "M" ? COLORS.boy : COLORS.other;
        doc.setFillColor(...fill);
        doc.setDrawColor(...COLORS.tagEdge);
        doc.roundedRect(sx, sy, seatW, seatH, radius, radius, "FD");
        doc.setFont("helvetica", "bold");
        const { size, lines } = fitName(
          doc,
          pdfSafe(student.name),
          seatW - 2 * inner,
          seatH - 2 * inner,
          nameSize,
        );
        doc.setFontSize(size);
        const lh = size * PT * LINE;
        // Texte centré verticalement : base de la 1re ligne
        const firstBase = sy + seatH / 2 - (lines.length * lh) / 2 + lh * 0.78;
        lines.forEach((line, i) =>
          doc.text(line, sx + seatW / 2, firstBase + i * lh, { align: "center" }),
        );
      }
    }
  }

  // Bureau du professeur
  doc.setFillColor(...COLORS.desk);
  doc.setDrawColor(...COLORS.deskEdge);
  doc.setLineWidth(0.5);
  doc.roundedRect((pageW - deskW) / 2, deskY, deskW, deskH, 1.5, 1.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Bureau du professeur", pageW / 2, deskY + deskH / 2 + 1.5, { align: "center" });

  return doc;
}

/** Crée le PDF et le télécharge sous « 6A_plandeclasse_09.11.2026.pdf ». */
export async function downloadPlanPdf(cls: ClassPlan, date = new Date()): Promise<string> {
  // jsPDF (≈ 350 ko) n'est chargé qu'au moment de l'export
  const { jsPDF } = await import("jspdf");
  const fileName = `${pdfFileName(cls.name.trim(), date)}.pdf`;
  buildPlanPdf(jsPDF, cls).save(fileName);
  return fileName;
}
