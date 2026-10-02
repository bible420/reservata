import ManagedForm from "../../components/ManagedForm.jsx";
import { useState } from "react";
import { Archive, ArrowLeft, ArrowRight, Building2, Download, Edit3, Lock, Plus, Save, Search, Trash2 } from "lucide-react";
import { PageTabs, TabPanel } from "../../components/PageTabs.jsx";
import { ActivityRows, Badge, CardHeader, DetailModal, EmptyState } from "../../components/Common.jsx";
import { REQUESTER_TYPES } from "../../config.js";
import { isUstSsoEmail, suggestOfficeCode } from "../../store/shared.js";
import { downloadCsv, formatDate, sortBy, todayIso } from "../../shared/utils.js";

const ROLE_OPTIONS = ["Requester", "Office Admin", "Super Admin", "OSG Admin"];
const OFFICE_ADMIN_EXCLUDED_OFFICES = ["Facilities Management", "Faculty of Arts and Letters"];
// Role filter cards, in display order.
const ROLE_DESCRIPTIONS = {
  "Super Admin": "Manages every office, routing rules and accounts.",
  "Office Admin": "Handles approvals, payments and resources for one office.",
  Requester: "Books resources as faculty, staff, a student or a student org.",
  "OSG Admin": "Reviews visitor access, events and parking for OSG."
};

function initialsOf(name) {
  return String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "?";
}
// Archiving an office marks it Inactive, so the directory filters treat Inactive as archived.
const OFFICE_FILTERS = [
  ["directory", "Office directory", () => true],
  ["active", "Active", (office) => office.status !== "Inactive"],
  ["archived", "Archived", (office) => office.status === "Inactive"]
];

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function OfficeDirectoryRow({ office, resourceCount, adminCount, onCoverage, onEdit, onArchive }) {
  const archived = office.status === "Inactive";
  return (
    <li className="om-row">
      <span className="om-icon" aria-hidden="true"><Building2 size={18} /></span>
      <div className="om-info">
        <div className="om-name">
          <strong>{office.name}</strong>
          <span className={`om-pill ${archived ? "is-archived" : "is-active"}`}>{archived ? "Archived" : "Active"}</span>
          {!archived && !adminCount && <span className="om-pill is-warning">No admin assigned</span>}
        </div>
        <small>{plural(resourceCount, "resource")} · {plural(adminCount, "administrator account")}</small>
      </div>
      <div className="om-actions">
        <button className="om-coverage" onClick={onCoverage} type="button">
          View coverage <ArrowRight size={14} aria-hidden="true" />
        </button>
        <button className="icon-button" aria-label={`Edit ${office.name}`} title="Edit office" onClick={onEdit} type="button">
          <Edit3 size={15} />
        </button>
        {!archived && (
          <button className="icon-button danger-icon om-archive" aria-label={`Archive ${office.name}`} title="Archive office" onClick={onArchive} type="button">
            <Archive size={15} />
          </button>
        )}
      </div>
    </li>
  );
}

