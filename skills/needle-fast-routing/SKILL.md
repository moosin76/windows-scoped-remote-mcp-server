# Needle Fast Routing Skill

## Purpose

Use `needle_route` as WSR's local System-1 fast router when a request can be reduced to a straightforward tool selection and argument extraction task.

Needle is recommendation-only. Never treat a Needle result as authority to bypass WSR tool handlers, Workspace Sandbox rules, Provider allowlists, or input validation.

## Canonical query rule

Users may speak Korean or any other language. Before calling `needle_route`, convert the intent into a short English imperative for routing.

Examples:

```text
사용자: "wsr 상태 확인해"
query: "Check WSR status"

사용자: "df 워크스페이스로 바꿔"
query: "Switch workspace to 'df'"

사용자: "현재 workspace가 어디야?"
query: "Get the current active workspace"

사용자: "Blender scene 정보 확인해"
query: "Get Blender scene information"

사용자: "PostgreSQL schema 목록 확인해"
query: "List PostgreSQL schemas"

사용자: "브라우저로 localhost:5174 열어"
query: "Open http://localhost:5174 in the browser"
```

Do not translate or normalize literal identifiers. Preserve workspace aliases, paths, URLs, branch names, object names, schema/table names, IDs, and other user-provided literals exactly.

When the canonical English query differs from the original request, also pass `originalQuery` with the user's exact wording. WSR uses it for diagnostics/evaluation and to restore Provider `user_prompt` arguments; it is not sent to Needle inference.

## Scope selection

Prefer the narrowest safe scope.

- Core WSR request: `scope="core"`
- Named Provider request: `scope="providers"` and set `providerId`
- Mixed or unclear routing request: `scope="all"`

Examples:

```json
{"query":"Check WSR status","originalQuery":"wsr 상태 확인해","scope":"core"}
{"query":"Get Blender scene information","originalQuery":"Blender scene 정보 확인해","scope":"providers","providerId":"blender"}
{"query":"List PostgreSQL schemas","originalQuery":"PostgreSQL schema 목록 확인해","scope":"providers","providerId":"postgresql"}
```

A named Provider should not normally use `scope="all"`; doing so needlessly makes Core tools compete with Provider tools.

## Result handling

Use the recommendation only when:

- `available=true`
- `recommended=true`
- `escalate=false`
- the returned tool/arguments still make sense for the user's request

If `recommended=false`, `escalate=true`, Needle is unavailable, or the result is suspicious, fall back to normal LLM reasoning and existing WSR tools.

Never auto-execute low-confidence recommendations.

## Provider routing

Provider candidates must come only from `ProviderRegistry.listCachedTools()`, which is the discovered/allowlisted snapshot.

WSR pre-shortlists a relevant Provider and at most a small set of likely tools before Needle inference. A strong lexical match may reduce the shortlist to a single tool.

Provider `user_prompt` is intentionally hidden from Needle inference. WSR restores it from `originalQuery` (or the canonical query when no original is supplied), preventing Needle from fabricating/paraphrasing the provider audit prompt.

## When not to use Needle

Skip Needle and use normal reasoning when the task requires:

- multi-step planning
- substantial code/design judgment
- ambiguous intent that cannot be safely canonicalized
- comparing several possible workflows
- decisions that depend on reading tool outputs before choosing the next tool

Needle is a fast routing aid, not a reasoning replacement.
