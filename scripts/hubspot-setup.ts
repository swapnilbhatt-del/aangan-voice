// Creates the "Aangan Enquiries" deal pipeline (stages with win probabilities, so HubSpot's
// forecast works). Idempotent.
//   npm run hubspot:setup
import { createPipeline, resolvePipeline, PIPELINE_LABEL } from "../lib/hubspot";

async function main() {
  const res = await fetch("https://api.hubapi.com/crm/v3/pipelines/deals", { headers: { Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}` } });
  if (!res.ok) throw new Error(`HubSpot ${res.status}: ${await res.text()}`);
  const { results } = (await res.json()) as { results: { label: string }[] };
  if (results.some((p) => p.label === PIPELINE_LABEL)) console.log(`Pipeline "${PIPELINE_LABEL}" already exists.`);
  else {
    try {
      await createPipeline();
      console.log(`Created pipeline "${PIPELINE_LABEL}".`);
    } catch (e) {
      console.warn(`Could not create a custom pipeline (${(e as Error).message.slice(0, 160)}). Deals will use the default pipeline.`);
    }
  }
  console.log("Resolved:", await resolvePipeline());
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
