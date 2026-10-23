import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface AuthDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  illustration?: ReactNode;
  variant?: "online" | "success";
  showCloseButton?: boolean;
}

export default function AuthDialog({ open, onClose, title, children, actions, illustration, variant = "online", showCloseButton = true }: AuthDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const contentWidth = variant === "success" ? "max-w-md" : "max-w-lg";

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
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 animate-modal-content backdrop:bg-primary-950/45 dark:backdrop:bg-black/60 backdrop:backdrop-blur-sm backdrop:animate-modal-backdrop"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      {showCloseButton && (
        <button type="button" onClick={onClose} aria-label="Fechar janela"
          className="absolute right-3 top-3 flex size-8 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-primary-600">
          <X size={18} aria-hidden="true" />
        </button>
      )}
      <div className={`mx-auto flex w-full ${contentWidth} flex-col gap-2 px-6 pb-7 ${showCloseButton ? "pt-12" : "pt-7 sm:pt-8"} sm:px-8 sm:pb-8`}>
        {illustration}
        <h2 id={titleId} className="text-center text-2xl font-semibold leading-8 tracking-tight dark:text-slate-100">
          {title}
        </h2>
        <div id={descriptionId} className="text-sm leading-6">{children}</div>
        <div className="mt-5 flex flex-col gap-2">{actions}</div>
      </div>
    </dialog>
  );
}
