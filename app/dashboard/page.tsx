"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from "recharts";
import { supabase } from "@/lib/supabase";
import { PLANS, type PlanKey } from "@/lib/plans";

/* ---------- Settings you may want to change ---------- */
const CURRENCY = "USD"; // e.g. "NGN" for naira
const DEFAULT_COUNTRY_CODE = "234"; // used to turn 0803... into 234803... for WhatsApp
const PROFILE_SELECT =
  "*, organizations(name, capture_key, plan, subscription_status, trial_ends_at, current_period_end)";
const LOCK_MESSAGE = "Your trial has ended. Subscribe to add and edit leads.";

/* ---------- Types and constants ---------- */
const STAGES = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "survey_booked", label: "Survey booked" },
  { key: "quote_sent", label: "Quote sent" },
  { key: "deposit_paid", label: "Deposit paid" },
  { key: "installed", label: "Installed" },
  { key: "lost", label: "Lost" },
] as const;
type Status = (typeof STAGES)[number]["key"];

const SOURCES = [
  "Referral",
  "WhatsApp",
  "Instagram",
  "Facebook",
  "Website",
  "Walk-in",
  "Phone call",
  "Other",
];

interface Lead {
  id: string;
  organization_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  source: string;
  status: Status;
  system_size_kva: number | null;
  deal_value: number | null;
  notes: string | null;
  assigned_to: string | null;
  follow_up_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
interface Profile {
  id: string;
  organization_id: string;
  full_name: string | null;
  role: "owner" | "admin" | "sales_rep";
  organizations?: {
    name: string;
    capture_key?: string;
    plan?: string;
    subscription_status?: string;
    trial_ends_at?: string;
    current_period_end?: string | null;
  } | null;
}
interface Member {
  id: string;
  full_name: string | null;
  role: string;
}
interface Activity {
  id: string;
  activity: string;
  created_at: string;
}

/* ---------- Helpers ---------- */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: CURRENCY,
  maximumFractionDigits: 0,
});
const stageLabel = (k: string) => STAGES.find((s) => s.key === k)?.label ?? k;
const isClosed = (l: Lead) => l.status === "installed" || l.status === "lost";
const isOverdue = (l: Lead) =>
  !!l.follow_up_at && !isClosed(l) && new Date(l.follow_up_at) < new Date();
const num = (s: string) => (s.trim() === "" ? null : Number(s));

function waLink(phone: string, text: string) {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("0")) d = DEFAULT_COUNTRY_CODE + d.slice(1);
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

// datetime-local needs local time, not UTC
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

// Stops spreadsheet apps from running "=..." text as a formula
const safeCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
};

const card = "rounded-2xl border border-white/10 bg-white/[0.04]";
const field =
  "w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none placeholder:text-gray-500 focus:border-primary/60";
const btn =
  "rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm transition-colors hover:bg-white/[0.08]";
const btnPrimary =
  "rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50";

