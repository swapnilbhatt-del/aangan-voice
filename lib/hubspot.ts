// HubSpot CRM: one contact per caller, one deal per qualified enquiry, in an
// "Aangan Enquiries" pipeline whose stage probabilities give Nikhil a revenue forecast.
const BASE = "https://api.hubapi.com";
export const PIPELINE_LABEL = "Aangan Enquiries";
export const STAGES = [
  { key: "qualified", label: "Qualified (call)", probability: "0.1" },
  { key: "claimed", label: "Claimed by designer", probability: "0.2" },
  { key: "consultation_booked", label: "Consultation booked", probability: "0.4" },
  { key: "signed", label: "Signed", probability: "1.0", isClosed: true },
  { key: "lost", label: "Lost", probability: "0.0", isClosed: true },
] as const;
export type StageKey = (typeof STAGES)[number]["key"];

async function hs<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HubSpot ${init.method ?? "GET"} ${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return (res.status === 204 ? null : await res.json()) as T;
}

type Pipeline = { id: string; label: string; stages: { id: string; label: string }[] };
let cached: { pipelineId: string; stageIds: Record<StageKey, string> } | null = null;

export async function resolvePipeline() {
  if (cached) return cached;
  const { results } = await hs<{ results: Pipeline[] }>("/crm/v3/pipelines/deals");
  const p = results.find((r) => r.label === PIPELINE_LABEL);
  if (p) {
    const stageIds = Object.fromEntries(STAGES.map((s) => [s.key, p.stages.find((x) => x.label === s.label)?.id])) as Record<StageKey, string>;
    if (Object.values(stageIds).every(Boolean)) return (cached = { pipelineId: p.id, stageIds });
  }
  // Fallback: HubSpot's default sales pipeline, so a missing setup never drops a lead.
  const d = results.find((r) => r.id === "default") ?? results[0];
  const byOrder = d.stages.map((s) => s.id);
  return (cached = {
    pipelineId: d.id,
    stageIds: { qualified: byOrder[0], claimed: byOrder[1], consultation_booked: byOrder[2], signed: byOrder.at(-2)!, lost: byOrder.at(-1)! },
  });
}

export async function createPipeline() {
  return hs<Pipeline>("/crm/v3/pipelines/deals", {
    method: "POST",
    body: JSON.stringify({
      label: PIPELINE_LABEL,
      displayOrder: 0,
      stages: STAGES.map((s, i) => ({
        label: s.label,
        displayOrder: i,
        metadata: { probability: s.probability, ...("isClosed" in s ? { isClosed: "true" } : {}) },
      })),
    }),
  });
}

export async function upsertContact(c: { phone: string | null; firstName: string | null; email: string | null; locality: string | null }) {
  if (c.phone || c.email) {
    const filters = c.phone ? [{ propertyName: "phone", operator: "EQ", value: c.phone }] : [{ propertyName: "email", operator: "EQ", value: c.email }];
    const found = await hs<{ results: { id: string }[] }>("/crm/v3/objects/contacts/search", {
      method: "POST",
      body: JSON.stringify({ filterGroups: [{ filters }], limit: 1 }),
    });
    if (found.results[0]) return found.results[0].id;
  }
  const props: Record<string, string> = { lifecyclestage: "salesqualifiedlead", hs_lead_status: "NEW" };
  if (c.firstName) props.firstname = c.firstName;
  if (c.phone) props.phone = c.phone;
  if (c.email) props.email = c.email;
  if (c.locality) props.city = c.locality;
  const created = await hs<{ id: string }>("/crm/v3/objects/contacts", { method: "POST", body: JSON.stringify({ properties: props }) });
  return created.id;
}

export async function createDeal(d: { name: string; amount: number; contactId: string; description: string }) {
  const { pipelineId, stageIds } = await resolvePipeline();
  const close = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);
  const deal = await hs<{ id: string }>("/crm/v3/objects/deals", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        dealname: d.name,
        amount: String(d.amount),
        pipeline: pipelineId,
        dealstage: stageIds.qualified,
        closedate: close,
        description: d.description.slice(0, 5000),
      },
      // 3 = deal → contact (HubSpot-defined association).
      associations: [{ to: { id: d.contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }] }],
    }),
  });
  return deal.id;
}

export async function moveDeal(dealId: string, stage: StageKey) {
  const { stageIds } = await resolvePipeline();
  await hs(`/crm/v3/objects/deals/${dealId}`, { method: "PATCH", body: JSON.stringify({ properties: { dealstage: stageIds[stage] } }) });
}

export async function ping() {
  await hs("/crm/v3/objects/deals?limit=1");
}
