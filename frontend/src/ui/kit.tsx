import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { addMonths, tenancyMonthKey, tenancyMonthLabel } from "../domain/dates";
import { ensureMonth } from "../domain/months";
import type { MonthStatus } from "../domain/types";
import { useHousehold } from "../store/household-context";
import type { HouseholdStore } from "../store/household-store";
import { NumericField } from "./numeric-field";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupText } from "@/components/ui/input-group";
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
  const floor = tenancyMonthKey(state.tenancyStart);
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon-sm"
        title="Previous tenancy month"
        disabled={key <= floor}
        onClick={() => goMonth(store, -1)}
      >
        <ChevronLeftIcon />
      </Button>
      <div className="relative flex h-8 min-w-40 items-center justify-center text-center sm:min-w-52">
        <div className="pointer-events-none text-sm font-semibold">{tenancyMonthLabel(key)}</div>
        <input
          type="month"
          aria-label="Choose tenancy month"
          min={floor}
          className="absolute inset-0 h-8 cursor-pointer opacity-0 outline-none"
          value={key}
          onChange={(e) => {
            if (!/^\d{4}-\d{2}$/.test(e.target.value)) return;
            const next = e.target.value < floor ? floor : e.target.value;
            store.mutate(() => {
              store.state.currentMonth = next;
              ensureMonth(store.state, store.state.currentMonth);
            });
          }}
        />
      </div>
      <Button variant="outline" size="icon-sm" title="Next tenancy month" onClick={() => goMonth(store, 1)}>
        <ChevronRightIcon />
      </Button>
    </div>
  );
}

export function goMonth(store: HouseholdStore, delta: number): void {
  store.mutate(() => {
    const next = addMonths(store.state.currentMonth, delta);
    const floor = tenancyMonthKey(store.state.tenancyStart);
    if (delta < 0 && next < floor) return;
    store.state.currentMonth = next;
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
        {props.sub ? (
          <p className="tabular-nums text-xs text-muted-foreground">{props.sub}</p>
        ) : null}
      </CardHeader>
    </Card>
  );
}

export function KpiGrid(props: { children: ReactNode }) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 lg:mb-6 lg:grid-cols-[repeat(auto-fit,minmax(13.5rem,1fr))] [&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1">
      {props.children}
    </div>
  );
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
    <InputGroup className={cn("w-full min-w-0", props.className)}>
      <InputGroupAddon>
        <InputGroupText>{props.currency}</InputGroupText>
      </InputGroupAddon>
      <NumericField
        group
        allowEmpty
        min={props.min}
        disabled={props.disabled}
        placeholder={props.placeholder}
        value={typeof props.value === "number" ? props.value : null}
        onChange={(v) => {
          props.onChange(v === null ? "" : v);
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
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
};

export function Panel(props: PanelProps) {
  const hasHeader = Boolean(props.title || props.description || props.action);
  return (
    <Card id={props.id} className={cn("scroll-mt-24", props.className)}>
      {hasHeader ? (
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              {props.title ? <CardTitle>{props.title}</CardTitle> : null}
              {props.description ? (
                <CardDescription className={props.title ? "mt-1" : undefined}>
                  {props.description}
                </CardDescription>
              ) : null}
            </div>
            {props.action ? <div className="flex flex-wrap gap-2">{props.action}</div> : null}
          </div>
        </CardHeader>
      ) : null}
      <CardContent className={hasHeader ? "pt-4" : undefined}>{props.children}</CardContent>
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
  return (
    <NumericField
      integer
      className={props.className}
      min={props.min}
      max={props.max}
      disabled={props.disabled}
      value={props.value}
      onChange={props.onChange}
    />
  );
}
