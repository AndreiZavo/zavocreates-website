// Read-only. /pricing (iaExKVmr3...) and /pricing-ro (Y42cAw7ew...) breakpoints plus the
// "Main" layout template (nav, footer, noise background, custom cursor).
// Result saved as docs/extraction/raw/03-pricing-breakpoints-and-template.json.gz. tree.changedNodeCount: 0
const { tree } = api
const ids = ["iaExKVmr3","ayN7NDPaO","vD8B7E5FW","Y42cAw7ew","jrr1SEmaE","zC3UWWB6f","d_uHRxjHw"]
const out = {}
for (const id of ids) out[id] = await tree.serialize(id, { depth: 99 })
return JSON.stringify(out)
