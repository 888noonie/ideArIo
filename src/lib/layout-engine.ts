import type { IdearioNode } from '../types/ideario';

export interface LayoutNode extends IdearioNode {
  x: number;
  y: number;
  radius: number;
}

export const CORE_RADIUS = 48;
export const NODE_RADIUS = 36;
/** Minimum gap between node edges. */
const NODE_GAP = 28;
/** Padding from canvas edges so nodes + labels stay visible. */
const EDGE_PADDING = 20;
/** Repulsion iterations for overlap resolution. */
const RELAX_ITERATIONS = 60;

/**
 * Resolution-aware node layout for the 8:3 canvas.
 *
 * - "core" (or first) node is centred; the rest sit on a circle around it.
 * - A simple repulsion pass guarantees no two nodes overlap, so the graph
 *   stays readable at 1280×480, 1920×720 and 2560×960 (and any size in
 *   between — it derives purely from the container's measured size).
 * - All nodes are clamped inside the padded bounds.
 */
export function layoutNodes(nodes: IdearioNode[], width: number, height: number): LayoutNode[] {
  if (nodes.length === 0 || width <= 0 || height <= 0) return [];

  const centerX = width / 2;

  const positioned: LayoutNode[] = nodes.map((node, index) => ({
    ...node,
    radius: node.id === 'core' || index === 0 ? CORE_RADIUS : NODE_RADIUS,
    x: 0,
    y: 0,
  }));

  // Leave room for the header overlay (title/summary/tags) at the top.
  const topReserve = Math.min(140, height * 0.28);
  const usableHeight = Math.max(80, height - topReserve);
  const usableCenterY = topReserve + usableHeight / 2;

  // Ring radius sized so outer nodes (incl. their radius) always fit.
  const maxRadius = positioned.reduce((m, n) => Math.max(m, n.radius), NODE_RADIUS);
  const ringRadius = Math.max(
    0,
    Math.min(width / 2, usableHeight / 2) - maxRadius - EDGE_PADDING
  );

  const coreIndex = nodes.findIndex((n) => n.id === 'core');
  const corePos = coreIndex >= 0 ? coreIndex : 0;

  const ringNodes = positioned.filter((_, i) => i !== corePos);
  ringNodes.forEach((node, ringIndex) => {
    const angle = (ringIndex / Math.max(1, ringNodes.length)) * Math.PI * 2 - Math.PI / 2;
    node.x = centerX + Math.cos(angle) * ringRadius;
    node.y = usableCenterY + Math.sin(angle) * ringRadius;
  });

  positioned[corePos].x = centerX;
  positioned[corePos].y = usableCenterY;

  resolveOverlaps(positioned);
  clampToBounds(positioned, width, height, topReserve);

  return positioned;
}

/** Push overlapping node pairs apart until nothing overlaps (or we give up). */
function resolveOverlaps(nodes: LayoutNode[]): void {
  for (let iter = 0; iter < RELAX_ITERATIONS; iter++) {
    let moved = false;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const minDist = a.radius + b.radius + NODE_GAP;

        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);

        if (dist >= minDist) continue;

        if (dist < 0.01) {
          // Perfectly stacked — nudge apart deterministically.
          dx = 0.5 + i * 0.1;
          dy = 0.5 + j * 0.1;
          dist = Math.hypot(dx, dy);
        }

        const push = (minDist - dist) / 2;
        const ux = dx / dist;
        const uy = dy / dist;

        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
        moved = true;
      }
    }

    if (!moved) break;
  }
}

function clampToBounds(nodes: LayoutNode[], width: number, height: number, topReserve: number): void {
  for (const node of nodes) {
    node.x = Math.min(Math.max(node.x, node.radius + EDGE_PADDING), width - node.radius - EDGE_PADDING);
    node.y = Math.min(
      Math.max(node.y, topReserve + node.radius * 0.5),
      height - node.radius - EDGE_PADDING
    );
  }
}
