import { useEffect, useId, useRef, type ReactNode } from "react";

interface AuthDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  variant?: "online" | "success";
}

export default function AuthDialog({ open, onClose, title, children, actions, variant = "online" }: AuthDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    const previousFocus = document.activeElement;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={`auth-dialog auth-dialog--${variant}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <div className="auth-dialog-content">
        <h2 id={titleId}>{title}</h2>
        <div id={descriptionId} className="auth-dialog-copy">{children}</div>
        <div className="auth-dialog-actions">{actions}</div>
      </div>
    </dialog>
  );
}
