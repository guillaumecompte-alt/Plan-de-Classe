import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * Glisser-déposer par « pointer events » : fonctionne à la souris, au stylet et au doigt
 * (tablette, téléphone, TBI), contrairement au glisser-déposer HTML5 natif.
 *
 * - Souris / stylet : le glissement commence dès que le pointeur bouge de quelques pixels.
 * - Doigt : appui maintenu (~0,2 s) puis glissement ; un glissement immédiat fait défiler la page.
 * - Les cibles portent l'attribut `data-drop` ("list" ou la clé de la place).
 * - Près des bords de l'écran, la page défile automatiquement.
 */

type Session = {
  id: string;
  pointerId: number;
  type: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
  dragging: boolean;
  timer: number | null;
  raf: number | null;
  scrollV: number;
};

export type GhostBox = { w: number; h: number };

const LONG_PRESS_MS = 220;
const EDGE = 72;

function targetAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  const t = el instanceof Element ? el.closest<HTMLElement>("[data-drop]") : null;
  return t?.dataset["drop"] ?? null;
}

type Setters = {
  setDragId: (v: string | null) => void;
  setOver: (v: string | null) => void;
  setGhost: (v: GhostBox | null) => void;
};

function createController(
  set: Setters,
  onDropRef: { current: (id: string, target: string | null) => void },
) {
  let session: Session | null = null;
  let ghostEl: HTMLDivElement | null = null;
  let suppressClick = false;

  const placeGhost = () => {
    if (session && ghostEl)
      ghostEl.style.transform = `translate(${session.x - session.ox}px, ${session.y - session.oy}px)`;
  };

  const tick = () => {
    const s = session;
    if (!s?.dragging) return;
    if (s.scrollV) {
      window.scrollBy(0, s.scrollV);
      set.setOver(targetAt(s.x, s.y));
    }
    s.raf = requestAnimationFrame(tick);
  };

  const startDrag = () => {
    const s = session;
    if (!s || s.dragging) return;
    s.dragging = true;
    s.timer = null;
    if (s.type === "touch" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(15);
      } catch {
        /* certains navigateurs refusent */
      }
    }
    set.setDragId(s.id);
    set.setGhost({ w: s.w, h: s.h });
    set.setOver(targetAt(s.x, s.y));
    s.raf = requestAnimationFrame(tick);
  };

  const end = (drop: boolean) => {
    const s = session;
    if (!s) return;
    if (s.timer !== null) window.clearTimeout(s.timer);
    if (s.raf !== null) cancelAnimationFrame(s.raf);
    session = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    if (s.dragging) {
      // Le « click » qui suit un glissement ne doit pas sélectionner l'élève
      suppressClick = true;
      window.setTimeout(() => (suppressClick = false), 0);
      const target = targetAt(s.x, s.y);
      if (drop && target) onDropRef.current(s.id, target === "list" ? null : target);
      set.setDragId(null);
      set.setOver(null);
      set.setGhost(null);
    }
  };

  function onMove(e: PointerEvent) {
    const s = session;
    if (!s || e.pointerId !== s.pointerId) return;
    s.x = e.clientX;
    s.y = e.clientY;
    if (!s.dragging) {
      const dist = Math.hypot(s.x - s.startX, s.y - s.startY);
      if (s.type === "touch") {
        if (dist > 10) end(false); // l'utilisateur fait défiler la page
      } else if (dist > 5) startDrag();
      return;
    }
    e.preventDefault();
    placeGhost();
    set.setOver(targetAt(s.x, s.y));
    const h = window.innerHeight;
    s.scrollV =
      s.y < EDGE
        ? -Math.ceil((EDGE - s.y) / 4)
        : s.y > h - EDGE
          ? Math.ceil((s.y - (h - EDGE)) / 4)
          : 0;
  }
  function onUp(e: PointerEvent) {
    if (session && e.pointerId === session.pointerId) end(true);
  }
  function onCancel(e: PointerEvent) {
    if (session && e.pointerId === session.pointerId) end(false);
  }

  return {
    begin(e: ReactPointerEvent<HTMLElement>, id: string) {
      if (e.button !== 0 || session) return;
      const rect = e.currentTarget.getBoundingClientRect();
      session = {
        id,
        pointerId: e.pointerId,
        type: e.pointerType,
        startX: e.clientX,
        startY: e.clientY,
        x: e.clientX,
        y: e.clientY,
        ox: e.clientX - rect.left,
        oy: e.clientY - rect.top,
        w: rect.width,
        h: rect.height,
        dragging: false,
        timer: null,
        raf: null,
        scrollV: 0,
      };
      if (e.pointerType === "touch") session.timer = window.setTimeout(startDrag, LONG_PRESS_MS);
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    },
    ghostRef(el: HTMLDivElement | null) {
      ghostEl = el;
      placeGhost();
    },
    clickWasDrag: () => suppressClick,
    isDragging: () => !!session?.dragging,
    cancel: () => end(false),
  };
}

export function usePointerDrag(onDrop: (id: string, target: string | null) => void) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [ghost, setGhost] = useState<GhostBox | null>(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const ctrl = useRef<ReturnType<typeof createController> | null>(null);
  if (!ctrl.current) ctrl.current = createController({ setDragId, setOver, setGhost }, onDropRef);
  const c = ctrl.current;

  // Empêche le défilement de la page pendant un glissement au doigt
  useEffect(() => {
    const block = (e: TouchEvent) => {
      if (c.isDragging()) e.preventDefault();
    };
    document.addEventListener("touchmove", block, { passive: false });
    return () => {
      document.removeEventListener("touchmove", block);
      c.cancel();
    };
  }, [c]);

  return {
    dragId,
    over,
    ghost,
    ghostRef: c.ghostRef,
    begin: c.begin,
    clickWasDrag: c.clickWasDrag,
  };
}
