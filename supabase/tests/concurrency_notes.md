# Wave 5 · true-concurrency exercise (local stack, two sessions)

`verify_grants_local.sql` proves the guard predicates sequentially; row-level
locking makes the guarded single-UPDATE claims atomic by construction. To
exercise a REAL race locally (optional, Phase 5), run in two psql sessions
against the local stack:

Session 1:
```sql
begin;
update public.comp_codes_v2 set redeemed_count = redeemed_count + 1
 where code_hash = public.hash_comp_code('<test code>')
   and active and redeemed_count < max_redemptions
 returning redeemed_count;   -- holds the row lock; do NOT commit yet
```

Session 2 (while session 1 is open):
```sql
update public.comp_codes_v2 set redeemed_count = redeemed_count + 1
 where code_hash = public.hash_comp_code('<test code>')
   and active and redeemed_count < max_redemptions
 returning redeemed_count;   -- BLOCKS on session 1's row lock
```

Commit session 1 → session 2 unblocks, re-evaluates its WHERE against the
committed row, and (for a max_redemptions=1 code) matches ZERO rows. One
winner, provably. The same two-session pattern applies to
`begin_checkout_attempt` (the partial unique index makes the second INSERT
converge) and `claim_stripe_event` (the second claim reads the fresh
`processing` row and returns 'busy').

Never run any of this against the live project.
