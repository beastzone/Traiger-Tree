export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

export function Avatar({ name, photo, size }: { name: string; photo: string | null; size?: 'lg' | 'xl' }) {
  const cls = `avatar${size ? ` ${size}` : ''}`;
  return photo ? <img className={cls} src={photo} alt="" /> : <div className={cls}>{initials(name)}</div>;
}
