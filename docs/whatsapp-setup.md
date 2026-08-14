# WhatsApp Business — setup

The code is in place. What remains is mostly a Meta account, which only you can
do, and it takes days rather than minutes because a business and a phone number
have to be verified by Meta and each message template has to be approved.

Nothing sends until you have finished this **and** enabled a rule. That is
deliberate.

---

## 1. What you create at Meta

1. **Meta Business account** — business.facebook.com. The hospital, not a person.
2. **Business verification.** Meta asks for documents proving the organisation
   exists. This is the slow step: typically several days.
3. **WhatsApp Business Account (WABA)**, inside the Business account.
4. **A phone number** for it. It must NOT already be on ordinary WhatsApp or
   WhatsApp Business — if the theatre office number is in daily use on a handset,
   use a different line. Registering it here takes it off that handset.
5. **A Meta app** with the WhatsApp product added.
6. **A permanent access token.** Create a System User in Business Settings, give
   it the WABA, and generate a token with `whatsapp_business_messaging` and
   `whatsapp_business_management`.

   Do **not** use the temporary token shown in the app dashboard: it expires in
   24 hours, and everything will work for a day and then stop for a reason
   nobody remembers.

## 2. Environment variables

On **Vercel only** — sending is cloud-only, because Meta's webhooks cannot reach
a server behind the hospital's NAT, and if both nodes could send, a message
queued locally and then synced would go out twice.

```
WHATSAPP_ACCESS_TOKEN=          # the System User token
WHATSAPP_PHONE_NUMBER_ID=       # from WhatsApp > API Setup, NOT the phone number
WHATSAPP_APP_SECRET=            # App Settings > Basic > App Secret
WHATSAPP_WEBHOOK_VERIFY_TOKEN=  # invent one: openssl rand -hex 24
WHATSAPP_API_URL=https://graph.facebook.com/v21.0
```

The kill switch, which works without a deploy:

```
COMMUNICATION_DISABLED=true              # stops everything, all channels
COMMUNICATION_DISABLED_CHANNELS=WHATSAPP # stops WhatsApp only
```

Set `COMMUNICATION_DISABLED_CHANNELS=WHATSAPP` **now**, before the first
template is approved. Take it off deliberately when you are ready to send.

## 3. Webhook

In the Meta app: **WhatsApp → Configuration → Webhook**.

```
Callback URL:  https://unth-theatre.link/api/webhooks/whatsapp
Verify token:  the WHATSAPP_WEBHOOK_VERIFY_TOKEN you set above
```

Subscribe to the **`messages`** field. That carries delivery and read receipts as
well as inbound replies.

Meta calls the URL once to verify it. If it fails, the usual cause is that the
environment variable is set but the deployment has not been redeployed — Vercel
only picks up environment changes on a new deployment.

The signature check **fails closed**: with no `WHATSAPP_APP_SECRET` configured,
every webhook is rejected. That is intentional. An unverified webhook can write
delivery status for any message, so "not configured" must never mean "accept
anything".

## 4. Templates

Every outbound message needs a template Meta has approved, because the hospital
messages first and free text is only allowed inside a 24-hour window the
recipient opens by writing to you.

Submit them in **WhatsApp Manager → Message templates**. Approval usually takes
minutes to a day; rejection is common on the first attempt.

Start with these three, which match what ORM already has:

**`theatre_setup_overdue`** — Utility
```
Theatre {{1}} setup is overdue. The case is due at {{2}}. Please attend immediately.
```

**`vendor_request_reminder`** — Utility
```
Reminder: request {{1}} has not been confirmed. It was required by {{2}}. Please respond.
```

**`patient_appointment_update`** — Utility
```
Dear {{1}}, there is an update about your procedure on {{2}}. Please contact {{3}}.
```

Then record each approved template in ORM with its `providerTemplateId` and
`providerStatus = APPROVED`. The send policy refuses an unapproved one with a
sentence a person can act on, rather than letting Meta reject it with an error
nobody reads.

**Do not put clinical detail in a template.** The classification enforces this,
but Meta will also reject it. `CLINICAL_UPDATE_AVAILABLE` is the pattern: say
that something exists, and nothing about what.

## 5. Money and consent — decide before enabling

**Every conversation is billable.** Utility conversations are cheaper than
marketing ones, and a misconfigured escalation loop is a bill as well as a
nuisance. That is why rules are created inactive and in dry-run, and why the kill
switch exists before the first rule does.

**A phone number in a patient record is not consent to message it.** Meta
requires opt-in for patient messaging, and it is a reasonable requirement
independently of them. ORM does not record consent today. Before any patient
template is enabled, decide how consent is captured and where it is stored — I
will add the field and the check.

Staff messaging does not raise this: a duty phone number for operational alerts
is a different matter, and the templates for it name no patient.

## 6. Test before anyone real is contacted

1. Add your own number as a test recipient in the Meta app.
2. Leave `COMMUNICATION_DISABLED_CHANNELS=WHATSAPP` set.
3. Create a rule and leave it in **dry-run**: it renders and logs, and sends
   nothing.
4. Check the rendered body in the communications log.
5. Remove the kill switch, send one message to your own number.
6. Confirm the webhook moves it to DELIVERED and then READ.

Only then take a rule out of dry-run.

## 7. What can still go wrong

| Symptom | Cause |
|---|---|
| Everything worked for a day, then stopped | Temporary token was used instead of a System User token |
| Webhook verification fails | Environment variable set but not redeployed |
| `131047` | Outside the 24-hour window — use an approved template |
| `131026` | The number is not on WhatsApp |
| `132000` / `132001` | Template missing or not approved |
| Messages send twice | Something is sending from the theatre server. Sending is cloud-only |

The failure classification refuses to retry any of the non-transient ones, so a
wrong number or an unapproved template costs one attempt rather than a loop.
