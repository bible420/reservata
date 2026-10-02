import { ActivityRows, Badge, CardHeader, ChartSummary, EmptyState, Metrics, ReservationRows, ResourceMiniRows, StatusBreakdown, StatusTileGrid, StatusTiles } from "../../components/Common.jsx";
import { ApprovalRows } from "../reservations/ReservationViews.jsx";
import { ArrivalRows, VisitorRows } from "../visitors/VisitorViews.jsx";
import { formatDate, todayIso } from "../../shared/utils.js";
import { CheckCircle2, Clock3 } from "lucide-react";

const COLORS = {
  blue: { accent: "#1a7d9d", color: "#1a7d9d" },
  yellow: { accent: "#ffbd19", color: "#8b5b00" },
  green: { accent: "#167852", color: "#167852" },
  purple: { accent: "#6652b6", color: "#6652b6" },
  red: { accent: "#b94444", color: "#b94444" }
};

function metric(label, value, caption, palette) {
  return { label, value, caption, ...COLORS[palette] };
}

function openParking(store) {
  const used = store.data.visitors
    .filter((item) => item.parking)
    .reduce((total, item) => total + Math.max(1, Number(item.cars || 1)), 0);
  return Math.max(0, 20 - used);
}

function approvalSuccessMessage(reservation, stepId) {
  const routeCompleted = reservation.requiresPayment && (reservation.approvalSteps || [])
    .every((step) => step.id === stepId || ["Approved", "Skipped"].includes(step.status));
  if (routeCompleted) return `Approval recorded. Payment verification is now routed to ${reservation.office}, the resource-owning office.`;
  return "Approval recorded and route advanced.";
}

function reservationTime(reservation) {
  return new Date(`${reservation.date}T${reservation.start || "00:00"}`).getTime();
}

function reservationEndTime(reservation) {
  return new Date(`${reservation.date}T${reservation.end || reservation.start || "00:00"}`).getTime();
}

function RequesterDashboard({ store, onNavigate, onAction, onReserve }) {
  const mine = store.myReservations();
  const active = mine.filter((item) => !["Rejected", "Cancelled", "Confirmed", "Completed", "Expired", "No Show"].includes(item.status));
  const overdue = active.filter((item) => store.isReservationOverdue(item));
  const outgoing = mine
    .filter((item) => !["Rejected", "Cancelled", "Completed", "Expired", "No Show"].includes(item.status))
    .filter((item) => reservationEndTime(item) >= Date.now())
    .sort((left, right) => reservationTime(left) - reservationTime(right));
  const requesterStatus = [
    { label: "Pending", value: active.length, color: COLORS.blue.color },
    { label: "Payment Required", value: mine.filter((item) => item.status === "For Payment").length, color: COLORS.yellow.color },
    { label: "Approved", value: mine.filter((item) => item.status === "Confirmed").length, color: COLORS.green.color },
    { label: "Completed", value: mine.filter((item) => item.status === "Completed").length, color: COLORS.yellow.color },
    { label: "Rejected", value: mine.filter((item) => item.status === "Rejected").length, color: "#b94444" },
    { label: "Cancelled", value: mine.filter((item) => item.status === "Cancelled").length, color: "#6f7481" }
  ];
  return (
    <>
      <div className="hero requester-hero">
        <span className="eyebrow">Requester Workspace</span>
        <h2>Request a room, vehicle, or equipment without guessing the process.</h2>
        <p>Start with available resources, submit the purpose and schedule, then follow the approval route until confirmation.</p>
        <div className="split-actions hero-action">
          <button className="primary-button" onClick={() => onNavigate("resources")} type="button">Browse Resources</button>
          <button className="secondary-button" onClick={() => onNavigate("myRequests")} type="button">Track My Requests</button>
        </div>
      </div>
      <div className="requester-steps section-gap">
        <article className="card"><strong>1</strong><span>Choose an available resource</span></article>
        <article className="card"><strong>2</strong><span>Submit schedule and purpose</span></article>
        <article className="card"><strong>3</strong><span>Track approvals and payment</span></article>
      </div>
      <article className="card section-gap">
        <CardHeader
          title="Outgoing reservations"
          subtitle="Upcoming submitted schedules that have not passed yet"
          action={<button className="secondary-button" onClick={() => onNavigate("myRequests")} type="button">View All</button>}
        />
        <ReservationRows
          store={store}
          items={outgoing.slice(0, 3)}
          onUpload={(id, file) => onAction(() => store.uploadReceipt(id, file), "Receipt uploaded for verification.")}
          onDocumentUpload={(id, file) => onAction(() => store.uploadSupportingDocument(id, file), "Supporting document uploaded.")}
        />
      </article>
      <div className="grid two-col section-gap">
        <article className="card">
          <CardHeader
            title="Requests needing attention"
            subtitle={overdue.length ? `${overdue.length} passed schedule needs office follow-up` : "Active requests, payments, and reviews"}
            action={<button className="secondary-button" onClick={() => onNavigate("myRequests")} type="button">View All</button>}
          />
          <ReservationRows
            store={store}
            items={active.slice(0, 4)}
            onUpload={(id, file) => onAction(() => store.uploadReceipt(id, file), "Receipt uploaded for verification.")}
            onDocumentUpload={(id, file) => onAction(() => store.uploadSupportingDocument(id, file), "Supporting document uploaded.")}
          />
        </article>
        <article className="card"><CardHeader title="Quick availability" subtitle="Available right now — tap to request" /><ResourceMiniRows items={store.data.resources.filter((item) => item.status === "Available").slice(0, 5)} onSelect={(item) => onReserve(item.id)} /></article>
      </div>
      <div className="section-gap">
        <StatusTiles
          title="Request Summary"
          subtitle="Lifetime totals across every reservation you have submitted"
          items={requesterStatus}
        />
      </div>
    </>
  );
}

