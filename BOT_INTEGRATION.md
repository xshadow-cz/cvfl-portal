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

Administrators can see the player sync result in the single Admin
synchronization panel. If sync fails, the previous snapshot is retained and
the error is displayed there.

## Referee bot SQLite database

The portal can read the referee bot's existing SQLite database directly. In the
provided referee bot, `DB_NAME = 'game.db'` and the `referees` table contains
`discord_id`, `discord_name`, `roblox_name`, `license_type`, `is_suspended`,
`suspended_until`, and `suspension_reason`. The portal opens that database
read-only and imports the current table every 60 seconds by default.

### Sharing the database file

The portal backend process must be able to read the same persistent file as the
bot. On a hosting platform with separate containers, both services must mount
the same persistent volume at a path visible to each service. Sharing only the
hosting account, uploading a second copy, or using a temporary deployment
directory is not sufficient. Do not copy the live database on each deployment.

Find the actual database path on the host. The bot's relative `game.db` path is
resolved against its current working directory, not necessarily the folder
containing the Python file. Configure the bot to use a stable absolute path if
its working directory may change. Then set the portal backend's `.env`:

```dotenv
REFEREE_BOT_DB_FILE=/absolute/shared/path/game.db
REFEREE_BOT_SYNC_INTERVAL_MS=60000
```

For Windows hosts, use the absolute path visible to the Node.js backend, for
example `REFEREE_BOT_DB_FILE=C:/cvfl/shared/game.db`. Relative paths are
resolved from the portal backend directory. Give the portal service account
read access to the database and its directory; keep write access with the bot.
Do not set this path to the portal's own `DATABASE_FILE`.

Restart or redeploy the portal backend after setting this variable in the
hosting provider's environment settings. The single Admin synchronization
panel reports whether the database was opened, the last successful import,
the number of imported source rows, and removed licenses. A message saying
that synchronization is not configured means `REFEREE_BOT_DB_FILE` is missing
or empty in the running backend environment. If startup reports
`scheduleAuditLogCleanup is not defined`, the deployed backend is running an
older or different `server.js`; deploy the current backend source and restart
the service.
The sync fails visibly in that panel and leaves the previous portal data
unchanged if the source cannot be read, required columns are absent, values are
invalid, duplicate Discord/Roblox identities are found, or a previously
non-empty portal roster receives an empty bot table.

### Imported fields and ownership

| Referee bot column | Portal field | Notes |
|---|---|---|
| `discord_id` | `discord_id` | Converted to a string so Discord's 64-bit ID stays exact. |
| `discord_name` | `discord_nick` | Discord username/name saved by the bot. |
| `roblox_name` | `roblox_nick` | Referee's Roblox username. |
| `license_type` | `license` | `Licence A/B/C` becomes `A/B/C`. |
| `is_suspended` | `status` | `1` becomes `Suspended`; `0` becomes `Active`. |
| `suspension_reason` | `suspension_reason` | The reason is copied; the bot remains authoritative. |

`suspended_until` remains managed by the bot, which clears expired suspensions.
The portal keeps the `is_delegate` checkbox as portal-owned data when refreshing
an existing referee. A new referee starts with delegation disabled. Only League
Management and Referee Management can change that checkbox. Removing a license
from the bot removes the matching portal referee and its derived Referee and
Delegate access; match records retain their historical text.

### First sign-in for a referee

1. A manager grants the user a referee license in the Discord bot. The bot
   inserts the Discord ID and names in `game.db`.
2. The portal imports that row on its next sync (normally within 60 seconds).
3. The user opens the portal and selects “Přihlásit přes Discord”. OAuth
   authenticates the exact Discord account ID; the portal finds that ID in the
   synchronized referee table.
4. A referee registration is accepted for a first sign-in without a separate
   portal invite. The portal creates the Discord account/session and grants the
   Referee role. The Delegate role is included only when the portal checkbox is
   enabled.
5. On later visits, the existing secure session cookie is reused until logout,
   expiry, or access removal. If the Discord ID does not match the bot record,
   the user still needs the normal Admin-issued portal invite/role assignment.

The OAuth callback, state-cookie validation, one-time invite claiming, and
session-cookie logic are unchanged by referee synchronization.
