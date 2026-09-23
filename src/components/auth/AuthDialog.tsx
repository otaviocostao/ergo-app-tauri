import { useEffect, useId, useRef, type ReactNode } from "react";

interface AuthDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  illustration?: ReactNode;
  variant?: "online" | "success";
}

export default function AuthDialog({ open, onClose, title, children, actions, illustration, variant = "online" }: AuthDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const contentWidth = variant === "success" ? "max-w-lg" : "max-w-2xl";

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
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto rounded-lg border-0 bg-white p-0 text-black [color-scheme:light] motion-safe:animate-dialog-enter backdrop:bg-black/30"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <div className={`mx-auto flex min-h-[34rem] w-[calc(100%-3rem)] ${contentWidth} flex-col justify-center gap-2 py-10`}>
        {illustration}
        <h2 id={titleId} className="text-center text-3xl font-semibold leading-12 tracking-tight">
          {title}
        </h2>
        <div id={descriptionId} className="text-base leading-6">{children}</div>
        <div className="mt-8 flex flex-col gap-2">{actions}</div>
      </div>
    </dialog>
  );
}
