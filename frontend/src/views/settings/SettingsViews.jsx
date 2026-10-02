import ManagedForm from "../../components/ManagedForm.jsx";
import { confirmLeaveForms } from "../../shared/formSafety.js";
import { useEffect, useMemo, useState } from "react";
import { Archive, ArrowDown, ArrowUp, Clock3, Edit3, Plus, Save, Trash2 } from "lucide-react";
import { Badge } from "../../components/Common.jsx";
import { MAX_PAYMENT_DEADLINE_HOURS, MAX_PAYMENT_INSTRUCTIONS_LENGTH, MAX_PAYMENT_STEPS, MAX_PAYMENT_STEP_FIELD_LENGTH, MIN_PAYMENT_STEP_TITLE_LENGTH, applyPaymentStepTokens } from "../../store/shared.js";
export { OfficeSettingsView } from "./OfficeSettingsView.jsx";

const RESOURCE_TYPES = ["Equipment", "Vehicle", "Visitor Service"];
const GUIDE_HIDDEN_KEY = "reservata.workflowGuideHidden.v1";

// The payment window is stored in hours; the unit only changes how the admin types it.
const WINDOW_UNITS = { Hours: 1, Days: 24, Weeks: 168 };
const PAYMENT_TOKENS = [
  ["{fee}", "Amount due"],
  ["{office}", "Paying office"],
  ["{window}", "Hours to pay"],
  ["{reservationId}", "Reservation ID"],
];
const PAYMENT_SAMPLE = { fee: "PHP 850", office: "Simbahayan", reservationId: "REQ-2026-003" };

function windowFromHours(hours) {
  const value = Number(hours) || 24;
  const unit = value % 168 === 0 ? "Weeks" : value > 24 && value % 24 === 0 ? "Days" : "Hours";
  return { unit, value: String(value / WINDOW_UNITS[unit]) };
}