function approvalWaitLabel(status) {
  if (status === "For Payment") return "payment verification";
  return status.replace(/^Under /, "").toLowerCase();
}

function DecisionBanner({ pendingCount, nextItem, onOpen }) {
  if (!pendingCount) {
    return (
      <div className="alert-strip clear">
        <CheckCircle2 aria-hidden="true" size={18} />
        <span>Nothing is waiting on your office right now. No overdue reviews, stale requests, or receipts to verify.</span>
      </div>
    );
  }
  return (
    <div className="decision-banner">
      <Clock3 aria-hidden="true" size={18} />
      <span>
        <strong>{pendingCount} request{pendingCount === 1 ? "" : "s"} need{pendingCount === 1 ? "s" : ""} your decision.</strong>
        {" "}{nextItem.resourceName} is waiting on {approvalWaitLabel(nextItem.status)}.
      </span>
      <button className="link-button" onClick={onOpen} type="button">Go to approval queue</button>
    </div>
  );
}

const PENDING_STATUSES = ["Under Owner Review", "Under Additional Review", "For Payment"];
const APPROVED_STATUSES = ["Approved", "Confirmed", "In Use"];
const RESOURCE_AVAILABILITY_STATUSES = [
  { status: "Available", label: "Available", color: COLORS.green.color },
  { status: "Reserved", label: "Reserved", color: "#6f7481" },
  { status: "In Use", label: "In use", color: COLORS.blue.color },
  { status: "Under Maintenance", label: "Under maintenance", color: "#c2691d" }
];

