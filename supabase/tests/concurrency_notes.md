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

## §K-3 · apply_stripe_grant same-subscription race (0011)

The pre-0011 function did `SELECT … FOR UPDATE` then INSERT-or-UPDATE. `FOR
UPDATE` cannot lock a row that does not exist yet, so two events arriving for
the SAME new subscription could both take the INSERT branch; the loser hit
`eg_one_stripe_sub`, the webhook returned its governed 500, and Stripe retried
(the retry then found the row and took the UPDATE branch). Data integrity was
never at risk — the unique index is what made the loser fail — but the
delivery failed and the exception was lost with the log.

Reproducing it (LOCAL ONLY), against a chain WITHOUT 0011: run 25 iterations
of two simultaneous `psql` processes issuing the identical

```sql
select public.apply_stripe_grant(null, '<user>', '<fresh sub id>', 'cus_x',
  'investor', 'active', 'active', now() + interval '30 days', false, 28);
```

for one fresh subscription id per iteration. Measured on 2026-08-25: **12 of
50 concurrent applies raised `duplicate key value violates unique constraint
"eg_one_stripe_sub"`**, while all 25 subscriptions still ended with exactly
one grant row. Re-running the identical hammer against the chain WITH 0011:
**0 of 50 failed**, 25/25 exactly one grant.

Proving the serialization is real and correctly keyed: hold the function's own
key in one session —

```sql
begin;
select pg_advisory_xact_lock(hashtext('stripe_grant:false:<sub id>'));
select pg_sleep(3);
commit;
```

— and call `apply_stripe_grant` for that SAME subscription in another session:
it blocks for the remainder of the hold (measured 2,537 ms) and then succeeds.
A call for a DIFFERENT subscription is unaffected (measured 141 ms), so the
lock is per-subscription, never a global serialization point.

What 0011 does NOT address: an older in-flight handler could still commit
state it fetched from Stripe before a newer handler's fetch (the webhook is
state-based — it re-reads the subscription, so the written value is "state as
of the fetch"). Closing that requires an explicit freshness stamp threaded
from the Edge runtime; it is a returned decision point, not a silent choice.
