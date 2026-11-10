#!/usr/bin/env python3
"""Turn the raw, read-only Framer dumps in docs/extraction/raw/ into content/*.json.

Usage (from the repo root):  python3 -I docs/extraction/transform.py

The raw dumps are the unmodified results of the programs in docs/extraction/programs/.
Every visible string below is read from a Framer node id or component control, never
typed by hand. The only hand-written values are: image file names/alt text (Framer has
alt text for one image only), the Romanian meta title/description (spec requirement),
and human descriptions of effect targets. See docs/extraction/README.md.
"""
import gzip
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW = os.path.join(ROOT, "docs", "extraction", "raw")
OUT = os.path.join(ROOT, "content")


def load(name):
    with gzip.open(os.path.join(RAW, name + ".json.gz"), "rt", encoding="utf-8") as f:
        return json.load(f)


PAGES = load("01-pages")
HOME = load("02-home-breakpoints")
PRICING = load("03-pricing-breakpoints-and-template")
META = load("04-project-inventory")
COMPS = {k: v for k, v in load("05-components").items() if k != "ext"}
EXTRA = load("06-subcomponents-svg-icons")
COMPS.update(EXTRA["comps"])

BP = {
    "home": {"desktop": "WQLkyLRf1", "tablet": "xPPcDrn0O", "phone": "KlICeir_c"},
    "pricing": {"desktop": "iaExKVmr3", "tablet": "ayN7NDPaO", "phone": "vD8B7E5FW"},
    "pricingRo": {"desktop": "Y42cAw7ew", "tablet": "jrr1SEmaE", "phone": "zC3UWWB6f"},
    "template": {"desktop": "YCJ0ndl77", "tablet": "cmt5tQtU2", "phone": "xYhHFGQwf"},
}
BP_PREFIX = {"desktop": "", "tablet": None, "phone": None}

# ---------------------------------------------------------------- indexes
IDX = {}  # id -> node (every node of every dump)
PARENT = {}


def index(n, parent=None):
    IDX[n["id"]] = n
    if parent is not None:
        PARENT[n["id"]] = parent["id"]
    for c in n.get("children", []) or []:
        index(c, n)


for src in (HOME, PRICING):
    for v in src.values():
        index(v)
for v in COMPS.values():
    index(v)


def node(i):
    return IDX[i]


def replica(bp_root, original_id):
    """Replica ids are <breakpoint id><original id>; the primary uses the original id."""
    for cand in (bp_root + original_id, original_id):
        if cand in IDX:
            return IDX[cand]
    raise KeyError(f"{original_id} not found under {bp_root}")


def hidden(i):
    """A node is hidden if it or any ancestor has visible === false."""
    while i is not None:
        if IDX[i].get("visible") is False:
            return True
        i = PARENT.get(i)
    return False


def must_visible(i):
    if hidden(i):
        raise SystemExit(f"refusing hidden node {i}")
    return IDX[i]


def text(i, keep_trailing=False):
    """Text of a RichTextNode, blocks joined with \n. Trailing block whitespace is trimmed
    (invisible in HTML); everything else is kept byte for byte."""
    n = must_visible(i)
    blocks = []
    for b in n.get("children", []) or []:
        blocks.append("".join(r.get("text", "") for r in b.get("children", [])))
    if not blocks:
        blocks = [str(n["text"])]
    if not keep_trailing:
        blocks = [b.rstrip() for b in blocks]
    return "\n".join(blocks)


def runs(i):
    n = must_visible(i)
    out = []
    for b in n["children"]:
        for r in b["children"]:
            run = {"text": r["text"]}
            if r.get("bold"):
                run["bold"] = True
            if r.get("italic"):
                run["italic"] = True
            out.append(run)
    return out


def ctrl(i, key):
    return must_visible(i)["$control__" + key]


# ---------------------------------------------------------------- colours
TOKENS = {}
TOKEN_NAME = {}
seen = {}
for t in META["colors"]:
    base = re.sub(r"[^a-z0-9]+", "-", t["name"].lower()).strip("-")
    if base in seen:
        base = base + "-" + t["id"][:4]
    seen[base] = True
    TOKEN_NAME[t["id"]] = base
    TOKENS[base] = {
        "light": t["light"],
        "dark": t.get("dark", t["light"]),
        "framerName": t["name"],
        "framerId": t["id"],
    }


def css_color(v):
    if not isinstance(v, str):
        return v

    def rep(m):
        return f"var(--color-{TOKEN_NAME[m.group(1)]})"

    v = re.sub(r"var\(--token-([0-9a-f-]{36})(?:,[^()]*(?:\([^()]*\))?[^()]*)?\)(?: /\* .*? \*/)?", rep, v)
    return v


# ---------------------------------------------------------------- images
IMAGES = {
    # hash: (file, alt)   alt: Framer altText where set, else from the layer/brand name
    "rSCNvMfCJWpK8OYFUdMLt2bc4": ("andrei-portrait-hero.jpg", "Andrei Zavo"),
    "xPlHAvfmiPH0fNqVQ2E2bPzXc": ("avatar-card-back.jpg", ""),
    "Lw3HeJUuF06vaB2z5aymzKRodpw": ("andrei-portrait-contact.jpg", "Portrait of portfolio creator"),
    "2CMZbWZwgVJ42L8Ay3k5LiNs": ("logo-relume.png", "Relume"),
    "QKSQc1S80dFCWOTVfznv1kEjts": ("logo-demmers.png", "Demmers"),
    "wxLGJvayvJBfD1I5pcbNVmQWFA": ("logo-framer.png", "Framer"),
    "jXmQ5hl6lUf0YSVqBcYLOPxVeWI": ("logo-envato.jpg", "Envato"),
    "fo6L0W19pXikKOAbEEN1NIKj0w": ("logo-kittl.png", "Kittl"),
    "tinBRs6iUtXojbKQIsKh0YKVfPg": ("logo-pacdora.png", "Pacdora"),
    "tSknvSwCmz2arp808OW5OhEPKX4": ("project-envato.png", "Envato project video thumbnail"),
    "PQ3W1lUGl3fctS67uY8TNmmLSj0": ("project-life.png", "Life project video thumbnail"),
    "RgkAiFeiwzKAmA9jfHOWFPN8DU": ("project-blitz.jpg", "Blitz project video thumbnail"),
    "pF2xuukLIcTjdMBnxxiMH3U5u8": ("project-eye.png", "Eye project video thumbnail"),
    "e6gVdBEBWB6iqNG9LCjliBXY9vc": ("project-demmers.jpg", "Demmers project video thumbnail"),
    "uL6KgHwClN2rFgQtxDBmyc2do": ("project-kittl.png", "Kittl project video thumbnail"),
    "AVsssNQRylEZc5orEWvz8Q1wQT4": ("noise.gif", ""),
    "yaTX6kONvdb5wi978paaSxl7DmE": ("og-image.png", "Andrei Zavo, promo and social media videographer"),
    "ipJOPXxZhV6hC8cgURUuLl31M": ("favicon.png", ""),
}
# measured from the downloaded originals (sips); see README
SIZES = {
    "andrei-portrait-hero.jpg": (4000, 6000), "avatar-card-back.jpg": (6000, 4000),
    "andrei-portrait-contact.jpg": (4000, 6000), "logo-relume.png": (1732, 1921),
    "logo-demmers.png": (768, 768), "logo-framer.png": (1024, 1024), "logo-envato.jpg": (400, 400),
    "logo-kittl.png": (193, 192), "logo-pacdora.png": (200, 200), "project-envato.png": (1080, 1920),
    "project-life.png": (1080, 1920), "project-blitz.jpg": (1080, 1920), "project-eye.png": (1080, 1920),
    "project-demmers.jpg": (720, 1280), "project-kittl.png": (3096, 5496), "noise.gif": (500, 700),
    "og-image.png": (1263, 688), "favicon.png": (2731, 2731),
    # vectors exported with tree.toSVG (intrinsic size of the SVG)
    "logo-moft.svg": (198, 60), "logo-blitz.svg": (295, 59), "badge-blitz.svg": (109, 99),
    "play-icon.svg": (72, 72),
}


