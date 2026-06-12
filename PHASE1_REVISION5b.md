# Deal Screener — Phase 1 Revision 5b

**Prepared for Claude Code | Created: 2026-06-03**
**Single focused fix — market picker search only.**

---

## Task — Fix Market Picker Search

**Two bugs to fix:**

### Bug 1 — Input resets to 1 character after each keystroke

The search input is losing its value on every keypress, so the user can never type more than one character. This is almost certainly caused by `pickerBuildStateList()` or `pickerBuildSearchResults()` re-rendering the input element (or its parent container) on every keystroke, which destroys and recreates the `<input>` — killing focus and value.

**Fix:** The search input must NOT be inside the container that gets re-rendered on each keystroke. Separate the search input from the results list. On each `input` event, only re-render the results `<div>` below the input — never touch the input element itself.

Concrete structure:
```html
<!-- This outer wrapper never gets replaced -->
<div id="picker-search-wrapper">
  <input id="picker-search" type="text" placeholder="Search markets...">
</div>

<!-- Only THIS gets replaced on each keystroke -->
<div id="picker-results"></div>
```

The input event handler should only update `#picker-results` innerHTML, never `#picker-search-wrapper`.

### Bug 2 — Search filter logic is too broad

Typing "N" returns every market with the letter N anywhere in the name. The intended behavior:

1. **Exact 2-letter state code match** (case-insensitive): typing `NC` → show all NC markets in a flat list. Typing `TX` → all TX markets.
2. **City name substring match**: typing `Charlotte` or `charlo` → show matching markets flat.
3. **State code prefix**: typing `N` alone should show markets in states that START WITH "N" (NC, NV, NE, NJ, NM, NY) — filtered state list, NOT a flat dump of everything.
4. **No match**: show "No results found."

Implementation:
```js
function pickerSearch(query) {
  const q = query.trim().toUpperCase();
  if (!q) {
    // Empty — show state list
    renderStateList();
    return;
  }

  // Check if it's an exact 2-letter state code
  if (q.length === 2 && stateMap[q]) {
    renderMarketList(q, stateMap[q]);
    return;
  }

  // Check for city name match (search by display name)
  const cityMatches = PICKER_MARKETS.filter(m =>
    m.name.toUpperCase().includes(q)
  );
  if (cityMatches.length > 0 && q.length >= 2) {
    renderSearchResults(cityMatches);
    return;
  }

  // Filter state list to states whose code starts with the query
  const stateMatches = Object.keys(stateMap).filter(s =>
    s.startsWith(q)
  );
  if (stateMatches.length > 0) {
    renderFilteredStateList(stateMatches);
    return;
  }

  // No match
  renderNoResults();
}
```

Key rules:
- City/name substring search only activates at **2+ characters** to prevent the single-letter flood
- State code prefix filter (1 char) narrows the state list but doesn't flatten to all markets
- Exact 2-letter state match jumps straight to that state's market list

**Verify:**
1. Open picker, type `N` → state list narrows to NC, NE, NJ, NM, NV, NY (states starting with N) — NOT a flat list of every market
2. Type `NC` → flat list of all NC markets appears directly (no state selection step needed)
3. Type `Charlotte` → Charlotte NC appears in results
4. Type `Hou` → Houston TX appears in results
5. Type `TX` → all Texas markets listed
6. Type `xyz` → "No results found" message
7. Clear the search field → state list returns to full list
8. **Critical:** type `NC` character by character — after typing `N`, input still shows `N`. After typing `C`, input shows `NC`. Input does NOT reset between keystrokes.
9. The input retains focus throughout typing — no need to re-click the search box
