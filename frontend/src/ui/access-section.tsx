import { useEffect, useState } from "react";
import { plural } from "../domain/format";
import type { AccountRole, PublicAccount } from "../lib/api-types";
import { useHousehold } from "../store/household-context";
import { EmptyState, Panel } from "./kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

export function AccessSection() {
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
  const payerName = state.people.find((p) => p.isPayer)?.name ?? "the payer";

  return (
    <Panel
      id="logins"
      title="Who can sign in"
      description={`Each housemate gets their own login. Admin sees the whole household. Tenant sees only their dashboard and can settle with ${payerName}. There is exactly one admin. ${plural(accounts.filter((a) => a.enabled).length, "login")}.`}
    >
      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
      {!accounts.length ? <EmptyState title="No logins yet" /> : null}
      <div className="grid gap-2">
        {accounts.map((account) => {
          const linked = account.personId
            ? (state.people.find((p) => p.id === account.personId)?.name ?? "removed person")
            : "not linked";
          return (
            <div
              key={account.id}
              className={`flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 px-3 py-2.5 ${account.enabled ? "" : "opacity-60"}`}
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium">{account.username}</div>
                <div className="text-xs text-muted-foreground">
                  {linked}
                  {!account.enabled ? " · disabled" : ""}
                </div>
              </div>
              <Badge variant={account.role === "admin" ? "default" : "secondary"}>
                {account.role === "admin" ? "Admin" : "Tenant"}
              </Badge>
              {account.role !== "admin" ? (
                <Button
                  variant="ghost"
                  size="sm"
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
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
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
              </Button>
              <NativeSelect
                value={account.personId ?? ""}
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
                <NativeSelectOption value="">Not linked</NativeSelectOption>
                {livePeople.map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>
                    {p.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {account.role !== "admin" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void store.adapter
                      .patchAccount?.(account.id, { enabled: !account.enabled })
                      .then(() => refresh())
                      .catch((e: unknown) =>
                        setError(e instanceof Error ? e.message : "Couldn't update login."),
                      );
                  }}
                >
                  {account.enabled ? "Disable" : "Enable"}
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-4 rounded-xl border p-3">
        <div className="mb-2 font-medium">Add a login</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <NativeSelect value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <NativeSelectOption value="">Link to person…</NativeSelectOption>
            {livePeople.map((p) => (
              <NativeSelectOption key={p.id} value={p.id}>
                {p.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            value={role}
            onChange={(e) => setRole(e.target.value === "admin" ? "admin" : "tenant")}
          >
            <NativeSelectOption value="tenant">Tenant</NativeSelectOption>
            <NativeSelectOption value="admin">Admin</NativeSelectOption>
          </NativeSelect>
          <Button
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
          </Button>
        </div>
      </div>
    </Panel>
  );
}