def asset_hash(ref):
    m = re.match(r"data:framer/asset-reference,([A-Za-z0-9]+)\.", ref)
    return m.group(1) if m else None


def image(ref_or_file, alt=None):
    if ref_or_file.startswith("data:"):
        f, a = IMAGES[asset_hash(ref_or_file)]
    else:
        f, a = ref_or_file, ""
    w, h = SIZES[f]
    return {"src": "/images/" + f, "width": w, "height": h, "alt": a if alt is None else alt}


def fill_of(i):
    return must_visible(i)["fill"]


# ---------------------------------------------------------------- site (template chrome)
root = PAGES["root"]
tpl = node("YCJ0ndl77")
footer_inst = node("THypV6AKn")
nav_open = node("Y4JoKRHSg")

site = {
    "url": "https://zavocreates.com",
    "title": root["metadata"]["title"],
    "description": root["metadata"]["description"],
    "ogImage": image(root["metadata"]["socialImage"]),
    "favicon": image(root["metadata"]["favicon"]),
    "phone": ctrl("THypV6AKn", "LKHj_3AuV"),
    "email": ctrl("THypV6AKn", "MF6KXMHqv"),
    "instagram": ctrl("THypV6AKn", "hEtbsGkw_"),
    "tiktok": ctrl("THypV6AKn", "YTJUUB2e2"),
    "threads": ctrl("THypV6AKn", "D15kjKjLI"),
    "noise": {**image(fill_of("UvARWQ2KC")), "opacity": node("UvARWQ2KC")["opacity"],
              "blendMode": node("UvARWQ2KC")["blendingMode"]},
    "nav": {
        "avatar": image(fill_of("TpkdFkNV1"), alt=""),
        "status": {"label": ctrl("VSa0MwIgMpUYi6IBCM", "riW_yXUKg"), "href": ctrl("VSa0MwIgMpUYi6IBCM", "RtQH4ek_I")},
        "links": [{"label": ctrl(i, "riW_yXUKg"), "href": ctrl(i, "RtQH4ek_I")}
                  for i in ["neACKjqbZ", "EWo2Lyygf", "MCmNmR4nh", "B3QCnRy6u"]],
        "cta": {"label": ctrl("aDvWJMYe5", "XhpeZnPQ4"), "href": ctrl("aDvWJMYe5", "irMOXbliE")},
    },
    "footer": {
        "emailLabel": text("pfzLLR13F"),
        "emailHref": node("OgVBfqyjt")["link"]["href"],
        "phoneLabel": text("MSfon9Twr"),
        # Framer's footer phone link still points at the template default (see README / report)
        "phoneHref": node("reFHU3wNN")["link"]["href"],
        "socialLabel": text("KGc2MzFHt"),
        "social": [
            {"network": "instagram", "href": ctrl("THypV6AKn", "hEtbsGkw_"), "icon": "/icons/phosphor-instagram-logo-fill.svg"},
            {"network": "tiktok", "href": ctrl("THypV6AKn", "YTJUUB2e2"), "icon": "/icons/phosphor-tiktok-logo-fill.svg"},
            {"network": "threads", "href": ctrl("THypV6AKn", "D15kjKjLI"), "icon": "/icons/phosphor-threads-logo-fill.svg"},
        ],
        "copyright": text("pcQF4KAGD"),
        "createdByLabel": text("eAsaVzV8V"),
        "createdByName": text("HRePcGy_H"),
        "createdByHref": node("HRePcGy_H")["link"]["href"],
    },
}

# ---------------------------------------------------------------- accordions


def accordion(comp_id):
    """Visible text of a *Accordion Wrap* component. Item N's title is read from the
    Closed variant (initial state); its 3 bullets from the 'Open - N' variant, the only
    state in which they are shown. Slot 4 ('Bullet Point' s53EF8MRD) is hidden in the
    open Service Accordion variant and is never read."""
    comp = COMPS[comp_id]
    vs = {v["name"]: v for v in comp["children"]}
    res = {}
    for grp in ["Desktop", "Tablet & Phone"]:
        closed = [c for c in vs[f"{grp} / Closed"]["children"] if c.get("$componentDisplayName") == "Service Accordion"]
        items = []
        for k, c in enumerate(closed):
            opened = [x for x in vs[f"{grp} / Open - {k + 1}"]["children"]
                      if x.get("$componentDisplayName") == "Service Accordion"][k]
            items.append({
                "title": c["$control__RrwMQDo7f"],
                "bullets": [opened["$control__P092R1VCI"], opened["$control__DRbn5a44Q"], opened["$control__SlgANDBKN"]],
            })
        res[grp] = items
    out = []
    for d, tp in zip(res["Desktop"], res["Tablet & Phone"]):
        item = {"title": d["title"], "bullets": d["bullets"]}
        ov = {}
        if tp["title"] != d["title"]:
            ov["title"] = tp["title"]
        if tp["bullets"] != d["bullets"]:
            ov["bullets"] = tp["bullets"]
        if ov:
            item["tabletPhone"] = ov
        out.append(item)
    return out


# ---------------------------------------------------------------- home
BADGE = image("badge-blitz.svg", alt="Blitz")
projects = [
    {"id": "envato", "href": node("APlmTa_Xt")["link"]["href"], "image": image(fill_of("RqyGF5GUq")),
     "badge": image(fill_of("qTZTqiicN")), "overlay": None},
    {"id": "life", "href": node("oAu3Mgp85")["link"]["href"], "image": image(fill_of("pTRohvdnk")), "badge": None, "overlay": None},
    {"id": "blitz", "href": node("Tma564rR_")["link"]["href"], "image": image(fill_of("sLaZklUwr")), "badge": BADGE, "overlay": None},
    {"id": "eye", "href": node("Soe6KcWwk")["link"]["href"], "image": image(fill_of("FDJTkdJlj")), "badge": None, "overlay": None},
    {"id": "demmers", "href": node("WSoDwp4u3")["link"]["href"], "image": image(fill_of("N1lekZsZP")),
     "badge": image(fill_of("JR_JABS3o")), "overlay": None},
    {"id": "kittl", "href": node("mM6gvjgD9")["link"]["href"], "image": image(fill_of("gM3gXSMsX")), "badge": None,
     "overlay": node("PPERuOzMp")["fill"]},
]
for p in projects:
    if p["badge"] is None:
        del p["badge"]
    if p["overlay"] is None:
        del p["overlay"]
# grid order per breakpoint, from the children order of 'Galley' in each breakpoint
CLIENT_TO_ID = {"APlmTa_Xt": "envato", "oAu3Mgp85": "life", "Tma564rR_": "blitz", "Soe6KcWwk": "eye",
                "WSoDwp4u3": "demmers", "mM6gvjgD9": "kittl"}


def project_order(bp):
    gal = node("jBNNyY9wA") if bp == "desktop" else replica(BP["home"][bp], "jBNNyY9wA")
    order = []
    for c in gal["children"]:
        if c.get("visible") is False:
            continue
        oid = c.get("$originalId") or c["id"]
        pid = CLIENT_TO_ID[oid]
        # Phone: the 'Client #1' slot shows its (desktop-hidden) Demmers frame and links to
        # the Demmers post, i.e. it is the Demmers project on that breakpoint.
        if bp == "phone" and oid == "APlmTa_Xt":
            assert c["link"]["href"] == node("WSoDwp4u3")["link"]["href"]
            pid = "demmers"
        order.append(pid)
    return order


