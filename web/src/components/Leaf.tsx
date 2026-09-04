import { memo } from 'react';
import type { LayoutNode } from '../layout';
import type { Person } from '../types';
import { initials } from './Avatar';

// A leaf pointing upward, roughly 112×146, centred on the origin.
export const LEAF_PATH =
  'M0,-72 C38,-62 58,-28 56,8 C54,44 30,70 0,74 C-30,70 -54,44 -56,8 C-58,-28 -38,-62 0,-72 Z';

const PHOTO_R = 30;
const PHOTO_Y = -20;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Slightly different green per leaf so the canopy doesn't look stamped. */
export function leafColors(id: string): { fill: string; stroke: string } {
  const h = hash(id);
  const hue = 98 + (h % 17) - 8;
  const sat = 22 + ((h >> 5) % 9);
  const light = 60 + ((h >> 9) % 7);
  return { fill: `hsl(${hue} ${sat}% ${light}%)`, stroke: `hsl(${hue} ${sat + 6}% ${light - 18}%)` };
}

function wrapName(name: string, maxChars = 15): string[] {
  const words = name.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > 2) {
    lines.length = 2;
    lines[1] = `${lines[1].slice(0, maxChars - 1)}…`;
  }
  return lines.map((l) => (l.length > maxChars + 2 ? `${l.slice(0, maxChars + 1)}…` : l));
}

interface Props {
  node: LayoutNode;
  person: Person;
  selected: boolean;
  highlight: boolean;
}

export const Leaf = memo(function Leaf({ node, person, selected, highlight }: Props) {
  const { fill, stroke } = leafColors(person.id);
  const lines = wrapName(person.name);
  const clipId = `clip-${person.id}`;
  const cls = `leaf${selected ? ' selected' : ''}${highlight ? ' highlight' : ''}`;

  return (
    <g
      className={cls}
      transform={`translate(${node.x} ${-node.y})`}
      data-id={person.id}
      role="button"
      aria-label={person.name}
    >
      <path className="leaf-halo" d={LEAF_PATH} />
      <path className="leaf-body" d={LEAF_PATH} fill={fill} stroke={stroke} />
      <path d="M0,-66 C4,-30 4,30 0,68" fill="none" stroke={stroke} strokeWidth="1.2" opacity="0.5" />
      <path className="leaf-outline" d={LEAF_PATH} />

      <circle cx="0" cy={PHOTO_Y} r={PHOTO_R + 3} fill="#fbf8f2" />
      {person.photo ? (
        <>
          <clipPath id={clipId}>
            <circle cx="0" cy={PHOTO_Y} r={PHOTO_R} />
          </clipPath>
          <image
            href={person.photo}
            x={-PHOTO_R}
            y={PHOTO_Y - PHOTO_R}
            width={PHOTO_R * 2}
            height={PHOTO_R * 2}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
          />
        </>
      ) : (
        <text className="leaf-initials" x="0" y={PHOTO_Y}>
          {initials(person.name)}
        </text>
      )}

      <text className="leaf-name" x="0" y={lines.length > 1 ? 30 : 36}>
        {lines.map((l, i) => (
          <tspan key={i} x="0" dy={i === 0 ? 0 : 16}>
            {l}
          </tspan>
        ))}
      </text>
    </g>
  );
});
