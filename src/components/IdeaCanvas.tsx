import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import type { IdearioYAML, IdearioNode } from '../types/ideario';
import { layoutNodes } from '../lib/layout-engine';
import { NodeDetail } from './NodeDetail';

interface IdeaCanvasProps {
  ideario: IdearioYAML | null;
}

const NODE_COLORS: Record<IdearioNode['type'], string> = {
  concept: '#00f5d4',
  action: '#ff4757',
  question: '#feca57',
  resource: '#54a0ff',
};

/** Pixels of pointer movement before a gesture counts as a pan, not a tap. */
const DRAG_THRESHOLD = 8;

export function IdeaCanvas({ ideario }: IdeaCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const draggedRef = useRef(false);

  // Recentre + relayout whenever the canvas resizes (any 8:3 resolution).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    };
    update();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(update);
      observer.observe(el);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Reset pan + selection when a new idea loads.
  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setSelectedNodeId(null);
  }, [ideario]);

  const positionedNodes = useMemo(() => {
    if (!ideario) return [];
    return layoutNodes(ideario.nodes, dimensions.width, dimensions.height);
  }, [ideario, dimensions]);

  const connections = useMemo(() => {
    if (!ideario) return [];
    const nodeMap = new Map(positionedNodes.map((n) => [n.id, n]));
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];

    for (const node of positionedNodes) {
      for (const targetId of node.connections) {
        const target = nodeMap.get(targetId);
        if (target) {
          lines.push({ x1: node.x, y1: node.y, x2: target.x, y2: target.y });
        }
      }
    }
    return lines;
  }, [positionedNodes, ideario]);

  const clampPan = useCallback((x: number, y: number) => {
    const maxX = dimensions.width * 0.6;
    const maxY = dimensions.height * 0.6;
    return {
      x: Math.min(Math.max(x, -maxX), maxX),
      y: Math.min(Math.max(y, -maxY), maxY),
    };
  }, [dimensions]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: pan.x,
      originY: pan.y,
    };
    draggedRef.current = false;
    containerRef.current?.setPointerCapture(e.pointerId);
  }, [pan]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (!draggedRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    draggedRef.current = true;
    setPan(clampPan(drag.originX + dx, drag.originY + dy));
  }, [clampPan]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
      containerRef.current?.releasePointerCapture(e.pointerId);
      // draggedRef intentionally NOT reset here: the click event fires after
      // pointerup and must still see "this was a drag". It resets on the
      // next pointerdown.
    }
  }, []);

  const handleNodeTap = useCallback((nodeId: string) => {
    if (draggedRef.current) return; // it was a pan, not a tap
    setSelectedNodeId(nodeId);
  }, []);

  const selectedNode = useMemo(
    () => (ideario && selectedNodeId ? ideario.nodes.find((n) => n.id === selectedNodeId) ?? null : null),
    [ideario, selectedNodeId]
  );

  if (!ideario) {
    return (
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center text-ario-muted"
      >
        <div className="text-center">
          <p className="text-2xl mb-2">Your ideas will appear here</p>
          <p className="text-sm">Tap Ario and start speaking</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden"
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Header */}
      <div className="absolute top-4 left-4 right-4 z-10 pointer-events-none">
        <h2 className="text-2xl font-semibold text-ario-text truncate">{ideario.title}</h2>
        <p className="text-ario-muted text-sm mt-1 line-clamp-2">{ideario.summary}</p>
        <div className="flex flex-wrap gap-2 mt-2">
          {ideario.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-1 text-xs rounded-full bg-ario-turquoise/10 text-ario-turquoise border border-ario-turquoise/20"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Graph */}
      <svg
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
      >
        <defs>
          {/*
            userSpaceOnUse: objectBoundingBox gradients paint nothing on
            perfectly horizontal/vertical lines (zero-size bounding box).
          */}
          <linearGradient
            id="edgeGradient"
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2={dimensions.width}
            y2="0"
          >
            <stop offset="0%" stopColor="#00f5d4" stopOpacity="0.25" />
            <stop offset="50%" stopColor="#ff4757" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#00f5d4" stopOpacity="0.25" />
          </linearGradient>
        </defs>

        <g transform={`translate(${pan.x}, ${pan.y})`}>
          {/* Connections */}
          {connections.map((line, i) => (
            <line
              key={i}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="url(#edgeGradient)"
              strokeWidth="2"
            />
          ))}

          {/* Nodes */}
          {positionedNodes.map((node) => (
            <g
              key={node.id}
              onClick={() => handleNodeTap(node.id)}
              className="cursor-pointer"
              role="button"
              aria-label={`Node ${node.label}`}
            >
              {/* Generous invisible hit area for touch (>= 72px diameter) */}
              <circle cx={node.x} cy={node.y} r={Math.max(node.radius, 40)} fill="transparent" />
              <circle
                cx={node.x}
                cy={node.y}
                r={node.radius}
                fill={NODE_COLORS[node.type]}
                fillOpacity={selectedNodeId === node.id ? 0.35 : node.id === 'core' ? 0.2 : 0.15}
                stroke={NODE_COLORS[node.type]}
                strokeWidth={selectedNodeId === node.id ? 3 : 2}
                className="drop-shadow-[0_0_12px_rgba(0,245,212,0.3)]"
              />
              <text
                x={node.x}
                y={node.y}
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ fill: 'rgb(var(--text-primary))' }}
                fontSize={node.id === 'core' ? 14 : 12}
                fontWeight={node.id === 'core' ? 600 : 400}
                pointerEvents="none"
              >
                {node.label}
              </text>
              <text
                x={node.x}
                y={node.y + (node.id === 'core' ? 20 : 18)}
                textAnchor="middle"
                fill={NODE_COLORS[node.type]}
                fontSize="10"
                style={{ textTransform: 'uppercase' }}
                pointerEvents="none"
              >
                {node.type}
              </text>
            </g>
          ))}
        </g>
      </svg>

      {/* Node detail modal */}
      {selectedNode && (
        <NodeDetail
          node={selectedNode}
          allNodes={ideario.nodes}
          ideaTitle={ideario.title}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
}
