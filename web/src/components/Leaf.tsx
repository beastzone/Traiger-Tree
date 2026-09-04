import { memo } from 'react';
import { NODE_W, type LayoutNode } from '../layout';
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

/** A New England fall orange for the leaf that is "you". */
export const ME_COLORS = { fill: 'hsl(26 72% 54%)', stroke: 'hsl(22 70% 36%)' };

const TAG_FONT = 10.5;
const TAG_MAX_W = NODE_W - 4;

/** Fit a relation phrase into a tag of at most two lines. */
function fitTag(text: string): { lines: string[]; width: number } {
  const perChar = TAG_FONT * 0.56;
  const pad = 16;
  const maxChars = Math.floor((TAG_MAX_W - pad) / perChar);
  const lines: string[] = [];
  let cur = '';
  for (const w of text.split(' ')) {
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
  const longest = Math.max(...lines.map((l) => l.length));
  return { lines, width: Math.max(40, Math.min(TAG_MAX_W, longest * perChar + pad)) };
}

interface Props {
  node: LayoutNode;
  person: Person;
  selected: boolean;
  highlight: boolean;
  isMe: boolean;
  /** "first cousin once removed" etc., shown as a tag at the stem when someone is "you". */
  relation?: string;
  /** Shown under the name when someone else in the tree has the same name: birth year or short ID. */
  disambiguator?: string;
}

export const Leaf = memo(function Leaf({ node, person, selected, highlight, isMe, relation, disambiguator }: Props) {
  const { fill, stroke } = isMe ? ME_COLORS : leafColors(person.id);
  const lines = wrapName(person.name);
  const clipId = `clip-${person.id}`;
  const cls = `leaf${selected ? ' selected' : ''}${highlight ? ' highlight' : ''}${isMe ? ' me' : ''}`;
  const tag = relation && !isMe ? fitTag(relation) : null;

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

      {isMe && (
        <text className="leaf-you" x="0" y={lines.length > 1 ? 62 : 54}>
          you
        </text>
      )}
      {!isMe && disambiguator && (
        <text className="leaf-sub" x="0" y={lines.length > 1 ? 61 : 52}>
          {disambiguator}
        </text>
      )}

      {tag && (
        <g className="leaf-tag" transform="translate(0 84)">
          <rect
            x={-tag.width / 2}
            y={-9}
            width={tag.width}
            height={tag.lines.length > 1 ? 30 : 18}
            rx={9}
          />
          <text x="0" y={tag.lines.length > 1 ? -3 : 0.5}>
            {tag.lines.map((l, i) => (
              <tspan key={i} x="0" dy={i === 0 ? 0 : 12}>
                {l}
              </tspan>
            ))}
          </text>
        </g>
      )}
    </g>
  );
});