logos_order = node("sRZTe4NZj")["$control__slots"]
LOGO_FRAMES = {
    "ZsfsQ9fRu": image(fill_of("wURMotUuM")), "RTNCLxfta": image(fill_of("dcb5ltvAO")),
    "SRxDtTDf_": image(fill_of("rV7ckoMI5")), "ZNFiWBA4L": image(fill_of("y_vDcCs5g")),
    "ldO_bqJSn": image(fill_of("jBxubjOlk")), "IDjKg2sYw": image("logo-moft.svg", alt="Moft"),
    "fVj30VdS7": image("logo-blitz.svg", alt="Blitz"), "qnWNcV4_w": image(fill_of("NccAEyuMX")),
}

form = COMPS["ZMWq6ryX_"]["children"][0]


def find(n, pred):
    if pred(n):
        return n
    for c in n.get("children", []) or []:
        r = find(c, pred)
        if r:
            return r
    return None


select = find(form, lambda n: n["type"] == "FormSelectNode")
home = {
    "hero": {
        "name": text("CZwNJ7je4"),
        "headingLeft": text("r4UIQp4HO"),
        "headingRight": text("FtXoZ9iF_"),
        "tagline": text("My9hL2B2W"),
        "avatarFront": image(fill_of("ZGEclVvOh")),
        "avatarBack": image(fill_of("XZtW_sCef")),
        "badge": {"text": text("vvHTPvWC4"), "lottie": "/lottie/hand-wave.json"},
    },
    "servicesIntro": {"heading": text("SMj6bFwiC"), "text": text("YUoSVPF9I")},
    "services": accordion("rJrFn94Y9"),
    "about": {
        "heading": text("T4k2l1bwi"),
        "word": text("wrSOwbw3s"),
        "phonetic": runs("jXtT9ceI0")[0]["text"],
        "partOfSpeech": runs("jXtT9ceI0")[2]["text"],
        "definition": text("eIvbWjjg0").split("\n")[0],
        "line": [r for r in runs("eIvbWjjg0")[1:]],
        "counters": [
            {"value": ctrl(i, "k4k7YmQcq"), "suffix": ctrl(i, "S0H9a8_hu"), "label": ctrl(i, "CSvrESaLr")}
            for i in ["QGp118YGP", "irBoYf_Rz", "GprZOHvF6"]
        ],
        "phoneCard": {"label": text("PxoSNDZvm"), "text": text("A_8KyUaSy"), "href": node("A_8KyUaSy")["link"]["href"]},
        "emailCard": {"label": text("iuoq51p1u"), "text": text("skJVLy6cr"), "href": node("skJVLy6cr")["link"]["href"]},
    },
    "collaboratorsIntro": {"heading": text("y8roXGHob"), "text": text("Rk4TwP0Ke")},
    "collaborators": [LOGO_FRAMES[s] for s in logos_order],
    "projectsIntro": {"heading": text("unUW3uYyu"), "text": text("CnDxVDlvZ")},
    "projects": projects,
    "projectOrder": {bp: project_order(bp) for bp in ["desktop", "tablet", "phone"]},
    "contact": {
        "heading": text("kezulE3TH"),
        "text": text("KICMCxCBZ"),
        "avatar": image(fill_of("o8M4FUKdl"), alt=node("o8M4FUKdl")["altText"]),
        "fields": {
            "name": {"label": text("MxjKOgWjQ"), "placeholder": node("bV8RiuevL")["formInputPlaceholder"], "inputName": node("bV8RiuevL")["formInputName"]},
            "email": {"label": text("FH3S7giR9"), "placeholder": node("v3ygIltwV")["formInputPlaceholder"], "inputName": node("v3ygIltwV")["formInputName"]},
            "service": {"label": text("ZnGGk60JJ"), "placeholder": select["formSelectOptions"][0]["title"], "inputName": select["formInputName"]},
            "message": {"label": text("K6sWKgxsB"), "placeholder": node("UN49MV6sR")["formInputPlaceholder"], "inputName": node("UN49MV6sR")["formInputName"]},
            "submit": ctrl("zDcFVo5DG", "gbYMQdKIa"),
        },
        "serviceOptions": [o["title"] for o in select["formSelectOptions"][1:]],
        "success": text("Gh18aqU9nCrDZGbtVi"),
        "error": text("p0ybcXT6SCrDZGbtVi"),
    },
}
assert [o["value"] for o in select["formSelectOptions"][1:]] == home["contact"]["serviceOptions"]

# ---------------------------------------------------------------- pricing


def pricing(lang, bpd, bpp, faq_comp, title, description):
    p = lambda i: replica(bpd, i) if bpd != "iaExKVmr3" else node(i)  # noqa: E731

    def t(i):
        return text(p(i)["id"])

    def ph(i):  # same node on the phone breakpoint
        return text(replica(bpp, i)["id"])

    def card(card_id, tier, count, price, desc, btn, label, pill=None, fill=None):
        c = {
            "name": t(tier), "videos": t(count), "price": t(price), "blurb": t(desc),
            "cta": t(label), "href": p(btn)["link"]["href"],
            "progress": p(fill)["width"],
            "featured": card_id == "ULqUKZBS0",
        }
        if pill:
            c["badge"] = t(pill)
        return c

    footnote = t("MUrI1vs2o")
    footnote_phone = ph("MUrI1vs2o")
    out = {
        "lang": lang,
        "title": title,
        "description": description,
        "intro": {"eyebrow": t("sLv5h2NLC"), "heading": t("aQB6BDD7I"), "text": t("uhNh8Z9gh")},
        "points": [
            {"number": t(n), "title": t(a), "body": t(b)}
            for n, a, b in [("rUF37bF_4", "Filz8ITMc", "I1KmSmt_V"), ("P1pdnoWFw", "pSdH7vybW", "q0GHQeK1o"),
                            ("kklj4at11", "Xa9b9VPZd", "GXOv6wvFV")]
        ],
        "processIntro": {"eyebrow": t("m_FVnUoFk"), "heading": t("EcMEk9poe")},
        "process": [
            {"number": t(n), "title": t(a), "body": t(b), "side": side}
            for n, a, b, side in [("JZ9lKdqR8", "y_10UcSj7", "SvefRI4YA", "left"), ("Ur6QNQEXO", "q5PLEGQOA", "MyRh4WeRp", "right"),
                                  ("Ka7pWyvNU", "QR_lskCtc", "Q08Dw8u1k", "left"), ("mJgIguxcU", "zKO5cd2YT", "r9VHczeZU", "right"),
                                  ("WVwY4lh6s", "lWG9RXEQH", "iXkCP_mXt", "left")]
        ],
        "faqIntro": {"eyebrow": t("cMiayWb7m"), "heading": t("j7feqRJch")},
        "faq": [{"q": i["title"], "lines": i["bullets"], **({"tabletPhone": {
            **({"q": i["tabletPhone"]["title"]} if "title" in i["tabletPhone"] else {}),
            **({"lines": i["tabletPhone"]["bullets"]} if "bullets" in i["tabletPhone"] else {})}} if "tabletPhone" in i else {})}
            for i in accordion(faq_comp)],
        "packagesIntro": {"eyebrow": t("mWnsMtfqk"), "heading": t("YyX6yRvUQ")},
        "packages": [
            card("Gw029DfQI", "qju2EW9QX", "A_3dJq3UI", "nLMrr6j4X", "CgFUyGVIW", "aGVY9xAz5", "oX1FeXHYJ", fill="l2ZzXdx_w"),
            card("L_7Q1l08E", "ed5e4nrNr", "rXhlCgHOU", "yfmruuUku", "HrV6cjVES", "yl7tXwP9f", "udndH4I0I", fill="vZlHZjNtD"),
            card("ULqUKZBS0", "ZQtRM7fM9", "FMdhGP0mo", "BruodKWxC", "AmVhA2sBm", "LCQtzSPI6", "v2BUZlIDj", pill="mLJSKicvJ", fill="OGxApqBRO"),
            card("dw8Proo0A", "uKV2puWlI", "gX21aKUDY", "N8AQ45WHn", "jqy5EMyNH", "WBgjBQNfL", "z1dhQ2KjW", fill="aUqgTCd2G"),
        ],
        "footnote": footnote,
        "cta": {"heading": t("h6wRyT4I4"), "text": t("s7ObMLJC1"),
                "label": p("mZJfTctOW")["$control__v6UsQ4OJm"], "href": p("mZJfTctOW")["$control__eI1zBfJVT"]},
    }
    if footnote_phone != footnote:
        out["footnotePhone"] = footnote_phone
    return out


