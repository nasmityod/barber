"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

/**
 * Diálogos propios del sistema. Sustituyen a window.confirm y window.prompt, que
 * rompen la continuidad visual justo en las acciones de mayor riesgo (cancelar
 * una cita, anular un cobro, eliminar un registro).
 *
 * La API es imperativa a propósito: los llamadores existentes cambian de
 * `if (!window.confirm(...)) return;` a `if (!await confirmAction(...)) return;`.
 * Requiere que <DialogHost /> esté montado una sola vez en el shell.
 */

type DialogPrompt = {
  label: string;
  placeholder?: string;
  defaultValue?: string;
  maxLength?: number;
  multiline?: boolean;
};

type DialogRequest = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  prompt?: DialogPrompt;
};

type PendingDialog = DialogRequest & { resolve: (value: string | null) => void };

let publish: ((dialog: PendingDialog | null) => void) | null = null;

function openDialog(request: DialogRequest): Promise<string | null> {
  if (!publish) return Promise.resolve(null);
  return new Promise((resolve) => publish?.({ ...request, resolve }));
}

/** Confirmación sin texto. Devuelve true si la persona aceptó. */
export async function confirmAction(request: DialogRequest): Promise<boolean> {
  return (await openDialog(request)) !== null;
}

/** Confirmación con un texto obligatorio (motivo, nombre de lote…). */
export async function promptText(request: DialogRequest & { prompt: DialogPrompt }): Promise<string | null> {
  const value = await openDialog(request);
  return value === null ? null : value.trim();
}

export function DialogHost() {
  const [dialog, setDialog] = useState<PendingDialog | null>(null);
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    publish = (next) => { setDialog(next); setValue(next?.prompt?.defaultValue ?? ""); setTouched(false); };
    return () => { publish = null; };
  }, []);

  const close = (result: string | null) => { setDialog((current) => { current?.resolve(result); return null; }); };

  useEffect(() => {
    if (!dialog) return;
    const focus = window.setTimeout(() => (fieldRef.current ?? panelRef.current?.querySelector<HTMLButtonElement>("button.primary"))?.focus(), 30);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(null); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>("button, input, textarea, a[href]");
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { window.clearTimeout(focus); document.removeEventListener("keydown", onKey); };
  }, [dialog]);

  if (!dialog) return null;

  const needsText = Boolean(dialog.prompt);
  const missing = needsText && !value.trim();
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (missing) { setTouched(true); fieldRef.current?.focus(); return; }
    close(needsText ? value.trim() : "");
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(null); }}>
      <div className={`modal confirm-modal ${dialog.destructive ? "destructive" : ""}`} role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" ref={panelRef}>
        <div className="modal-head">
          <div>
            {dialog.destructive && <span className="eyebrow"><AlertTriangle size={12} /> Acción irreversible</span>}
            <h2 id="app-dialog-title">{dialog.title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={() => close(null)} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <form onSubmit={submit}>
          {dialog.message && <p>{dialog.message}</p>}
          {dialog.prompt && <label style={{ marginTop: dialog.message ? 18 : 0, display: "block" }}>
            {dialog.prompt.label}
            {dialog.prompt.multiline
              ? <textarea ref={(node) => { fieldRef.current = node; }} value={value} maxLength={dialog.prompt.maxLength ?? 300} placeholder={dialog.prompt.placeholder} onChange={(event) => setValue(event.target.value)} />
              : <input ref={(node) => { fieldRef.current = node; }} value={value} maxLength={dialog.prompt.maxLength ?? 160} placeholder={dialog.prompt.placeholder} onChange={(event) => setValue(event.target.value)} />}
          </label>}
          {touched && missing && <p className="form-error" role="alert" style={{ marginTop: 12 }}>Este dato es obligatorio para continuar.</p>}
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={() => close(null)}>{dialog.cancelLabel ?? "Cancelar"}</button>
            <button type="submit" className={dialog.destructive ? "danger-button" : "primary"}>{dialog.confirmLabel ?? "Confirmar"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