/* ---------- Small components ---------- */
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-[#0b0b0b] p-6 sm:p-8"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <h2 className="text-2xl font-bold">{title}</h2>
          <button onClick={onClose} className={btn} aria-label="Close">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className={`${card} p-5`}>
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-1 text-3xl font-bold sm:text-4xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

/* ---------- Getting started checklist ---------- */
function Checklist({
  steps,
  onDismiss,
}: {
  steps: { label: string; hint: string; done: boolean }[];
  onDismiss: () => void;
}) {
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  return (
    <section className={`${card} mb-6 p-5 sm:p-6`} aria-label="Getting started">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">
            Getting started
          </p>
          <h2 className="mt-1 text-xl font-bold">
            {allDone ? "You're all set" : "Set up your pipeline"}
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            {allDone
              ? "You've covered the basics. Dismiss this card whenever you like."
              : "A few quick steps. Each one ticks itself when you do it."}
          </p>
        </div>
        <button
          className="shrink-0 text-sm text-gray-500 hover:text-white"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>
        <p className="shrink-0 text-sm font-semibold">
          {doneCount} of {steps.length}
        </p>
      </div>

      <ul className="mt-5 space-y-3">
        {steps.map((s, i) => (
          <li
            key={s.label}
            className={`flex items-start gap-3 rounded-xl border p-4 transition-colors ${
              s.done
                ? "border-primary/20 bg-primary/[0.05]"
                : "border-white/10 bg-white/[0.02]"
            }`}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                s.done ? "bg-primary text-black" : "bg-white/10 text-gray-400"
              }`}
            >
              {s.done ? "✓" : i + 1}
            </span>
            <div className="min-w-0">
              <p
                className={`text-sm font-semibold ${s.done ? "text-primary" : ""}`}
              >
                {s.label}
              </p>
              {!s.done && (
                <p className="mt-1 text-sm text-gray-400">{s.hint}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- Add lead ---------- */
function AddLeadModal({
  profile,
  team,
  onClose,
  onSaved,
}: {
  profile: Profile;
  team: Member[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const canAssign = profile.role !== "sales_rep";
  const [f, setF] = useState({
    full_name: "",
    phone: "",
    email: "",
    location: "",
    source: "Referral",
    system_size_kva: "",
    deal_value: "",
    assigned_to: canAssign ? "" : profile.id,
    follow_up_at: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const email = f.email.trim().toLowerCase();
    const kva = num(f.system_size_kva);
    const value = num(f.deal_value);
    if (f.full_name.trim().length < 2)
      return setError("Enter the lead's name.");
    if (!f.phone.trim() && !email)
      return setError("Add a phone number or an email so you can reach them.");
    if (email && !/^\S+@\S+\.\S+$/.test(email))
      return setError("That email address doesn't look right.");
    if ([kva, value].some((n) => n !== null && (!Number.isFinite(n) || n < 0)))
      return setError("System size and deal value must be positive numbers.");

    setSaving(true);
    const { error: err } = await supabase.from("leads").insert({
      organization_id: profile.organization_id,
      created_by: profile.id,
      full_name: f.full_name.trim(),
      phone: f.phone.trim() || null,
      email: email || null,
      location: f.location.trim() || null,
      source: f.source,
      system_size_kva: kva,
      deal_value: value,
      assigned_to: f.assigned_to || null,
      follow_up_at: f.follow_up_at
        ? new Date(f.follow_up_at).toISOString()
        : null,
    });
    setSaving(false);
    if (err)
      return setError(
        err.message?.includes("LEAD_LIMIT")
          ? "You've reached your plan's lead limit. Upgrade to add more."
          : "Couldn't save this lead. Check your connection and try again.",
      );
    onSaved("Lead added");
    onClose();
  }

  return (
    <Modal title="Add a lead" onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <input
          autoFocus
          className={`${field} sm:col-span-2`}
          placeholder="Full name *"
          value={f.full_name}
          onChange={set("full_name")}
          maxLength={120}
        />
        <input
          className={field}
          placeholder="Phone / WhatsApp"
          value={f.phone}
          onChange={set("phone")}
          maxLength={30}
        />
        <input
          className={field}
          type="email"
          placeholder="Email"
          value={f.email}
          onChange={set("email")}
          maxLength={254}
        />
        <input
          className={`${field} sm:col-span-2`}
          placeholder="Location (area or address)"
          value={f.location}
          onChange={set("location")}
          maxLength={200}
        />
        <select
          className={field}
          value={f.source}
          onChange={set("source")}
          aria-label="Lead source"
        >
          {SOURCES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        {canAssign ? (
          <select
            className={field}
            value={f.assigned_to}
            onChange={set("assigned_to")}
            aria-label="Assign to"
          >
            <option value="">Unassigned</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name || "Team member"}
              </option>
            ))}
          </select>
        ) : (
          <div />
        )}
        <input
          className={field}
          inputMode="decimal"
          placeholder="System size (kVA)"
          value={f.system_size_kva}
          onChange={set("system_size_kva")}
        />
        <input
          className={field}
          inputMode="decimal"
          placeholder={`Deal value (${CURRENCY})`}
          value={f.deal_value}
          onChange={set("deal_value")}
        />
        <label className="text-sm text-gray-400 sm:col-span-2">
          Follow-up reminder (optional)
          <input
            className={`${field} mt-2`}
            type="datetime-local"
            value={f.follow_up_at}
            onChange={set("follow_up_at")}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-400 sm:col-span-2">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className={`${btnPrimary} sm:col-span-2 py-3`}
        >
          {saving ? "Saving..." : "Add lead"}
        </button>
      </form>
    </Modal>
  );
}

/* ---------- Lead detail ---------- */
function LeadModal({
  lead,
  team,
  canManage,
  activities,
  onClose,
  onSave,
  onDelete,
  onWhatsApp,
  waText,
}: {
  lead: Lead;
  team: Member[];
  canManage: boolean;
  activities: Activity[];
  onClose: () => void;
  onSave: (patch: Partial<Lead>, activity: string[]) => Promise<boolean>;
  onDelete: () => void;
  onWhatsApp: () => void;
  waText: string;
}) {
  const [d, setD] = useState({
    full_name: lead.full_name,
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    location: lead.location ?? "",
    source: lead.source,
    status: lead.status as string,
    assigned_to: lead.assigned_to ?? "",
    deal_value: lead.deal_value?.toString() ?? "",
    system_size_kva: lead.system_size_kva?.toString() ?? "",
    follow_up_at: toLocalInput(lead.follow_up_at),
    notes: lead.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set =
    (k: keyof typeof d) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      setD({ ...d, [k]: e.target.value });

  const memberName = (id: string | null) =>
    team.find((t) => t.id === id)?.full_name || "Team member";
  const sourceOptions = SOURCES.includes(d.source)
    ? SOURCES
    : [...SOURCES, d.source];

  // Work out exactly what changed, so we only save and log real changes
  const name = d.full_name.trim();
  const phone = d.phone.trim() || null;
  const email = d.email.trim().toLowerCase() || null;
  const value = num(d.deal_value);
  const kva = num(d.system_size_kva);
  const patch: Partial<Lead> = {};
  const log: string[] = [];

  if (name !== lead.full_name) {
    patch.full_name = name;
    log.push("Name updated");
  }
  if (phone !== lead.phone) {
    patch.phone = phone;
    log.push("Phone updated");
  }
  if (email !== lead.email) {
    patch.email = email;
    log.push("Email updated");
  }
  if ((d.location.trim() || null) !== lead.location) {
    patch.location = d.location.trim() || null;
    log.push("Location updated");
  }
  if (d.source !== lead.source) {
    patch.source = d.source;
    log.push(`Source set to ${d.source}`);
  }
  if (d.status !== lead.status) {
    patch.status = d.status as Status;
    log.push(
      `Moved from ${stageLabel(lead.status)} to ${stageLabel(d.status)}`,
    );
  }
  if ((d.assigned_to || null) !== lead.assigned_to) {
    patch.assigned_to = d.assigned_to || null;
    log.push(
      d.assigned_to ? `Assigned to ${memberName(d.assigned_to)}` : "Unassigned",
    );
  }
  if (value !== lead.deal_value) {
    patch.deal_value = value as number | null;
    log.push(
      `Deal value set to ${value === null ? "empty" : Number.isFinite(value) ? money.format(value) : "invalid"}`,
    );
  }
  if (kva !== lead.system_size_kva) {
    patch.system_size_kva = kva as number | null;
    log.push(`System size set to ${kva ?? "empty"} kVA`);
  }
  if (d.follow_up_at !== toLocalInput(lead.follow_up_at)) {
    patch.follow_up_at = d.follow_up_at
      ? new Date(d.follow_up_at).toISOString()
      : null;
    log.push(
      d.follow_up_at
        ? `Follow-up set for ${new Date(d.follow_up_at).toLocaleString()}`
        : "Follow-up cleared",
    );
  }
  if (d.notes !== (lead.notes ?? "")) {
    patch.notes = d.notes || null;
    log.push("Notes updated");
  }

  const dirty = Object.keys(patch).length > 0;

  const requestClose = () => {
    if (
      dirty &&
      !window.confirm("You have unsaved changes. Close without saving?")
    )
      return;
    onClose();
  };

  async function save() {
    setError("");
    if (name.length < 2) return setError("Enter the lead's name.");
    if (!phone && !email)
      return setError(
        "Keep a phone number or an email so you can reach this lead.",
      );
    if (email && !/^\S+@\S+\.\S+$/.test(email))
      return setError("That email address doesn't look right.");
    if ([value, kva].some((n) => n !== null && (!Number.isFinite(n) || n < 0)))
      return setError("Deal value and system size must be positive numbers.");

    setSaving(true);
    const ok = await onSave(patch, log);
    setSaving(false);
    if (!ok) setError("Couldn't save your changes. Please try again.");
  }

  return (
    <Modal title={lead.full_name} onClose={requestClose}>
      <div className="flex flex-wrap gap-3">
        {lead.phone && (
          <a
            href={waLink(lead.phone, waText)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onWhatsApp}
            className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-sm text-green-400 hover:bg-green-500/20"
          >
            Message on WhatsApp
          </a>
        )}
        {lead.email && (
          <a href={`mailto:${lead.email}`} className={btn}>
            Send email
          </a>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-gray-400 sm:col-span-2">
          Name
          <input
            className={`${field} mt-2`}
            value={d.full_name}
            onChange={set("full_name")}
            maxLength={120}
          />
        </label>
        <label className="text-sm text-gray-400">
          Phone / WhatsApp
          <input
            className={`${field} mt-2`}
            value={d.phone}
            onChange={set("phone")}
            maxLength={30}
          />
        </label>
        <label className="text-sm text-gray-400">
          Email
          <input
            className={`${field} mt-2`}
            type="email"
            value={d.email}
            onChange={set("email")}
            maxLength={254}
          />
        </label>
        <label className="text-sm text-gray-400">
          Location
          <input
            className={`${field} mt-2`}
            value={d.location}
            onChange={set("location")}
            maxLength={200}
          />
        </label>
        <label className="text-sm text-gray-400">
          Source
          <select
            className={`${field} mt-2`}
            value={d.source}
            onChange={set("source")}
          >
            {sourceOptions.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>

        <label className="text-sm text-gray-400">
          Stage
          <select
            className={`${field} mt-2`}
            value={d.status}
            onChange={set("status")}
          >
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-400">
          Assigned to
          {canManage ? (
            <select
              className={`${field} mt-2`}
              value={d.assigned_to}
              onChange={set("assigned_to")}
            >
              <option value="">Unassigned</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name || "Team member"}
                </option>
              ))}
            </select>
          ) : (
            <p className="mt-3 text-white">
              {lead.assigned_to ? memberName(lead.assigned_to) : "Unassigned"}
            </p>
          )}
        </label>
        <label className="text-sm text-gray-400">
          Deal value ({CURRENCY})
          <input
            className={`${field} mt-2`}
            inputMode="decimal"
            value={d.deal_value}
            onChange={set("deal_value")}
          />
        </label>
        <label className="text-sm text-gray-400">
          System size (kVA)
          <input
            className={`${field} mt-2`}
            inputMode="decimal"
            value={d.system_size_kva}
            onChange={set("system_size_kva")}
          />
        </label>
        <label className="text-sm text-gray-400 sm:col-span-2">
          Follow-up reminder
          <input
            className={`${field} mt-2`}
            type="datetime-local"
            value={d.follow_up_at}
            onChange={set("follow_up_at")}
          />
          {d.follow_up_at && (
            <button
              type="button"
              className="mt-2 text-xs text-gray-500 hover:text-white"
              onClick={() => setD({ ...d, follow_up_at: "" })}
            >
              Clear reminder
            </button>
          )}
        </label>
        <label className="text-sm text-gray-400 sm:col-span-2">
          Notes
          <textarea
            className={`${field} mt-2 min-h-[120px]`}
            value={d.notes}
            onChange={set("notes")}
            placeholder="Site details, budget, what they said..."
            maxLength={5000}
          />
        </label>
      </div>

      <div className="mt-8">
        <h3 className="mb-3 text-lg font-semibold">Activity</h3>
        <div className="space-y-2">
          {activities.length === 0 ? (
            <p className={`${card} p-4 text-sm text-gray-400`}>
              No activity yet. Changes you save are recorded here.
            </p>
          ) : (
            activities.map((a) => (
              <div key={a.id} className={`${card} p-3`}>
                <p className="text-sm">{a.activity}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {new Date(a.created_at).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {canManage && (
        <button
          onClick={onDelete}
          className="mt-8 text-sm text-red-400 hover:underline"
        >
          Delete this lead
        </button>
      )}

      {/* Save bar: always visible at the bottom of the window */}
      <div className="sticky bottom-0 -mx-6 -mb-6 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[#0b0b0b] px-6 py-4 sm:-mx-8 sm:-mb-8 sm:px-8">
        <p
          role="status"
          className={`text-sm ${error ? "text-red-400" : dirty ? "text-yellow-400" : "text-gray-500"}`}
        >
          {error || (dirty ? "You have unsaved changes" : "All changes saved")}
        </p>
        <button
          className={btnPrimary}
          onClick={save}
          disabled={!dirty || saving}
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </Modal>
  );
}

/* ---------- Website form ---------- */
function WebsiteFormModal({
  profile,
  onClose,
  onKeyChanged,
  notify,
}: {
  profile: Profile;
  onClose: () => void;
  onKeyChanged: (key: string) => void;
  notify: (msg: string) => void;
}) {
  const key = profile.organizations?.capture_key ?? "";
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const link = `${origin}/quote/${key}`;
  const embed = `<iframe src="${link}" width="100%" height="680" style="border:0;max-width:560px" loading="lazy" title="Request a solar quote"></iframe>`;

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(`${what} copied`);
    } catch {
      notify("Couldn't copy automatically. Select the text and copy it.");
    }
  };

  const regenerate = async () => {
    if (
      !window.confirm(
        "Create a new link? Your current link and any website embeds will stop working until you replace them.",
      )
    )
      return;
    const { data, error } = await supabase.rpc("regenerate_capture_key");
    if (error || !data)
      return notify("Couldn't create a new link. Please try again.");
    onKeyChanged(data as string);
    notify("New link created");
  };

  return (
    <Modal title="Website enquiry form" onClose={onClose}>
      {!key ? (
        <p className="text-sm text-gray-400">
          Your form link isn't ready yet. Ask your administrator to finish the
          database setup for website forms.
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-400">
            Anyone who fills in this form becomes a new lead in your pipeline,
            marked “Website”, and you get an email straight away.
          </p>

          <h3 className="mb-2 mt-6 font-semibold">Your enquiry link</h3>
          <div className="flex gap-2">
            <input
              readOnly
              className={field}
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Enquiry link"
            />
            <button className={btnPrimary} onClick={() => copy(link, "Link")}>
              Copy
            </button>
          </div>
          <div className="mt-2 flex gap-4 text-sm">
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Open the form
            </a>
          </div>
          <p className="mt-3 text-sm text-gray-400">
            Put this link in your Instagram or Facebook bio, your WhatsApp
            status and auto-reply, and on your business cards. Anyone who taps
            it lands on your quote form.
          </p>

          <h3 className="mb-2 mt-8 font-semibold">Add it to your website</h3>
          <p className="mb-2 text-sm text-gray-400">
            Paste this code where you want the form to appear. It works on
            WordPress, Wix, Squarespace and plain HTML sites.
          </p>
          <textarea
            readOnly
            className={`${field} min-h-[96px] font-mono text-xs`}
            value={embed}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Embed code"
          />
          <button
            className={`${btn} mt-2`}
            onClick={() => copy(embed, "Embed code")}
          >
            Copy code
          </button>

          {profile.role === "owner" && (
            <div className="mt-8 border-t border-white/10 pt-5">
              <p className="text-sm text-gray-500">
                Getting spam, or shared the link by mistake? Create a new one.
                The old link stops working immediately.
              </p>
              <button
                onClick={regenerate}
                className="mt-2 text-sm text-red-400 hover:underline"
              >
                Create a new link
              </button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

/* ---------- Billing banner ---------- */
function BillingBanner({
  status,
  locked,
  daysLeft,
  periodEnd,
  isOwner,
  onOpen,
}: {
  status: string;
  locked: boolean;
  daysLeft: number;
  periodEnd: string | null;
  isOwner: boolean;
  onOpen: () => void;
}) {
  if (status === "active" && !locked) return null;

  const red = "border-red-500/30 bg-red-500/10 text-red-200";
  const yellow = "border-yellow-500/30 bg-yellow-500/10 text-yellow-200";
  const green = "border-primary/30 bg-primary/10 text-primary";
  let tone = green;
  let text = "";
  let cta = "Choose a plan";

  if (locked) {
    tone = red;
    text =
      status === "trialing"
        ? "Your free trial has ended. You can still view and export your leads. Subscribe to add and edit leads."
        : "Your subscription has ended. You can still view and export your leads. Renew to add and edit leads.";
  } else if (status === "trialing") {
    if (daysLeft > 14) return null;
    text = `Free trial: ${daysLeft} day${daysLeft === 1 ? "" : "s"} left.`;
  } else if (status === "past_due") {
    tone = yellow;
    text =
      "Your last payment didn't go through. Update your payment details to keep your account active.";
    cta = "Manage billing";
  } else if (status === "canceled") {
    tone = yellow;
    text = `Your subscription is cancelled and ends on ${periodEnd ? new Date(periodEnd).toLocaleDateString() : "the end of this period"}.`;
    cta = "Manage billing";
  }

  return (
    <div
      role="status"
      className={`mb-6 flex flex-col gap-3 rounded-xl border p-4 text-sm sm:flex-row sm:items-center sm:justify-between ${tone}`}
    >
      <p>
        {text}
        {!isOwner && locked ? " Ask the account owner to subscribe." : ""}
      </p>
      {isOwner && (
        <button className={btn} onClick={onOpen}>
          {cta}
        </button>
      )}
    </div>
  );
}

/* ---------- Billing ---------- */
function BillingModal({
  org,
  onClose,
  notify,
}: {
  org: NonNullable<Profile["organizations"]>;
  onClose: () => void;
  notify: (msg: string) => void;
}) {
  const [busy, setBusy] = useState("");
  const status = org.subscription_status ?? "trialing";

  const canceledAccessEnd = org.current_period_end
    ? Date.parse(org.current_period_end)
    : NaN;

  const subscribed =
    status === "active" ||
    status === "past_due" ||
    (status === "canceled" &&
      Number.isFinite(canceledAccessEnd) &&
      canceledAccessEnd > Date.now());
  const currentPlan = PLANS[org.plan as PlanKey];

  const go = async (path: string, body: object, tag: string) => {
    setBusy(tag);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url)
        return notify(data?.error || "Something went wrong. Please try again.");
      window.location.href = data.url;
    } catch {
      notify("We couldn't reach the server. Check your connection.");
    } finally {
      setBusy("");
    }
  };

  return (
    <Modal title="Billing" onClose={onClose}>
      {subscribed ? (
        <>
          <p className="text-gray-400">
            Current plan:{" "}
            <span className="font-semibold text-white">
              {currentPlan?.name ?? org.plan}
            </span>
            {status === "past_due" && (
              <span className="ml-2 text-yellow-400">(payment failed)</span>
            )}
            {status === "canceled" && (
              <span className="ml-2 text-yellow-400">(cancelled)</span>
            )}
          </p>
          {org.current_period_end && (
            <p className="mt-1 text-sm text-gray-500">
              {status === "canceled" ? "Access ends" : "Paid through"}{" "}
              {new Date(org.current_period_end).toLocaleDateString()}
            </p>
          )}
          <button
            className={`${btnPrimary} mt-6`}
            disabled={busy === "manage"}
            onClick={() => go("/api/billing/manage", {}, "manage")}
          >
            {busy === "manage" ? "Opening..." : "Update card or cancel"}
          </button>
          <p className="mt-3 text-xs text-gray-500">
            To change plans, contact support and we'll switch you over.
          </p>
        </>
      ) : (
        <>
          <p className="mb-5 text-sm text-gray-400">
            Pick a plan to keep adding and editing leads. You're sent to
            Paystack to pay securely, and you can cancel any time.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {(Object.keys(PLANS) as PlanKey[]).map((key) => (
              <div key={key} className={`${card} p-5`}>
                <h3 className="text-lg font-semibold">{PLANS[key].name}</h3>
                <p className="mt-1 text-2xl font-bold">{PLANS[key].price}</p>
                <p className="mt-2 text-sm text-gray-400">{PLANS[key].blurb}</p>
                <button
                  className={`${btnPrimary} mt-4 w-full`}
                  disabled={!!busy}
                  onClick={() =>
                    go("/api/billing/checkout", { plan: key }, key)
                  }
                >
                  {busy === key
                    ? "Redirecting..."
                    : `Subscribe to ${PLANS[key].name}`}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

/* ---------- Team ---------- */
interface TeamData {
  members: {
    id: string;
    full_name: string | null;
    email: string | null;
    role: string;
  }[];
  invites: { id: string; email: string; role: string; expires_at: string }[];
  limit: number;
}
const roleLabel = (r: string) =>
  r === "owner" ? "Owner" : r === "admin" ? "Admin" : "Sales rep";

function TeamModal({
  profile,
  onClose,
  notify,
  onChanged,
}: {
  profile: Profile;
  onClose: () => void;
  notify: (msg: string) => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<TeamData | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("sales_rep");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const isOwner = profile.role === "owner";

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/team");
      if (!res.ok) throw new Error();
      setData(await res.json());
      setLoadErr("");
    } catch {
      setLoadErr("Couldn't load your team. Please try again.");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify("Link copied");
    } catch {
      notify("Couldn't copy automatically. Select the link and copy it.");
    }
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLink("");
    if (!/^\S+@\S+\.\S+$/.test(email.trim()))
      return setError("Enter a valid email address.");
    setSending(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok)
        return setError(
          json?.error || "Something went wrong. Please try again.",
        );
      setLink(json.link);
      setEmail("");
      notify(
        json.emailSent
          ? "Invitation sent"
          : "Invite created. Copy the link below and send it yourself.",
      );
      load();
    } catch {
      setError("We couldn't reach the server. Check your connection.");
    } finally {
      setSending(false);
    }
  };

  const remove = async (
    kind: "member" | "invite",
    id: string,
    label: string,
  ) => {
    if (
      !window.confirm(
        kind === "member"
          ? `Remove ${label} from your team? Their leads become unassigned.`
          : `Cancel the invitation for ${label}?`,
      )
    )
      return;
    const res = await fetch("/api/team", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok)
      return notify(json?.error || "Couldn't do that. Please try again.");
    notify(kind === "member" ? "Member removed" : "Invitation cancelled");
    load();
    onChanged();
  };

  return (
    <Modal title="Your team" onClose={onClose}>
      {loadErr && (
        <p role="alert" className="mb-4 text-sm text-red-400">
          {loadErr}
        </p>
      )}
      {!data && !loadErr && <p className="text-sm text-gray-400">Loading...</p>}

      {data && (
        <>
          <p className="text-sm text-gray-400">
            {data.members.length + data.invites.length} of {data.limit} seats
            used
          </p>

          <div className="mt-4 space-y-2">
            {data.members.map((m) => (
              <div
                key={m.id}
                className={`${card} flex items-center justify-between gap-3 p-3`}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {m.full_name || "Team member"}
                    {m.id === profile.id && (
                      <span className="ml-2 text-xs text-gray-500">(you)</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-gray-500">{m.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs">
                    {roleLabel(m.role)}
                  </span>
                  {m.id !== profile.id &&
                    m.role !== "owner" &&
                    (isOwner || m.role === "sales_rep") && (
                      <button
                        className="text-xs text-red-400 hover:underline"
                        onClick={() =>
                          remove(
                            "member",
                            m.id,
                            m.full_name || m.email || "this person",
                          )
                        }
                      >
                        Remove
                      </button>
                    )}
                </div>
              </div>
            ))}
            {data.invites.map((i) => (
              <div
                key={i.id}
                className={`${card} flex items-center justify-between gap-3 border-dashed p-3`}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{i.email}</p>
                  <p className="text-xs text-gray-500">
                    Invited as {roleLabel(i.role).toLowerCase()} · expires{" "}
                    {new Date(i.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  className="shrink-0 text-xs text-gray-400 hover:text-white"
                  onClick={() => remove("invite", i.id, i.email)}
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>

          <h3 className="mb-2 mt-8 font-semibold">Invite someone</h3>
          <form
            onSubmit={invite}
            className="flex flex-col gap-3 sm:flex-row"
            noValidate
          >
            <input
              className={field}
              type="email"
              placeholder="Their email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email to invite"
            />
            <select
              className={`${field} sm:w-40`}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              aria-label="Role"
            >
              <option value="sales_rep">Sales rep</option>
              {isOwner && <option value="admin">Admin</option>}
            </select>
            <button type="submit" disabled={sending} className={btnPrimary}>
              {sending ? "Sending..." : "Invite"}
            </button>
          </form>
          <p className="mt-2 text-xs text-gray-500">
            Sales reps see their own leads and unassigned ones. Admins see
            everything and can manage the team.
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-400">
              {error}
            </p>
          )}
          {link && (
            <div className="mt-4">
              <p className="mb-2 text-sm text-gray-400">
                Invite link (works once, expires in 7 days):
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  className={field}
                  value={link}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Invite link"
                />
                <button className={btn} onClick={() => copy(link)}>
                  Copy
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

/* ---------- Page ---------- */
export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [team, setTeam] = useState<Member[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "mine" | "overdue">("all");
  const [showAdd, setShowAdd] = useState(false);
  const [showWebsite, setShowWebsite] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [showBilling, setShowBilling] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityTick, setActivityTick] = useState(0);
  const [toast, setToast] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [checklistHidden, setChecklistHidden] = useState(true); // true until we know, so it never flashes

  // Billing state. Mirrors org_can_write() in the database.
  const org = profile?.organizations;
  const billingStatus = org?.subscription_status ?? "trialing";

  const trialEndMs = org?.trial_ends_at ? Date.parse(org.trial_ends_at) : NaN;

  const periodEndMs = org?.current_period_end
    ? Date.parse(org.current_period_end)
    : NaN;

  const nowMs = Date.now();

  const canWrite =
    billingStatus === "trialing"
      ? Number.isFinite(trialEndMs) && trialEndMs > nowMs
      : billingStatus === "active" || billingStatus === "past_due"
        ? Number.isFinite(periodEndMs) && periodEndMs + 3 * 86400000 > nowMs
        : billingStatus === "canceled"
          ? Number.isFinite(periodEndMs) && periodEndMs > nowMs
          : false;

  const billingLocked = !!org && !canWrite;

  const trialDaysLeft = Number.isFinite(trialEndMs)
    ? Math.max(0, Math.ceil((trialEndMs - nowMs) / 86400000))
    : 0;

  const openAdd = () =>
    billingLocked ? notify(LOCK_MESSAGE) : setShowAdd(true);

  const openImport = () =>
    billingLocked ? notify(LOCK_MESSAGE) : fileRef.current?.click();

  const notify = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }, []);

  const reloadTeam = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, role");
    setTeam((data as Member[]) ?? []);
  }, []);

  const loadLeads = useCallback(async () => {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error)
      setLoadError(
        "We couldn't load your leads. Check your connection and refresh.",
      );
    else {
      setLeads(data as Lead[]);
      setLoadError("");
    }
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | undefined;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return; // middleware sends logged-out visitors to /login
      const { data: prof } = await supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .eq("id", user.id)
        .single();
      if (!prof) {
        setLoadError(
          "Your account isn't linked to a company yet. Please contact support.",
        );
        setLoading(false);
        return;
      }
      setProfile(prof as Profile);
      const [{ data: members }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, role"),
        loadLeads(),
      ]);
      setTeam((members as Member[]) ?? []);
      setLoading(false);
      channel = supabase
        .channel("leads-live")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "leads" },
          (payload) => {
            loadLeads();
            const row = payload.new as Partial<Lead>;
            if (payload.eventType === "INSERT" && row?.source === "Website")
              notify(`New website lead: ${row.full_name}`);
          },
        )
        .subscribe();
    })();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [loadLeads, notify]);

  const selected = leads.find((l) => l.id === selectedId) ?? null;

  useEffect(() => {
    try {
      setChecklistHidden(
        localStorage.getItem("sf_checklist_dismissed") === "1",
      );
    } catch {
      setChecklistHidden(false);
    }
  }, []);

  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("billing") !== "success"
    )
      return;
    window.history.replaceState({}, "", "/dashboard");
    notify("Payment received. Updating your plan...");
    const refresh = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .eq("id", user.id)
        .single();
      if (prof) setProfile(prof as Profile);
    };
    const t1 = setTimeout(refresh, 3000);
    const t2 = setTimeout(refresh, 9000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [notify]);

  const dismissChecklist = () => {
    setChecklistHidden(true);
    try {
      localStorage.setItem("sf_checklist_dismissed", "1");
    } catch {}
  };

  useEffect(() => {
    if (!selectedId) {
      setActivities([]);
      return;
    }
    supabase
      .from("lead_activities")
      .select("id, activity, created_at")
      .eq("lead_id", selectedId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setActivities((data as Activity[]) ?? []));
  }, [selectedId, activityTick]);

  const logActivity = async (leadId: string, activity: string) => {
    if (!profile) return;
    await supabase.from("lead_activities").insert({
      organization_id: profile.organization_id,
      lead_id: leadId,
      user_id: profile.id,
      activity,
    });
    setActivityTick((t) => t + 1);
  };

  // Updates the screen immediately, then saves. Reverts if saving fails.
  const updateLead = async (
    id: string,
    patch: Partial<Lead>,
    activity?: string | string[],
  ) => {
    if (billingLocked) {
      notify(LOCK_MESSAGE);
      return false;
    }
    const before = leads.find((l) => l.id === id);
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    const { error } = await supabase.from("leads").update(patch).eq("id", id);
    if (error) {
      if (before)
        setLeads((prev) => prev.map((l) => (l.id === id ? before : l)));
      notify("Couldn't save that change. Please try again.");
      return false;
    }
    const entries = Array.isArray(activity)
      ? activity
      : activity
        ? [activity]
        : [];
    for (const entry of entries) await logActivity(id, entry);
    return true;
  };

  const deleteLead = async (lead: Lead) => {
    if (billingLocked) return notify(LOCK_MESSAGE);

    if (!window.confirm(`Delete ${lead.full_name}? This can't be undone.`))
      return;

    const { error } = await supabase.from("leads").delete().eq("id", lead.id);

    if (error) {
      notify(
        billingLocked
          ? LOCK_MESSAGE
          : "Couldn't delete this lead. Please try again.",
      );
      return;
    }

    setSelectedId(null);
    setLeads((prev) => prev.filter((l) => l.id !== lead.id));
    notify("Lead deleted");
  };

  const onDragEnd = (r: DropResult) => {
    if (!r.destination || r.destination.droppableId === r.source.droppableId)
      return;
    const to = r.destination.droppableId as Status;
    updateLead(
      r.draggableId,
      { status: to },
      `Moved from ${stageLabel(r.source.droppableId)} to ${stageLabel(to)}`,
    );
  };

  /* ----- CSV import / export ----- */
  const importCsv = (file: File) => {
    if (!profile) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: async ({ data }) => {
        const pick = (row: Record<string, string>, keys: string[]) => {
          for (const k of keys) if (row[k]?.trim()) return row[k].trim();
          return null;
        };
        const rows = data.slice(0, 500).map((r) => ({
          organization_id: profile.organization_id,
          created_by: profile.id,
          full_name: pick(r, ["full_name", "name", "customer", "client"]),
          phone: pick(r, ["phone", "mobile", "whatsapp", "phone number"]),
          email: pick(r, ["email", "email address"])?.toLowerCase() ?? null,
          location: pick(r, ["location", "address", "city", "area"]),
          source: pick(r, ["source"]) ?? "Import",
          notes: pick(r, ["notes", "note"]),
        }));
        const valid = rows.filter((r) => r.full_name);
        if (valid.length === 0)
          return notify(
            "No leads found. Your file needs a header row with a 'name' column.",
          );
        for (let i = 0; i < valid.length; i += 100) {
          const { error } = await supabase
            .from("leads")
            .insert(valid.slice(i, i + 100));
          if (error)
            return notify(
              "Import stopped partway. Some leads may have been added.",
            );
        }
        await loadLeads();
        notify(
          `Imported ${valid.length} leads${rows.length > valid.length ? `, skipped ${rows.length - valid.length} without a name` : ""}`,
        );
      },
      error: () => notify("Couldn't read that file. Use a .csv file."),
    });
  };

  const exportCsv = () => {
    const csv = Papa.unparse(
      leads.map((l) => ({
        Name: safeCell(l.full_name),
        Phone: safeCell(l.phone),
        Email: safeCell(l.email),
        Location: safeCell(l.location),
        Source: safeCell(l.source),
        Stage: stageLabel(l.status),
        "System size (kVA)": l.system_size_kva ?? "",
        "Deal value": l.deal_value ?? "",
        "Follow-up": l.follow_up_at
          ? new Date(l.follow_up_at).toLocaleString()
          : "",
        Notes: safeCell(l.notes),
        Created: new Date(l.created_at).toLocaleDateString(),
      })),
    );
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ----- Derived data ----- */
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (filter === "mine" && l.assigned_to !== profile?.id) return false;
      if (filter === "overdue" && !isOverdue(l)) return false;
      if (!q) return true;
      return [l.full_name, l.email, l.phone, l.location].some((v) =>
        v?.toLowerCase().includes(q),
      );
    });
  }, [leads, search, filter, profile]);

  const grouped = useMemo(() => {
    const g = Object.fromEntries(
      STAGES.map((s) => [s.key, [] as Lead[]]),
    ) as Record<Status, Lead[]>;
    visible.forEach((l) => (g[l.status] ?? g.new).push(l));
    return g;
  }, [visible]);

  const stats = useMemo(() => {
    const active = leads.filter((l) => !isClosed(l));
    const won = leads.filter((l) => l.status === "installed").length;
    const lost = leads.filter((l) => l.status === "lost").length;
    return {
      active: active.length,
      pipeline: active.reduce((s, l) => s + (l.deal_value ?? 0), 0),
      overdue: leads.filter(isOverdue).length,
      winRate:
        won + lost === 0 ? "—" : `${Math.round((won / (won + lost)) * 100)}%`,
    };
  }, [leads]);

  const weekly = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return Array.from({ length: 8 }, (_, i) => {
      const s = new Date(start);
      s.setDate(s.getDate() - (7 - i) * 7);
      const e = new Date(s);
      e.setDate(e.getDate() + 7);
      return {
        week: s.toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
        }),
        leads: leads.filter((l) => {
          const t = new Date(l.created_at);
          return t >= s && t < e;
        }).length,
      };
    });
  }, [leads]);

  const orgName = profile?.organizations?.name ?? "Your company";
  const canManage = profile?.role !== "sales_rep";
  const firstName = (selected?.full_name ?? "").split(" ")[0];
  const waText = `Hi ${firstName}, this is ${profile?.full_name ?? "the team"} from ${orgName}. Thanks for your interest in solar. When is a good time to talk?`;

  // Progress comes straight from your leads, so CSV imports count too
  const checklist = [
    {
      label: "Add your first lead",
      hint: "Use “Add lead”, or import a spreadsheet.",
      done: leads.length > 0,
    },
    {
      label: "Set a follow-up reminder",
      hint: "Open a lead and pick a follow-up date and time.",
      done: leads.some((l) => !!l.follow_up_at),
    },
    {
      label: "Move a lead to the next stage",
      hint: "Drag a card to another column, or change its stage when you open it.",
      done: leads.some((l) => l.status !== "new"),
    },
    {
      label: "Get a lead from your website form",
      hint: "Open “Website form”, copy your link and share it. Enquiries land here automatically.",
      done: leads.some((l) => l.source === "Website"),
    },
  ];
  const showChecklist = !!profile && !loadError && !checklistHidden;

  /* ----- Render ----- */
  if (loading) {
    return (
      <main className="min-h-screen bg-black px-6 py-10 text-white">
        <div className="mx-auto max-w-7xl animate-pulse space-y-6">
          <div className="h-10 w-64 rounded-xl bg-white/10" />
          <div className="grid gap-4 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-2xl bg-white/10" />
            ))}
          </div>
          <div className="h-96 rounded-2xl bg-white/10" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-primary">{orgName}</p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Pipeline
            </h1>
            <p className="mt-1 text-sm text-gray-400">
              {profile?.full_name} ·{" "}
              {profile?.role === "sales_rep"
                ? "Sales rep"
                : profile?.role === "admin"
                  ? "Admin"
                  : "Owner"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className={btnPrimary} onClick={openAdd}>
              + Add lead
            </button>
            <button className={btn} onClick={openImport}>
              Import CSV
            </button>
            <button className={btn} onClick={() => setShowWebsite(true)}>
              Website form
            </button>
            {canManage && (
              <button className={btn} onClick={() => setShowTeam(true)}>
                Team
              </button>
            )}
            {profile?.role === "owner" && (
              <button className={btn} onClick={() => setShowBilling(true)}>
                Billing
              </button>
            )}
            <button
              className={btn}
              onClick={exportCsv}
              disabled={leads.length === 0}
            >
              Export CSV
            </button>
            <Link href="/" className={btn}>
              Home
            </Link>
            <button
              className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400"
              onClick={async () => {
                await supabase.auth.signOut();
                router.replace("/login");
                router.refresh();
              }}
            >
              Log out
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importCsv(f);
                e.target.value = "";
              }}
            />
          </div>
        </header>

        {profile && org && (
          <BillingBanner
            status={billingStatus}
            locked={billingLocked}
            daysLeft={trialDaysLeft}
            periodEnd={org.current_period_end ?? null}
            isOwner={profile.role === "owner"}
            onOpen={() => setShowBilling(true)}
          />
        )}

        {loadError && (
          <p
            role="alert"
            className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300"
          >
            {loadError}
          </p>
        )}

        {showChecklist && (
          <Checklist steps={checklist} onDismiss={dismissChecklist} />
        )}

        {leads.length === 0 && !loadError ? (
          <div className={`${card} mx-auto mt-10 max-w-xl p-10 text-center`}>
            <h2 className="text-2xl font-bold">No leads yet</h2>
            <p className="mt-2 text-gray-400">
              Add your first lead, or import the ones you already have from a
              spreadsheet.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button className={btnPrimary} onClick={openAdd}>
                + Add lead
              </button>
              <button className={btn} onClick={openImport}>
                Import CSV
              </button>
              <button className={btn} onClick={() => setShowWebsite(true)}>
                Website form
              </button>
            </div>
            <p className="mt-4 text-xs text-gray-500">
              CSV columns we understand: name, phone, email, location, source,
              notes.
            </p>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat label="Active leads" value={String(stats.active)} />
              <Stat
                label="Pipeline value"
                value={money.format(stats.pipeline)}
                hint="Open deals with a value set"
              />
              <Stat label="Follow-ups overdue" value={String(stats.overdue)} />
              <Stat
                label="Win rate"
                value={stats.winRate}
                hint="Installed ÷ (installed + lost)"
              />
            </div>

            <div className={`${card} mb-6 p-5`}>
              <h2 className="mb-3 text-lg font-semibold">New leads per week</h2>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekly}>
                    <XAxis
                      dataKey="week"
                      stroke="#666"
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.05)" }}
                      contentStyle={{
                        background: "#111",
                        border: "1px solid #333",
                        borderRadius: 12,
                      }}
                    />
                    <Bar dataKey="leads" fill="#22c55e" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Search and filters */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row">
              <input
                className={field}
                placeholder="Search by name, phone, email or location"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search leads"
              />
              <div className="flex shrink-0 gap-2">
                {(
                  [
                    ["all", "All"],
                    ["mine", "My leads"],
                    ["overdue", "Overdue"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setFilter(k)}
                    className={`rounded-xl border px-4 py-2.5 text-sm ${filter === k ? "border-primary/50 bg-primary/15 text-primary" : "border-white/10 bg-white/[0.04]"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Board */}
            <DragDropContext onDragEnd={onDragEnd}>
              <div className="flex gap-4 overflow-x-auto pb-4">
                {STAGES.map((stage) => (
                  <Droppable droppableId={stage.key} key={stage.key}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`min-h-[320px] w-72 shrink-0 rounded-2xl border p-3 ${snapshot.isDraggingOver ? "border-primary/40 bg-primary/5" : "border-white/10 bg-white/[0.03]"}`}
                      >
                        <div className="mb-3 flex items-center justify-between px-1">
                          <h3 className="font-semibold">{stage.label}</h3>
                          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-gray-300">
                            {grouped[stage.key].length}
                          </span>
                        </div>
                        <div className="space-y-3">
                          {grouped[stage.key].map((lead, index) => (
                            <Draggable
                              draggableId={lead.id}
                              index={index}
                              key={lead.id}
                            >
                              {(p) => (
                                <div
                                  ref={p.innerRef}
                                  {...p.draggableProps}
                                  {...p.dragHandleProps}
                                  className="rounded-xl border border-white/10 bg-black/50 p-3"
                                >
                                  <p className="font-semibold">
                                    {lead.full_name}
                                  </p>
                                  <p className="mt-0.5 text-xs text-gray-400">
                                    {lead.location || lead.phone || lead.email}
                                  </p>
                                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                                    {lead.system_size_kva != null && (
                                      <span className="rounded-full bg-white/10 px-2 py-0.5">
                                        {lead.system_size_kva} kVA
                                      </span>
                                    )}
                                    {lead.deal_value != null && (
                                      <span className="rounded-full bg-white/10 px-2 py-0.5">
                                        {money.format(lead.deal_value)}
                                      </span>
                                    )}
                                    {isOverdue(lead) && (
                                      <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-red-400">
                                        Follow-up overdue
                                      </span>
                                    )}
                                  </div>
                                  {lead.assigned_to && (
                                    <p className="mt-2 text-xs text-gray-500">
                                      {team.find(
                                        (t) => t.id === lead.assigned_to,
                                      )?.full_name || "Assigned"}
                                    </p>
                                  )}
                                  <button
                                    className={`${btn} mt-3 w-full py-1.5`}
                                    onClick={() => setSelectedId(lead.id)}
                                  >
                                    Open
                                  </button>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      </div>
                    )}
                  </Droppable>
                ))}
              </div>
            </DragDropContext>
          </>
        )}
      </div>

      {showAdd && profile && (
        <AddLeadModal
          profile={profile}
          team={team}
          onClose={() => setShowAdd(false)}
          onSaved={(m) => {
            notify(m);
            loadLeads();
          }}
        />
      )}

      {showWebsite && profile && (
        <WebsiteFormModal
          profile={profile}
          onClose={() => setShowWebsite(false)}
          notify={notify}
          onKeyChanged={(k) =>
            setProfile((p) =>
              p
                ? {
                    ...p,
                    organizations: {
                      name: p.organizations?.name ?? "",
                      capture_key: k,
                    },
                  }
                : p,
            )
          }
        />
      )}

      {showTeam && profile && (
        <TeamModal
          profile={profile}
          onClose={() => setShowTeam(false)}
          notify={notify}
          onChanged={reloadTeam}
        />
      )}

      {showBilling && profile && org && (
        <BillingModal
          org={org}
          onClose={() => setShowBilling(false)}
          notify={notify}
        />
      )}

      {selected && (
        <LeadModal
          key={selected.id}
          lead={selected}
          team={team}
          canManage={canManage}
          activities={activities}
          onClose={() => setSelectedId(null)}
          onSave={async (patch, activity) => {
            const ok = await updateLead(selected.id, patch, activity);
            if (ok) notify("Changes saved");
            return ok;
          }}
          onDelete={() => deleteLead(selected)}
          onWhatsApp={() => logActivity(selected.id, "Opened WhatsApp chat")}
          waText={waText}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl border border-white/10 bg-[#161616] px-5 py-3 text-sm shadow-xl"
        >
          {toast}
        </div>
      )}
    </main>
  );
}