# RO page node ids differ from EN (it is a duplicated page, not a replica): map by structure.
def ro_map():
    en = node("iaExKVmr3")
    ro = node("Y42cAw7ew")
    m = {}

    def walk(a, b):
        m[a["id"]] = b["id"]
        ca, cb = a.get("children", []) or [], b.get("children", []) or []
        assert len(ca) == len(cb), (a["id"], b["id"])
        for x, y in zip(ca, cb):
            assert x["type"] == y["type"]
            walk(x, y)

    walk(en, ro)
    return m


RO = ro_map()
pricing_en = pricing("en", "iaExKVmr3", "vD8B7E5FW", "ubjPQnPS8", site["title"], site["description"])


def pricing_ro():
    # Re-run the EN extraction with every EN id swapped for its RO twin.
    global node, replica
    real_node, real_replica = node, replica

    def node_ro(i):
        return real_node(RO.get(i, i))

    def replica_ro(bp, i):
        return real_replica(bp, RO.get(i, i))

    node, replica = node_ro, replica_ro
    orig_text, orig_runs = text, runs
    try:
        out = pricing(
            "ro", "Y42cAw7ew", "zC3UWWB6f", "bFAdQEipB",
            # The one intentional content addition (spec 2): Framer serves the English site
            # meta on /pricing-ro; this is a faithful Romanian translation of it.
            "Andrei Zavo | Videograf de promo și social media pentru branduri în creștere",
            "Sunt Andrei Zavo, videograf de promo și social media. Creez clipuri scurte, reels și conținut TikTok care ajută brandurile să crească, să-și implice publicul și să iasă în evidență online.",
        )
    finally:
        node, replica = real_node, real_replica
    return out


# text() / ctrl() look up IDX directly, so give them RO ids through node():
_text = text


def text(i, keep_trailing=False):  # noqa: F811
    return _text(node(i)["id"], keep_trailing)


pricing_ro_content = pricing_ro()

# ---------------------------------------------------------------- tokens
presets = {p["id"]: p for p in META["presets"]}
USED_PRESETS = ["djOUw0pzb", "TTqvVnbYq", "NxCe_AOfF", "ilUlJnLkH", "fEk4hlkXq", "UezruUh9E", "EBQDvGnCv", "JLWig38Pv", "L1yEr8kIk"]
BPKEY = {"default": "desktop", "medium": "tablet", "small": "phone"}


def px(v):
    if isinstance(v, (int, float)):
        return f"{v}px"
    return v


text_styles = {}
for pid in USED_PRESETS:
    p = presets[pid]
    name = re.sub(r"[^a-z0-9]+", "-", p["name"].lower()).strip("-")
    per = {}
    for k, b in p["breakpoint"].items():
        per[BPKEY[k]] = {"fontSize": px(b.get("fontSize", p.get("fontSize", 16))), "lineHeight": b["lineHeight"],
                         "letterSpacing": b.get("letterSpacing", p.get("letterSpacing", "0em")),
                         "paragraphSpacing": b["paragraphSpacing"]}
    for bp in ["desktop", "tablet", "phone"]:  # single-breakpoint presets apply everywhere
        per.setdefault(bp, per.get("tablet", per["desktop"]) if bp == "phone" else per["desktop"])
    style = {
        "framerId": pid,
        "framerName": p["name"],
        # 'Body Large' has no font set in Framer; Framer's default text font is Inter.
        "fontFamily": p.get("fontName", "Inter"),
        "fontWeight": p.get("fontWeight", 400),
        "fontStyle": p.get("fontStyle", "normal"),
        "textTransform": p.get("textTransform", "none"),
        "color": css_color(p["textColor"]),
        "breakpoints": per,
    }
    if "tag" in p:
        style["tag"] = p["tag"]
    text_styles[name] = style
PRESET_NAME = {v["framerId"]: k for k, v in text_styles.items()}

link_styles = {}
for lp in EXTRA["linkPresets"]:
    if lp["id"] in ("ZRloE2uUu", "B5iVuQtXN", "HH0lrxgrI"):
        name = {"ZRloE2uUu": "default", "B5iVuQtXN": "footer", "HH0lrxgrI": "footer-underline"}[lp["id"]]
        L = lp["link"]
        link_styles[name] = {
            "color": css_color(L["textColor"]), "decoration": L["textDecoration"],
            "hoverColor": css_color(L["hover"]["textColor"]), "hoverDecoration": L["hover"]["textDecoration"],
            "motion": "link.hover",
        }

# spacing / radii actually used on the three pages + template + used components
gaps, pads, radii = set(), set(), set()


def collect(n):
    if n.get("visible") is False:
        return
    for k, s in (("gap", gaps), ("padding", pads), ("radius", radii)):
        v = n.get(k)
        if isinstance(v, str):
            s.add(v)
    for c in n.get("children", []) or []:
        collect(c)


for page in ("home", "pricing", "template"):
    for bid in BP[page].values():
        collect(node(bid))


def sort_px(s):
    def key(v):
        m = re.findall(r"-?[\d.]+", v)
        return [float(x) for x in m] if m else [0]
    return sorted(s, key=key)


tokens = {
    "breakpoints": [
        {"name": "desktop", "minWidth": 1200, "maxWidth": None, "frameWidth": 1200, "media": "(min-width: 1200px)"},
        {"name": "tablet", "minWidth": 810, "maxWidth": 1199.98, "frameWidth": 810, "media": "(min-width: 810px) and (max-width: 1199.98px)"},
        {"name": "phone", "minWidth": 0, "maxWidth": 809.98, "frameWidth": 390, "media": "(max-width: 809.98px)"},
    ],
    "colorScheme": "light dark",
    "colors": TOKENS,
    "fonts": [
        {"family": "Antonio", "weights": [400, 700], "source": "Google Fonts (self-host)"},
        {"family": "Inter", "weights": [300, 500, 600], "source": "Google Fonts (self-host)"},
    ],
    "text": text_styles,
    "link": link_styles,
    "space": {"gaps": sort_px(gaps), "paddings": sort_px(pads)},
    "radii": sort_px(radii),
    "shadows": {
        "card-hover": "0px 14px 30px 0px rgba(32, 31, 26, 0.08)",
        "card-featured-hover": "0px 16px 34px 0px rgba(32, 31, 26, 0.22)",
    },
}
# Body Large (Hi badge text) only uses 'fontSize'; keep its breakpoint list complete
assert all(set(s["breakpoints"]) == {"desktop", "tablet", "phone"} for s in text_styles.values())

# ---------------------------------------------------------------- motion


def sec(v):
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str) and v.endswith("s"):
        return float(v[:-1])
    raise ValueError(v)


