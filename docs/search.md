# Searching a timeline

**Search** in the timeline toolbar (or **/** outside a text field) opens a search dialog for the open timeline. Type words from a title or notes. Every word must match. Results list moments and [durations](durations.md), 25 per page, with each one's time or extent and a preview of its notes. A moment also matches through the titles and notes of its nested entries, such as stacks. The view does not move while you search. Choosing a result closes the dialog and moves the view to it: a moment is centred at the current zoom; a duration is fitted with a margin on both sides. The chosen moment or band pulses briefly. Nothing else opens; click it to edit.

Matching depends on where the timeline lives:

| Timeline                                 | How it matches                                                                                                                     | Order                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Server (PostgreSQL)                      | Full-text search with the language-neutral `simple` configuration. Each word matches the start of a word (`harb` finds "harbour"). | Rank (titles weigh more than notes), then time |
| Desktop `.och` file                      | Each word occurs anywhere in the title or notes. Case is ignored for ASCII letters only.                                           | Title matches first, then time                 |
| In-memory (browser drafts, offline HTML) | Each word occurs anywhere in the title or notes, ignoring case.                                                                    | Title matches first, then time                 |

Indexed (server and desktop) timelines search the saved version. Unsaved edits replace their saved matches on the current page and are flagged in the result count, which is then approximate. Comparisons have no search.

## Storage and API

PostgreSQL keeps one `oc_entity_search` row per moment and duration with a stored, weighted `tsvector`. Sparse saves update the rows of changed entities; whole-document saves rebuild them with the rational index, and `npm run migrate` builds them once for existing timelines (`oc_timelines.search_version`). Queries are scoped to one timeline through the table's primary key.

`POST /api/timelines/:id/query` accepts `{"kind": "search", "text": "harbor", "page": 1}` (at most 200 characters; pages 1–4,000) and returns `{results: [{kind, id, first, last, title, snippet}], total, page}`. The desktop uses the same request through its native query. Search terms are lowercased words of letters and digits (at most eight), so punctuation and query operators are never interpreted as syntax.
