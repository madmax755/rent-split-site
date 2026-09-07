import type { ReactNode } from "react";

type KpiProps = {
  label: string;
  value: string;
  sub?: string;
};

export function Kpi(props: KpiProps) {
  return (
    <div className="kpi">
      <div className="kpi-label">{props.label}</div>
      <div className="kpi-val">{props.value}</div>
      {props.sub ? <div className="kpi-sub">{props.sub}</div> : null}
    </div>
  );
}

type SectionProps = {
  id: string;
  title: string;
  meta?: string;
  icon: ReactNode;
  iconBg: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  padded?: boolean;
};

export function Section(props: SectionProps) {
  return (
    <div className={`section${props.open ? " open" : ""}`} style={props.padded === false ? { padding: 0 } : undefined}>
      <div className="section-head" onClick={props.onToggle}>
        <div className="section-icon" style={{ background: props.iconBg }}>
          {props.icon}
        </div>
        <div className="section-title">{props.title}</div>
        {props.meta ? <span className="section-meta">{props.meta}</span> : null}
        <svg
          className="chev"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </div>
      <div className="section-body" style={props.padded === false ? { display: "block", padding: 20 } : undefined}>
        {props.children}
      </div>
    </div>
  );
}
