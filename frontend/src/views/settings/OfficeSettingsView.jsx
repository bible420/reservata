import ManagedForm from "../../components/ManagedForm.jsx";
import { useEffect, useState } from "react";
import { Archive, ChevronLeft, ChevronRight, Edit3, Save, Upload } from "lucide-react";
import { Badge, CardHeader, EmptyState } from "../../components/Common.jsx";
import { PageTabs, TabPanel } from "../../components/PageTabs.jsx";
import ResourcePhoto from "../../components/ResourcePhoto.jsx";
import { prepareResourcePhoto } from "../../services/resourcePhotos.js";
import { MONTH_LABELS, monthCells, shiftMonth, WEEKDAY_LABELS } from "../../domain/reservations/requesterCalendar.js";
import { formatDate, todayIso, tomorrowIso } from "../../shared/utils.js";
import {
  allowedResourceTypes,
  effectivePaymentDeadlineHours,
  generateAssetTag,
  MAX_PAYMENT_DEADLINE_HOURS,
  officeTagKey,
  MIN_PAYMENT_DEADLINE_HOURS,
  normalizeBlockedDates
} from "../../store/shared.js";

const RESOURCE_TYPES = ["Equipment", "Vehicle", "Visitor Service"];
const RESOURCE_STATUSES = [
  "Available",
  "Reserved",
  "In Use",
  "Under Maintenance",
  "Unavailable",
  "Archived",
];

// New resources start from their owning office's defaults (hours, workflow, payments).
function officeDefaults(store, officeName) {
  const office = store?.data.offices.find((item) => item.name === officeName);
  if (!office) return {};
  const defaults = {};
  if (office.openTime && office.closeTime) Object.assign(defaults, { openTime: office.openTime, closeTime: office.closeTime });
  if (office.defaultWorkflowId && store.data.approvalTemplates.some((item) => item.id === office.defaultWorkflowId && item.status === "Active")) {
    defaults.workflowTemplateId = office.defaultWorkflowId;
  }
  if (office.collectsPayments !== undefined) defaults.requiresPayment = Boolean(office.collectsPayments);
  return defaults;
}

function resourceDraft(resource, store) {
  const office = store?.officeScope || "";
  const defaultType = (store && allowedResourceTypes(office)?.[0]) || "Equipment";
  return resource ? structuredClone(resource) : {
    name: "",
    office,
    assetTag: store && office ? generateAssetTag(store.data.resources, officeTagKey(store.data.offices, office), defaultType) : "",
    type: defaultType,
    location: "",
    serialNumber: "",
    tags: [],
    capacity: 1,
    status: "Available",
    requiresPayment: false,
    fee: 0,
    paymentDeadlineHours: "",
    driver: "Not applicable",
    openTime: "",
    closeTime: "",
    blockedDates: [],
    workflowTemplateId: "WF-BASIC",
    slotDuration: 60,
    minBookingHours: 1,
    maxBookingHours: 4,
    bufferMinutes: 0,
    maxAdvanceDays: 30,
    ...officeDefaults(store, office),
  };
}

function isMaintenanceBlock(block) {
  return Boolean(block) && block.reason.trim().toLowerCase() === "maintenance";
}

// Choice keys match the legend keys so each button picks up its legend colour.
const DAY_CHOICES = [
  ["available", "Available"],
  ["blocked", "Block"],
  ["maintenance", "Maintenance"],
];

const DAY_STATUS_LEGEND = [
  { key: "today", label: "Today" },
  { key: "available", label: "Available" },
  { key: "blocked", label: "Blocked" },
  { key: "maintenance", label: "Maintenance" },
];

