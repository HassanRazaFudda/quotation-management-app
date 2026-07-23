"use client";

import { useEffect, useState } from "react";
import { Plus, ShieldCheck, User as UserIcon } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { toast } from "@/components/toast";
import { Badge, Button, Card, Field, Input, Select, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "staff";
  active: boolean;
  lastLoginAt: string | null;
}

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function refresh() {
    const { users } = await api.get<{ users: AdminUser[] }>("/api/admin/users");
    setUsers(users);
  }

  useEffect(() => {
    refresh().catch((e) => toast.error(e instanceof ApiError ? e.message : "Failed to load."));
  }, []);

  async function toggleActive(u: AdminUser) {
    try {
      await api.patch(`/api/admin/users/${u.id}`, { active: !u.active });
      toast.success(u.active ? "User disabled" : "User enabled");
      refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update.");
    }
  }

  async function setRole(u: AdminUser, role: "admin" | "staff") {
    try {
      await api.patch(`/api/admin/users/${u.id}`, { role });
      toast.success("Role updated");
      refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update.");
    }
  }

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Staff and administrators"
        action={
          <Button icon={<Plus className="size-4" />} onClick={() => setShowForm((v) => !v)}>
            Add user
          </Button>
        }
      />

      <div className="space-y-4 p-5 lg:p-8">
        {showForm && <NewUserForm onDone={() => { setShowForm(false); refresh(); }} />}

        {!users ? (
          <Spinner label="Loading users…" />
        ) : (
          <Card className="divide-y divide-line">
            {users.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="flex size-9 items-center justify-center rounded-full bg-canvas text-sm font-semibold text-ink">
                  {u.role === "admin" ? <ShieldCheck className="size-4 text-brand-500" /> : <UserIcon className="size-4 text-muted" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">
                    {u.name} {!u.active && <span className="text-xs text-muted">(disabled)</span>}
                  </p>
                  <p className="text-xs text-muted">{u.email}</p>
                </div>
                <Badge tone={u.role}>{u.role}</Badge>
                <Select
                  className="h-9 w-28"
                  options={[
                    { value: "staff", label: "Staff" },
                    { value: "admin", label: "Admin" },
                  ]}
                  value={u.role}
                  onChange={(e) => setRole(u, e.target.value as "admin" | "staff")}
                />
                <Button variant={u.active ? "danger" : "secondary"} size="sm" onClick={() => toggleActive(u)}>
                  {u.active ? "Disable" : "Enable"}
                </Button>
              </div>
            ))}
          </Card>
        )}
      </div>
    </>
  );
}

function NewUserForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/api/admin/users", { name, email, password, role });
      toast.success("User created");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create user.");
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password" hint="At least 8 characters">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </Field>
        <Field label="Role">
          <Select
            options={[
              { value: "staff", label: "Staff" },
              { value: "admin", label: "Admin" },
            ]}
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "staff")}
          />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" loading={saving}>Create user</Button>
        </div>
      </form>
    </Card>
  );
}