function OfficeForm({ title, subtitle, name, status, onName, onStatus, onSubmit, submitLabel, onCancel, idPrefix }) {
  return (
    <ManagedForm className="wf-card om-form" onSubmit={onSubmit}>
      <div className="wf-card-head">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      <div className="wf-card-body om-form-fields">
        <div className="field">
          <label htmlFor={`${idPrefix}-name`}>Office name</label>
          <input id={`${idPrefix}-name`} className="input" value={name} onChange={(event) => onName(event.target.value)} placeholder="e.g. Office of Student Affairs" required />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-status`}>Status</label>
          <select id={`${idPrefix}-status`} className="select" value={status} onChange={(event) => onStatus(event.target.value)}>
            <option value="Active">Active</option>
            <option value="Inactive">Archived</option>
          </select>
        </div>
      </div>
      <div className="wf-card-foot">
        {onCancel && <button className="secondary-button" onClick={onCancel} type="button">Cancel</button>}
        <button className="primary-button icon-text-button" type="submit"><Save size={16} /> {submitLabel}</button>
      </div>
    </ManagedForm>
  );
}

const CLOSED_RESERVATION_STATUSES = ["Rejected", "Cancelled", "Expired", "No Show"];
const WAITING_RESERVATION_STATUSES = ["Under Owner Review", "Under Additional Review"];

function CoverageEmpty({ children }) {
  return <p className="om-cov-empty">{children}</p>;
}

// Everything one office owns, for the Super Admin's "View coverage" drill-down.
function OfficeCoverage({ store, office, onBack, onEdit, onNavigate }) {
  const [tab, setTab] = useState("overview");
  const archived = office.status === "Inactive";
  const resources = store.data.resources.filter((item) => item.office === office.name && item.status !== "Archived");
  const admins = store.data.people.filter((person) => person.office === office.name && person.role.includes("Admin"));
  const reservations = [...store.data.reservations.filter((item) => item.office === office.name)]
    .sort((left, right) => `${right.date} ${right.start}`.localeCompare(`${left.date} ${left.start}`));
  const reservationIds = new Set(reservations.map((item) => item.id));
  const payments = store.data.payments.filter((item) => item.office === office.name || reservationIds.has(item.reservationId));
  const toVerify = payments.filter((item) => item.status === "Pending Verification");
  const waiting = store.data.reservations.filter((item) =>
    item.approvalSteps?.some((step) => step.office === office.name && step.status === "Pending")
  );
  const resourceNames = new Set(resources.map((item) => item.name));
  const adminNames = new Set(admins.map((person) => person.name));
  const activity = store.data.activity.filter((item) =>
    reservationIds.has(item.reservationId)
    || item.target === office.name
    || resourceNames.has(item.target)
    || adminNames.has(item.actor)
    || adminNames.has(item.target)
  );
  const today = todayIso();
  const upcoming = reservations
    .filter((item) => item.date >= today && !CLOSED_RESERVATION_STATUSES.includes(item.status))
    .sort((left, right) => `${left.date} ${left.start}`.localeCompare(`${right.date} ${right.start}`));
  const upcomingByDate = upcoming.reduce((groups, item) => {
    (groups[item.date] ||= []).push(item);
    return groups;
  }, {});
  const reservationFor = (payment) => store.data.reservations.find((item) => item.id === payment.reservationId);

  const attention = [
    archived && ["This office is archived", "Requesters cannot book its resources. Edit the office to make it active again."],
    !admins.length && ["No administrator accounts", "Assign an Office Admin so someone can review this office's requests and payments."],
    !resources.length && ["No resources yet", "Add a resource so people can start booking from this office."],
    waiting.length > 0 && [`${plural(waiting.length, "request")} waiting on this office`, "They are sitting in this office's approval queue."],
    toVerify.length > 0 && [`${plural(toVerify.length, "receipt")} to verify`, "Requesters have uploaded payment receipts that need a decision."],
  ].filter(Boolean);

  const tabs = [
    ["overview", "Overview"],
    ["resources", "Resources", resources.length],
    ["admins", "Admin accounts", admins.length],
    ["calendar", "Calendar"],
    ["reservations", "Reservations", reservations.length],
    ["payments", "Payments", payments.length],
    ["activity", "Activity", activity.length],
  ].map(([key, label, count]) => [key, count === undefined ? label : <>{label} <span className="om-tab-count">{count}</span></>]);

  return (
    <div className="om-coverage-page">
      <button className="om-back" onClick={onBack} type="button"><ArrowLeft size={16} aria-hidden="true" /> All offices</button>
      <div className="om-cov-head">
        <span className="om-cov-icon" aria-hidden="true"><Building2 size={22} /></span>
        <div className="om-cov-title">
          <div className="om-name">
            <h2>{office.name}</h2>
            <span className={`om-pill ${archived ? "is-archived" : "is-active"}`}>{archived ? "Archived" : "Active"}</span>
          </div>
          <p>Coverage view. Everything {office.name} manages, in one place.</p>
        </div>
        <button className="secondary-button icon-text-button om-cov-edit" onClick={onEdit} type="button">
          <Edit3 size={15} aria-hidden="true" /> Edit office
        </button>
      </div>

      <div className="om-stats om-stats-4">
        <div className="om-stat">
          <span>Resources</span>
          <strong>{resources.length}</strong>
          <small>{resources.length ? `${resources.filter((item) => item.status === "Available").length} available now` : "None yet"}</small>
        </div>
        <div className="om-stat">
          <span>Admin accounts</span>
          <strong>{admins.length}</strong>
          <small>{admins.length ? `${admins.filter((person) => person.status === "Active").length} active` : "None assigned"}</small>
        </div>
        <div className="om-stat">
          <span>Reservations</span>
          <strong>{reservations.length}</strong>
          <small>All statuses</small>
        </div>
        <div className="om-stat">
          <span>Payments to verify</span>
          <strong>{toVerify.length}</strong>
          <small>{payments.length} total</small>
        </div>
      </div>

      <section className="wf-card om-cov-card">
        <PageTabs id="coverage" label="Office coverage" tabs={tabs} value={tab} onChange={setTab} />

        <TabPanel id="coverage" name="overview" value={tab}>
          <div className="om-cov-overview">
            <div>
              <h3>Needs attention</h3>
              {attention.length ? (
                <ul className="om-attention">
                  {attention.map(([title, detail]) => (
                    <li key={title}>
                      <span className="om-attention-dot" aria-hidden="true" />
                      <div><strong>{title}</strong><small>{detail}</small></div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="om-all-clear">Nothing needs attention. This office is staffed, stocked and up to date.</p>
              )}
            </div>
            <div>
              <h3>Recent activity</h3>
              {activity.length
                ? <ActivityRows store={{ visibleActivity: activity }} limit={5} />
                : <CoverageEmpty>No activity has been recorded for this office yet.</CoverageEmpty>}
            </div>
          </div>
        </TabPanel>

        <TabPanel id="coverage" name="resources" value={tab}>
          <div className="om-cov-panel-head">
            <p>Resources owned by {office.name}.</p>
            <button className="secondary-button" onClick={() => onNavigate("officeSettings")} type="button">Manage resources</button>
          </div>
          {resources.length ? (
            <div className="table-wrap">
              <table className="om-cov-table">
                <thead><tr><th>Resource</th><th>Type</th><th>Status</th><th>Fee</th></tr></thead>
                <tbody>
                  {resources.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.name}</strong><br /><small>{item.location}</small></td>
                      <td>{item.type}</td>
                      <td><Badge status={item.status} /></td>
                      <td>{item.requiresPayment ? `PHP ${Number(item.fee || 0).toLocaleString("en-PH")}` : "Free"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <CoverageEmpty>{office.name} has no resources yet.</CoverageEmpty>}
        </TabPanel>

        <TabPanel id="coverage" name="admins" value={tab}>
          <div className="om-cov-panel-head">
            <p>Accounts that administer {office.name}.</p>
            <button className="secondary-button" onClick={() => onNavigate("users")} type="button">Manage users</button>
          </div>
          {admins.length ? (
            <ul className="om-cov-list">
              {admins.map((person) => (
                <li key={person.email}>
                  <span className="ur-avatar" aria-hidden="true">{initialsOf(person.name)}</span>
                  <div><strong>{person.name}</strong><small>{person.email}</small></div>
                  <span className="om-cov-role">{person.role}</span>
                  <Badge status={person.status} />
                </li>
              ))}
            </ul>
          ) : <CoverageEmpty>No administrator accounts are assigned to {office.name}.</CoverageEmpty>}
        </TabPanel>

        <TabPanel id="coverage" name="calendar" value={tab}>
          <div className="om-cov-panel-head"><p>Upcoming bookings for {office.name}&apos;s resources.</p></div>
          {upcoming.length ? (
            <div className="om-cov-days">
              {Object.entries(upcomingByDate).map(([date, items]) => (
                <div className="om-cov-day" key={date}>
                  <h4>{formatDate(date)}</h4>
                  <ul className="om-cov-list">
                    {items.map((item) => (
                      <li key={item.id}>
                        <span className="om-cov-time">{item.start}–{item.end}</span>
                        <div><strong>{item.resourceName}</strong><small>{item.requester}</small></div>
                        <Badge status={item.status} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : <CoverageEmpty>Nothing is scheduled ahead for this office.</CoverageEmpty>}
        </TabPanel>

        <TabPanel id="coverage" name="reservations" value={tab}>
          {reservations.length ? (
            <div className="table-wrap">
              <table className="om-cov-table">
                <thead><tr><th>Resource</th><th>Requester</th><th>Schedule</th><th>Status</th></tr></thead>
                <tbody>
                  {reservations.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.resourceName}</strong><br /><small>{item.id}</small></td>
                      <td>{item.requester}</td>
                      <td>{formatDate(item.date)}<br /><small>{item.start}–{item.end}</small></td>
                      <td><Badge status={item.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <CoverageEmpty>No reservations have been made with {office.name} yet.</CoverageEmpty>}
        </TabPanel>

        <TabPanel id="coverage" name="payments" value={tab}>
          {payments.length ? (
            <div className="table-wrap">
              <table className="om-cov-table">
                <thead><tr><th>Reservation</th><th>Requester</th><th>Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {payments.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{reservationFor(item)?.resourceName || item.reservationId}</strong><br /><small>{item.reservationId}</small></td>
                      <td>{item.requester}</td>
                      <td>PHP {Number(item.amount || 0).toLocaleString("en-PH")}</td>
                      <td><Badge status={item.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <CoverageEmpty>No payments have been recorded for {office.name} yet.</CoverageEmpty>}
        </TabPanel>

        <TabPanel id="coverage" name="activity" value={tab}>
          {activity.length
            ? <div className="om-cov-activity"><ActivityRows store={{ visibleActivity: activity }} /></div>
            : <CoverageEmpty>No activity has been recorded for this office yet.</CoverageEmpty>}
        </TabPanel>
      </section>
    </div>
  );
}

function emptyOfficeDraft(store) {
  const basic = store.data.approvalTemplates.find((item) => item.id === "WF-BASIC" && item.status === "Active");
  return {
    name: "",
    code: "",
    status: "Active",
    contactEmail: "",
    phone: "",
    location: "",
    openTime: "08:00",
    closeTime: "17:00",
    description: "",
    defaultWorkflowId: basic?.id || store.data.approvalTemplates.find((item) => item.status === "Active")?.id || "",
    collectsPayments: false
  };
}

function displayClock(value) {
  if (!value) return "";
  const [hours, minutes] = value.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

// "juan.dela-cruz@ust.edu.ph" -> "Juan Dela Cruz": a starting display name the admin can fix later.
function nameFromEmail(email) {
  return email.split("@")[0].split(/[._-]+/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function FieldLabel({ htmlFor, children, required, optional }) {
  return (
    <label htmlFor={htmlFor}>
      {children}
      {required && <span className="ao-required">Required</span>}
      {optional && <span className="wf-optional"> (optional)</span>}
    </label>
  );
}

function AddOfficeForm({ store, onAction, onDone }) {
  const [draft, setDraft] = useState(() => emptyOfficeDraft(store));
  const [codeEdited, setCodeEdited] = useState(false);
  const [adminEmails, setAdminEmails] = useState([]);
  const [adminInput, setAdminInput] = useState("");
  const [adminError, setAdminError] = useState("");
  const [created, setCreated] = useState(null);
  const workflows = store.data.approvalTemplates.filter((item) => item.status === "Active");

  function update(field, value) {
    setDraft((current) => {
      const next = { ...current, [field]: value };
      // Keep suggesting a code from the name until the admin types their own.
      if (field === "name" && !codeEdited) next.code = suggestOfficeCode(value);
      return next;
    });
  }

  function addAdmin() {
    const email = adminInput.trim().toLowerCase();
    setAdminError("");
    if (!email) return;
    if (!isUstSsoEmail(email)) return setAdminError("Use a UST SSO email ending in @ust.edu.ph.");
    if (adminEmails.includes(email)) return setAdminError("That email is already on the list.");
    if (store.data.people.some((person) => person.email.toLowerCase() === email)) {
      return setAdminError("That person already has an account. Change their role in Users & Roles instead.");
    }
    setAdminEmails((current) => [...current, email]);
    setAdminInput("");
  }

  function reset() {
    setDraft(emptyOfficeDraft(store));
    setCodeEdited(false);
    setAdminEmails([]);
    setAdminInput("");
    setAdminError("");
  }

  async function submit(event) {
    event.preventDefault();
    const passwords = [];
    const officeName = draft.name.trim();
    const saved = await onAction(async () => {
      await store.saveOffice(draft);
      for (const email of adminEmails) {
        await store.createUser({ name: nameFromEmail(email), email, office: officeName, role: "Office Admin", status: "Active" });
        if (store.pendingTempPassword) {
          passwords.push({ email, password: store.pendingTempPassword });
          store.pendingTempPassword = null;
        }
      }
    }, adminEmails.length ? `Office created with ${plural(adminEmails.length, "administrator")}.` : "Office created.");
    if (!saved) return;
    reset();
    if (passwords.length) setCreated({ office: officeName, passwords });
    else onDone();
  }

  const previewName = draft.name.trim();
  const contact = [draft.contactEmail.trim(), draft.phone.trim()].filter(Boolean).join(" · ");
  const hours = draft.openTime && draft.closeTime ? `${displayClock(draft.openTime)} to ${displayClock(draft.closeTime)}` : "";

  return (
    <>
      <div className="wf-intro">
        <h2>Set up a new office</h2>
        <p>Offices own resources and have administrators who review requests. Fields marked Required must be filled in.</p>
      </div>
      <div className="wf-layout">
        <ManagedForm className="ao-form" onSubmit={submit}>
          <section className="wf-card">
            <div className="wf-card-head">
              <h3>Basic information</h3>
              <p>The name people see and the short code used in asset tags.</p>
            </div>
            <div className="wf-card-body ao-grid">
              <div className="field ao-span-2">
                <FieldLabel htmlFor="new-office-name" required>Office name</FieldLabel>
                <input id="new-office-name" className="input" value={draft.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. Office of Student Affairs" required />
              </div>
              <div className="field">
                <FieldLabel htmlFor="new-office-code" required>Short code</FieldLabel>
                <input
                  id="new-office-code"
                  className="input ao-code"
                  value={draft.code}
                  onChange={(event) => { setCodeEdited(true); update("code", event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)); }}
                  placeholder="e.g. OSA"
                  pattern="[A-Z0-9]{2,8}"
                  title="2 to 8 letters or numbers"
                  required
                />
                <small className="field-help">Suggested from the name. Used in asset tags, like {draft.code || "SIMBA"}-VEH-005.</small>
              </div>
              <div className="field">
                <FieldLabel htmlFor="new-office-status">Status</FieldLabel>
                <select id="new-office-status" className="select" value={draft.status} onChange={(event) => update("status", event.target.value)}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Archived</option>
                </select>
                <small className="field-help">Archived offices are hidden from the Active list.</small>
              </div>
            </div>
          </section>

          <section className="wf-card">
            <div className="wf-card-head">
              <h3>Contact and location</h3>
              <p>So requesters know where to go and who to reach.</p>
            </div>
            <div className="wf-card-body ao-grid">
              <div className="field">
                <FieldLabel htmlFor="new-office-email" required>Contact email</FieldLabel>
                <input id="new-office-email" className="input" type="email" value={draft.contactEmail} onChange={(event) => update("contactEmail", event.target.value)} placeholder="e.g. office@ust.edu.ph" required />
              </div>
              <div className="field">
                <FieldLabel htmlFor="new-office-phone" optional>Phone</FieldLabel>
                <input id="new-office-phone" className="input" type="tel" value={draft.phone} onChange={(event) => update("phone", event.target.value)} placeholder="e.g. (02) 8123 4567" />
              </div>
              <div className="field ao-span-2">
                <FieldLabel htmlFor="new-office-location" optional>Location</FieldLabel>
                <input id="new-office-location" className="input" value={draft.location} onChange={(event) => update("location", event.target.value)} placeholder="e.g. Main Building, Room 204" />
              </div>
              <fieldset className="ao-hours ao-span-2">
                <legend>Office hours <span className="wf-optional">(optional)</span></legend>
                <div className="ao-grid">
                  <div className="field">
                    <label htmlFor="new-office-open">Opens</label>
                    <input id="new-office-open" className="input" type="time" value={draft.openTime} onChange={(event) => update("openTime", event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="new-office-close">Closes</label>
                    <input id="new-office-close" className="input" type="time" value={draft.closeTime} onChange={(event) => update("closeTime", event.target.value)} />
                  </div>
                </div>
                <small className="field-help">Resources in this office use these hours by default. You can set different hours per resource.</small>
              </fieldset>
              <div className="field ao-span-2">
                <FieldLabel htmlFor="new-office-description" optional>Description</FieldLabel>
                <textarea id="new-office-description" className="textarea" rows={3} value={draft.description} onChange={(event) => update("description", event.target.value)} placeholder="What does this office manage? Requesters see this." />
              </div>
            </div>
          </section>

          <section className="wf-card">
            <div className="wf-card-head">
              <h3>Administrators</h3>
              <p>People who review requests and payments for this office.</p>
            </div>
            <div className="wf-card-body ao-admins">
              <div className="field">
                <label htmlFor="new-office-admin">Add an administrator by email</label>
                <div className="ao-admin-row">
                  <input
                    id="new-office-admin"
                    className="input"
                    type="email"
                    value={adminInput}
                    onChange={(event) => { setAdminInput(event.target.value); setAdminError(""); }}
                    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addAdmin(); } }}
                    placeholder="e.g. name@ust.edu.ph"
                  />
                  <button className="secondary-button" onClick={addAdmin} type="button">Add</button>
                </div>
                {adminError
                  ? <small className="field-error" role="alert">{adminError}</small>
                  : <small className="field-help">New admins get an Office Admin account when the office is created. You can manage accounts later in Users &amp; Roles.</small>}
              </div>
              {adminEmails.length ? (
                <ul className="ao-admin-list">
                  {adminEmails.map((email) => (
                    <li key={email}>
                      <span className="ur-avatar" aria-hidden="true">{initialsOf(nameFromEmail(email))}</span>
                      <div><strong>{nameFromEmail(email)}</strong><small>{email}</small></div>
                      <button className="icon-button danger-icon" aria-label={`Remove ${email}`} title="Remove" onClick={() => setAdminEmails((current) => current.filter((item) => item !== email))} type="button">
                        <Trash2 size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ao-warning">No administrator yet. Until one is added, nobody can review this office&apos;s requests.</p>
              )}
            </div>
          </section>

          <section className="wf-card">
            <div className="wf-card-head">
              <h3>Booking and payments <span className="wf-optional">(optional)</span></h3>
              <p>Defaults for this office. You can change them per resource.</p>
            </div>
            <div className="wf-card-body ao-grid">
              <div className="field ao-span-2">
                <label htmlFor="new-office-workflow">Default approval workflow</label>
                <select id="new-office-workflow" className="select" value={draft.defaultWorkflowId} onChange={(event) => update("defaultWorkflowId", event.target.value)}>
                  {workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
                </select>
              </div>
              <label className="ao-check ao-span-2">
                <input type="checkbox" checked={draft.collectsPayments} onChange={(event) => update("collectsPayments", event.target.checked)} />
                <span>This office collects payments for its resources</span>
              </label>
            </div>
          </section>

          <div className="wf-card ao-actions">
            <button className="secondary-button" onClick={() => { reset(); onDone(); }} type="button">Cancel</button>
            <button className="primary-button icon-text-button" type="submit"><Save size={16} /> Add office</button>
          </div>
        </ManagedForm>

        <aside className="wf-side">
          <section className="wf-card" aria-labelledby="ao-preview-title">
            <div className="wf-card-head">
              <h3 id="ao-preview-title">How it will look</h3>
              <p>A preview of the office in the directory.</p>
            </div>
            <div className="ao-preview">
              <div className="ao-preview-row">
                <span className="om-icon" aria-hidden="true"><Building2 size={18} /></span>
                <div className="om-info">
                  <div className="om-name">
                    <strong className={previewName ? "" : "is-placeholder"}>{previewName || "Office name"}</strong>
                    <span className={`om-pill ${draft.status === "Inactive" ? "is-archived" : "is-active"}`}>{draft.status === "Inactive" ? "Archived" : "Active"}</span>
                  </div>
                  <small>0 resources · {plural(adminEmails.length, "administrator account")}</small>
                </div>
              </div>
              <dl className="ao-preview-facts">
                <div><dt>Code</dt><dd>{draft.code || "–"}</dd></div>
                <div><dt>Hours</dt><dd className={hours ? "" : "is-placeholder"}>{hours || "Not set"}</dd></div>
                <div className="ao-span-2"><dt>Contact</dt><dd className={contact ? "" : "is-placeholder"}>{contact || "Not added yet"}</dd></div>
                <div className="ao-span-2"><dt>Location</dt><dd className={draft.location.trim() ? "" : "is-placeholder"}>{draft.location.trim() || "Not added yet"}</dd></div>
              </dl>
            </div>
          </section>
        </aside>
      </div>
      {created && (
        <DetailModal
          title="Office created"
          subtitle={`${created.office} · ${plural(created.passwords.length, "administrator account")}`}
          onClose={() => { setCreated(null); onDone(); }}
        >
          <p>Share each temporary password with its administrator. They can change it anytime from their Profile page.</p>
          {created.passwords.map(({ email, password }) => (
            <p className="detail-box" key={email}>{email}<br /><strong>{password}</strong></p>
          ))}
        </DetailModal>
      )}
    </>
  );
}

export function OfficesView({ store, onAction, onNavigate }) {
  const [activeTab, setActiveTab] = useState("directory");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState("Active");
  const [coverageId, setCoverageId] = useState("");
  const normalized = query.trim().toLowerCase();
  const offices = store.data.offices;
  const coverageOffice = offices.find((office) => office.id === coverageId);
  const matching = offices.filter((office) => office.name.toLowerCase().includes(normalized));
  const resourceCount = (office) => store.data.resources.filter((resource) => resource.office === office.name && resource.status !== "Archived").length;
  const adminCount = (office) => store.data.people.filter((person) => person.office === office.name && person.role.includes("Admin")).length;
  const archivedCount = offices.filter((office) => office.status === "Inactive").length;
  const totalResources = offices.reduce((sum, office) => sum + resourceCount(office), 0);
  const totalAdmins = offices.reduce((sum, office) => sum + adminCount(office), 0);

  const tabs = [
    ...OFFICE_FILTERS.map(([key, label, test]) => [key, <>{label} <span className="om-tab-count">{offices.filter(test).length}</span></>]),
    ["add", <><Plus size={15} aria-hidden="true" /> Add office</>],
    ...(selected ? [["edit", "Edit office"]] : [])
  ];

  async function saveEdit(event) {
    event.preventDefault();
    const saved = await onAction(() => store.saveOffice({ name: editName, status: editStatus }, selected.id), "Office updated.");
    if (saved) closeEdit();
  }

  function edit(office) {
    setSelected(office);
    setEditName(office.name);
    setEditStatus(office.status);
    setActiveTab("edit");
  }

  function closeEdit() {
    setSelected(null);
    setActiveTab((current) => (current === "edit" ? "directory" : current));
  }

  function archive(office) {
    if (!window.confirm("Archive this office? Active resources must be transferred or archived first.")) return;
    onAction(() => store.archiveOffice(office.id), "Office archived.");
  }

  if (coverageOffice) {
    return (
      <OfficeCoverage
        store={store}
        office={coverageOffice}
        onBack={() => setCoverageId("")}
        onEdit={() => { setCoverageId(""); edit(coverageOffice); }}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <>
      <PageTabs id="offices" label="Office management" tabs={tabs} value={activeTab} onChange={setActiveTab} />
      {OFFICE_FILTERS.map(([key, , test]) => {
        const visible = matching.filter(test);
        return (
          <TabPanel id="offices" name={key} value={activeTab} key={key}>
            <div className="wf-intro">
              <h2>Every office, at a glance</h2>
              <p>Open an office&apos;s coverage to review its resources, administrators, calendar, reservations and payments.</p>
            </div>
            <div className="om-stats">
              <div className="om-stat">
                <span>Offices</span>
                <strong>{offices.length}</strong>
                <small>{offices.length - archivedCount} active, {archivedCount} archived</small>
              </div>
              <div className="om-stat">
                <span>Resources</span>
                <strong>{totalResources}</strong>
                <small>Across all offices</small>
              </div>
              <div className="om-stat">
                <span>Admin accounts</span>
                <strong>{totalAdmins}</strong>
                <small>Across all offices</small>
              </div>
            </div>
            <section className="wf-card om-list">
              <div className="om-list-head">
                <div>
                  <h3>Offices</h3>
                  <p>Showing {visible.length} of {plural(offices.length, "office")}</p>
                </div>
                <label className="ur-search om-search">
                  <Search size={16} aria-hidden="true" />
                  <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search offices" aria-label="Search offices" />
                </label>
              </div>
              {visible.length ? (
                <ul className="om-rows">
                  {visible.map((office) => (
                    <OfficeDirectoryRow
                      key={office.id}
                      office={office}
                      resourceCount={resourceCount(office)}
                      adminCount={adminCount(office)}
                      onCoverage={() => setCoverageId(office.id)}
                      onEdit={() => edit(office)}
                      onArchive={() => archive(office)}
                    />
                  ))}
                </ul>
              ) : (
                <div className="om-empty">
                  <strong>No offices found</strong>
                  <p>Try a different name, or check another list.</p>
                </div>
              )}
            </section>
          </TabPanel>
        );
      })}
      <TabPanel id="offices" name="add" value={activeTab}>
        <AddOfficeForm store={store} onAction={onAction} onDone={() => setActiveTab("directory")} />
      </TabPanel>
      {selected && (
        <TabPanel id="offices" name="edit" value={activeTab}>
          <OfficeForm
            idPrefix="edit-office"
            title={`Edit office: ${selected.name}`}
            subtitle="Rename the office or change whether it is active."
            name={editName}
            status={editStatus}
            onName={setEditName}
            onStatus={setEditStatus}
            onSubmit={saveEdit}
            submitLabel="Save office"
            onCancel={closeEdit}
          />
        </TabPanel>
      )}
    </>
  );
}

export function UsersView({ store, onAction }) {
  const [activeTab, setActiveTab] = useState("directory");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  const [tempPasswordInfo, setTempPasswordInfo] = useState(null);
  const [draft, setDraft] = useState({
    name: "",
    email: "",
    office: "",
    role: "Requester",
    requesterType: "Student",
    status: "Active"
  });
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [officeFilter, setOfficeFilter] = useState("");
  const normalized = query.trim().toLowerCase();
  const directoryOffices = [...new Set(store.data.people.map((person) => person.office).filter(Boolean))].sort();
  const people = sortBy(store.data.people.filter((person) =>
    `${person.name} ${person.email} ${person.office} ${person.role}`.toLowerCase().includes(normalized)
    && (!roleFilter || person.role === roleFilter)
    && (!officeFilter || person.office === officeFilter)
    && (!statusFilter || person.status === statusFilter)
  ), sort);
  // Super Admin and OSG Admin offices are fixed by the server, so the dropdown is locked to that office.
  const fixedOffice = { "Super Admin": "All Offices", "OSG Admin": "OSG" }[draft.role];
  const officeAdminOffices = store.data.offices
    .filter((office) => office.status === "Active" && !OFFICE_ADMIN_EXCLUDED_OFFICES.includes(office.name))
    .map((office) => office.name);
  const officeOptions = fixedOffice ? [fixedOffice] : officeAdminOffices;

  async function submit(event) {
    event.preventDefault();
    const saved = await onAction(() => store.createUser(draft), "SSO account provisioned.");
    if (saved) {
      if (store.pendingTempPassword) {
        setTempPasswordInfo({ name: draft.name, email: draft.email, password: store.pendingTempPassword });
        store.pendingTempPassword = null;
      }
      setActiveTab("directory");
      setDraft({
        name: "",
        email: "",
        office: "",
        role: "Requester",
        requesterType: "Student",
        status: "Active"
      });
    }
  }

  function update(field, value) {
    setDraft((current) => {
      const next = { ...current, [field]: value };
      if (field === "role" && value === "Super Admin") next.office = "All Offices";
      if (field === "role" && value === "OSG Admin") next.office = "OSG";
      if (field === "role" && value === "Office Admin" && !officeAdminOffices.includes(next.office)) {
        next.office = officeAdminOffices[0] || "";
      }
      if (field === "role" && value === "Requester" && current.role !== "Requester") next.office = "";
      return next;
    });
  }

  return (
    <>
      <PageTabs id="users" label="User management" tabs={[["directory", "Users & roles"], ["editor", "Add account"]]} value={activeTab} onChange={setActiveTab} />
      <TabPanel id="users" name="editor" value={activeTab}>
      <ManagedForm className="card form-card user-create-form" onSubmit={submit} noValidate>
        <CardHeader title="Provision SSO account" subtitle="Only Super Admins can register a UST SSO identity for RESERVATA access." />
        <div className="form-grid">
          <div className="field">
            <label htmlFor="new-user-name">Full name</label>
            <input id="new-user-name" className="input" value={draft.name} onChange={(event) => update("name", event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="new-user-email">UST SSO email</label>
            <input
              id="new-user-email"
              className="input"
              type="email"
              inputMode="email"
              title="Use a UST SSO email ending in @ust.edu.ph"
              value={draft.email}
              onChange={(event) => update("email", event.target.value.trim().toLowerCase())}
              placeholder="name@ust.edu.ph"
              required
            />
          </div>
          <div className="field">
            {draft.role === "Requester" ? (
              <>
                <label htmlFor="new-user-office">Department</label>
                <input
                  id="new-user-office"
                  className="input"
                  value={draft.office}
                  onChange={(event) => update("office", event.target.value)}
                  placeholder="e.g. College of Science"
                  required
                />
              </>
            ) : (
              <>
                <label htmlFor="new-user-office">Office</label>
                <select id="new-user-office" className="select" value={fixedOffice || draft.office} onChange={(event) => update("office", event.target.value)} disabled={Boolean(fixedOffice)} required>
                  {officeOptions.map((office) => <option key={office} value={office}>{office}</option>)}
                </select>
              </>
            )}
          </div>
          <div className="field">
            <label htmlFor="new-user-role">Role</label>
            <select id="new-user-role" className="select" value={draft.role} onChange={(event) => update("role", event.target.value)} required>
              {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </div>
          {draft.role === "Requester" && (
            <div className="field">
              <label htmlFor="new-user-requester-type">Affiliation</label>
              <select id="new-user-requester-type" className="select" value={draft.requesterType} onChange={(event) => update("requesterType", event.target.value)} required>
                {REQUESTER_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="new-user-status">Account status</label>
            <select id="new-user-status" className="select" value={draft.status} onChange={(event) => update("status", event.target.value)} required>
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </div>
        </div>
        <div className="split-actions form-actions">
          <button className="primary-button" type="submit">Create Account</button>
        </div>
      </ManagedForm>
      </TabPanel>
      <TabPanel id="users" name="directory" value={activeTab}>
      <div className="wf-intro">
        <h2>Who can do what</h2>
        <p>Roles decide what each person can do in Reservata. Pick a role below to filter the list.</p>
      </div>
      <div className="ur-roles" role="group" aria-label="Filter by role">
        {[["", "All users", "Everyone with an account."], ...Object.keys(ROLE_DESCRIPTIONS).map((role) => [role, role, ROLE_DESCRIPTIONS[role]])].map(([role, label, description]) => (
          <button
            key={label}
            className={`ur-role-card${roleFilter === role ? " is-active" : ""}`}
            aria-pressed={roleFilter === role}
            onClick={() => setRoleFilter(role)}
            type="button"
          >
            <span className="ur-role-top">
              <strong>{label}</strong>
              <b>{role ? store.data.people.filter((person) => person.role === role).length : store.data.people.length}</b>
            </span>
            <small>{description}</small>
          </button>
        ))}
      </div>
      <section className="wf-card ur-directory">
        <div className="ur-toolbar">
          <label className="ur-search">
            <Search size={16} aria-hidden="true" />
            <input
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, email, office"
              aria-label="Search users"
            />
          </label>
          <select className="select" value={officeFilter} onChange={(event) => setOfficeFilter(event.target.value)} aria-label="Filter by office">
            <option value="">All offices</option>
            {directoryOffices.map((office) => <option key={office} value={office}>{office}</option>)}
          </select>
          <select className="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option>Active</option>
            <option>Inactive</option>
          </select>
          <select className="select" value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort users">
            <option value="name">Sort by name</option>
            <option value="office">Sort by office</option>
            <option value="role">Sort by role</option>
            <option value="status">Sort by status</option>
          </select>
          {["Office Admin", "Super Admin"].includes(store.currentUser.roleLabel) && (
            <button className="secondary-button icon-text-button" onClick={() => downloadCsv("reservata-users.csv", people.map((person) => ({
              name: person.name,
              email: person.email,
              office: person.office,
              role: person.role,
              status: person.status
            })))} disabled={!people.length} type="button"><Download size={16} aria-hidden="true" /> Export CSV</button>
          )}
        </div>
        <div className="table-wrap">
          <table className="ur-table">
            <thead><tr><th>User</th><th>Office</th><th>Role</th><th>Affiliation</th><th>Account status</th></tr></thead>
            <tbody>
              {people.map((person) => {
                // Your own account is locked so you cannot demote or deactivate yourself.
                const protectedAccount = person.email === store.currentUser.email;
                return (
                  <tr key={person.email}>
                    <td>
                      <div className="ur-user">
                        <span className={`ur-avatar${protectedAccount ? " is-self" : ""}`} aria-hidden="true">{initialsOf(person.name)}</span>
                        <div>
                          <span className="ur-name">
                            <strong>{person.name}</strong>
                            {protectedAccount && <span className="ur-protected"><Lock size={11} aria-hidden="true" /> Protected</span>}
                          </span>
                          <small>{person.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>{person.office}</td>
                    <td>
                      <select
                        aria-label={`Role for ${person.name}`}
                        className="select"
                        disabled={protectedAccount}
                        onChange={(event) => onAction(() => store.updateUserRole(person.email, event.target.value), "User role updated.")}
                        value={person.role}
                      >
                        {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
                      </select>
                    </td>
                    <td>
                      {person.role === "Requester" ? (
                        <select
                          aria-label={`Affiliation for ${person.name}`}
                          className="select"
                          disabled={protectedAccount}
                          onChange={(event) => onAction(() => store.updateUserRequesterType(person.email, event.target.value), "Affiliation updated.")}
                          value={REQUESTER_TYPES.includes(person.requesterType) ? person.requesterType : "Student"}
                        >
                          {REQUESTER_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                        </select>
                      ) : <span className="ur-muted">Not applicable</span>}
                    </td>
                    <td>
                      <select
                        aria-label={`Account status for ${person.name}`}
                        className={`select ur-status is-${String(person.status).toLowerCase()}`}
                        disabled={protectedAccount}
                        onChange={(event) => {
                          const nextStatus = event.target.value;
                          if (nextStatus === "Inactive" && !window.confirm(`Deactivate ${person.name}'s account?`)) return;
                          onAction(() => store.updateUserStatus(person.email, nextStatus), "User access updated.");
                        }}
                        value={person.status}
                      >
                        <option>Active</option>
                        <option>Inactive</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!people.length && <EmptyState>No matching users found.</EmptyState>}
        <div className="ur-foot">
          <span>Showing {people.length} of {store.data.people.length} user{store.data.people.length === 1 ? "" : "s"}</span>
          {roleFilter && (
            <span className="ur-active-filter">
              Role: <strong>{roleFilter}</strong>
              <button className="wf-link-button" onClick={() => setRoleFilter("")} type="button">Clear</button>
            </span>
          )}
        </div>
      </section>
      </TabPanel>
      {tempPasswordInfo && (
        <DetailModal
          title="Account created"
          subtitle={`${tempPasswordInfo.name} · ${tempPasswordInfo.email}`}
          onClose={() => setTempPasswordInfo(null)}
        >
          <p>Share this temporary password with the new user. They can change it anytime from their Profile page.</p>
          <p className="detail-box"><strong>{tempPasswordInfo.password}</strong></p>
        </DetailModal>
      )}
    </>
  );
}

