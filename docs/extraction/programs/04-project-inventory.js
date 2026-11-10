// Read-only. Node type counts, components, code files, text style presets, colour tokens.
// Result saved as docs/extraction/raw/04-project-inventory.json.gz. tree.changedNodeCount: 0
const { tree } = api
const types = {}
for (const n of tree.walk()) { types[n.type] = (types[n.type]||0)+1 }
const comps = tree.getNodesOfTypes("ComponentNode").map(n => ({ id: n.id, name: n.name }))
const codes = tree.getNodesOfTypes("CodeFileNode").map(n => ({ id: n.id, name: n.name }))
const presets = await tree.serializeNodes(tree.getNodesOfTypes("TextStylePresetNode"), { depth: 0 })
const colors = await tree.serializeNodes(tree.getNodesOfTypes("ColorStyleTokenNode"), { depth: 0 })
const pages = tree.getNodesOfTypes("WebPageNode").map(n => ({ id: n.id, name: n.name, path: n.path }))
const tmpl = tree.getNodesOfTypes("LayoutTemplateNode").map(n => ({ id: n.id, name: n.name }))
return JSON.stringify({ types, comps, codes, presets, colors, pages, tmpl })
