import { useEffect, type ReactNode } from 'react';

interface Props {
  onClose?: () => void;
  children: ReactNode;
}

/** Bottom sheet on phones, centred dialog on wider screens. */
export function Sheet({ onClose, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="sheet-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-grip" />
        {children}
      </div>
    </div>
  );
}

interface ConfirmProps {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function Confirm({ title, children, confirmLabel, danger, busy, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Sheet onClose={onCancel}>
      <h2>{title}</h2>
      {children}
      <div className="actions">
        <button className={`btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </button>
        <button className="btn btn-quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}
