# Deal Screener — Phase 1 Revision 6b

**Prepared for Claude Code | Created: 2026-06-04**
**Single targeted fix — logo replacement.**

---

## Task — Replace Logo with Processed Transparent PNG

**Background removed, tested, looks correct on dark background.**

**Source file (ready to use — do not modify it):**
```
Logo/clearpath-mark-transparent.png
```
Full path: `C:\Users\leach\OneDrive\Documents\Claude\Projects\Deal Screener\Logo\clearpath-mark-transparent.png`

This is the CPC icon mark with white background fully removed. Verified composite on `#0a0a0a`: green arrow vibrant, chrome ring clean, no artifacts.

**Fix:**
1. Copy `Logo/clearpath-mark-transparent.png` into `public/icons/clearpath-mark.png` — **overwrite the existing file**
2. No changes needed to `index.html` — `src` already points to `icons/clearpath-mark.png`
3. In `styles.css`, **remove** the `background-color: #0a0a0a` workaround and **remove** any `filter:` rules previously applied to the logo image. The new PNG is genuinely transparent — no CSS workarounds needed.
4. Do not resize the logo — keep it at its current display size.

**For the Get Funding button icon:**
The same `clearpath-mark.png` is used inside the funding button (green `#b8ff57` background). On the green button, the dark chrome elements of the icon may be hard to read. If that's the case, apply a CSS rule specifically to the button icon:

```css
.cpc-btn img[src*="clearpath-mark"],
[class*="funding"] img[src*="clearpath-mark"] {
  filter: brightness(0) invert(1);  /* white icon on green button */
}
```

Only apply this filter to the button instance — NOT the header logo.

**Verify:**
1. Hard reload
2. Header logo: green arrow and chrome ring visible, no white square, no background artifact
3. Logo looks like the dark-background preview — clean icon on dark
4. Get Funding button: logo icon is legible against the green button background
5. Run: `document.querySelector('img[src*="clearpath-mark"]').complete` → `true` (image loaded)
6. No checkered pattern anywhere on the page