def transition(t):
    if t["type"] == "spring":
        o = {"type": "spring"}
        for k in ("stiffness", "damping", "mass", "bounce"):
            if k in t:
                o[k] = t[k]
        if "duration" in t:
            o["duration"] = sec(t["duration"])
        if "delay" in t:
            o["delay"] = sec(t["delay"])
        if "stagger" in t and sec(t["stagger"]) != 0:
            o["stagger"] = sec(t["stagger"])
        return o
    if t["type"] == "tween":
        o = {"type": "tween", "duration": sec(t["duration"]), "ease": t["ease"]}
        if "delay" in t:
            o["delay"] = sec(t["delay"])
        return o
    if t["type"] is False:
        return {"type": "instant"}
    raise ValueError(t)


def num(v):
    if isinstance(v, (int, float)):
        return v
    m = re.match(r"^(-?[\d.]+)(px|deg)?$", v.strip())
    if not m:
        raise ValueError(v)
    f = float(m.group(1))
    return int(f) if f.is_integer() else f


def pose(e):
    """Framer effect state -> transform values (numbers in px / deg)."""
    o = {}
    for k in ("opacity", "x", "y", "scale", "rotateX", "rotateY", "skewX", "skewY"):
        if k in e:
            o[k] = num(e[k])
    if "rotate" in e:
        parts = str(e["rotate"]).split()
        if len(parts) == 3:
            o["rotateX"], o["rotateY"], o["rotate"] = (num(x) for x in parts)
        else:
            o["rotate"] = num(parts[0])
    if "shadow" in e:
        o["boxShadow"] = e["shadow"]
    if "backgroundColor" in e:
        o["backgroundColor"] = css_color(e["backgroundColor"])
    return o


IDENTITY = {"opacity": 1, "x": 0, "y": 0, "scale": 1, "rotate": 0, "rotateX": 0, "rotateY": 0, "skewX": 0, "skewY": 0}


def appear(node_id, element, page, section):
    a = must_visible(node_id)["appearEffect"]
    assert a["enter"] == a["exit"], node_id
    return {
        "kind": "appear", "element": element, "page": page, "section": section, "framerNodeId": node_id,
        # onScrollTarget = Framer 'Section in view': fires when the element's scroll section (its timeline row) enters
        "trigger": {"onMount": "load", "onScrollTarget": "sectionInView", "onInView": "inView"}[a["trigger"]],
        "threshold": a["threshold"], "replay": bool(a.get("replay", False)),
        "from": pose(a["enter"]), "to": dict(IDENTITY),
        "transition": transition(a["enter"]["transition"]),
    }


TARGETS = {
    "Rd4N98ip7": "Home 'Service' section (#service)",
    "z940ZBfKS": "Home 'About' section (#about)",
    "fsscpsFUj": "MISSING in Framer (node no longer exists)",
    "D5Jb3fIsM": "Pricing timeline row 01 (#process-step-1)",
    "soZnxaBEC": "Pricing timeline row 02 (#process-step-2)",
    "u_jraBzMP": "Pricing timeline row 03 (#process-step-3)",
    "UDJZoUjQt": "Pricing timeline row 04 (#process-step-4)",
    "dzB1LDzRy": "Pricing timeline row 05 (#process-step-5)",
}


def sections(st):
    out = []
    for s in st["sections"]:
        o = {"at": "start"} if "target" not in s else {"at": "target", "target": {"framerNodeId": s["target"], "description": TARGETS[s["target"]]}}
        o["pose"] = pose(s)
        out.append(o)
    return out


avatar_st = {bp: replica(BP["home"][bp], "rwG3sNdPR").get("styleTransformEffect") for bp in ("desktop", "tablet", "phone")}
badge_st = node("Bs_FAjTcc")["styleTransformEffect"]


def variant_diff(a, b, path="", inherit=None):
    """Property differences between two variant trees (matched by position). Gesture
    variants (hover/pressed) inherit from their primary: a key missing there is unchanged."""
    if inherit is None:
        inherit = bool(b.get("gesture"))
    diffs = {}
    skip = {"id", "children", "left", "top", "$inheritsFrom", "gesture", "name", "$originalId", "$replicaId",
            "$groundNodeId", "$scopeId", "$rect", "$isPrimary", "$isReplica", "$parentId", "onTap", "onAppear", "htmlTag",
            "transition", "$componentDisplayName", "customCursor"}
    keys = (set(a) | set(b)) - skip
    d = {}
    for k in sorted(keys):
        if k.startswith("$control__"):
            continue
        if inherit and k not in b:
            continue
        va, vb = a.get(k), b.get(k)
        if k == "opacity":  # absent means 1
            va, vb = 1 if va is None else va, 1 if vb is None else vb
        if k == "visible":  # absent means visible
            va, vb = va is not False, vb is not False
        if k in ("rotation", "rotateZ"):  # absent means 0deg
            va, vb = va or "0deg", vb or "0deg"
        if va != vb:
            d[k] = [css_color(va), css_color(vb)]
    label = (path + "/" + (a.get("name") or a["type"].replace("Node", ""))).lstrip("/")
    if d:
        diffs[label] = d
    for x, y in zip(a.get("children", []) or [], b.get("children", []) or []):
        diffs.update(variant_diff(x, y, label, inherit))
    return diffs


def variant_of(comp, name, gesture=None):
    for v in COMPS[comp]["children"]:
        if v["name"] == name and v.get("gesture") == gesture:
            return v
    raise KeyError((comp, name, gesture))


def comp_transition(comp, name, gesture=None):
    return transition(variant_of(comp, name, gesture)["transition"])


acc_closed = variant_of("R2GwKZ_X8", "Desktop / Closed")
acc_open = variant_of("R2GwKZ_X8", "Desktop / Open")
acc_hover = variant_of("R2GwKZ_X8", "Desktop / Closed", "hover")
acc_tp_closed = variant_of("R2GwKZ_X8", "Tablet & Phone / Closed")
acc_tp_open = variant_of("R2GwKZ_X8", "Tablet & Phone / Open")
counter = node("urtqdFyEC")
ticker = node("sRZTe4NZj")
ticker_phone = node("O245HjtxdsRZTe4NZj")
page_fx = node("WQLkyLRf1")["pageEffects"]["all"]
nav_tpl = node("thwdkYYsh")

line_fills = []
for row, lid in [("D5Jb3fIsM", "x2tDqmICZ"), ("soZnxaBEC", "fKgEDWlJl"), ("u_jraBzMP", "jwq8ngyIS"), ("UDJZoUjQt", "aV6Pw2CGc")]:
    st = must_visible(lid)["styleTransformEffect"]
    assert st["sections"][1]["target"] == row
    line_fills.append({"row": TARGETS[row], "framerNodeId": lid, "sections": sections(st)})

row_content = [("NXKlKLn2_", 1), ("xd6qseZA2", 2), ("h4e4GuWXD", 3), ("ociXa5Zz4", 4), ("zIoEwZZJn", 5)]
row_dots = [("jc3EGQNxk", 1), ("eHfWXARFh", 2), ("iLXa6KmLn", 3), ("zSO704EZ3", 4), ("dqZTM93fl", 5)]

