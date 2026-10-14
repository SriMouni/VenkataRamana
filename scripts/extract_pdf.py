"""Extract stories from Ramana.pdf into data/stories.json.

Usage: python scripts/extract_pdf.py "C:/path/to/Ramana.pdf"
"""
import json, re, sys, pathlib
import pypdf

CONS = "\u0C15-\u0C39\u0C58-\u0C5A"           # Telugu consonants
SIGNS = "\u0C3E-\u0C4C\u0C55\u0C56\u0C01-\u0C03"  # vowel signs, anusvara, visarga
VIRAMA = "\u0C4D"

def fix_lost_glyphs(t: str) -> str:
    """pypdf turns some glyphs it can't map into NUL characters; restore them from context."""
    t = t.replace("\U000F06A6", "🙏")  # private-use glyph used for the folded-hands emoji
    # Raw (pre-reorder) spellings of words whose lost glyph can't be inferred by a rule.
    fixed_words = {
        "సా\0్ట": "సాఫ్ట్", "గి\0్ట": "గిఫ్ట్", "ప్రత్రే\0క": "ప్రత్యేక",
        "దిగా\0\0ంతి": "దిగ్భ్రాంతి", "ఇనా్నళ\0్ళ": "ఇనా్నళూ్ళ",
    }
    for bad, good in fixed_words.items():
        t = t.replace(bad, good)
    t = t.replace("ె\0", "ై")                       # ె + lost mark = ై   (రె⊘తు -> రైతు)
    t = t.replace(f"{VIRAMA}ట\0", f"{VIRAMA}ట{VIRAMA}ర")      # ఎలకి్ట⊘కల్ -> ఎలక్ట్రికల్
    t = re.sub(r"\0\0(?=[^\0])", "క్షా", t)                    # ప⊘⊘న -> పక్షాన
    t = re.sub(f"\0(?=[{SIGNS}])", "క్ష", t)                   # ర⊘ించ -> రక్షించ
    # ళ⊘్ళ: a lost vowel sign; ఊళ్ళో after ఊ, otherwise ే (వాళ్ళేందరో, కొన్నాళ్లే).
    t = re.sub(f"(ఊ?)ళ\0{VIRAMA}([{CONS}])",
               lambda m: f"{m.group(1)}ళ{'ో' if m.group(1) else 'ే'}{VIRAMA}{m.group(2)}", t)
    return t.replace("\0", "")


def fix_telugu(t: str) -> str:
    t = fix_lost_glyphs(t)
    # PDF puts "consonant + vowel-sign + virama + consonant"; real order is
    # "consonant + virama + consonant + vowel-sign".  Repeat for stacked conjuncts.
    pat = re.compile(f"([{CONS}])([{SIGNS}]+)((?:{VIRAMA}[{CONS}])+)")
    prev = None
    while prev != t:
        prev, t = t, pat.sub(r"\1\3\2", t)
    # "ర్్మ" -> "ర్మ్": a trailing half-consonant comes out with its virama doubled up front.
    t = re.sub(f"{VIRAMA}{VIRAMA}([{CONS}])", rf"{VIRAMA}\1{VIRAMA}", t)
    return t

def clean(raw: str) -> str:
    t = raw.replace(" \n", " ").replace("\n", "")
    t = re.sub(r"[ \t]+", " ", t)
    return fix_telugu(t).strip()

def split_stories(text: str):
    stories, n, pos = [], 1, 0
    starts = []
    while True:
        m = re.compile(rf"(?:^|\s){n}\.\s*").search(text, pos)
        if not m:
            break
        starts.append((n, m.start(), m.end()))
        pos, n = m.end(), n + 1
    for i, (num, s, e) in enumerate(starts):
        end = starts[i + 1][1] if i + 1 < len(starts) else len(text)
        body = text[e:end].strip().lstrip(".").strip()
        if len(body) > 40:  # skip empty trailing numbers like "61. 62."
            stories.append({"number": num, "body": body})
    return stories

def make_title(body: str) -> str:
    first = re.split(r"[.?!।]+", body, maxsplit=1)[0].strip()
    words = first.split()
    return " ".join(words[:8]) + ("…" if len(words) > 8 else "")

def main():
    pdf = sys.argv[1]
    raw = "\n".join(p.extract_text() for p in pypdf.PdfReader(pdf).pages)
    stories = split_stories(clean(raw))
    for s in stories:
        s["title"] = make_title(s["body"])
    out = pathlib.Path(__file__).resolve().parent.parent / "data" / "stories.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(stories, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Wrote {len(stories)} stories to {out}")

if __name__ == "__main__":
    main()
