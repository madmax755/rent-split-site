import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ConfirmMode = "confirm" | "notice";

export type ConfirmRequest = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  mode?: ConfirmMode;
};

export type ConfirmAsk = (request: ConfirmRequest) => Promise<boolean>;

export const SIGN_OUT_REQUEST: ConfirmRequest = {
  title: "Sign out?",
  description: "This browser will forget the session.",
  confirmLabel: "Sign out",
  destructive: true,
};

type ConfirmDialogProps = {
  request: ConfirmRequest | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog(props: ConfirmDialogProps) {
  const req = props.request;
  if (!req) return null;

  const notice = req.mode === "notice";
  const confirmLabel = req.confirmLabel ?? (notice ? "OK" : "Continue");
  const cancelLabel = req.cancelLabel ?? "Cancel";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{req.title}</DialogTitle>
          {req.description ? <DialogDescription>{req.description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          {notice ? null : (
            <Button
              type="button"
              variant="outline"
              autoFocus={req.destructive}
              onClick={props.onCancel}
            >
              {cancelLabel}
            </Button>
          )}
          <Button
            type="button"
            variant={req.destructive ? "destructive" : "default"}
            autoFocus={notice || !req.destructive}
            onClick={props.onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ConfirmContext = createContext<ConfirmAsk | null>(null);

export function ConfirmProvider(props: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const pending = useRef<{ resolve: (value: boolean) => void } | null>(null);

  const ask = useCallback<ConfirmAsk>((next) => {
    pending.current?.resolve(false);
    return new Promise<boolean>((resolve) => {
      pending.current = { resolve };
      setRequest(next);
    });
  }, []);

  function settle(value: boolean): void {
    pending.current?.resolve(value);
    pending.current = null;
    setRequest(null);
  }

  return (
    <ConfirmContext.Provider value={ask}>
      {props.children}
      <ConfirmDialog
        request={request}
        onCancel={() => settle(request?.mode === "notice")}
        onConfirm={() => settle(true)}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmAsk {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error("ConfirmProvider is missing");
  return ask;
}