function OfficeAdminDashboard({ store, onAction, onNavigate }) {
  const reservations = store.officeReservations;
  const countBy = (statuses) => reservations.filter((item) => statuses.includes(item.status)).length;
  const today = todayIso();
  const actionable = [...store.actionableReservations].sort((left, right) => reservationTime(left) - reservationTime(right));
  const pendingCount = store.actionableApprovalCount;
  const statusGroups = [
    { label: "In review", value: countBy(PENDING_STATUSES), color: COLORS.yellow.color },
    { label: "Active", value: countBy(APPROVED_STATUSES), color: COLORS.green.color },
    { label: "Completed", value: countBy(["Completed"]), color: COLORS.blue.color },
    { label: "Expired", value: countBy(["Expired"]), color: COLORS.red.color },
    { label: "Rejected, cancelled, no show", value: countBy(["Rejected", "Cancelled", "No Show"]), color: "#9aa0ab" }
  ];
  const availabilityItems = RESOURCE_AVAILABILITY_STATUSES.map(({ status, label, color }) => ({
    label,
    color,
    value: store.officeResources.filter((item) => item.status === status).length
  }));
  const mostRequested = store.officeResources
    .map((resource) => ({
      label: resource.name,
      value: reservations.filter((item) => item.resourceId === resource.id).length
    }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 6);
  const recentRequests = [...reservations]
    .sort((left, right) => reservationTime(right) - reservationTime(left))
    .slice(0, 8);
  return (
    <>
      <DecisionBanner pendingCount={pendingCount} nextItem={actionable[0]} onOpen={() => onNavigate("approvalQueue")} />
      <Metrics items={[
        metric("Needs Your Action", pendingCount, "Awaiting an office decision", "yellow"),
        metric("Starting Today", reservations.filter((item) => item.date === today && !["Rejected", "Cancelled", "Expired", "No Show"].includes(item.status)).length, "Confirmed for today", "green"),
        metric("In Use Now", countBy(["In Use"]), "Resources out right now", "blue"),
        metric("Expired", countBy(["Expired"]), "Lapsed without a decision", "red")
      ]} />
      <div className="grid two-col wide-left section-gap">
        <div className="stack">
          <article className="card">
            <CardHeader title="Approval queue" subtitle={`${store.officeScope} requests assigned to your office`} action={<Badge status="Pending">{pendingCount} pending</Badge>} />
            <ApprovalRows store={store}
              items={store.actionableReservations}
              office={store.officeScope}
              onApprove={(id, stepId, reservation) => onAction(() => store.approveReservation(id, stepId), approvalSuccessMessage(reservation, stepId))}
              onReject={(id, stepId, reason) => onAction(() => store.rejectReservation(id, stepId, reason), "Reservation rejected.")}
              onAction={onAction}
            />
          </article>
          <article className="card table-wrap">
            <CardHeader title="Recent requests" subtitle="Latest reservations for your office" />
            {recentRequests.length ? (
              <table>
                <thead><tr><th>Resource</th><th>Requester</th><th>Date</th><th>Time</th><th>Status</th></tr></thead>
                <tbody>
                  {recentRequests.map((item) => (
                    <tr key={item.id}>
                      <td>{item.resourceName}</td>
                      <td>{item.requester}</td>
                      <td>{formatDate(item.date)}</td>
                      <td>{item.start}-{item.end}</td>
                      <td><Badge status={item.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyState>No requests have been submitted for this office yet.</EmptyState>}
          </article>
        </div>
        <div className="stack">
          <StatusBreakdown title="Request status" subtitle={`${reservations.length} requests, grouped by stage`} items={statusGroups} />
          <StatusTileGrid title="Resource availability" subtitle="Resources by current status" items={availabilityItems} />
          <ChartSummary title="Most requested" subtitle="Top resources by request volume" items={mostRequested} />
        </div>
      </div>
    </>
  );
}

// System-wide counterpart to DecisionBanner: the Super Admin does not approve requests,
// so it flags where approvals are piling up and which offices have nobody to clear them.
function SystemBanner({ pendingCount, nextItem, nextOffice, unstaffed, onOpen }) {
  if (!pendingCount && !unstaffed.length) {
    return (
      <div className="alert-strip clear">
        <CheckCircle2 aria-hidden="true" size={18} />
        <span>All offices are clear. No requests are waiting in any approval queue.</span>
      </div>
    );
  }
  return (
    <div className="decision-banner">
      <Clock3 aria-hidden="true" size={18} />
      <span>
        {pendingCount > 0 && (
          <>
            <strong>{pendingCount} request{pendingCount === 1 ? " is" : "s are"} waiting across offices.</strong>
            {" "}{nextItem.resourceName} is next, waiting on {nextOffice}.
          </>
        )}
        {unstaffed.length > 0 && (
          <>
            {pendingCount > 0 && " "}
            <strong>{unstaffed.join(", ")}</strong> {unstaffed.length === 1 ? "has" : "have"} pending approvals but no active office admin.
          </>
        )}
      </span>
      <button className="link-button" onClick={onOpen} type="button">{unstaffed.length ? "Assign an admin" : "View offices"}</button>
    </div>
  );
}

function SuperAdminDashboard({ store, onNavigate }) {
  const reservations = store.data.reservations;
  const countBy = (statuses) => reservations.filter((item) => statuses.includes(item.status)).length;
  const today = todayIso();
  const activeResources = store.data.resources.filter((item) => item.status !== "Archived");
  const activeOffices = store.data.offices.filter((item) => item.status === "Active");
  const pendingStep = (item) => item.approvalSteps?.find((step) => step.status === "Pending");
  const waiting = reservations
    .filter((item) => PENDING_STATUSES.includes(item.status) && pendingStep(item))
    .sort((left, right) => reservationTime(left) - reservationTime(right));
  const officeRows = activeOffices.map((office) => ({
    name: office.name,
    resources: activeResources.filter((item) => item.office === office.name).length,
    admins: store.data.people.filter((person) => person.office === office.name && person.role === "Office Admin" && person.status === "Active").length,
    pending: reservations.filter((item) => item.approvalSteps?.some((step) => step.office === office.name && step.status === "Pending")).length
  }));
  const unstaffed = officeRows.filter((row) => row.pending && !row.admins).map((row) => row.name);
  const statusGroups = [
    { label: "In review", value: countBy(PENDING_STATUSES), color: COLORS.yellow.color },
    { label: "Active", value: countBy(APPROVED_STATUSES), color: COLORS.green.color },
    { label: "Completed", value: countBy(["Completed"]), color: COLORS.blue.color },
    { label: "Expired", value: countBy(["Expired"]), color: COLORS.red.color },
    { label: "Rejected, cancelled, no show", value: countBy(["Rejected", "Cancelled", "No Show"]), color: "#9aa0ab" }
  ];
  const availabilityItems = RESOURCE_AVAILABILITY_STATUSES.map(({ status, label, color }) => ({
    label,
    color,
    value: activeResources.filter((item) => item.status === status).length
  }));
  const recentRequests = [...reservations]
    .sort((left, right) => reservationTime(right) - reservationTime(left))
    .slice(0, 8);
  return (
    <>
      <SystemBanner
        pendingCount={waiting.length}
        nextItem={waiting[0]}
        nextOffice={waiting[0] ? pendingStep(waiting[0]).office : ""}
        unstaffed={unstaffed}
        onOpen={() => onNavigate(unstaffed.length ? "users" : "offices")}
      />
      <Metrics items={[
        metric("In Review", waiting.length, "Waiting on an office, system-wide", "yellow"),
        metric("Starting Today", reservations.filter((item) => item.date === today && !["Rejected", "Cancelled", "Expired", "No Show"].includes(item.status)).length, "Across all offices", "green"),
        metric("In Use Now", countBy(["In Use"]), "Resources out right now", "blue"),
        metric("Expired", countBy(["Expired"]), "Lapsed without a decision", "red")
      ]} />
      <div className="grid two-col wide-left section-gap">
        <div className="stack">
          <article className="card table-wrap">
            <CardHeader
              title="Office overview"
              subtitle={`${activeOffices.length} active office${activeOffices.length === 1 ? "" : "s"}: resources, admins and approval load`}
              action={<button className="secondary-button" onClick={() => onNavigate("offices")} type="button">Manage offices</button>}
            />
            {officeRows.length ? (
              <table>
                <thead><tr><th>Office</th><th>Resources</th><th>Office admins</th><th>Pending approvals</th></tr></thead>
                <tbody>
                  {officeRows.map((row) => (
                    <tr key={row.name}>
                      <td><strong>{row.name}</strong></td>
                      <td>{row.resources}</td>
                      <td>{row.admins ? row.admins : <Badge status="Rejected">None</Badge>}</td>
                      <td>{row.pending ? <Badge status="Pending">{row.pending} pending</Badge> : <span className="read-only-label">Clear</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyState>No active offices are configured yet.</EmptyState>}
          </article>
          <article className="card table-wrap">
            <CardHeader title="Recent requests" subtitle="Latest reservations across every office" />
            {recentRequests.length ? (
              <table>
                <thead><tr><th>Resource</th><th>Office</th><th>Requester</th><th>Date</th><th>Status</th></tr></thead>
                <tbody>
                  {recentRequests.map((item) => (
                    <tr key={item.id}>
                      <td>{item.resourceName}</td>
                      <td>{item.office}</td>
                      <td>{item.requester}</td>
                      <td>{formatDate(item.date)}<br /><small>{item.start}-{item.end}</small></td>
                      <td><Badge status={item.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyState>No requests have been submitted yet.</EmptyState>}
          </article>
        </div>
        <div className="stack">
          <StatusBreakdown title="Request status" subtitle={`${reservations.length} requests, grouped by stage`} items={statusGroups} />
          <StatusTileGrid title="Resource availability" subtitle={`${activeResources.length} resources across all offices`} items={availabilityItems} />
          <article className="card">
            <CardHeader
              title="Recent activity"
              subtitle="System actions"
              action={<button className="secondary-button" onClick={() => onNavigate("activity")} type="button">View all</button>}
            />
            <ActivityRows store={store} limit={5} />
          </article>
        </div>
      </div>
    </>
  );
}

function OsgAdminDashboard({ store, onNavigate, onAction }) {
  const visitorStatus = ["Pending", "Approved", "Rejected", "Arrived"].map((status) => ({
    label: status,
    value: store.data.visitors.filter((item) => item.status === status).length
  }));
  return (
    <>
      <Metrics items={[
        metric("Pending Visitor Requests", store.data.visitors.filter((item) => item.status === "Pending").length, "Needs OSG review", "yellow"),
        metric("Event Reviews", store.actionableApprovalCount, "Conditional OSG approvals", "blue"),
        metric("Arrived", store.data.visitors.filter((item) => item.status === "Arrived").length, "Checked in", "green"),
        metric("Open Parking", openParking(store), "Visitor bays", "purple")
      ]} />
      <div className="grid two-col section-gap">
        <article className="card">
          <CardHeader title="Priority visitor queue" subtitle="Requests awaiting OSG action" />
          <VisitorRows
            items={store.data.visitors}
            onApprove={(id) => onAction(() => store.approveVisitor(id, true), "Visitor request approved.")}
            onDecline={(id, reason) => onAction(() => store.approveVisitor(id, false, reason), "Visitor request declined.")}
          />
        </article>
        <article className="card">
          <CardHeader title="Arrival monitor" subtitle="Today at Main Gate" action={<button className="secondary-button" onClick={() => onNavigate("arrivals")} type="button">Open</button>} />
          <ArrivalRows items={store.data.visitors} onCheckIn={(id) => onAction(() => store.checkInVisitor(id), "Visitor arrival recorded.")} />
        </article>
      </div>
      <div className="section-gap"><ChartSummary title="Visitor requests by status" items={visitorStatus} /></div>
    </>
  );
}


export default function DashboardView(props) {
  const role = props.store.session.activeRole;
  if (role === "officeAdmin") return <OfficeAdminDashboard {...props} />;
  if (role === "superAdmin") return <SuperAdminDashboard {...props} />;
  if (role === "osgAdmin") return <OsgAdminDashboard {...props} />;
  return <RequesterDashboard {...props} />;
}
