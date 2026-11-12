// Read-only. Pages (depth 1, breakpoint frames + widths) and the root SEO metadata.
// Result saved as docs/extraction/raw/01-pages.json.gz. tree.changedNodeCount: 0
const { tree } = api
const pages = ["augiA20Il","G_l_x1ZI2","nLi6iDCYw"]
const out = {}
for (const p of pages) {
  const s = await tree.serialize(p, { depth: 1 })
  out[p] = { ...s, children: (s.children||[]).map(c => { const { children, ...rest } = c; return { ...rest, childCount: (children||[]).length } }) }
}
const root = tree.root
out.root = Object.fromEntries(Object.entries(root).filter(([k]) => k !== 'children'))
return JSON.stringify(out).slice(0, 20000)
