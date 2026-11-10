# Repair receipt with a later estimate — 2026-11-10

Product receipt (`item_received`) can be saved with an empty estimate and no customer message. The administrator can enter an estimate after inspecting the product within 1–2 days and write a separate message in the existing Repair Ticket conversation.

The frontend and server no longer require an estimate for receipt. Numeric validation and final payment/shipping requirements remain unchanged. The existing receipt email/SMS uses “제품 수령 후 1~2일 내 별도 안내 예정” when its estimate variable is empty. Templates and delivery triggers are unchanged; a later estimate-only edit does not resend receipt notifications. Ticket conversation messages retain their existing notification behavior.

Number assignment remains on the received-item and later fulfillment stages, with an existing number retained on edits. New rejected/cancelled inquiries do not get a number. No migration or historical renumbering is part of this release.

Validation: 75 repair/notification/reminder/admin regression tests passed, including receipt without a quote, later quote and ticket message, stable customer/request/ticket identity, one receipt notification, stale-version rejection, and no number for rejected/cancelled inquiries. Cloudflare Pages build passed.

Production UI verification and deployment evidence are recorded separately in ignored `test-results/`. Only a clearly labelled synthetic test record is used for UI writes; real customer records are not edited for testing.