motion = {
    "page": {
        "kind": "page", "element": "Every page (primary breakpoint pageEffects.all)", "page": "all", "section": "page",
        "framerNodeId": "WQLkyLRf1",
        "enter": {"from": pose(page_fx["enter"]), "to": dict(IDENTITY), "transition": transition(page_fx["enter"]["transition"])},
        "exit": {"to": pose(page_fx["exit"]), "transition": transition(page_fx["exit"]["transition"])},
        "transition": transition(page_fx["enter"]["transition"]),
    },
    "smoothScroll": {
        "kind": "smoothScroll", "element": "Smooth Scroll component (one instance per page)", "page": "all", "section": "page",
        "framerNodeId": "IvmHhEgzx",
        "intensity": node("IvmHhEgzx")["$control__intensity"],
        "perPage": {"home": node("IvmHhEgzx")["$control__intensity"], "pricing": node("e1bAsp22t")["$control__intensity"],
                    "pricingRo": node(RO["e1bAsp22t"])["$control__intensity"]},
        "transition": {"type": "instant"},
    },
    "home.hero.sticky": {
        "kind": "sticky", "element": "Sticky Container holding the flipping avatar card", "page": "home", "section": "hero",
        "framerNodeId": "FGqFXGOHD", "top": node("FGqFXGOHD")["positionStickyTop"],
        "containerHeight": node("FGqFXGOHD")["height"], "trackHeight": node("y_hBktkYW")["height"],
        "note": "Sticky Wrap (300vh) and the absolutely positioned 'Content' column (hero, service, about sections, 100vh each) overlap; the avatar stays pinned while the three sections scroll past.",
        "transition": {"type": "instant"},
    },
    "home.avatar.appear": appear("rwG3sNdPR", "Avatar card (flip card with portrait front / photo back) in the sticky hero", "home", "hero"),
    "home.avatar.scroll": {
        "kind": "scroll", "element": "Avatar card wrapper (rotates/moves as Service and About scroll in)", "page": "home", "section": "hero",
        "framerNodeId": "rwG3sNdPR", "trigger": "scrollTarget", "viewport": avatar_st["desktop"]["viewport"],
        "sections": sections(avatar_st["desktop"]),
        "breakpointSections": {"tablet": sections(avatar_st["tablet"]), "phone": None},
        "transition": transition(avatar_st["desktop"]["transition"]),
    },
    "home.hero.left.appear": appear("ylmXIg_32", "Hero heading left ('Andrei Zavo' / 'Video')", "home", "hero"),
    "home.hero.right.appear": appear("Ln0cv0Auo", "Hero heading right ('Producer' + tagline)", "home", "hero"),
    "home.badge.scroll": {
        "kind": "scroll", "element": "Purple 'Hi' circle badge on the hero avatar card (Circle Badge Ib7Yaza05). The contact-section badge (mYSICkfKR) has no section targets set, so it stays static.",
        "page": "home", "section": "hero", "framerNodeId": "Ib7Yaza05", "trigger": "scrollTarget", "viewport": badge_st["viewport"],
        "sections": [
            {"at": "start", "pose": pose(badge_st["sections"][0])},
            {"at": "target", "target": {"framerNodeId": "Rd4N98ip7", "description": TARGETS["Rd4N98ip7"]}, "pose": pose(badge_st["sections"][1])},
            {"at": "target", "target": {"framerNodeId": "fsscpsFUj", "description": TARGETS["fsscpsFUj"]}, "pose": pose(badge_st["sections"][2])},
        ],
        "transition": transition(badge_st["transition"]),
    },
    "home.badge.cycle": {
        "kind": "variant", "element": "Circle Badge Animate: 60px window that slides between the text 'Hi' (top) and the waving-hand Lottie (bottom)",
        "page": "home", "section": "hero", "framerNodeId": "XNap6uYIo",
        "cycle": [
            {"variant": "Hi", "shows": "text", "stackDistribution": node("MfMv4zSf8")["stackDistribution"],
             "holdSeconds": sec(node("MfMv4zSf8")["onAppear"][0]["delay"])},
            {"variant": "Hand Waving", "shows": "lottie", "stackDistribution": node("IBLDLyt9u")["stackDistribution"],
             "holdSeconds": sec(node("IBLDLyt9u")["onAppear"][0]["delay"])},
        ],
        "loop": True,
        "lottie": {"src": "/lottie/hand-wave.json", "loop": node("QbFYFZ1n3")["$control__loop"], "speed": node("QbFYFZ1n3")["$control__speed"],
                   "color1": css_color(node("QbFYFZ1n3")["$control__color1"]), "color2": css_color(node("QbFYFZ1n3")["$control__color2"])},
        "transition": transition(node("MfMv4zSf8")["transition"]),
    },
    "home.counter": {
        "kind": "counter", "element": "Number Card counters (5 / 100+ / 20+) in the About section", "page": "home", "section": "about",
        "framerNodeId": "urtqdFyEC", "trigger": "inView", "replay": counter["$control__animation"]["replay"],
        "start": counter["$control__start"], "decimals": counter["$control__decimals"], "commas": counter["$control__commas"],
        "font": {"desktop": counter["$control__font"], "phone": node("jnBlTqivcurtqdFyEC")["$control__font"]},
        "color": css_color(counter["$control__color"]["color"]),
        "transition": transition(counter["$control__transition"]),
    },
    "home.services.accordion": {
        "kind": "variant", "element": "Service Accordion items (one open at a time; click toggles)", "page": "home", "section": "service",
        "framerNodeId": "rJrFn94Y9",
        "states": {"desktop": variant_diff(acc_closed, acc_open), "tabletPhone": variant_diff(acc_tp_closed, acc_tp_open)},
        "hover": variant_diff(acc_closed, acc_hover),
        "transition": comp_transition("rJrFn94Y9", "Desktop / Closed"),
    },
    "home.logos.marquee": {
        "kind": "marquee", "element": "Logo Carrousel (Ticker) in 'Some of my collaborators'", "page": "home", "section": "collaborators",
        "framerNodeId": "sRZTe4NZj",
        "speed": ticker["$control__speed"], "direction": ticker["$control__direction"], "gap": ticker["$control__gap"],
        "padding": ticker["$control__padding"], "alignment": ticker["$control__alignment"], "hoverFactor": ticker["$control__hoverFactor"],
        "fade": ticker["$control__fadeOptions"], "height": ticker["height"],
        "phone": {"width": ticker_phone["width"], "speed": ticker_phone["$control__speed"], "gap": ticker_phone["$control__gap"]},
        "transition": {"type": "instant"},
    },
    "pricing.timeline.lineFill": {
        "kind": "scroll", "element": "Purple 'Line Fill' inside each grey timeline line; slides from y -180px to 0 as its row reaches the viewport middle",
        "page": "pricing", "section": "process", "framerNodeId": "x2tDqmICZ", "trigger": "scrollTarget", "viewport": "middle",
        "sections": line_fills[0]["sections"], "rows": line_fills,
        "transition": {"type": "instant"},
        "note": "Scroll-linked (no spring set in Framer). Row 05 has no visible line. On /pricing-ro Framer's section targets still point at the EN page rows; use the RO page's own rows.",
    },
    "pricing.timeline.row.appear": {
        **appear("NXKlKLn2_", "Timeline row text block (title + body)", "pricing", "process"),
        "rows": [{"row": k, "framerNodeId": i, "from": pose(must_visible(i)["appearEffect"]["enter"]),
                  "threshold": must_visible(i)["appearEffect"]["threshold"]} for i, k in row_content],
    },
    "pricing.timeline.dot.appear": {
        **appear("jc3EGQNxk", "Timeline numbered dot (48px circle)", "pricing", "process"),
        "rows": [{"row": k, "framerNodeId": i} for i, k in row_dots],
    },
    "pricing.card.hover": {
        "kind": "hover", "element": "Pricing cards Test / Starter / Premium", "page": "pricing", "section": "packages",
        "framerNodeId": "Gw029DfQI", "to": pose(node("Gw029DfQI")["hoverEffect"]),
        "transition": transition(node("Gw029DfQI")["hoverEffect"]["transition"]),
    },
    "pricing.card.featured.hover": {
        "kind": "hover", "element": "Featured pricing card Growth", "page": "pricing", "section": "packages",
        "framerNodeId": "ULqUKZBS0", "to": pose(node("ULqUKZBS0")["hoverEffect"]),
        "transition": transition(node("ULqUKZBS0")["hoverEffect"]["transition"]),
    },
    "pricing.button.hover": {
        "kind": "hover", "element": "Outline 'Book …' buttons (Test / Starter / Premium)", "page": "pricing", "section": "packages",
        "framerNodeId": "aGVY9xAz5", "to": pose(node("aGVY9xAz5")["hoverEffect"]),
        "transition": transition(node("aGVY9xAz5")["hoverEffect"]["transition"]),
    },
    "pricing.button.featured.hover": {
        "kind": "hover", "element": "Filled 'Book Growth' button", "page": "pricing", "section": "packages",
        "framerNodeId": "LCQtzSPI6", "to": pose(node("LCQtzSPI6")["hoverEffect"]),
        "transition": transition(node("LCQtzSPI6")["hoverEffect"]["transition"]),
    },
    "pricing.faq.accordion": {
        "kind": "variant", "element": "FAQ accordion (Questions Accordion Wrap / RO); same Service Accordion items", "page": "pricing", "section": "faq",
        "framerNodeId": "ubjPQnPS8",
        "states": {"desktop": variant_diff(acc_closed, acc_open), "tabletPhone": variant_diff(acc_tp_closed, acc_tp_open)},
        "hover": variant_diff(acc_closed, acc_hover),
        "transition": comp_transition("ubjPQnPS8", "Desktop / Closed"),
    },
    "button.primary.hover": {
        "kind": "hover", "element": "Primary Button (pricing CTA 'Let’s work together'): purple circle grows from the bottom-left corner, label turns white",
        "page": "pricing", "section": "cta", "framerNodeId": "QtnGPi4Hi",
        "states": variant_diff(variant_of("QtnGPi4Hi", "Desktop"), variant_of("QtnGPi4Hi", "Desktop", "hover")),
        "transition": comp_transition("QtnGPi4Hi", "Desktop", "hover"),
    },
    "button.secondary.hover": {
        "kind": "hover", "element": "Secondary Button (nav 'Contact')", "page": "all", "section": "nav", "framerNodeId": "l1lRiQK3K",
        "states": variant_diff(variant_of("l1lRiQK3K", "Desktop"), variant_of("l1lRiQK3K", "Desktop", "hover")),
        "transition": comp_transition("l1lRiQK3K", "Desktop", "hover"),
    },
    "button.submit.hover": {
        "kind": "hover", "element": "Contact form Submit button (hover)", "page": "home", "section": "contact", "framerNodeId": "CXG4KfCnd",
        "states": variant_diff(variant_of("CXG4KfCnd", "Desktop"), variant_of("CXG4KfCnd", "Desktop", "hover")),
        "pressed": variant_diff(variant_of("CXG4KfCnd", "Desktop"), variant_of("CXG4KfCnd", "Desktop", "pressed")),
        "transition": comp_transition("CXG4KfCnd", "Desktop", "hover"),
    },
    "button.submit.spinner": {
        "kind": "loop", "element": "Submit button loading spinner (conic gradient, masked ring)", "page": "home", "section": "contact",
        "framerNodeId": "EKlpffxntm2_RmyTVm",
        "to": {"rotate": node("EKlpffxntm2_RmyTVm")["loopEffect"]["rotate"]}, "repeat": node("EKlpffxntm2_RmyTVm")["loopEffect"]["repeatType"],
        "transition": transition(node("EKlpffxntm2_RmyTVm")["loopEffect"]["transition"]),
    },
    "nav.link.hover": {
        "kind": "hover", "element": "Nav Link (Home / About / Collabs / Projects / Available for work)", "page": "all", "section": "nav",
        "framerNodeId": "nvfIJTuv1",
        "states": variant_diff(variant_of("nvfIJTuv1", "Desktop"), variant_of("nvfIJTuv1", "Desktop", "hover")),
        "transition": comp_transition("nvfIJTuv1", "Desktop", "hover"),
    },
    "nav.scroll": {
        "kind": "scrollVariant", "element": "Floating nav pill: collapses to avatar + status when scrolling down (desktop); tap avatar to reopen",
        "page": "all", "section": "nav", "framerNodeId": "thwdkYYsh",
        "trigger": nav_tpl["scrollVariantEffect"]["trigger"], "direction": nav_tpl["scrollVariantEffect"]["direction"],
        "replay": nav_tpl["scrollVariantEffect"]["replay"],
        "states": {"desktop": variant_diff(variant_of("AGb8tzb9V", "Desktop / Open"), variant_of("AGb8tzb9V", "Desktop / Closed")),
                   "tabletPhone": variant_diff(variant_of("AGb8tzb9V", "Tablet & Phone / Closed"), variant_of("AGb8tzb9V", "Tablet & Phone / Open"))},
        "note": "Desktop starts Open and switches to Closed on scroll down. Tablet/phone start in 'Tablet & Phone / Closed' (links hidden) and have no scroll effect.",
        "transition": comp_transition("AGb8tzb9V", "Desktop / Open"),
    },
    "nav.status.glow": {
        "kind": "variant", "element": "Green availability dot glow next to 'Available for work' (Avatar Status)", "page": "all", "section": "nav",
        "framerNodeId": "Zpq26dbNS", "loop": True,
        "states": variant_diff(variant_of("Zpq26dbNS", "Desktop / Available"), variant_of("Zpq26dbNS", "Desktop / Available Glow")),
        "holdSeconds": sec(node("VSa0MwIgM")["onAppear"][0]["delay"]),
        "transition": comp_transition("Zpq26dbNS", "Desktop / Available Glow"),
        "returnTransition": comp_transition("Zpq26dbNS", "Desktop / Available"),
    },
    "link.hover": {
        "kind": "hover", "element": "Inline text links (phone / email cards)", "page": "home", "section": "about", "framerNodeId": "ZRloE2uUu",
        "to": {"color": link_styles["default"]["hoverColor"]},
        "transition": transition([lp for lp in EXTRA["linkPresets"] if lp["id"] == "ZRloE2uUu"][0]["link"]["transition"]),
    },
    "cursor": {
        "kind": "cursor", "element": "Custom cursor (desktop breakpoint only)", "page": "all", "section": "page", "framerNodeId": "WbNejK37I",
        "default": {"size": 16, "fill": css_color(node("HcdR6zACl")["fill"]), "radius": node("HcdR6zACl")["radius"]},
        "blending": {"size": 16, "fill": css_color(node("GqW150rHi")["fill"]), "blendMode": node("GqW150rHi")["blendingMode"],
                     "usedOn": ["nav pill", "footer", "contact form submit button"]},
        "follow": tpl["customCursor"]["follow"], "offsetX": num(tpl["customCursor"]["offsetX"]), "offsetY": num(tpl["customCursor"]["offsetY"]),
        "placement": tpl["customCursor"]["placement"], "alignment": tpl["customCursor"]["alignment"],
        "transition": transition(node("HcdR6zACl")["transition"]),
    },
}

