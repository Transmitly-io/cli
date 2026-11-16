# @transmitly/cli

Command-line client for the Transmitly API. Requires Node 18+. Run it from the
platform repository today; the same entry point is published as
`@transmitly/cli` when registry credentials are configured.

```bash
export TRANSMITLY_API_KEY=txk_...
node cli/transmitly/index.js emails send \
  --from "Notify <notify@acme.com>" \
  --to ada@example.net \
  --subject "Welcome" \
  --html "<p>Your workspace is ready.</p>"
```

Use `--test` to accept and record a message without SMTP delivery, `--attach`
for attachments (repeat the flag) and `--schedule` with an RFC3339 timestamp or
a phrase such as `"in 2 hours"`.

## Commands

```bash
transmitly emails send ...        # send a message
transmitly emails get <id>        # accepted message and deliveries
transmitly messages list          # filter with --status, --stream, --q, --limit
transmitly messages get <id>      # message plus per-recipient state
transmitly domains list
transmitly domains create <domain>
transmitly domains verify <id>
transmitly suppressions list
transmitly suppressions add <email> --reason manual
transmitly webhooks list
transmitly events list
transmitly usage
transmitly health                 # no API key required
transmitly test-mode simulate ...
```

Set `TRANSMITLY_BASE_URL` for local testing. Output is JSON so it composes with
`jq`. Exit codes: `0` success, `1` request error, `2` usage error.

Keys with the `admin` scope are needed for domain, webhook and suppression
management. Keep the key out of shell history in shared environments; read it
from a secret manager or an environment variable.