function AvailabilityCalendarCard({ store, resource, resourceId, onAction, onDraftBlockedDatesChange }) {
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState("");
  const cells = monthCells(month);
  const blockedByDate = new Map((resource.blockedDates || []).map((item) => [item.date, item]));
  const minDate = tomorrowIso();
  const selectedBlock = selectedDate ? blockedByDate.get(selectedDate) : null;
  const reservationsOn = (date) => (resourceId ? store.resourceReservationsOnDate(resourceId, date) : []);
  const selectedReservations = selectedDate ? reservationsOn(selectedDate) : [];
  const [monthYear, monthNumber] = month.split("-").map(Number);
  const activeChoice = selectedBlock ? (isMaintenanceBlock(selectedBlock) ? "maintenance" : "blocked") : "available";

  function selectDate(date) {
    if (date < minDate) return;
    setSelectedDate(date);
  }

  async function applyStatus(choice) {
    if (choice === activeChoice) return;
    if (!resourceId) {
      const current = resource.blockedDates || [];
      const withoutDate = current.filter((item) => item.date !== selectedDate);
      const next = choice === "available"
        ? withoutDate
        : normalizeBlockedDates([...withoutDate, { date: selectedDate, reason: choice === "maintenance" ? "Maintenance" : "" }]);
      onDraftBlockedDatesChange(next);
      return;
    }
    if (choice === "available") {
      await onAction(() => store.unblockResourceDate(resourceId, selectedDate), "Date unblocked.");
      return;
    }
    const conflicts = reservationsOn(selectedDate);
    await onAction(
      () => store.blockResourceDate(resourceId, selectedDate, choice === "maintenance" ? "Maintenance" : ""),
      conflicts.length
        ? `Date blocked. ${conflicts.length} existing reservation${conflicts.length === 1 ? "" : "s"} on this date may need follow-up.`
        : "Date blocked."
    );
  }

  return (
    <section className="card resource-editor-card availability-calendar">
      <CardHeader title="Availability calendar" subtitle="Select an upcoming date to set its availability." />
      <div className="availability-calendar-surface">
        <div className="availability-calendar-nav">
          <button className="icon-button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" type="button"><ChevronLeft aria-hidden="true" size={18} /></button>
          <strong>{MONTH_LABELS[monthNumber - 1]} {monthYear}</strong>
          <button className="icon-button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month" type="button"><ChevronRight aria-hidden="true" size={18} /></button>
        </div>
        <div className="mini-calendar">
          {WEEKDAY_LABELS.map((day) => <div className="mini-calendar-head" key={day}>{day}</div>)}
          {cells.map((cell) => {
            if (!cell.inMonth) return <div className="mini-calendar-day muted" key={cell.key}>{cell.day}</div>;
            const block = blockedByDate.get(cell.date);
            const past = cell.date < minDate;
            const isToday = cell.date === todayIso();
            const stateClass = isToday ? "today" : isMaintenanceBlock(block) ? "maintenance" : block ? "blocked" : "available";
            return (
              <button
                className={`mini-calendar-day ${stateClass} ${cell.date === selectedDate ? "selected" : ""}`}
                onClick={() => selectDate(cell.date)}
                disabled={past}
                aria-label={`${formatDate(cell.date)}, ${stateClass}`}
                type="button"
                key={cell.key}
              >
                {cell.day}
              </button>
            );
          })}
        </div>
        <ul className="mini-calendar-legend">
          {DAY_STATUS_LEGEND.map((item) => (
            <li key={item.key}>
              <span className={`mini-calendar-legend-swatch ${item.key}`} aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
      </div>
      {selectedDate && (
        <div className="availability-calendar-selection">
          <div className="availability-selection-head">
            <p className="calendar-side-summary">{formatDate(selectedDate)}</p>
            <button className="wf-link-button" onClick={() => setSelectedDate("")} aria-label={`Hide options for ${formatDate(selectedDate)}`} type="button">Hide</button>
          </div>
          <p className="calendar-side-hint">
            {selectedBlock ? (isMaintenanceBlock(selectedBlock) ? "Maintenance" : "Blocked") : "Available"}
          </p>
          {!!selectedReservations.length && (
            <p className="calendar-side-hint">{selectedReservations.length} existing reservation{selectedReservations.length === 1 ? "" : "s"} on this date.</p>
          )}
          <div className="day-status-toggle">
            {DAY_CHOICES.map(([choice, label]) => (
              <button
                key={choice}
                className={`day-choice ${choice}${activeChoice === choice ? " is-active" : ""}`}
                aria-pressed={activeChoice === choice}
                onClick={() => applyStatus(choice)}
                type="button"
              >
                <span className="day-choice-dot" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function OfficeSettingsView({ store, onAction }) {
  const [activeTab, setActiveTab] = useState("inventory");
  const [photoError, setPhotoError] = useState("");
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const selected = store.officeResources.find((item) => item.id === selectedId);
  const [draft, setDraft] = useState(resourceDraft(null, store));
  const workflows = store.data.approvalTemplates.filter(
    (item) => item.status === "Active",
  );
  const allOffices = !store.officeScope;
  const ownerOffice = store.officeScope || draft.office || "";
  const activeOffices = store.data.offices.filter((item) => item.status === "Active");
  const officeTypes = allowedResourceTypes(ownerOffice) || RESOURCE_TYPES;

  useEffect(() => {
    setDraft(resourceDraft(selected, store));
  }, [selectedId, store.officeScope, store.data.resources.length]);

  function update(field, value) {
    if (field === "office" && !selectedId) {
      // Changing the owning office can change the allowed types and the asset tag prefix.
      const type = (allowedResourceTypes(value) || RESOURCE_TYPES).includes(draft.type)
        ? draft.type
        : (allowedResourceTypes(value) || RESOURCE_TYPES)[0];
      const currentGeneratedTag = ownerOffice ? generateAssetTag(store.data.resources, officeTagKey(store.data.offices, ownerOffice), draft.type, selectedId) : "";
      setDraft((current) => ({
        ...current,
        ...officeDefaults(store, value),
        office: value,
        type,
        assetTag: !current.assetTag || current.assetTag === currentGeneratedTag
          ? (value ? generateAssetTag(store.data.resources, officeTagKey(store.data.offices, value), type, selectedId) : "")
          : current.assetTag,
      }));
      return;
    }
    if (field === "type" && !selectedId) {
      const tagKey = officeTagKey(store.data.offices, ownerOffice);
      const currentGeneratedTag = generateAssetTag(store.data.resources, tagKey, draft.type, selectedId);
      const nextGeneratedTag = generateAssetTag(store.data.resources, tagKey, value, selectedId);
      setDraft((current) => ({
        ...current,
        type: value,
        assetTag: !current.assetTag || current.assetTag === currentGeneratedTag ? nextGeneratedTag : current.assetTag,
      }));
      return;
    }
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    const previousIds = selectedId ? null : new Set(store.officeResources.map((item) => item.id));
    const saved = await onAction(
      () => store.saveResource(draft, selectedId),
      selectedId ? "Resource updated." : "Resource created.",
    );
    if (!saved) return;
    const created = previousIds && store.officeResources.find((item) => !previousIds.has(item.id));
    if (created) {
      setSelectedId(created.id);
      setDraft(resourceDraft(created, store));
      return;
    }
    setActiveTab("inventory");
    setSelectedId("");
    setDraft(resourceDraft(null, store));
  }

  async function archive() {
    if (
      !window.confirm(
        "Archive this resource? Requesters will no longer be able to reserve it.",
      )
    )
      return;
    const saved = await onAction(
      () => store.archiveResource(selectedId),
      "Resource archived.",
    );
    if (saved) setSelectedId("");
  }

  return (
    <div className="resource-settings">
      <PageTabs id="inventory" label="Resource management" tabs={[["inventory", allOffices ? "All resources" : "Office resources"], ["editor", selectedId ? "Edit resource" : "Add resource"]]} value={activeTab} onChange={setActiveTab} />
      <TabPanel id="inventory" name="editor" value={activeTab}>
      <ManagedForm onSubmit={submit} resetKey={selectedId} changed={Boolean(draft.photoData) || Boolean(selected && (draft.photoKey || "") !== (selected.photoKey || ""))}>
        <div className="resource-editor-heading">
          <h2>{selectedId ? (draft.name || "Edit resource") : "Add resource"}</h2>
          <p>{ownerOffice ? `${ownerOffice} inventory and booking configuration` : "Choose the owning office, then configure the resource"}</p>
        </div>
        <div className="grid two-col wide-left">
          <div className="stack">
            <article className="card resource-editor-card">
              <CardHeader title="Basic information" subtitle="Identity, location and capacity of the resource." />
              <div className="form-grid">
                <div className="field span-2 resource-photo-editor">
                  <ResourcePhoto resource={draft} preview={draft.photoData} />
                  <div>
                    <label htmlFor="resource-photo">Resource photo</label>
                    <label className="secondary-button file-button icon-text-button">
                      <Upload size={16} /> Upload photo
                      <input id="resource-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={readingPhoto} aria-describedby="resource-photo-help" onChange={async (event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file) return;
                        setReadingPhoto(true); setPhotoError("");
                        try { update("photoData", await prepareResourcePhoto(file)); }
                        catch (error) { setPhotoError(error.message); }
                        finally { setReadingPhoto(false); }
                      }} />
                    </label>
                    <p id="resource-photo-help" className="field-help">JPG, PNG, or WebP. Maximum 5 MB.</p>
                    {readingPhoto && <p role="status">Preparing photo...</p>}
                    {photoError && <p className="field-error" role="alert">{photoError}</p>}
                    {(draft.photoData || draft.photoKey) && <button className="secondary-button" type="button" onClick={() => { update("photoData", ""); update("photoKey", ""); }}>Remove photo</button>}
                  </div>
                </div>
                {allOffices && (
                  <div className="field span-2">
                    <label htmlFor="resource-office">Owning office</label>
                    <select
                      id="resource-office"
                      className="select"
                      value={draft.office || ""}
                      onChange={(event) => update("office", event.target.value)}
                      disabled={Boolean(selectedId)}
                      required
                    >
                      <option value="" disabled>Select an office</option>
                      {activeOffices.map((office) => (
                        <option key={office.id} value={office.name}>{office.name}</option>
                      ))}
                    </select>
                    <small className="field-help">
                      {selectedId
                        ? "The owning office cannot be changed after a resource is created."
                        : "This office reviews requests first and verifies payments for the resource."}
                    </small>
                  </div>
                )}
                <div className="field span-2">
                  <label htmlFor="resource-name">Name</label>
                  <input
                    id="resource-name"
                    className="input"
                    value={draft.name}
                    onChange={(event) => update("name", event.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="resource-asset-tag">Asset tag</label>
                  <input
                    id="resource-asset-tag"
                    className="input"
                    value={draft.assetTag || ""}
                    onChange={(event) => update("assetTag", event.target.value)}
                    placeholder="EDTECH-PROJ-001"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="resource-serial-number">Serial number</label>
                  <input
                    id="resource-serial-number"
                    className="input"
                    value={draft.serialNumber || ""}
                    onChange={(event) => update("serialNumber", event.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div className="field">
                  <label htmlFor="resource-type">Type</label>
                  <select
                    id="resource-type"
                    className="select"
                    value={draft.type}
                    onChange={(event) => update("type", event.target.value)}
                  >
                    {officeTypes.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="resource-status">Status</label>
                  <select
                    id="resource-status"
                    className="select"
                    value={draft.status}
                    onChange={(event) => update("status", event.target.value)}
                  >
                    {RESOURCE_STATUSES.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="resource-location">Location</label>
                  <input
                    id="resource-location"
                    className="input"
                    value={draft.location}
                    onChange={(event) => update("location", event.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="resource-capacity">Capacity</label>
                  <input
                    id="resource-capacity"
                    className="input"
                    min="1"
                    type="number"
                    value={draft.capacity}
                    onChange={(event) => update("capacity", event.target.value)}
                    required
                  />
                </div>
                <div className="field span-2">
                  <label htmlFor="resource-tags">Tags</label>
                  <input
                    id="resource-tags"
                    className="input"
                    value={Array.isArray(draft.tags) ? draft.tags.join(", ") : draft.tags || ""}
                    onChange={(event) => update("tags", event.target.value)}
                    placeholder="AV, Portable, High demand"
                  />
                  <small className="field-help">Use commas to separate searchable labels.</small>
                </div>
              </div>
            </article>
            <article className="card resource-editor-card">
              <CardHeader title="Booking rules and payment" subtitle="Approval steps, fees and driver requirements." />
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="resource-slot-duration">Slot duration (minutes)</label>
                  <select
                    id="resource-slot-duration"
                    className="select"
                    value={draft.slotDuration}
                    onChange={(event) => update("slotDuration", Number(event.target.value))}
                  >
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={60}>60 minutes</option>
                    <option value={90}>90 minutes</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="resource-buffer">Buffer time (minutes)</label>
                  <input
                    id="resource-buffer"
                    className="input"
                    type="number"
                    min="0"
                    max="120"
                    value={draft.bufferMinutes}
                    onChange={(event) => update("bufferMinutes", Number(event.target.value))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="resource-min-hours">Min booking (hours)</label>
                  <input
                    id="resource-min-hours"
                    className="input"
                    type="number"
                    min="0.5"
                    max="24"
                    step="0.5"
                    value={draft.minBookingHours}
                    onChange={(event) => update("minBookingHours", Number(event.target.value))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="resource-max-hours">Max booking (hours)</label>
                  <input
                    id="resource-max-hours"
                    className="input"
                    type="number"
                    min="0.5"
                    max="72"
                    step="0.5"
                    value={draft.maxBookingHours}
                    onChange={(event) => update("maxBookingHours", Number(event.target.value))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="resource-max-advance">Max advance booking (days)</label>
                  <input
                    id="resource-max-advance"
                    className="input"
                    type="number"
                    min="1"
                    max="365"
                    value={draft.maxAdvanceDays}
                    onChange={(event) => update("maxAdvanceDays", Number(event.target.value))}
                  />
                </div>
                <div className="field span-2">
                  <label htmlFor="resource-workflow">Approval workflow</label>
                  <select
                    id="resource-workflow"
                    className="select"
                    value={draft.workflowTemplateId}
                    onChange={(event) =>
                      update("workflowTemplateId", event.target.value)
                    }
                    required
                  >
                    {workflows.map((workflow) => (
                      <option key={workflow.id} value={workflow.id}>
                        {workflow.name}
                      </option>
                    ))}
                  </select>
                  <small className="field-help">
                    Workflows are set up by the Super Admin under Approval Workflows.
                  </small>
                </div>
                {draft.type === "Vehicle" && (
                  <div className="field span-2">
                    <label htmlFor="resource-driver">Driver requirement</label>
                    <select
                      id="resource-driver"
                      className="select"
                      value={draft.driver}
                      onChange={(event) => update("driver", event.target.value)}
                    >
                      <option>With Driver</option>
                      <option>Without Driver</option>
                    </select>
                  </div>
                )}
                <label className="check-field span-2">
                  <input
                    checked={Boolean(draft.requiresPayment)}
                    onChange={(event) =>
                      update("requiresPayment", event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>Requires payment before confirmation</span>
                </label>
                {draft.requiresPayment && (
                  <div className="field">
                    <label htmlFor="resource-fee">Fee (PHP)</label>
                    <input
                      id="resource-fee"
                      className="input"
                      min="0"
                      type="number"
                      value={draft.fee}
                      onChange={(event) => update("fee", event.target.value)}
                    />
                  </div>
                )}
                {draft.requiresPayment && (
                  <div className="field">
                    <label htmlFor="resource-payment-window">Payment window (hours)</label>
                    <input
                      id="resource-payment-window"
                      className="input"
                      max={MAX_PAYMENT_DEADLINE_HOURS}
                      min={MIN_PAYMENT_DEADLINE_HOURS}
                      placeholder={`${store.settings.paymentDeadlineHours} hours`}
                      type="number"
                      value={draft.paymentDeadlineHours ?? ""}
                      onChange={(event) =>
                        update("paymentDeadlineHours", event.target.value)
                      }
                    />
                    <small className="field-help">Blank uses the Super Admin default.</small>
                  </div>
                )}
              </div>
            </article>
            <article className="card resource-editor-card form-actions-card">
              <div className="resource-editor-actions">
                {selectedId && (
                  <button className="danger-button icon-text-button" onClick={archive} type="button">
                    <Archive size={16} /> Archive resource
                  </button>
                )}
                <div className="resource-editor-actions-right">
                  {selectedId && (
                    <button className="secondary-button" onClick={() => setSelectedId("")} type="button">
                      Cancel
                    </button>
                  )}
                  <button className="primary-button icon-text-button" type="submit" disabled={readingPhoto}>
                    <Save size={16} /> {selectedId ? "Save changes" : "Add Resource"}
                  </button>
                </div>
              </div>
            </article>
          </div>
          <div className="stack">
            <AvailabilityCalendarCard
              store={store}
              resource={selectedId && selected ? selected : draft}
              resourceId={selectedId && selected ? selectedId : ""}
              onAction={onAction}
              onDraftBlockedDatesChange={(blockedDates) => update("blockedDates", blockedDates)}
            />
            <article className="card resource-editor-card">
              <CardHeader title="Daily availability" subtitle="Hours when this resource can be booked." />
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="resource-open-time">Available from</label>
                  <input
                    id="resource-open-time"
                    className="input"
                    type="time"
                    value={draft.openTime || ""}
                    onChange={(event) => update("openTime", event.target.value)}
                  />
                  <small className="field-help">Blank uses the default 08:00.</small>
                </div>
                <div className="field">
                  <label htmlFor="resource-close-time">Available until</label>
                  <input
                    id="resource-close-time"
                    className="input"
                    type="time"
                    value={draft.closeTime || ""}
                    onChange={(event) => update("closeTime", event.target.value)}
                  />
                  <small className="field-help">Blank uses the default 17:00.</small>
                </div>
              </div>
            </article>
          </div>
        </div>
      </ManagedForm>
      </TabPanel>
      <TabPanel id="inventory" name="inventory" value={activeTab}>
      <section className="card table-wrap">
        <CardHeader
          title={allOffices ? "All resources" : "Office resources"}
          subtitle={allOffices
            ? "Every office's inventory. Select a record to maintain its details, status, fee, and workflow."
            : "Select a record to maintain its details, status, fee, and workflow."}
        />
        <table>
          <thead>
            <tr>
              <th>Resource</th>
              {allOffices && <th>Office</th>}
              <th>Asset Tag</th>
              <th>Type</th>
              <th>Status</th>
              <th>Workflow</th>
              <th>Payment</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {store.officeResources.map((resource) => (
              <tr key={resource.id}>
                <td>
                  <strong>{resource.name}</strong>
                  <br />
                  <small>
                    {resource.location}
                    {resource.serialNumber && ` · SN: ${resource.serialNumber}`}
                    {resource.tags?.length ? ` · ${resource.tags.join(", ")}` : ""}
                  </small>
                </td>
                {allOffices && <td>{resource.office}</td>}
                <td>{resource.assetTag}</td>
                <td>{resource.type}</td>
                <td>
                  <Badge status={resource.status} />
                </td>
                <td>
                  {workflows.find(
                    (item) => item.id === resource.workflowTemplateId,
                  )?.name || "Basic Resource Approval"}
                </td>
                <td>
                  {resource.requiresPayment
                    ? `PHP ${Number(resource.fee || 0).toLocaleString()} / ${effectivePaymentDeadlineHours(resource, store.settings)}h`
                    : "None"}
                </td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={`Edit ${resource.name}`}
                    title="Edit resource"
                    onClick={() => { setSelectedId(resource.id); setActiveTab("editor"); }}
                    type="button"
                  >
                    <Edit3 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!store.officeResources.length && (
          <EmptyState>{allOffices ? "No resources have been added yet." : "No resources belong to this office yet."}</EmptyState>
        )}
      </section>
      </TabPanel>
    </div>
  );
}
