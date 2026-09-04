import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, type PointerEvent as RPointerEvent } from 'react';
import { ARCH_RISE, NODE_H, NODE_W, type Layout } from '../layout';
import type { Person } from '../types';
import { Leaf } from './Leaf';

export interface CanvasHandle {
  focusNode: (id: string) => void;
  fit: (animate?: boolean) => void;
  zoomBy: (factor: number) => void;
}

interface Props {
  layout: Layout;
  people: Map<string, Person>;
  selectedId: string | null;
  highlightId: string | null;
  meId: string | null;
  relations: Map<string, string> | null;
  onSelect: (id: string | null) => void;
}

/**
 * A branch from (x1,y1) up to (x2,y2): a short vertical rise off the parent,
 * one straight diagonal, then a short vertical stub into the child's stem.
 * Straight segments with rounded joints — simple, but still reads as wood.
 */
function branchPath(x1: number, y1: number, x2: number, y2: number): string {
  const gap = y1 - y2;
  const rise = Math.min(34, gap * 0.3);
  const stub = Math.min(22, gap * 0.2);
  if (Math.abs(x2 - x1) < 1) return `M${x1},${y1} L${x2},${y2}`;
  return `M${x1},${y1} L${x1},${y1 - rise} L${x2},${y2 + stub} L${x2},${y2}`;
}

interface View {
  x: number;
  y: number;
  k: number;
}

const MIN_K = 0.12;
const MAX_K = 3;
const FOCUS_K = 1.35;
const TRUNK_H = 95;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Pannable, pinch-zoomable SVG canvas. The view transform lives in a ref and is
 * written straight to the DOM so dragging never waits on a React render.
 */