function formatWindow(hours) {
  if (!hours) return "the payment window";
  const [unit, size] = hours % 168 === 0 ? ["week", 168] : hours % 24 === 0 && hours > 24 ? ["day", 24] : ["hour", 1];
  const count = hours / size;
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

const ROUTING_GUIDE = [
  ["Name it", "Pick a clear name and the type of resource it applies to."],
  ["Add review steps", "Each step is one office that has to approve the request."],
  ["Set the order with tiers", "Steps in the same tier review at the same time. The next tier starts once the one before it is cleared."],
];

// Collapse tier numbers to 1..n so removing the last step of a tier never leaves a gap.
function renumberTiers(steps) {
  const order = [...new Set(steps.map((step) => Number(step.sequence) || 1))].sort((a, b) => a - b);
  return steps.map((step) => ({ ...step, sequence: order.indexOf(Number(step.sequence) || 1) + 1 }));
}

function emptyStep(tier) {
  return {
    id: `STEP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: "",
    office: "",
    sequence: tier,
    approvingBodyId: "",
  };
}

function readGuideHidden() {
  try {
    return localStorage.getItem(GUIDE_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function workflowDraft(template) {
  return template
    ? { ...structuredClone(template), steps: renumberTiers(structuredClone(template.steps)) }
    : {
        name: "",
        resourceType: "All",
        status: "Active",
        steps: [
          {
            id: "OWNER",
            name: "Resource Owner Review",
            office: "$OWNER",
            sequence: 1,
          },
        ],
      };
}

export function WorkflowsView({ store, onAction }) {
  const [activeTab, setActiveTab] = useState("workflows");
  const [selectedId, setSelectedId] = useState("");
  const selected = store.data.approvalTemplates.find(
    (item) => item.id === selectedId,
  );
  const [draft, setDraft] = useState(workflowDraft());
  const [windowUnit, setWindowUnit] = useState(() => windowFromHours(store.settings.paymentDeadlineHours).unit);
  const [windowValue, setWindowValue] = useState(() => windowFromHours(store.settings.paymentDeadlineHours).value);
  const [tokenTarget, setTokenTarget] = useState(null);
  const [paymentInstructions, setPaymentInstructions] = useState(
    store.settings.paymentInstructions,
  );
  const [paymentSteps, setPaymentSteps] = useState(
    store.settings.paymentSteps.map((step) => ({ ...step })),
  );
  const offices = useMemo(
    () => store.data.offices.filter((item) => item.status === "Active"),
    [store.data.offices],
  );
  const [guideHidden, setGuideHidden] = useState(readGuideHidden);
  // Approval tiers map to the workflow sequence: tier 1 is the owner review,
  // higher tiers run in order, and steps that share a tier run in parallel.
  const tiers = useMemo(() => {
    const byTier = new Map();
    draft.steps.forEach((step, index) => {
      const tier = Number(step.sequence) || 1;
      if (!byTier.has(tier)) byTier.set(tier, []);
      byTier.get(tier).push({ step, index });
    });
    return [...byTier.entries()]
      .sort(([a], [b]) => a - b)
      .map(([tier, items]) => ({ tier, items }));
  }, [draft.steps]);
  const highestTier = tiers.length ? tiers[tiers.length - 1].tier : 1;

  useEffect(() => setDraft(workflowDraft(selected)), [selected]);
  const windowFactor = WINDOW_UNITS[windowUnit];
  const windowHours = Number(windowValue) > 0 ? Number(windowValue) * windowFactor : 0;
  const previewSteps = applyPaymentStepTokens(paymentSteps, { ...PAYMENT_SAMPLE, window: windowHours || "" });

  useEffect(() => {
    const next = windowFromHours(store.settings.paymentDeadlineHours);
    setWindowUnit(next.unit);
    setWindowValue(next.value);
  }, [store.settings.paymentDeadlineHours]);
  useEffect(
    () => setPaymentInstructions(store.settings.paymentInstructions),
    [store.settings.paymentInstructions],
  );
  useEffect(
    () => setPaymentSteps(store.settings.paymentSteps.map((step) => ({ ...step }))),
    [store.settings.paymentSteps],
  );

  function updatePaymentStep(index, field, value) {
    setPaymentSteps((current) =>
      current.map((step, stepIndex) =>
        stepIndex === index ? { ...step, [field]: value } : step,
      ),
    );
  }

  function addPaymentStep() {
    setPaymentSteps((current) =>
      current.length >= MAX_PAYMENT_STEPS
        ? current
        : [...current, { title: "", detail: "" }],
    );
  }

  function changeWindowUnit(unit) {
    const factor = WINDOW_UNITS[unit];
    const max = Math.floor(MAX_PAYMENT_DEADLINE_HOURS / factor);
    // Convert the current window so switching units keeps roughly the same length.
    const converted = windowHours ? Math.round(windowHours / factor) : 1;
    setWindowUnit(unit);
    setWindowValue(String(Math.min(max, Math.max(1, converted))));
  }

  function insertToken(token) {
    if (!tokenTarget) return;
    const { index, field } = tokenTarget;
    const current = paymentSteps[index]?.[field] ?? "";
    const spacer = current && !current.endsWith(" ") ? " " : "";
    updatePaymentStep(index, field, `${current}${spacer}${token}`.slice(0, MAX_PAYMENT_STEP_FIELD_LENGTH));
  }

  function resetPaymentSettings() {
    const next = windowFromHours(store.settings.paymentDeadlineHours);
    setWindowUnit(next.unit);
    setWindowValue(next.value);
    setPaymentInstructions(store.settings.paymentInstructions);
    setPaymentSteps(store.settings.paymentSteps.map((step) => ({ ...step })));
    setTokenTarget(null);
  }

  function removePaymentStep(index) {
    setTokenTarget(null);
    setPaymentSteps((current) =>
      current.filter((_, stepIndex) => stepIndex !== index),
    );
  }

  function movePaymentStep(index, offset) {
    setTokenTarget(null);
    setPaymentSteps((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function updateStep(index, field, value) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) =>
        stepIndex === index ? { ...step, [field]: value } : step,
      ),
    }));
  }

  function addStep(tier) {
    setDraft((current) => ({
      ...current,
      steps: [...current.steps, emptyStep(tier)],
    }));
  }

  function removeStep(index) {
    if (index === 0) return;
    setDraft((current) => ({
      ...current,
      steps: renumberTiers(current.steps.filter((_, stepIndex) => stepIndex !== index)),
    }));
  }

  function toggleGuide() {
    const next = !guideHidden;
    setGuideHidden(next);
    try {
      localStorage.setItem(GUIDE_HIDDEN_KEY, next ? "1" : "0");
    } catch {
      // Storage can be unavailable (private mode); the guide just won't stay hidden.
    }
  }

  function startOver() {
    if (!window.confirm("Clear this workflow and start over?")) return;
    setSelectedId("");
    setDraft(workflowDraft());
  }

  function editWorkflow(id) {
    setSelectedId(id);
    document.getElementById("workflow-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function officeLabel(office) {
    return office === "$OWNER" ? "Resource owner" : office;
  }

  async function submit(event) {
    event.preventDefault();
    const saved = await onAction(
      () => store.saveWorkflow(draft, selectedId),
      selectedId ? "Approval workflow updated." : "Approval workflow created.",
    );
    if (saved) {
      setSelectedId("");
      setDraft(workflowDraft());
    }
  }

  async function archive() {
    if (
      !window.confirm(
        "Archive this approval workflow? Resources using it must be moved first.",
      )
    )
      return;
    const saved = await onAction(
      () => store.archiveWorkflow(selectedId),
      "Approval workflow archived.",
    );
    if (saved) setSelectedId("");
  }

  async function submitPaymentSettings(event) {
    event.preventDefault();
    await onAction(
      () => store.updatePaymentSettings({
      paymentDeadlineHours: windowHours,
      paymentInstructions,
      paymentSteps,
    }),
      "Payment settings updated.",
    );
  }

  return (
    <div className="workflow-settings">
      <div className="workflow-tabs" role="tablist" aria-label="Approval settings">
        {[
          ["workflows", "Workflows"],
          ["payment", "Payment instructions"],
        ].map(([id, label], index, tabs) => (
          <button
            key={id}
            id={`settings-tab-${id}`}
            role="tab"
            type="button"
            aria-selected={activeTab === id}
            aria-controls={`settings-panel-${id}`}
            tabIndex={activeTab === id ? 0 : -1}
            onClick={() => { if (id === activeTab || confirmLeaveForms()) setActiveTab(id); }}
            onKeyDown={(event) => {
              const offsets = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: tabs.length - 1 - index };
              if (!(event.key in offsets)) return;
              event.preventDefault();
              if (!confirmLeaveForms()) return;
              const next = tabs[(index + offsets[event.key] + tabs.length) % tabs.length][0];
              setActiveTab(next);
              document.getElementById(`settings-tab-${next}`)?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div id="settings-panel-payment" role="tabpanel" aria-labelledby="settings-tab-payment" hidden={activeTab !== "payment"}>
        <div className="wf-intro">
          <h2>How requesters pay</h2>
          <p>Set how long requesters have to pay, and what they are told to do after submitting a paid request.</p>
        </div>

        <div className="wf-layout">
          <ManagedForm className="pay-form" onSubmit={submitPaymentSettings}>
            <section className="wf-card">
              <div className="wf-card-head">
                <h3>Payment window</h3>
                <p>How long a requester has to upload a receipt after the final approval. Choose hours, days or weeks.</p>
              </div>
              <div className="wf-card-body">
                <div className="field">
                  <label htmlFor="payment-deadline-value">Default window</label>
                  <div className="pay-window">
                    <input
                      id="payment-deadline-value"
                      className="input"
                      max={Math.floor(MAX_PAYMENT_DEADLINE_HOURS / windowFactor)}
                      min={1}
                      type="number"
                      value={windowValue}
                      onChange={(event) => setWindowValue(event.target.value)}
                      required
                    />
                    <select
                      id="payment-deadline-unit"
                      className="select"
                      aria-label="Window unit"
                      value={windowUnit}
                      onChange={(event) => changeWindowUnit(event.target.value)}
                    >
                      {Object.keys(WINDOW_UNITS).map((unit) => (
                        <option key={unit}>{unit}</option>
                      ))}
                    </select>
                  </div>
                  <small className="field-help">
                    The deadline is also capped by the reservation start time. The longest window is {MAX_PAYMENT_DEADLINE_HOURS / 24} days.
                  </small>
                </div>
              </div>
            </section>

            <section className="wf-card">
              <div className="wf-card-head">
                <h3>Payment instructions</h3>
                <p>Explain how and where to settle the fee. Shown to requesters on the paid-request payment steps.</p>
              </div>
              <div className="wf-card-body">
                <div className="field">
                  <label htmlFor="payment-instructions">Instructions</label>
                  <textarea
                    id="payment-instructions"
                    className="textarea"
                    maxLength={MAX_PAYMENT_INSTRUCTIONS_LENGTH}
                    rows={5}
                    value={paymentInstructions}
                    onChange={(event) => setPaymentInstructions(event.target.value)}
                    required
                  />
                </div>
              </div>
            </section>

            <section className="wf-card">
              <div className="wf-card-head pay-steps-head">
                <div>
                  <h3>Payment next steps</h3>
                  <p>The numbered list requesters see after submitting a paid request.</p>
                </div>
                <span className="wf-pill">{paymentSteps.length} of {MAX_PAYMENT_STEPS} steps</span>
              </div>
              <div className="wf-card-body pay-steps">
                <div className="pay-tokens">
                  <strong>Placeholders</strong>
                  <p>Click inside a step title or detail, then pick a placeholder. It is added to the end of that field.</p>
                  <div className="pay-token-list">
                    {PAYMENT_TOKENS.map(([token, label]) => (
                      <button
                        key={token}
                        className="pay-token"
                        type="button"
                        disabled={!tokenTarget}
                        title={tokenTarget ? `Add ${token}` : "Click inside a step field first"}
                        // Keep focus in the step field so the placeholder lands where the cursor was.
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => insertToken(token)}
                      >
                        <code>{token}</code>
                        <small>{label}</small>
                      </button>
                    ))}
                  </div>
                </div>

                {paymentSteps.map((step, index) => (
                  <div className="pay-step" key={index}>
                    <div className="pay-step-head">
                      <span className="wf-number">{index + 1}</span>
                      <strong>Step {index + 1}</strong>
                      <div className="pay-step-actions">
                        <button
                          aria-label={`Move step ${index + 1} up`}
                          className="icon-button"
                          disabled={index === 0}
                          onClick={() => movePaymentStep(index, -1)}
                          title="Move up"
                          type="button"
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          aria-label={`Move step ${index + 1} down`}
                          className="icon-button"
                          disabled={index === paymentSteps.length - 1}
                          onClick={() => movePaymentStep(index, 1)}
                          title="Move down"
                          type="button"
                        >
                          <ArrowDown size={16} />
                        </button>
                        <button
                          aria-label={`Remove step ${index + 1}`}
                          className="icon-button danger-icon wf-remove"
                          disabled={paymentSteps.length <= 1}
                          onClick={() => removePaymentStep(index)}
                          title="Remove step"
                          type="button"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="pay-step-fields">
                      <div className="field">
                        <label htmlFor={`payment-step-title-${index}`}>Step title</label>
                        <input
                          id={`payment-step-title-${index}`}
                          className="input"
                          maxLength={MAX_PAYMENT_STEP_FIELD_LENGTH}
                          minLength={MIN_PAYMENT_STEP_TITLE_LENGTH}
                          value={step.title}
                          onFocus={() => setTokenTarget({ index, field: "title" })}
                          onChange={(event) => updatePaymentStep(index, "title", event.target.value)}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`payment-step-detail-${index}`}>Step detail</label>
                        <textarea
                          id={`payment-step-detail-${index}`}
                          className="textarea"
                          maxLength={MAX_PAYMENT_STEP_FIELD_LENGTH}
                          rows={3}
                          value={step.detail}
                          onFocus={() => setTokenTarget({ index, field: "detail" })}
                          onChange={(event) => updatePaymentStep(index, "detail", event.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  className="wf-add-tier"
                  disabled={paymentSteps.length >= MAX_PAYMENT_STEPS}
                  onClick={addPaymentStep}
                  type="button"
                >
                  <Plus size={16} /> {paymentSteps.length >= MAX_PAYMENT_STEPS ? `Maximum of ${MAX_PAYMENT_STEPS} steps reached` : `Add Step ${paymentSteps.length + 1}`}
                </button>
              </div>
              <div className="wf-card-foot">
                <button className="secondary-button" onClick={resetPaymentSettings} type="button">
                  Discard changes
                </button>
                <button className="primary-button icon-text-button" type="submit">
                  <Save size={16} /> Save payment settings
                </button>
              </div>
            </section>
          </ManagedForm>

          <aside className="wf-side">
            <section className="wf-card pay-preview" aria-labelledby="pay-preview-title">
              <div className="wf-card-head">
                <h3 id="pay-preview-title">What requesters see</h3>
                <p>A live preview using sample values.</p>
              </div>
              <div className="pay-preview-body">
                <div className="pay-banner">
                  <Clock3 size={16} aria-hidden="true" />
                  <span>Pay and upload a receipt within {formatWindow(windowHours)}</span>
                </div>
                <h4>Instructions</h4>
                <p className="pay-preview-instructions">{paymentInstructions.trim() || "No instructions yet."}</p>
                <h4>Next steps</h4>
                <ol className="pay-preview-steps">
                  {previewSteps.map((step, index) => (
                    <li key={index}>
                      <span className="wf-number">{index + 1}</span>
                      <div>
                        <strong className={step.title ? "" : "is-empty"}>{step.title || "Untitled step"}</strong>
                        {step.detail && <small>{step.detail}</small>}
                      </div>
                    </li>
                  ))}
                </ol>
                <p className="pay-preview-sample">
                  Sample values: fee {PAYMENT_SAMPLE.fee}, office {PAYMENT_SAMPLE.office}, reservation {PAYMENT_SAMPLE.reservationId}.
                </p>
              </div>
            </section>
          </aside>
        </div>
      </div>
      <div id="settings-panel-workflows" role="tabpanel" aria-labelledby="settings-tab-workflows" hidden={activeTab !== "workflows"}>
        <div className="wf-intro">
          <h2>Who approves a reservation?</h2>
          <p>Build an approval route for your resources, then assign it to the ones that need it.</p>
        </div>

        <section className="wf-card wf-guide" aria-labelledby="wf-guide-title">
          <div className="wf-guide-head">
            <h3 id="wf-guide-title">How approval routing works</h3>
            <button className="wf-link-button" type="button" onClick={toggleGuide} aria-expanded={!guideHidden}>
              {guideHidden ? "Show guide" : "Hide guide"}
            </button>
          </div>
          {!guideHidden && (
            <ol className="wf-guide-steps">
              {ROUTING_GUIDE.map(([title, detail], index) => (
                <li key={title}>
                  <span className="wf-number">{index + 1}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="wf-layout">
          <ManagedForm id="workflow-editor" className="wf-card wf-editor" onSubmit={submit} resetKey={selectedId}>
            <div className="wf-card-head">
              <h3>{selectedId ? "Edit workflow" : "Create workflow"}</h3>
              <p>Set up who has to approve a reservation, and in what order.</p>
            </div>

            <div className="wf-card-body">
              <div className={`wf-details${selectedId ? " has-status" : ""}`}>
                <div className="field">
                  <label htmlFor="workflow-name">Workflow name</label>
                  <input
                    id="workflow-name"
                    className="input"
                    placeholder="e.g. Event Vehicle Approval"
                    value={draft.name}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="workflow-type">Resource type</label>
                  <select
                    id="workflow-type"
                    className="select"
                    value={draft.resourceType}
                    onChange={(event) => setDraft((current) => ({ ...current, resourceType: event.target.value }))}
                  >
                    <option>All</option>
                    {RESOURCE_TYPES.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </div>
                {selectedId && (
                  <div className="field">
                    <label htmlFor="workflow-status">Status</label>
                    <select
                      id="workflow-status"
                      className="select"
                      value={draft.status}
                      onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
                    >
                      <option>Active</option>
                      <option>Archived</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="wf-steps-head">
                <div>
                  <h4>Review steps</h4>
                  <p>Tier 1 is always the resource owner. Add more steps or tiers if others need to approve too.</p>
                </div>
                <span className="wf-pill">
                  {highestTier} tier{highestTier === 1 ? "" : "s"} / {draft.steps.length} step{draft.steps.length === 1 ? "" : "s"}
                </span>
              </div>

              {tiers.map(({ tier, items }) => (
                <div className="wf-tier-group" key={tier}>
                  {tier > 1 && (
                    <div className="wf-connector">
                      <span>Then, once Tier {tier - 1} is cleared</span>
                    </div>
                  )}
                  <section className="wf-tier" aria-label={`Tier ${tier}`}>
                    <div className="wf-tier-head">
                      <span className="wf-number">{tier}</span>
                      <div>
                        <strong>Tier {tier}</strong>
                        <small>{tier === 1 ? "Reviewed first" : `Starts after Tier ${tier - 1} is cleared`}</small>
                      </div>
                    </div>

                    {items.map(({ step, index }) => {
                      const owner = index === 0;
                      const bodies = store.data.approvingBodies.filter(
                        (body) => body.office === step.office && body.status === "Active",
                      );
                      return (
                        <div className="wf-step" key={step.id}>
                          <div className="wf-step-fields">
                            <div className="field">
                              <label htmlFor={`step-name-${step.id}`}>Step name</label>
                              <input
                                id={`step-name-${step.id}`}
                                className="input"
                                placeholder="e.g. Facilities review"
                                value={step.name}
                                onChange={(event) => updateStep(index, "name", event.target.value)}
                                required
                              />
                            </div>
                            <div className="field">
                              <label htmlFor={`step-office-${step.id}`}>Approving office</label>
                              <select
                                id={`step-office-${step.id}`}
                                className="select"
                                value={step.office}
                                disabled={owner}
                                onChange={(event) => {
                                  updateStep(index, "office", event.target.value);
                                  updateStep(index, "approvingBodyId", "");
                                }}
                                required
                              >
                                {owner || step.office === "$OWNER" ? (
                                  <option value="$OWNER">Resource Owner</option>
                                ) : (
                                  <option value="" disabled>Select an office</option>
                                )}
                                {!owner && offices.map((office) => (
                                  <option key={office.id} value={office.name}>{office.name}</option>
                                ))}
                              </select>
                            </div>
                            <div className="field">
                              <label htmlFor={`step-approving-body-${step.id}`}>
                                Approving body <span className="wf-optional">(optional)</span>
                              </label>
                              <select
                                id={`step-approving-body-${step.id}`}
                                className="select"
                                value={step.approvingBodyId || ""}
                                onChange={(event) => updateStep(index, "approvingBodyId", event.target.value)}
                              >
                                <option value="">No specific body</option>
                                {bodies.map((body) => (
                                  <option key={body.id} value={body.id}>{body.bodyName}</option>
                                ))}
                              </select>
                            </div>
                            <button
                              className="icon-button danger-icon wf-remove"
                              aria-label={`Remove ${step.name || "step"}`}
                              disabled={owner}
                              onClick={() => removeStep(index)}
                              title={owner ? "The owner review is required" : "Remove step"}
                              type="button"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                          {owner && (
                            <small className="wf-step-note">Required. Every request starts with the resource owner.</small>
                          )}
                        </div>
                      );
                    })}

                    <button className="secondary-button icon-text-button wf-add-step" type="button" onClick={() => addStep(tier)}>
                      <Plus size={16} /> Add a step to Tier {tier}
                    </button>
                  </section>
                </div>
              ))}

              <div className="wf-connector wf-connector-plain" aria-hidden="true" />
              <button className="wf-add-tier" type="button" onClick={() => addStep(highestTier + 1)}>
                <Plus size={16} /> Add Tier {highestTier + 1}
              </button>
              <p className="wf-add-tier-note">Runs after Tier {highestTier} is cleared.</p>
            </div>

            <div className="wf-card-foot">
              {selectedId ? (
                <>
                  <button className="danger-button icon-text-button" onClick={archive} type="button">
                    <Archive size={16} /> Archive
                  </button>
                  <button className="secondary-button" onClick={() => setSelectedId("")} type="button">
                    Cancel
                  </button>
                </>
              ) : (
                <button className="secondary-button" onClick={startOver} type="button">
                  Start over
                </button>
              )}
              <button className="primary-button icon-text-button" type="submit">
                <Save size={16} /> {selectedId ? "Save workflow" : "Create workflow"}
              </button>
            </div>
          </ManagedForm>

          <aside className="wf-side">
            <section className="wf-card wf-preview" aria-labelledby="wf-preview-title">
              <div className="wf-card-head">
                <h3 id="wf-preview-title">Route preview</h3>
                <p>What a new request goes through.</p>
              </div>
              <ol className="wf-timeline">
                <li className="wf-timeline-start">
                  <span className="wf-dot" />
                  <strong>Request submitted</strong>
                </li>
                {tiers.map(({ tier, items }) => (
                  <li key={tier} className="wf-timeline-tier">
                    <span className="wf-dot" />
                    <div>
                      <small>Tier {tier}</small>
                      {items.map(({ step }) => (
                        <div className="wf-timeline-step" key={step.id}>
                          <span className={step.name.trim() ? "" : "is-empty"}>{step.name.trim() || "Untitled step"}</span>
                          {step.office && <small>{officeLabel(step.office)}</small>}
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
                <li className="wf-timeline-end">
                  <span className="wf-dot" />
                  <strong>Reservation confirmed</strong>
                </li>
              </ol>
            </section>
            <div className="wf-tip">
              <strong>New here?</strong>
              <p>Start with the resource owner only. You can come back and add more tiers whenever you need them.</p>
            </div>
          </aside>
        </div>

        <section className="wf-card wf-catalog">
          <div className="wf-card-head wf-catalog-head">
            <div>
              <h3>Configured workflows</h3>
              <p>Resources keep their assigned template. New requests use the active route.</p>
            </div>
            <span>
              {store.data.approvalTemplates.length} workflow{store.data.approvalTemplates.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Workflow</th>
                  <th>Type</th>
                  <th>Steps</th>
                  <th>Status</th>
                  <th className="wf-action-col">Action</th>
                </tr>
              </thead>
              <tbody>
                {store.data.approvalTemplates.map((workflow) => (
                  <tr key={workflow.id} className={workflow.id === selectedId ? "is-selected" : ""}>
                    <td>
                      <strong>{workflow.name}</strong>
                      <br />
                      <small>{workflow.id}</small>
                    </td>
                    <td>{workflow.resourceType}</td>
                    <td>{workflow.steps.length} step{workflow.steps.length === 1 ? "" : "s"}</td>
                    <td>
                      <Badge status={workflow.status} />
                    </td>
                    <td className="wf-action-col">
                      <button
                        className="secondary-button icon-text-button"
                        aria-label={`Edit ${workflow.name}`}
                        onClick={() => editWorkflow(workflow.id)}
                        type="button"
                      >
                        <Edit3 size={14} /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
