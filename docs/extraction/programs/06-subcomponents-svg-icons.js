// Read-only. Avatar Status + Secondary Button (used inside Nav), link style presets,
// SVG export of the vector logos/icons (tree.toSVG), and where Iconoir / Phosphor /
// Lottie_Icon instances live in the project.
// Result saved as docs/extraction/raw/06-subcomponents-svg-icons.json.gz. tree.changedNodeCount: 0
const { tree } = api
const out = {}
out.comps = {}
for (const id of ["Zpq26dbNS","l1lRiQK3K"]) out.comps[id] = await tree.serialize(id, { depth: 99 })
out.linkPresets = await tree.serializeNodes(tree.getNodesOfTypes("LinkStylePresetNode"), { depth: 0 })
out.svg = {}
for (const id of ["ekMei1Y5u","cfGYNhY23","dX3khA1To","U_RTM5JkQ","h0oRDLhzp","PEZDcLysE"]) {
  try { out.svg[id] = await tree.toSVG(id) } catch (e) { out.svg[id] = "ERR " + e.message }
}
const usage = []
for (const n of tree.getNodesOfTypes("ComponentInstanceNode")) {
  const s = await tree.serialize(n, { depth: 0 })
  const nm = s.$componentDisplayName || ""
  if (/Phosphor|Lottie|Iconoir|Switch/i.test(nm)) {
    const anc = tree.getAncestorsFor(n).map(a => a.name || a.type).slice(0, 8)
    const ctr = Object.fromEntries(Object.entries(s).filter(([k]) => k.startsWith("$control__") && /iconSearch|jsonFile|weight/.test(k)))
    usage.push({ id: n.id, nm, anc, ctr, visible: s.visible })
  }
}
out.usage = usage
return JSON.stringify(out)