# ---------------------------------------------------------------- layout
LAYOUT_KEYS = [
    "htmlTag", "elementId", "position", "top", "right", "bottom", "left", "centerAnchorX", "centerAnchorY", "zIndex",
    "width", "height", "minHeight", "maxWidth", "aspectRatio",
    "layout", "stackDirection", "stackDistribution", "stackAlignment", "stackWrapEnabled", "gap", "padding",
    "gridColumnCount", "gridRowCount", "gridColumnMinWidth", "gridRowHeight", "gridRowHeightType", "gridAlignment",
    "gridItemColumnSpan", "gridItemHorizontalAlignment", "gridItemVerticalAlignment",
    "overflow", "overflowX", "fill", "fillImagePositionX", "fillImagePositionY", "opacity", "radius",
    "radiusTopLeft", "radiusTopRight", "radiusBottomRight", "radiusBottomLeft",
    "border", "borderColor", "borderStyle", "borderWidth", "borderTop", "borderRight", "borderBottom", "borderLeft",
    "rotation", "rotateX", "rotateY", "translateZ", "perspective", "preserve3d", "backfaceVisibility",
    "transformOriginX", "transformOriginY", "blendingMode", "backgroundBlur", "positionStickyTop", "cursor", "scrollMarginTop",
    "x", "y",
]
TEXT_KEYS = ["tag", "textAlignment", "textColor", "textTransform", "textWrap", "textVerticalAlignment", "width", "height",
             "maxWidth", "position", "top", "right", "bottom", "left", "zIndex", "fontName", "fontSize", "fontWeight",
             "letterSpacing", "lineHeight", "openTypeFontFeatures"]


