import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, IconButton } from './misc.jsx';

/** Focus is trapped while open and returned to the trigger on close (NFR-16). */
export const Modal = ({
  open,
  onClose,
  title,
  children,
  footer,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    restoreTo.current = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;

      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLElement>('input, textarea, button')?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      restoreTo.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title} ref={panelRef}>
        <header className="modal__head">
          <h2 className="modal__title">{title}</h2>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
};

export const ConfirmDialog = ({
  open, title, message, confirmLabel = 'Delete', busy, onConfirm, onCancel,
}: {
  open: boolean; title: string; message: ReactNode; confirmLabel?: string;
  busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) => (
  <Modal
    open={open}
    onClose={onCancel}
    title={title}
    width={430}
    footer={
      <>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm} loading={busy}>
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </>
    }
  >
    <div className="stack">{message}</div>
  </Modal>
);
