# Integration Findings — Sprint 4 (Custom GPT)

Findings from integrating an external Custom GPT with the CareerOS Content API.

Classification:

- **API configuration** — permissions, populate, tokens, response shaping
- **Consumption** — how the client (GPT, tunnel, OpenAPI) uses the API
- **Domain** — gap in `DOMAIN.md` / schema (none required for this sprint)

| Finding | Classification | Notes |
|---------|----------------|-------|
| Unauthenticated `GET /api/profile`, `/api/companies`, `/api/experiences`, `/api/projects` return **403** | API configuration | Role Public stays closed. External consumers use a Strapi **Read-only API Token**. |
| MCP bearer in local Cursor config is not a Content API token (REST returns **401**) | API configuration | Content API and Strapi MCP use different credentials. |
| Relations and components are omitted unless populated | API configuration | Controllers force a fixed populate allowlist for consumers. |
| Rich text is Strapi Blocks JSON, not plain strings | Consumption | GPT instructions explain reading `children[].text`. No parallel text fields. |
| `referenceContacts` excluded from Company API responses | API configuration | Personal data; field remains in the domain and admin. Not exposed to the GPT. |
| ChatGPT cloud cannot reach `http://localhost:1337` | Consumption | Temporary **ngrok** HTTPS tunnel for local tests; real deploy is out of scope. |
| ngrok free tier serves an HTML warning page without `ngrok-skip-browser-warning` | Consumption | Header documented in OpenAPI and GPT instructions. |
| ngrok requires a local authtoken (`ERR_NGROK_4018` without account) | Consumption | Install credential via `ngrok config add-authtoken <token>` before tunneling. |
| ngrok public URL changes every session | Consumption | OpenAPI uses `https://REPLACE_WITH_NGROK_HOST`; replace when creating the Action. |
| Only **published** documents appear in the Content API | API configuration | Empty results → check Publish in admin before changing the domain. |

No domain change was required to support the Custom GPT consumer.