export const TreeCanvas = forwardRef<CanvasHandle, Props>(function TreeCanvas(
  { layout, people, selectedId, highlightId, meId, relations, onSelect },
  ref,
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const viewRef = useRef<View>({ x: 0, y: 0, k: 1 });
  const sizeRef = useRef({ w: 0, h: 0 });
  const animRef = useRef<number | null>(null);
  const fittedRef = useRef(false);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; mid: { x: number; y: number }; view: View } | null>(null);
  const movedRef = useRef(false);
  const downRef = useRef<{ x: number; y: number } | null>(null);

  const applyView = useCallback(() => {
    const { x, y, k } = viewRef.current;
    gRef.current?.setAttribute('transform', `translate(${x} ${y}) scale(${k})`);
  }, []);

  const stopAnim = () => {
    if (animRef.current != null) cancelAnimationFrame(animRef.current);
    animRef.current = null;
  };

  const animateTo = useCallback(
    (target: View, duration = 650) => {
      stopAnim();
      const from = { ...viewRef.current };
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const e = easeInOut(t);
        // Zoom feels smoother interpolated geometrically.
        const k = from.k * Math.pow(target.k / from.k, e);
        viewRef.current = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, k };
        applyView();
        if (t < 1) animRef.current = requestAnimationFrame(step);
        else animRef.current = null;
      };
      animRef.current = requestAnimationFrame(step);
    },
    [applyView],
  );

  const fitView = useCallback((): View | null => {
    const { w, h } = sizeRef.current;
    if (!w || !h || layout.nodes.size === 0) return null;
    const b = layout.bounds;
    // Layout y grows downward; on screen the tree grows upward.
    const minX = b.minX - 40;
    const maxX = b.maxX + 40;
    const minY = -b.maxY - 40;
    const maxY = -b.minY + TRUNK_H + 20;
    const bw = maxX - minX;
    const bh = maxY - minY;
    const k = Math.max(MIN_K, Math.min(1.1, (w - 32) / bw, (h - 140) / bh));
    return { k, x: w / 2 - ((minX + maxX) / 2) * k, y: h / 2 + 30 - ((minY + maxY) / 2) * k };
  }, [layout]);

  useImperativeHandle(
    ref,
    () => ({
      focusNode(id) {
        const n = layout.nodes.get(id);
        const { w, h } = sizeRef.current;
        if (!n || !w) return;
        const k = Math.min(MAX_K, Math.max(viewRef.current.k, FOCUS_K));
        animateTo({ k, x: w / 2 - n.x * k, y: h / 2 + 20 + n.y * k }, 750);
      },
      fit(animate = true) {
        const v = fitView();
        if (!v) return;
        if (animate) animateTo(v);
        else {
          viewRef.current = v;
          applyView();
        }
      },
      zoomBy(factor) {
        const { w, h } = sizeRef.current;
        const v = viewRef.current;
        const k = Math.max(MIN_K, Math.min(MAX_K, v.k * factor));
        const cx = w / 2;
        const cy = h / 2;
        animateTo({ k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k }, 260);
      },
    }),
    [layout, animateTo, fitView, applyView],
  );

  // Track the element size; fit once the first time we have both size and nodes.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      sizeRef.current = { w: r.width, h: r.height };
      if (!fittedRef.current) {
        const v = fitView();
        if (v) {
          viewRef.current = v;
          applyView();
          fittedRef.current = true;
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitView, applyView]);

  useEffect(() => {
    if (!fittedRef.current) {
      const v = fitView();
      if (v) {
        viewRef.current = v;
        applyView();
        fittedRef.current = true;
      }
    }
  }, [layout, fitView, applyView]);

  // Wheel zoom needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopAnim();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const v = viewRef.current;
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018));
      const k = Math.max(MIN_K, Math.min(MAX_K, v.k * factor));
      viewRef.current = { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k };
      applyView();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyView]);

  const local = (e: RPointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const startGesture = () => {
    const [a, b] = [...pointers.current.values()];
    gesture.current = {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      view: { ...viewRef.current },
    };
  };

  const onPointerDown = (e: RPointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    stopAnim();
    svgRef.current?.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) {
      movedRef.current = false;
      downRef.current = p;
      gesture.current = null;
    } else if (pointers.current.size === 2) {
      startGesture();
    }
  };

  const onPointerMove = (e: RPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    const prev = pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId, p);

    if (pointers.current.size === 1) {
      const v = viewRef.current;
      viewRef.current = { ...v, x: v.x + (p.x - prev.x), y: v.y + (p.y - prev.y) };
      if (downRef.current && Math.hypot(p.x - downRef.current.x, p.y - downRef.current.y) > 6) movedRef.current = true;
      applyView();
    } else if (pointers.current.size >= 2 && gesture.current) {
      movedRef.current = true;
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const g = gesture.current;
      const k = Math.max(MIN_K, Math.min(MAX_K, (g.view.k * dist) / Math.max(1, g.dist)));
      // Keep the world point that was under the original midpoint under the new one.
      const wx = (g.mid.x - g.view.x) / g.view.k;
      const wy = (g.mid.y - g.view.y) / g.view.k;
      viewRef.current = { k, x: mid.x - wx * k, y: mid.y - wy * k };
      applyView();
    }
  };

  const onPointerUp = (e: RPointerEvent) => {
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    svgRef.current?.releasePointerCapture(e.pointerId);
    if (wasSingle && !movedRef.current && e.type === 'pointerup') {
      // A tap. Pointer capture retargets the browser's click to the <svg>, so
      // hit-test ourselves instead of relying on click handlers on leaves.
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const leaf = el?.closest<SVGGElement>('g.leaf[data-id]');
      onSelect(leaf?.dataset.id ?? null);
    }
    if (pointers.current.size === 1) {
      // Dropping from pinch to drag: restart the drag from the remaining finger.
      gesture.current = null;
      const [[, p]] = [...pointers.current.entries()];
      downRef.current = p;
    } else if (pointers.current.size === 0) {
      gesture.current = null;
    }
  };

  return (
    <svg
      ref={svgRef}
      className="tree-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <g ref={gRef}>
        {layout.roots.map((id) => {
          const n = layout.nodes.get(id)!;
          const top = -n.y + NODE_H / 2 - 12;
          const bottom = top + TRUNK_H;
          return (
            <g key={`trunk-${id}`}>
              <ellipse cx={n.x} cy={bottom} rx={NODE_W * 0.55} ry={9} fill="#5b4334" opacity="0.13" />
              <path
                d={`M${n.x - 12},${top} C${n.x - 14},${top + 45} ${n.x - 22},${bottom - 20} ${n.x - 34},${bottom} L${n.x + 34},${bottom} C${n.x + 22},${bottom - 20} ${n.x + 14},${top + 45} ${n.x + 12},${top} Z`}
                fill="#7b5c45"
              />
            </g>
          );
        })}

        {layout.couples.map((c) => {
          // A couple's stems meet in a plain inverted V above their leaves.
          // Solid wood like any branch, but paler with a dashed grain so the
          // graft (not a bloodline) reads at a glance. Children grow from the peak.
          const left = c.a.x < c.b.x ? c.a : c.b;
          const right = c.a.x < c.b.x ? c.b : c.a;
          const yTop = -left.y - NODE_H / 2 + 14; // just inside each leaf's tip
          const x1 = left.x + 16;
          const x2 = right.x - 16;
          const mx = (x1 + x2) / 2;
          const peak = -left.y - ARCH_RISE;
          const d = `M${x1},${yTop} L${mx},${peak} L${x2},${yTop}`;
          return (
            <g key={c.familyId} className="bough">
              <path className="bough-wood" d={d} />
              <path className="bough-grain" d={d} />
              <circle cx={mx} cy={peak} r={5} className="bough-knot" />
            </g>
          );
        })}

        {layout.branches.map((b) => {
          const x1 = b.from.x;
          const y1 = -b.from.y;
          const x2 = b.to.x;
          const y2 = -b.to.y;
          // One stroke per branch; thickness steps down by generation.
          const width = Math.max(4, 12 - b.depth * 2);
          return (
            <g key={`${b.familyId}-${b.childId}`} className="branch">
              <path d={branchPath(x1, y1, x2, y2)} strokeWidth={width} />
            </g>
          );
        })}

        {[...layout.nodes.values()].map((n) => {
          const person = people.get(n.id);
          if (!person) return null;
          return (
            <Leaf
              key={n.id}
              node={n}
              person={person}
              selected={selectedId === n.id}
              highlight={highlightId === n.id}
              isMe={meId === n.id}
              relation={relations?.get(n.id)}
            />
          );
        })}
      </g>
    </svg>
  );
});
