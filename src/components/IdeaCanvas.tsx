import { useMemo, useRef, useEffect, useState } from 'react';
import type { IdearioYAML, IdearioNode } from '../types/ideario';

interface IdeaCanvasProps {
  ideario: IdearioYAML | null;
}

interface PositionedNode extends IdearioNode {
  x: number;
  y: number;
}

const HEADER_SPACE = 120;

function layoutNodes(nodes: IdearioNode[], width: number, height: number): PositionedNode[] {
  if (nodes.length === 0) return [];

  const centerX = width / 2;
  const usableHeight = Math.max(height - HEADER_SPACE, 160);
  const centerY = HEADER_SPACE + usableHeight / 2;
  const radius = Math.min(width * 0.32, usableHeight * 0.36);

  return nodes.map((node, index) => {
    if (node.id === 'core' || index === 0) {
      return { ...node, x: centerX, y: centerY };
    }

    // Distribute other nodes in a circle
    const angle = ((index - 1) / Math.max(1, nodes.length - 1)) * Math.PI * 2 - Math.PI / 2;
    return {
      ...node,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  });
}

const NODE_COLORS: Record<IdearioNode['type'], string> = {
  concept: '#00f5d4',
  action: '#ff4757',
  question: '#feca57',
  resource: '#54a0ff',
};

function displayNodeLabel(label: string): string {
  return label.length > 17 ? `${label.slice(0, 16)}…` : label;
}

export function IdeaCanvas({ ideario }: IdeaCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });

  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => {
      const rect = containerRef.current!.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

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

  if (!ideario) {
    return (
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center text-ario-muted"
      >
        <div className="text-center ario-empty-state">
          <div className="ario-empty-orbit mx-auto mb-5">
            <span className="ario-empty-core" />
          </div>
          <p className="text-2xl font-medium text-ario-text mb-2">Your next idea starts here</p>
          <p className="text-sm max-w-xs">Speak naturally and Ario will shape the important connections.</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden ario-canvas">
      {/* Header */}
      <div className="absolute top-4 left-4 right-4 z-10 ario-canvas-header">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2 w-2 rounded-full bg-ario-turquoise shadow-[0_0_12px_rgba(0,245,212,0.9)]" />
          <h2 className="text-2xl font-semibold text-ario-text truncate">{ideario.title}</h2>
        </div>
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
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
      >
        <defs>
          <linearGradient id="edgeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00f5d4" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#ff4757" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#00f5d4" stopOpacity="0.2" />
          </linearGradient>
        </defs>

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
          <g key={node.id}>
            <circle
              cx={node.x}
              cy={node.y}
              r={node.id === 'core' ? 48 : 36}
              fill={NODE_COLORS[node.type]}
              fillOpacity={node.id === 'core' ? 0.2 : 0.15}
              stroke={NODE_COLORS[node.type]}
              strokeWidth="2"
              className="drop-shadow-[0_0_12px_rgba(0,245,212,0.3)]"
            />
            <text
              x={node.x}
              y={node.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#e8eef5"
              fontSize={node.id === 'core' ? 14 : 12}
              fontWeight={node.id === 'core' ? 600 : 400}
            >
              {displayNodeLabel(node.label)}
            </text>
            <text
              x={node.x}
              y={node.y + (node.id === 'core' ? 20 : 18)}
              textAnchor="middle"
              fill={NODE_COLORS[node.type]}
              fontSize="10"
              className="uppercase"
            >
              {node.type}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