export function ActivityView({ store }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("time");
  const normalized = query.trim().toLowerCase();
  const visibleActivity = sortBy(store.visibleActivity.filter((item) =>
    `${item.action} ${item.actor} ${item.target} ${item.time} ${item.details || ""}`.toLowerCase().includes(normalized)
  ), sort, sort === "time" ? "desc" : "asc");
  const scopedStore = {
    ...store,
    get visibleActivity() {
      return visibleActivity;
    }
  };
  return (
    <article className="card">
      <CardHeader
        title="Audit trail"
        subtitle="Reservation, payment, user, and visitor actions"
        action={["Office Admin", "Super Admin"].includes(store.currentUser.roleLabel) && <button className="secondary-button" onClick={() => downloadCsv("reservata-audit-trail.csv", visibleActivity.map((item) => ({
          action: item.action,
          actor: item.actor,
          target: item.target,
          details: item.details || "",
          time: item.time
        })))} disabled={!visibleActivity.length} type="button">Export CSV</button>}
      />
      <div className="toolbar list-toolbar">
        <input className="input resource-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search audit trail" aria-label="Search audit trail" />
        <select className="select status-filter" value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort audit trail">
          <option value="time">Sort by time</option>
          <option value="action">Sort by action</option>
          <option value="actor">Sort by actor</option>
          <option value="target">Sort by target</option>
        </select>
      </div>
      <ActivityRows store={scopedStore} />
    </article>
  );
}

export function ProfileView({ store }) {
  const user = store.currentUser;
  return (
    <>
      <article className="hero profile-hero">
        <span className="big-avatar">{user.initials}</span>
        <div><span className="eyebrow">{user.roleLabel}</span><h2>{user.name}</h2><p>{user.email}</p></div>
      </article>
      <article className="card profile-details">
        <div className="detail-grid">
          <div><label className="field-label">Full Name</label><div className="detail-box">{user.name}</div></div>
          <div><label className="field-label">Email</label><div className="detail-box">{user.email}</div></div>
          <div><label className="field-label">Role</label><div className="detail-box">{user.roleLabel}</div></div>
          <div><label className="field-label">Office / Scope</label><div className="detail-box">{user.office}</div></div>
        </div>
      </article>
    </>
  );
}
