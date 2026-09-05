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


## القرار اللاحق: الاشتراك يمنح مزايا فعلية

بناءً على موافقة المالك «تمام اربطه وعدل الموقع» بعد مناقشة الأسعار والمزايا:

- Starter: 29 دولار شهريًا، رصيد 30 دولار، 20 GB، عمليتان متزامنتان، 30 إعدادًا محفوظًا.
- Pro: 79 دولار، رصيد 90 دولار، 100 GB، خمس عمليات، 150 إعدادًا، عشر هويات، دفعة تصدير حتى 20 مشروعًا.
- Studio: 199 دولار، رصيد 250 دولار، 500 GB، عشر عمليات، 500 إعداد، 50 هوية، 4 زملاء إضافة إلى المالك، دفعة 50 مشروعًا، سياسات مراجعة وحدود صرف للأعضاء.
- المحفظة دون اشتراك: 1 GB وعملية واحدة وتصدير منفرد. اختيار الباقة لا يغيّر سعر العملية نفسه؛ الرصيد الإضافي هو الخصم التجاري المعتمد.
- التحرير اليدوي وإنشاء القطع وربطها وقواعدها مجاني. عروض التحرير القديمة المدفوعة تُرفض ويُطلب عرض جديد بقيمة صفر. ما سبق في هذه الوثيقة من تحصيل مقابل التحرير اليدوي أصبح قرارًا تاريخيًا مستبدلًا.
- تجربة الباقة متاحة في وضع test فقط، ولا تمنح رصيدًا ولا حقوق اشتراك حي. الرصيد التجريبي 100 دولار مرة واحدة للحساب.
- الجدولة الآلية المقترحة لم تنفذ ولا تُعرض كميزة جاهزة. الانتهاء المقترح لرصيد الاشتراك بعد 60 يومًا لم ينفذ؛ الرصيد الحالي لا يُحذف تلقائيًا.
- أسعار الباقات تحفظ تحت plans-v2 حتى لا يعيد إعداد الصفر التاريخي إخفاء الأسعار المتفق عليها. معرفات أسعار Stripe وتفعيل البيع منفصلان.
- مقدار run الافتراضي 0.12 دولار هو سعر تجريبي للصورة/اختبار المحفظة، وليس سعرًا تجاريًا مقاسًا ومعتمدًا تلقائيًا.
