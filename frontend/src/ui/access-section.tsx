import { useEffect, useState } from "react";
import { plural } from "../domain/format";
import type { AccountRole, PublicAccount } from "../lib/api-types";
import { useHousehold } from "../store/household-context";
import { Icon } from "./icon";
import { Section } from "./section";

type AccessSectionProps = {
  onToggleSection: (id: string) => void;
};

export function AccessSection(props: AccessSectionProps) {
  const { store, state } = useHousehold();
  const [accounts, setAccounts] = useState<PublicAccount[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [personId, setPersonId] = useState("");
  const [role, setRole] = useState<AccountRole>("tenant");
  const [error, setError] = useState("");
  const canManage = !!store.adapter.listAccounts;

  async function refresh(): Promise<void> {
    if (!store.adapter.listAccounts) return;
    const list = await store.adapter.listAccounts();
    setAccounts(list);
    setError("");
  }

  useEffect(() => {
    if (store.needAuth || !store.adapter.listAccounts) return;
    void refresh().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Couldn't load logins.");
    });
  }, [store, store.needAuth, store.session?.accountId]);

  async function onBecameTenant(): Promise<void> {
    const me = (await store.adapter.me?.()) ?? store.session;
    if (!me) return;
    store.applySession(me);
    const data = await store.loadRaw();
    if (data) store.applyHydrate(data);
    store.state.activeTab = "home";
    store.notifyPublic();
  }

  if (!canManage) return null;

  const livePeople = state.people.filter((p) => !p.archived);

  return (
    <Section
      id="access"
      title="Who can sign in"
      meta={plural(accounts.filter((a) => a.enabled).length, "login")}
      iconBg="var(--p5)"
      open={!!state.sectionsOpen.access}
      onToggle={() => {
        props.onToggleSection("access");
        void refresh().catch((e: unknown) => {
          setError(e instanceof Error ? e.message : "Couldn't load logins.");
        });
      }}
      icon={
        <Icon>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </Icon>
      }
    >
      <div className="helper" style={{ marginTop: 0 }}>
        Each housemate gets their own username and password. <b>Admin</b> sees the whole household
        editor. <b>Tenant</b> sees only their own dashboard and can record a settlement with{" "}
        {state.people.find((p) => p.isPayer)?.name ?? "the payer"}. There is exactly one admin.
      </div>
      {error ? (
        <div className="callout warn">
          <p style={{ margin: 0 }}>{error}</p>
        </div>
      ) : null}
      {accounts.map((account) => {
        const linked = account.personId
          ? (state.people.find((p) => p.id === account.personId)?.name ?? "removed person")
          : "not linked";
        return (
          <div className="list-row" key={account.id} style={{ opacity: account.enabled ? 1 : 0.6 }}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{account.username}</div>
              <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>
                {linked}
                {!account.enabled ? " · disabled" : ""}
              </div>
            </div>
            <span className={`badge ${account.role === "admin" ? "ok" : "muted"}`}>
              {account.role === "admin" ? "Admin" : "Tenant"}
            </span>
            {account.role !== "admin" ? (
              <span
                className="badge muted"
                style={{ cursor: "pointer" }}
                onClick={() => {
                  if (
                    !confirm(
                      `Make ${account.username} the admin? You will become a tenant on the next request.`,
                    )
                  )
                    return;
                  void store.adapter
                    .patchAccount?.(account.id, { role: "admin" })
                    .then(() => onBecameTenant())
                    .catch((e: unknown) =>
                      setError(e instanceof Error ? e.message : "Couldn't change admin."),
                    );
                }}
              >
                Make admin
              </span>
            ) : null}
            <button
              className="btn-ghost btn btn-sm"
              onClick={() => {
                const next = prompt(`New password for ${account.username}?`);
                if (!next) return;
                void store.adapter
                  .patchAccount?.(account.id, { password: next })
                  .then(() => {
                    store.announce("Password updated — they will need to sign in again.");
                    return refresh();
                  })
                  .catch((e: unknown) =>
                    setError(e instanceof Error ? e.message : "Couldn't set password."),
                  );
              }}
            >
              Reset password
            </button>
            <select
              value={account.personId ?? ""}
              style={{ maxWidth: 140 }}
              onChange={(e) => {
                const id = e.target.value || null;
                void store.adapter
                  .patchAccount?.(account.id, { personId: id })
                  .then(() => refresh())
                  .catch((e2: unknown) =>
                    setError(e2 instanceof Error ? e2.message : "Couldn't link person."),
                  );
              }}
            >
              <option value="">Not linked</option>
              {livePeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {account.role !== "admin" ? (
              <button
                className="btn-icon"
                title={account.enabled ? "Disable login" : "Enable login"}
                onClick={() => {
                  void store.adapter
                    .patchAccount?.(account.id, { enabled: !account.enabled })
                    .then(() => refresh())
                    .catch((e: unknown) =>
                      setError(e instanceof Error ? e.message : "Couldn't update login."),
                    );
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  {account.enabled ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M5 12h14" />}
                </svg>
              </button>
            ) : null}
          </div>
        );
      })}
      <div className="bill-card" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Add a login</div>
        <div className="dim-grid">
          <div>
            <div className="dim-label">Username</div>
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div>
            <div className="dim-label">Password</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        </div>
        <div className="row-h" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">Link to person…</option>
            {livePeople.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value === "admin" ? "admin" : "tenant")}
          >
            <option value="tenant">Tenant</option>
            <option value="admin">Admin</option>
          </select>
          <button
            className="btn"
            onClick={() => {
              setError("");
              void store.adapter
                .createAccount?.({
                  username,
                  password,
                  personId: personId || null,
                  role,
                })
                .then(async () => {
                  setUsername("");
                  setPassword("");
                  setPersonId("");
                  setRole("tenant");
                  store.announce("Login created.");
                  if (role === "admin") await onBecameTenant();
                  else await refresh();
                })
                .catch((e: unknown) =>
                  setError(e instanceof Error ? e.message : "Couldn't create login."),
                );
            }}
          >
            Create
          </button>
        </div>
      </div>
    </Section>
  );
}
