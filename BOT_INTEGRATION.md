# Player bot integration

The portal reads a complete player snapshot from the Wispbyte player bot every
60 seconds by default. The trainer bot is not part of this integration.

## Bot endpoint contract

Expose an HTTPS `GET` endpoint and require the configured bearer token:

```http
GET /integration/players
Authorization: Bearer <shared-secret>
Accept: application/json
```

Return the entire current player table, not a partial page or a change-only
response. Set `complete` to `true` only after the bot has successfully read all
rows; the portal uses this marker to avoid archiving everyone after an
incomplete query.

```json
{
  "complete": true,
  "players": [
    {
      "discord_id": "123456789012345678",
      "discord_username": "discord-name",
      "roblox_username": "roblox-name",
      "roblox_id": "123456789",
      "current_team": "Exact portal team name",
      "expires_at": "2030-01-01T12:00:00.000Z"
    }
  ]
}
```

`current_team` must be the exact team name already configured in the portal, or
`null` for an unassigned player. `expires_at` accepts an ISO-8601 date or a Unix
timestamp in seconds/milliseconds; it is treated as an active Transfer Ban only
while it is in the future. Use `null` when there is no ban. `ban_id` is not used.
Discord IDs must be 17–20 digit strings. `roblox_id` may be `null`.

The portal matches players by Discord ID, then Roblox ID, and finally the exact
Roblox username to preserve portal statistics and historical match references.
Rows missing from a successful complete snapshot are archived, not physically
deleted; their team and active ban are cleared while historical records remain.
An unknown team name, duplicate player identity, malformed date, or incomplete
snapshot fails the entire sync and leaves the previous player data unchanged.

## Portal configuration

Set these variables in the portal backend's `.env` (not in frontend code):

```dotenv
PLAYER_BOT_API_URL=https://your-bot-host.example/integration/players
PLAYER_BOT_API_TOKEN=<long-random-secret>
PLAYER_BOT_SYNC_INTERVAL_MS=60000
```

Use a different high-entropy token for each integration. The portal sends it
only from its backend over HTTPS, rejects redirects, and does not return it in
the admin sync-status response. When configured, the bot is authoritative for
player names, Discord names, team membership, and Transfer Bans. Manage those
fields in the bot; portal-only player registration and Transfer Ban edits are
disabled. Portal match statistics remain portal-owned.

Administrators can see the last sync result in the Admin player panel. If sync
fails, the previous snapshot is retained and the error is displayed there.
