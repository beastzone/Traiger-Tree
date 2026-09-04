const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const IconBack = () => (
  <svg viewBox="0 0 24 24" {...base}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
export const IconSearch = () => (
  <svg viewBox="0 0 24 24" {...base}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </svg>
);
export const IconClose = () => (
  <svg viewBox="0 0 24 24" {...base}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const IconPlus = () => (
  <svg viewBox="0 0 24 24" {...base}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconMinus = () => (
  <svg viewBox="0 0 24 24" {...base}>
    <path d="M5 12h14" />
  </svg>
);
export const IconFit = () => (
  <svg viewBox="0 0 24 24" {...base}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);
export const IconMore = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <circle cx="6" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="18" cy="12" r="1.8" />
  </svg>
);
export const IconLock = () => (
  <svg viewBox="0 0 24 24" {...base}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 018 0v4" />
  </svg>
);
export const IconLeaf = () => (
  <svg viewBox="0 0 24 24" {...base}>
    <path d="M12 3c5 2.5 7.5 7 7.5 11 0 4.5-3.5 7.5-7.5 8-4-.5-7.5-3.5-7.5-8 0-4 2.5-8.5 7.5-11z" />
    <path d="M12 6v15" />
  </svg>
);
