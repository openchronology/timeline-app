# Views

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

A **view** is a saved way of showing a timeline: a set of [separations](tags.md#separating-by-tags), with their disjoins and unions, or an event's [relationships](relationships.md), under a title. One timeline can have many views, each telling a different story from the same events. A timeline's authors can make one its **default view**, which is how it opens for everyone.

## Saving and opening views

Separate the timeline the way you want it, then select **Views** in the toolbar and **Save what is shown as a view…**. Give it a title and, if you like, a description. On a server timeline, also choose who can see it.

The **Views** dialog lists the timeline's views as cards:

- **Open** shows the timeline in that view. The bar above the tracks names it, such as `View: Wars and sieges`.
- **Make default** makes it the timeline's default view. This is a setting like the title: save the timeline to keep it.
- **Edit…** changes its title and description. If you changed the separations after opening it, **Replace its separations with what is shown now** saves them into the view.
- **Update "…" with what is shown** saves the separations you have changed since opening a view straight back into it.
- **Duplicate** makes a copy, and **Delete** removes it.

A timeline that opens in a default view that is a saved view follows that view. When the view changes, the timeline opens the new way, without saving the timeline again. The timeline also keeps its own copy of the view's separations: exports use it, and it takes over if the view is deleted or moved to another timeline.

## Views on a server

On a server, views are kept apart from the timeline, each with its owner. A view is one of:

- **private**: seen only by its owner and those it is shared with;
- **public**: seen by everyone who can read its timeline. A public view of a private timeline stays hidden from those who cannot read the timeline.

**Share…** makes a view public or private, gives its link, and shares it with named accounts:

- **viewers** read it;
- **editors** also change it and reassign it.

Only its owner shares it, makes it public or private, or deletes it. The link opens the timeline in that view, for anyone who can see it.

**Fork** copies a view someone else owns as your own private view, which remembers the view it came from. **Duplicate** copies any view you can see, your own included, with no link back. Both work like [forking and copying timelines](collaboration.md).

### Views as templates

A view can be **reassigned** to another timeline: in **Edit…**, choose the timeline it is a view of, from the timelines you can read. Under **Your views of other timelines**, the Views dialog also lists your own views and those shared with you that belong to other timelines:

- **Copy here** forks or duplicates one onto this timeline;
- **Move here** reassigns it.

A view moved to a timeline that lacks some of its tags or moments still opens. Separations by tags it lacks are empty, and disjoins or unions at moments it lacks wait. It is up to the view's owner to change its separations to suit the new timeline.

A view outlives its timeline. Deleting a timeline leaves its views as views of no timeline, until their owners reassign them.

## Views in files

Desktop files, browser drafts and `.ochx` exports keep a list of views of their own, with the same Open, Make default, Edit, Duplicate and Delete. They are part of the file, so they go wherever the file goes. They are private to whoever has it, and nothing is shared or forked. Creating a server timeline from such a file makes its views the creator's private saved views of the new timeline. If the file's default view was one of them, the timeline's default view names the saved view made from it.

In a document, the list is `views`. The default view names one with `id`:

```json
{
  "views": [
    {
      "id": "wars",
      "title": "Wars and sieges",
      "description": "Battles in their own track from the first siege.",
      "separation": { "tags": ["war", "siege"] }
    }
  ],
  "view": { "id": "wars", "separation": { "tags": ["war", "siege"] } }
}
```

## The API: making views from scripts and AI assistants

Everything in this guide can be done through the [HTTP API](api.md), so scripts and AI assistants can build views for you. Make an API key in **Account → API keys**, with the `timelines:read` scope to read views and `timelines:write` to change them. Send it as `Authorization: Bearer och_key_…`. Keys need no CSRF token.

| Request                                                 | What it does                                                                                       |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `GET /api/timelines/{id}/views`                         | The timeline's views you can see, its default first (`isDefault`).                                 |
| `GET /api/views`                                        | Your views and those shared with you, of any timeline.                                             |
| `POST /api/views`                                       | Saves a view: `{timeline, title, description?, visibility?, separation}`.                          |
| `GET /api/views/{id}`                                   | One view, with what you may do with it (`canEdit`, `canShare`, `canFork`).                         |
| `PUT /api/views/{id}`                                   | Changes its `title`, `description`, `separation` or `visibility`, or reassigns it (`timeline`).    |
| `DELETE /api/views/{id}`                                | Deletes it.                                                                                        |
| `POST /api/views/{id}/fork`, `/duplicate`               | Copies it as your own private view, optionally `{title, timeline}`.                                |
| `GET`, `POST`, `DELETE /api/views/{id}/members`         | Lists, adds (`{username, role}`, role `viewer` or `editor`) or removes (`{username}`) its members. |
| `POST /api/timelines/{id}/query` with `{"kind":"tags"}` | The timeline's 200 commonest tags and how many events carry each: what separations can use.        |

Errors answer with a status and `{"error": "…"}`, a message that says what to fix, such as `Separations cannot disjoin from each other in a circle.` A request with an invalid separation saves nothing.

### Separations

A view's `separation` is one of:

- `{"tags": [...]}`: the events carrying any of the tags, in a track above the rest.
- `{"groups": [[...], [...]]}`: two to seven groups of tags, a track each.
- `{"separations": [...]}`: one to seven separations, each of which may disjoin and unite, as below.
- `{"related": {"moment": "<id>"}, "depth": "direct"}`: an event and the events related to it. Use `{"duration": "<id>"}` for a duration, and `"depth": "all"` for everything connected to it.

Tags are lowercased and trimmed, at most 128 characters, one to forty per separation.

Each of `separations` is `{"tags": [...], "disjoins": [...], "unions": [...]}`, or, in place of `tags`, an entity's relationships: `{"related": {"moment": "<id>"}, "depth": "direct" | "all", ...}` (the entity and those linked to it, or everything connected to it). Both lists are optional, with at most one entry for each track:

- **A disjoin** is `{"from": <track>, ...time}`. Before its time, the separation's events stay in track `from`. From its time on, they are in the separation's own track.
- **A union** is `{"into": <track>, ...time}`. From its time on, the separation's events are in track `into`, and the separation's track ends. If several unions have passed, the latest applies.
- **A track** is `null` for the main timeline, or another separation's index in the list, counted from 0. A separation may disjoin from a later one, but disjoins may not form a circle.
- **A time** is one of:
  - `"at": "<exact time>"`: an exact rational time in the timeline's coordinates, such as `"1914/1"`. The `first` and `last` of `GET /api/timelines/{id}` show the range.
  - `"moment": "<id>"`: at that moment's time, following it as it moves.
  - `"first": true` (disjoins) or `"last": true` (unions): the earliest or latest of the separation's moments (carrying its tags, or in its entity's set).

A moment counts by its time, and a duration by its start.

For example, this shows wars apart from the first battle until the last one, and trade apart throughout until it rejoins the war track at moment `treaty`:

```json
{
  "timeline": "6f0d…",
  "title": "War and trade",
  "visibility": "public",
  "separation": {
    "separations": [
      {
        "tags": ["war"],
        "disjoins": [{ "from": null, "first": true }],
        "unions": [{ "into": null, "last": true }]
      },
      { "tags": ["trade"], "unions": [{ "into": 0, "moment": "treaty" }] }
    ]
  }
}
```

Saved with:

```sh
curl -X POST https://example.org/api/views \
  -H "Authorization: Bearer $OCH_KEY" -H 'Content-Type: application/json' \
  --data @view.json
```

To make it the timeline's default view, save the timeline with `view` set to `{"id": "<the view's ID>", "separation": <its separation>}` (see [the API](api.md)). The [OpenAPI description](api.md) at `/api/openapi.json` has every field, under the **Views** tag.
