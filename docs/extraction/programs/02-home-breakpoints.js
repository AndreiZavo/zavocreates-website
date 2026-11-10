// Read-only. Full serialization of the Home page Desktop / Tablet / Phone breakpoints.
// Result saved as docs/extraction/raw/02-home-breakpoints.json.gz. tree.changedNodeCount: 0
const { tree } = api
const ids = ["WQLkyLRf1","xPPcDrn0O","KlICeir_c"]
const out = {}
for (const id of ids) out[id] = await tree.serialize(id, { depth: 99 })
return JSON.stringify(out)
