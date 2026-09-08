import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { addMonths, monthLabel } from "../domain/dates";
import { ensureMonth } from "../domain/months";
import type { MonthStatus } from "../domain/types";
import { useHousehold } from "../store/household-context";
import type { HouseholdStore } from "../store/household-store";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

export type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader(props: PageHeaderProps) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-heading text-2xl font-semibold tracking-tight max-lg:sr-only">
          {props.title}
        </h1>
        {props.description ? (
          <p className="max-w-2xl text-sm text-muted-foreground lg:mt-1">{props.description}</p>
        ) : null}
      </div>
      {props.actions ? (
        <div className="flex flex-wrap items-center gap-2">{props.actions}</div>
      ) : null}
    </div>
  );
}

export function MonthSwitcher() {
  const { store, state } = useHousehold();
  const key = state.currentMonth;
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon-sm"
        title="Previous month"
        onClick={() => goMonth(store, -1)}
      >
        <ChevronLeftIcon />
      </Button>
      <div className="min-w-28 text-center sm:min-w-36">
        <div className="text-sm font-semibold">{monthLabel(key)}</div>
      </div>
      <input
        type="month"
        aria-label="Choose month"
        className="hidden h-8 rounded-lg border border-input bg-transparent px-2 text-xs tabular-nums outline-none sm:block focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        value={key}
        onChange={(e) => {
          if (!/^\d{4}-\d{2}$/.test(e.target.value)) return;
          store.mutate(() => {
            store.state.currentMonth = e.target.value;
            ensureMonth(store.state, store.state.currentMonth);
          });
        }}
      />
      <Button variant="outline" size="icon-sm" title="Next month" onClick={() => goMonth(store, 1)}>
        <ChevronRightIcon />
      </Button>
    </div>
  );
}

export function goMonth(store: HouseholdStore, delta: number): void {
  store.mutate(() => {
    store.state.currentMonth = addMonths(store.state.currentMonth, delta);
    ensureMonth(store.state, store.state.currentMonth);
  });
}

export type KpiCardProps = {
  label: string;
  value: string;
  sub?: string;
};

export function KpiCard(props: KpiCardProps) {
  return (
    <Card size="sm">
      <CardHeader className="gap-1">
        <CardDescription className="text-[11px] font-semibold tracking-wider uppercase">
          {props.label}
        </CardDescription>
        <CardTitle className="tabular-nums font-heading text-2xl tracking-tight">
          {props.value}
        </CardTitle>
        {props.sub ? <p className="tabular-nums text-xs text-muted-foreground">{props.sub}</p> : null}
      </CardHeader>
    </Card>
  );
}

export function KpiGrid(props: { children: ReactNode }) {
  return <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{props.children}</div>;
}

export type MoneyInputProps = {
  currency: string;
  value: number | "";
  onChange: (value: number | "") => void;
  min?: number;
  step?: number;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

export function MoneyInput(props: MoneyInputProps) {
  return (
    <InputGroup className={cn("w-full min-w-0 sm:w-[148px]", props.className)}>
      <InputGroupAddon>
        <InputGroupText>{props.currency}</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        type="number"
        className="tabular-nums"
        step={props.step ?? 0.01}
        min={props.min}
        disabled={props.disabled}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (raw === "") {
            props.onChange("");
            return;
          }
          props.onChange(parseFloat(raw) || 0);
        }}
      />
    </InputGroup>
  );
}

export function StatusBadge(props: { status: MonthStatus }) {
  const label = {
    projected: "Projected",
    collecting: "Awaiting real bills",
    reconciled: "Reconciled",
  }[props.status];
  const variant = {
    projected: "outline" as const,
    collecting: "secondary" as const,
    reconciled: "default" as const,
  }[props.status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function WarnList(props: { items: string[] }) {
  if (!props.items.length) return null;
  return (
    <div className="mb-4 grid gap-2">
      {props.items.map((text) => (
        <Alert key={text} className="border-amber-500/40 bg-amber-50/70 dark:bg-amber-950/25">
          <AlertDescription>{text}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

export function EmptyState(props: { title: string; description?: string; action?: ReactNode }) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyTitle>{props.title}</EmptyTitle>
        {props.description ? <EmptyDescription>{props.description}</EmptyDescription> : null}
      </EmptyHeader>
      {props.action}
    </Empty>
  );
}

export type PanelProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
};

export function Panel(props: PanelProps) {
  return (
    <Card id={props.id} className={cn("scroll-mt-24", props.className)}>
      <CardHeader className="border-b">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle>{props.title}</CardTitle>
            {props.description ? (
              <CardDescription className="mt-1">{props.description}</CardDescription>
            ) : null}
          </div>
          {props.action ? <div className="flex flex-wrap gap-2">{props.action}</div> : null}
        </div>
      </CardHeader>
      <CardContent className="pt-4">{props.children}</CardContent>
    </Card>
  );
}

export function Screen(props: { id: string; active: boolean; children: ReactNode }) {
  if (!props.active) return null;
  return (
    <div
      data-screen={props.id}
      className="mx-auto w-full max-w-5xl px-3 py-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] lg:px-8 lg:py-6 lg:pb-10"
    >
      {props.children}
    </div>
  );
}

export type EditableTextProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
};

export function EditableText(props: EditableTextProps) {
  const [draft, setDraft] = useState(props.value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(props.value);
  }, [props.value]);

  return (
    <Input
      value={draft}
      disabled={props.disabled}
      className={props.className}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        if (draft !== props.value) props.onChange(draft);
      }}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        props.onChange(next);
      }}
    />
  );
}

export type EditableNumberProps = {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
};

export function EditableNumber(props: EditableNumberProps) {
  const [draft, setDraft] = useState(String(props.value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(String(props.value));
  }, [props.value]);

  function commit(raw: string): void {
    const n = Math.round(parseFloat(raw));
    if (!Number.isFinite(n)) {
      setDraft(String(props.value));
      return;
    }
    props.onChange(n);
  }

  return (
    <Input
      type="number"
      className={props.className}
      min={props.min}
      max={props.max}
      step={props.step}
      disabled={props.disabled}
      value={draft}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        commit(draft);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw.trim() === "") return;
        const n = parseFloat(raw);
        if (Number.isFinite(n)) props.onChange(n);
      }}
    />
  );
}
