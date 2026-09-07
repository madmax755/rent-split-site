import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export type TextPromptRequest = {
  title: string;
  description?: string;
  label: string;
  defaultValue?: string;
  type?: "text" | "password";
  confirmLabel?: string;
  placeholder?: string;
};

export type TextPromptDialogProps = {
  request: TextPromptRequest | null;
  onClose: () => void;
  onConfirm: (value: string) => void;
};

export function TextPromptDialog(props: TextPromptDialogProps) {
  const req = props.request;
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!req) return;
    setValue(req.defaultValue ?? "");
  }, [req]);

  if (!req) return null;

  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0;

  function submit(): void {
    if (!canSubmit) return;
    props.onConfirm(trimmed);
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{req.title}</DialogTitle>
          {req.description ? <DialogDescription>{req.description}</DialogDescription> : null}
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field>
            <FieldLabel htmlFor="text-prompt-field">{req.label}</FieldLabel>
            <Input
              id="text-prompt-field"
              type={req.type ?? "text"}
              value={value}
              placeholder={req.placeholder}
              autoFocus
              autoComplete={req.type === "password" ? "new-password" : "off"}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {req.confirmLabel ?? "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