FORM_KEYS = ["fontName", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "textColor", "formInputPlaceholderColor",
             "formInputFocusedBorder", "formInputIconColor", "formTextInputType", "formTextAreaResizable", "formInputRequired"]


def layout_value(k, v):
    if k in ("rotation", "rotateZ") and v == "0deg":
        return None
    if k == "fill" and isinstance(v, str) and v.startswith("data:framer/asset-reference"):
        h = asset_hash(v)
        return "/images/" + IMAGES[h][0] if h in IMAGES else None
    if k == "openTypeFontFeatures":
        return " ".join(f for f, on in v.items() if on == "on")
    if isinstance(v, (str, int, float, bool)):
        return css_color(v)
    return None


def zero_radius(props):
    for k in ("radiusTopLeft", "radiusTopRight", "radiusBottomRight", "radiusBottomLeft"):
        if props.get(k) == props.get("radius"):
            props.pop(k, None)
    for k in ("borderTop", "borderRight", "borderBottom", "borderLeft"):
        if "border" in props and props.get(k) == props.get("borderWidth"):
            props.pop(k, None)


VECTOR_FILES = {"ekMei1Y5u": "/images/logo-moft.svg", "cfGYNhY23": "/images/logo-blitz.svg", "PEZDcLysE": "/images/badge-blitz.svg"}


def layout_node(n):
    if n.get("visible") is False:
        return None
    t = n["type"]
    oid = n.get("$originalId") or n["id"]
    base = {"name": n.get("name") or t.replace("Node", ""), "framerId": oid}
    if t == "RichTextNode":
        props = {k: layout_value(k, n[k]) for k in TEXT_KEYS if k in n}
        props = {k: v for k, v in props.items() if v is not None}
        txt = "".join("".join(r.get("text", "") for r in b.get("children", [])) for b in n.get("children", []) or [])
        if not txt and isinstance(n.get("text"), dict):
            txt = "{control:" + n["text"].get("id", "") + "}"
        out = {**base, "kind": "text"}
        if n.get("textStylePreset"):
            out["preset"] = PRESET_NAME.get(n["textStylePreset"], n["textStylePreset"])
        out["preview"] = txt[:48]
        out["props"] = props
        return out
    if t in ("ShapeGroupNode", "BooleanShapeNode", "RectangleShapeNode", "PathNode"):
        props = {k: layout_value(k, n[k]) for k in LAYOUT_KEYS if k in n}
        props = {k: v for k, v in props.items() if v is not None}
        src = VECTOR_FILES.get(oid) or ("/images/play-icon.svg" if n.get("name") == "play icon" else None)
        out = {**base, "kind": "vector", "props": props}
        if src:
            out["src"] = src
        return out
    keys = LAYOUT_KEYS + (FORM_KEYS if t.startswith("Form") else [])
    props = {k: layout_value(k, n[k]) for k in keys if k in n}
    props = {k: v for k, v in props.items() if v is not None}
    zero_radius(props)
    if t.startswith("Form"):
        base["kind"] = "input"
    out = {"kind": "frame", **base, "props": props}
    if t == "ComponentInstanceNode":
        out["kind"] = "component"
        out["component"] = n.get("$componentDisplayName")
        if "$control__variant" in n:
            out["variant"] = variant_name(n["component"], n["$control__variant"]) if n.get("component") in COMPS else n["$control__variant"]
        return out
    if oid in VECTOR_FILES:
        out["kind"] = "vector"
        out["src"] = VECTOR_FILES[oid]
        return out
    if isinstance(n.get("fill"), str) and n["fill"].startswith("data:"):
        out["kind"] = "image"
    kids = [layout_node(c) for c in n.get("children", []) or []]
    kids = [k for k in kids if k]
    if kids:
        out["children"] = kids
    return out


def variant_name(comp, vid):
    for v in COMPS[comp].get("$variants", []):
        if v["id"] == vid:
            return v["name"]
    return vid


USED_COMPONENTS = {
    "Service Accordion Wrap": "rJrFn94Y9", "Service Accordion": "R2GwKZ_X8", "Service Bullet Point": "wgE4xF2So",
    "Number Card": "nh6yvBpJu", "Circle Badge": "c6u4zLoAj", "Circle Badge Animate": "XNap6uYIo",
    "Phone Info Card": "YHVFtKKGl", "Email Info Card": "Uu9UKaNP4", "Logo Carrousel": "CczggbDZK",
    "Contact Form": "ZMWq6ryX_", "Submit Button": "CXG4KfCnd", "Questions Accordion Wrap": "ubjPQnPS8",
    "Primary Button": "QtnGPi4Hi", "Nav": "AGb8tzb9V", "Nav Link": "nvfIJTuv1", "Secondary Button": "l1lRiQK3K",
    "Avatar Status": "Zpq26dbNS", "Footer": "avDWc9G7y", "Custom Cursor": "WbNejK37I",
}


def root_layout(n):
    """Breakpoint / variant roots: drop their canvas position (left/top on the Framer canvas)."""
    out = layout_node(n)
    for k in ("left", "top", "x", "y"):
        out["props"].pop(k, None)
    return out


def comp_layout(cid):
    out = {}
    for v in COMPS[cid]["children"]:
        key = v["name"] + (" [" + v["gesture"] + "]" if v.get("gesture") else "")
        ln = root_layout(v) if v.get("visible") is not False else None
        if ln:
            out[key] = ln
    return out


layout = {
    "note": "Generated from Framer node attributes (docs/extraction/transform.py). Hidden layers are omitted per breakpoint. "
            "Colours are CSS variables named after content/tokens.json colours; text nodes carry a 'preview' only for orientation "
            "(content comes from content/*.json). '/pricing-ro' has the identical structure to '/pricing'.",
    "pages": {page: {bp: root_layout(node(bid)) for bp, bid in BP[page].items()} for page in ("home", "pricing", "template")},
    "components": {name: comp_layout(cid) for name, cid in USED_COMPONENTS.items()},
}

# ---------------------------------------------------------------- write


def walk_strings(o, acc):
    if isinstance(o, str):
        acc.append(o)
    elif isinstance(o, dict):
        for v in o.values():
            walk_strings(v, acc)
    elif isinstance(o, list):
        for v in o:
            walk_strings(v, acc)
    return acc


FORBIDDEN = ["Interaction design and micro-animations", "Brand strategy", "UI/UX design", "Typography and color scheme",
             "Visual style guide", "Wireframing", "+1 (555)"]
files = {"site.json": site, "home.json": home, "pricing.en.json": pricing_en, "pricing.ro.json": pricing_ro_content,
         "tokens.json": tokens, "motion.json": motion, "layout.json": layout}
os.makedirs(OUT, exist_ok=True)
for fname, data in files.items():
    if fname in ("site.json",):
        strings = [s for s in walk_strings(data, []) if s != data["footer"]["phoneHref"]]
    else:
        strings = walk_strings(data, [])
    for s in strings:
        for f in (FORBIDDEN if fname not in ("layout.json", "motion.json") else FORBIDDEN[:3]):
            assert f not in s, (fname, f, s)
    with open(os.path.join(OUT, fname), "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print("wrote", fname, os.path.getsize(os.path.join(OUT, fname)), "bytes")
