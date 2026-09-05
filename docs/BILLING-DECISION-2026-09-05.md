# USD wallet and three subscriptions

Status: owner-authorized change to the canonical specification, 2026-09-05.

The owner requested an application balance denominated in US dollars, debited on usage, exactly three subscription tiers that grant dollar-denominated usage balance, and additional pay-as-you-go top-ups. The amount $100 is an example, not an approved subscription price, grant, or retail tariff.

This decision replaces the user-facing credit unit in Universal Assembly World v1.5 §§0, 119, 129–141 and Application World §Economy. It preserves the remaining requirements: quotes before execution, explicit approval, bundled editing, idempotency, refunds for technical failure, persistent unpaid drafts, and free Import, Export, Save, Delete, Publish of an already executed result, and Share Link.

## Money and transaction rules

- Store USD as integer millionths of a dollar; never use binary floating-point balances. Provider billing and payment-processor cents convert explicitly.
- Separate subscription grants from purchased top-ups, and separate test balances from live balances.
- Spend subscription balance before top-up balance. Do not expire purchased funds or silently forfeit subscription funds. Rollover/expiry and renewal policies require an explicit owner decision before commercial launch.
- Exactly three configurable subscription definitions: Starter, Pro, Studio. Names and illustrative test values are provisional and marked as such. Live checkout requires approved nonzero commercial prices, grants, an explicit activation flag, and a configured payment provider.
- A subscription grants balance only after a verified successful payment. A checkout redirect, unpaid invoice, or failed renewal never grants balance.
- Deduplicate both provider event IDs and the underlying invoice/payment ID. Repeated delivery cannot grant money twice.
- A quote records scope, project revision, exact USD price, pricing revision, billing mode and expiry. Changed scope or stale revisions require a new quote.
- Applying an operation atomically checks quote ownership, project access, revision, wallet balance and idempotency; updates the project, wallet, operation, revision history and ledger together.
- External jobs debit the approved price before dispatch. Failures without a usable result refund that operation exactly once. Retries must not create a new billable operation without approval.
- Never switch a test balance into live money. Never charge a card automatically when the wallet is empty.
- Payment-provider credentials and model credentials stay server-side. The current private build uses a clearly labeled test wallet; no payment collection or model-key creation is authorized by this change.

## Decisions still needed before live sales

The three monthly fees, included balances, production usage tariffs and minimum margins, supported merchant/payment provider, currency/tax treatment, rollover/expiry, refunds after cancellation, and renewal/upgrade policy. They are configuration and commercial gates, not fabricated defaults.

## Implementation references

- [Stripe webhook verification](https://docs.stripe.com/webhooks)
- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [Subscription lifecycle events](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Checkout sessions](https://docs.stripe.com/api/checkout/sessions/create)

Stripe is an optional adapter, not an assumption that the owner already has an eligible merchant account.
