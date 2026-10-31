# Using OpenChronology

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

OpenChronology is a timeline editor. You place moments and periods on a line of time, zoom from millennia down to fractions of a second, and share what you make. This guide walks through the app task by task. Each chapter links to a more detailed page when you want the full story. For quick answers, see the [frequently asked questions](faq.md).

## What a timeline is

A timeline holds three kinds of things:

- **Moments:** points in time, each with an optional title, notes and tags.
- **Durations:** periods with a start and an end. Either end can be a fixed time, or it can follow a moment, so that moving the moment moves the end too ([durations](durations.md)).
- **Relationships:** links between two moments, two durations, or a moment and a duration. They say that two things are connected, without a label ([relationships](relationships.md)).

### Exact times

Every time is stored exactly, as a whole number or a fraction such as `1/3`. A third of a second stays exactly a third, however far you zoom in, and nothing is rounded when you save or export.

### How times read as dates

What a time _means_ is up to the timeline's **Time display**. A new timeline shows plain numbers (**Exact rational**). Choose **Gregorian timestamp** to read the same numbers as dates and times: each number is then a count of seconds from the start of 1970, in UTC. Other displays show minutes, days, years, millions of years, or SI units such as `1.5 ks`. Changing the display never moves anything; it changes only how times are written and read. See [display settings](#display-settings).

### Where a timeline lives

| Where                         | Kept                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| In the browser, not signed in | Only in the open tab. Closing or refreshing it loses your work unless you export it.  |
| In the browser, signed in     | As a draft in this browser, until you save it to the server.                          |
| On a server                   | In the server's database, private until you choose otherwise, with its saved history. |
| In the desktop app            | In an `.och` file on your computer.                                                   |
| In the offline HTML file      | Only in the open tab, like a browser timeline without an account.                     |

## Getting started

### On the website

The home page, **Timelines**, lists **Your timelines** and **Your favorites** once you are signed in, and **Explore timelines** for everyone. Search public timelines by their titles, notes and tags, filter them by a tag, and sort them (**Featured first**, **By stars**, **By popularity** and others).

Every list on the home page and on a profile has its own search, so searching one leaves the others as they are:

| List                                                      | Search, filter and sort by                                                                                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Explore timelines**                                     | Words, a tag, and **Featured first**, **By stars**, **By popularity**, **Trending this month**, **Alphabetical**, **Newest first**, **Recently changed** or **Relevance** |
| **Your timelines**, **Your favorites**                    | The same, private timelines included, and **Visibility**: public, private or both                                                                                         |
| **Drafts in this browser**                                | Words and a tag, searched in this browser; **Recently changed**, **Alphabetical**, **Most moments** or **Relevance**                                                      |
| A profile's **Public timelines** and **Public favorites** | Words, a tag and the same orders as **Explore timelines**                                                                                                                 |

A search sorts by **Relevance** unless you choose another order. A tag on a timeline filters its list by that tag. Each list's search, order and page are in the page's address, so a search can be shared or bookmarked.

Lists update in place, without loading the page again, so you stay where you were:

- **Search as you type:** results follow the words and tag as you type them; **Search** or Enter applies them at once. **Sort** and **Visibility** apply as soon as you choose.
- **Back** returns to the list as it was before your last search, tag or page.
- **Grid** or **List** shows the cards side by side or one per row; the browser remembers your choice.
- **Arrow keys** move between the cards' titles once one has focus (**Home** and **End** go to the first and last).
- Each card shows the timeline's title, owner and last change, an excerpt of its description, its size, the span of its moments with a small chart of where they fall, and its tags.

Without JavaScript the lists still work: searching and paging load the page, which opens at the list you used.

- **Start a timeline:** **＋ New timeline** in the header opens an empty timeline called "Untitled timeline" in your browser. Click the title and the description at the top to change them. **Tags (comma-separated)** under them labels the whole timeline, so others can find it.
- **Try the sample:** **Explore 20,000 sample moments ↗** opens a sample timeline to pan and zoom through.
- **Open a file:** **Import** reads an `.ochx` file. Signed in, **Import .och** also reads a desktop file through the server.
- **Open a public timeline:** choose one under **Explore timelines**, or follow a link someone shared.

### Drafts and signing in

Without an account, a timeline you start lives only in the open tab. A banner, **In-memory timeline.**, reminds you, and the browser asks before you leave the page with changes. Use **Export** to keep a copy as an `.ochx` file. See [guest and standalone editing](guest-editing.md).

To sign in or create an account, use **Account** in the website's header (in the desktop app, **Sign in**). You can use a username and password, or **Continue with Google**, GitHub or Facebook where the site offers them. Accounts are for people 13 and older ([ages](moderation.md#ages)).

Signed in, a timeline you have not yet saved to the server is kept as a draft in this browser, from your first edit (an imported file at once). The status under the title says **Saved in this browser**. Each timeline you start or import is a draft of its own, so starting another keeps the one before:

- **Drafts in this browser**, on the home page, lists your drafts, most recently edited first. Choose one to open it, or **Delete** it.
- **Opening the editor** without choosing returns to the draft you edited last.
- **Saving a draft to the server** moves it there, and it leaves the list.

Drafts stay in this browser only, and only for your account. Save to the server to keep a timeline for good and to reach it from other devices.

### The desktop app and the offline file

**Download** in the header offers:

- **The desktop app** for Windows, macOS and Linux. It works with timeline files on your computer: **Open**, **Save** and **Save As…** read and write `.och` files, and **Import** reads `.ochx` files. It works without a network. **Server connection** connects it to OpenChronology servers (by default `https://timescale.info`), up to eight at once ([several servers](authentication.md#several-servers-on-the-desktop)). To sign in from the desktop, choose **Sign in using your browser**, then, on the website, check when and where the request started, type the code the desktop app shows and choose **Approve connection**. Approve only a sign-in you just started on your own computer, never a link someone sent you. The desktop app does not remember your sign-in after it closes.
- **The offline browser file** (`.html`): the whole editor in one file. It never uses the network. Work stays in memory, so export it as `.ochx` to keep it.

## Moving around

| To                             | Do                                                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Pan                            | Drag the timeline. Arrow keys also pan when the timeline is focused, and Shift-scroll pans left and right.           |
| Zoom through time              | Scroll, or pinch with two fingers side by side. **＋** and **−** zoom around the centre, as do the `+` and `-` keys. |
| Move up and down               | Drag, use Alt-scroll, or press the Up and Down arrow keys.                                                           |
| Make dots and labels larger    | Ctrl-scroll, pinch on a trackpad, or pinch with one finger above the other. Only their size on screen changes.       |
| See everything                 | **Fit all**. **Center axis** brings the axis back to the middle without changing the time shown.                     |
| Go to an exact stretch of time | Type times into **Left bound** and **Right bound** under the timeline, then **Go**.                                  |
| Give the timeline more room    | **Full screen**, or `F`, fills the window with the timeline and its toolbar. **Exit full screen** or Escape leaves.  |

Type the bounds the way the timeline's display writes times. To see and type the stored numbers themselves, set **Time display** to **Exact rational**. With the Gregorian display, clicking a bound opens a date and time dialog instead.

**Help** under the timeline lists these controls. The count above the timeline says how many moments are in view.

### What markers show

- **A dot** is one moment. A titled moment shows its title and time; an untitled one shows only its dot.
- **A dot with a number** is a summary: moments, and durations too short to draw, too close together on screen to draw apart. **Group within** under the timeline sets how close, from 12 to 48 pixels. Click a summary to list what it holds (its moments 25 at a time, and the durations collapsed into it), with **Zoom into this group**; double-click it to zoom straight in. Moments at exactly the same time stay together however far you zoom.
- **A band** is a duration. A duration too short to draw at the current zoom is summarized like a moment, and becomes a band again as you zoom in ([summaries](durations.md#summaries)).
- **An arc** above the axis is a relationship between two things.
- **A yellow line** is the time you selected by clicking empty space. New moments go there.

Over a server timeline that keeps growing, **Follow latest moments** keeps the newest moments in view, once you have stopped moving around for 15 seconds.

## Events: moments and durations

An event is either a **moment**, a single point in time, or a **duration**, a span between two times.

### Adding an event

**＋ Event** adds an event at the selected time, or in the middle of the view. You can also right-click the timeline (or press and hold it on a touch screen) and choose **＋ Event** to add one where you clicked. Clicking empty space only selects a time; it never creates anything.

The **New event** dialog opens on its **Moment** tab. Choose **Duration** at the top to make it a duration instead: it starts at the moment's time and lasts a quarter of the view. The title, notes, tags and sensitive-content labels you typed carry over, either way. The event joins the timeline when you choose **Save**. Once saved, an event keeps its kind: the dialog's other tab is disabled.

### The details panel

Click a moment to open **Moment details**:

- **Title:** optional. Untitled moments show as a dot without a label.
- **Exact time:** written in the timeline's display. Leaving the text as it is keeps the exact time, even when the display rounds it. **Exact rational coordinate** shows the stored number. With the Gregorian display, clicking the field opens a date and time dialog: pick the date and time, or use **Or type a time**, then **Apply**. Alt+Down in the field opens it too.
- **Notes:** plain text, or formatted text with the **Rich text notes** plugin.
- **Tags:** a comma-separated list such as `war, trade` ([tags](tags.md)).
- **Sensitive content:** **Nudity**, **Graphic violence** or **Disturbing content**, for moments that show them. Readers are warned, and its images stay blurred until they choose **Show images** ([labels](moderation.md#sensitive-content-labels)).
- **Durations:** the durations that start or end at this moment, and **New duration starting here**.
- **Related to:** this moment's [relationships](#relationships).
- **Additional metadata:** the moment's other data as JSON, for advanced use.

Your edits show on the timeline as you type. **Save** keeps them. **Cancel**, Escape, the **×** button or clicking outside the panel puts the moment back as it was. **Delete** removes the moment after asking; durations that followed it keep its time.

On the website, **Share** in the panel links to the moment, and **Report** tells the site's administrators about a problem with it.

### Reading a timeline

When you can't edit a timeline, a moment or duration opens in the **reader** instead of the details panel. The reader is a full-size version of its hover card. It shows:

- its pictures, credited to where they're hosted;
- its time, or a duration's span, written in full whatever the view (a year-dated moment reads `91 BCE`, a dated one `1781-09-09 CE`);
- its tags;
- its notes (formatted with **Rich text notes**);
- what its plugins record, such as sources or dating notes;
- its stack's entries;
- what it's related to (select one to read it next).

On phones the reader fills the screen. **Share** and **Report** are there too.

If you can edit, turn on **View mode** at the top to read the timeline the same way. It hides the editing controls, so nothing changes by accident. Turn it off to edit again. This browser remembers the setting. The reader opens in [separated](tags.md#separating-by-tags) tracks too, in View mode or when you can't edit; otherwise they open read-only details.

### Durations

Choose the **Duration** tab of **＋ Event** to create a duration. Click a band to open it. The **Duration** dialog has a **Title**, **Notes**, **Tags**, **Sensitive content** and **Related to**, as for moments, and a **Start** and an **End**:

- **Fixed time:** a time of its own.
- **Follows a moment:** choose the moment in **Choose a moment**, which lists moments in time order or searches them as you type. **Open moment** jumps to it, and **Choose another moment…** changes it.

**Save**, **Cancel** and **Delete duration** work as for moments. Deleting a duration leaves its moments as they are. See [durations](durations.md#editing).

### Images

Images come from plugins, and are links to pictures hosted elsewhere:

- **Moment icons** shows a picture as a moment's marker.
- **Duration backgrounds** shows a picture behind the timeline where a duration lies.
- **Timeline background** shows one picture behind the whole timeline. Set its address under the plugin in the **Plugins** dialog.
- **Moment stacks** adds cards with their own pictures inside a moment.

Give each image's HTTPS address. A server keeps only the link, not a copy, and credits the image's host. Exported files include copies, so they work offline. Link only images you may share ([images and copyright](images.md)).

### Undo and redo

**Undo** and **Redo** beside the bounds, or Ctrl+Z and Ctrl+Shift+Z (or Ctrl+Y; ⌘ on macOS), undo and redo adding, editing and deleting events and links. Saving to the server or to a desktop file starts a fresh undo history.

## Relationships

Open an event and find **Related to**. It lists what is linked to it, 25 at a time; choose one to open it. To link something, open **Add a relationship**, search for it by title or notes, and choose it. **×** removes a link.

Relationships show as arcs above the axis. Two buttons pull them out of the crowd:

- **Separate related:** moves this entity and what is linked to it into a track above the rest.
- **Separate all connected:** also follows links of links, as far as they go.

**Rejoin** returns to the whole timeline. See [relationships](relationships.md#viewing-and-editing).

## Tags and tracks

Tags are short labels on events, such as `war` or `trade`. Each can carry up to 40.

**Separate by tags** lists the timeline's tags and how often each is used. Choose some (or type others under **Other tags**) and select **Separate**. Everything carrying any of them moves into a track above; everything else stays below. Both tracks pan and zoom together, and both are read-only. Separating never changes or saves the timeline. **Rejoin** brings it back together. See [separating by tags](tags.md#separating-by-tags).

## Searching

**Search** above the timeline, or the `/` key, opens **Search this timeline**. Type words from titles or notes; a result must contain every word. Results come 25 a page, with each one's time and a preview of its notes. Choosing a result moves the view to it, and it pulses briefly; click it to open it. On the website, **Share these results** links to the search. See [searching a timeline](search.md).

## Display settings

**Time display** opens the timeline's display settings. They belong to the timeline, so everyone who opens it sees times the same way.

- **Representation:** **Exact rational**, **Floating point / decimal**, **Scientific notation**, **SI prefixes**, **Gregorian timestamp**, or **Custom JavaScript / TypeScript subset** for your own format.
- **Units:** for numeric displays, **Unit preset** offers seconds, minutes, hours, days, Julian years and millions of Julian years. **Unit label** and **Significant digits** fine-tune them.
- **The calendar:** **Gregorian timestamp** uses the Gregorian calendar extended back before its adoption, with years marked CE or BCE. **Timezone offset in minutes** sets one fixed offset from UTC; named time zones and daylight saving are not supported. Typed times need a `Z` or an offset such as `+02:00`. **Abbreviate chart labels to the visible scale** keeps labels short.
- **Ruler graduation:** where the ruler's marks fall: decimal, calendar, or your own list of steps.

Preview your choice, then select **Save display settings**. On a server timeline you can write to, that saves the display at once, without saving your other edits. See [time presentation](time-presentation.md).

**Light or dark** is yours, not the timeline's: everything follows your system's setting, or the **Theme** you pick (**System**, **Light** or **Dark**) in the footer or your account's menu on the website, or in the header of the offline file and the desktop app. It is kept in this browser. See the [FAQ](faq.md#can-i-use-a-dark-theme).

## Saving

The status under the title says where your work stands: **Unsaved changes**, **Saved in this browser**, **Saved on the server**, **Saved to file** and so on.

### To a file

**Export** downloads the timeline as an `.ochx` file: everything in it, including its display settings, plugins and copies of its images. **Import** opens one again, in any edition. Signed in on the website, **Export .och ↗** and **Import .och** convert to and from the desktop app's file format. In the desktop app, **Save** and **Save As…** write `.och` files.

### To the server

Signed in, **Save to server** saves a timeline from your browser to your account. It starts private. Once a timeline is on the server, the same button saves your changes to it as a new revision, for its owner and writers. Each account has a storage limit, shown on the **Account** page.

### Revisions

Every save to the server is a revision. **History** above the timeline lists them, newest first, twenty to a page. Open one to see it, and **Export this checkpoint (.ochx)** to download it. To work from an old version, import that file.

A timeline's owner can limit what is kept in **Sharing & settings**: **Data retention** deletes moments older than a period such as `1 year`, and **Stop keeping saved history…** stops keeping past revisions ([retention](retention.md)).

### When others save first

If someone saved the timeline while you were editing, your save merges your edits onto theirs. When you both changed the same thing differently, the save stops and lists the conflicts:

- **Keep my versions:** yours replace what was saved.
- **Use the saved versions:** your edits to those are dropped.

The rest of your edits are saved either way. See [saving while others save](collaboration.md#saving-while-others-save).

## Sharing and links

New server timelines are private. To change that, open **Sharing & settings** above the timeline (owners only):

- **Visibility:** **Private — you and the collaborators you add** or **Public — anyone can view it, and signed-in readers can propose changes**. Public timelines appear in search, and anyone can read them and their saved history.
- **Address:** a short name for the timeline's link, such as `/yourname/fall-of-rome`, then **Save address**.
- **Sensitive content:** labels for the whole timeline, so readers are warned before it opens.

**Share** opens the share dialog, with **Copy link**, links to post on social sites, and **Embed on a website** for public timelines. Events have **Share** in their details. Right-click the timeline and choose **Share this view** to share exactly what you see. The address bar also follows what is open, so you can copy it at any time. See [sharing timelines](sharing.md).

**☆ Star** adds a timeline to **Your favorites**. **Report** tells the site's administrators about a timeline that breaks the rules ([reporting](moderation.md#reporting)).

## Working together

### Members and roles

Under **Sharing & settings → Collaborators**, the owner adds people by **Username** with an **Access** level, then **Add or update collaborator**:

| Role                               | Can                                                              |
| ---------------------------------- | ---------------------------------------------------------------- |
| **Viewer**                         | Read a private timeline.                                         |
| **Contributor**                    | Read it, and propose changes as pull requests.                   |
| **Writer**                         | Also save changes directly, and merge or reject pull requests.   |
| Owner                              | Everything, including visibility, collaborators and deleting it. |
| Anyone signed in, public timelines | Read it and propose changes, like a contributor.                 |

See [custody and permissions](collaboration.md#custody-and-permissions).

### Pull requests

People who can't save directly can still edit. Their save button reads **Submit pull request**: give it a title and a description, and submit. Writers can do the same with **Propose changes**. **Pull requests** above the timeline lists proposals. Each shows what it adds, removes and changes, with a **Discussion**. Writers **Merge** or **Reject** a proposal; its author can **Close** it, or **Rebase on upstream** when the timeline has moved on. See [pull requests](collaboration.md#pull-requests).

### Forks and copies

- **Fork on server:** your own private copy that remembers where it came from. **Sync upstream** brings in later changes, and **Propose saved changes** offers yours back.
- **Duplicate:** an independent copy, with no link to the original.
- **Fork in browser:** for visitors who aren't signed in. It copies a public timeline into the tab to edit and export, up to 5,000 entries.

See [forks, duplicates and saved history](collaboration.md#forks-duplicates-and-saved-history).

### Live changes

An open server timeline updates as others save it, without moving your view. Your own unsaved edits are kept, and saving merges them.

## Comparing timelines

**Compare** above the timeline lists the timelines you can see. Choose two or more, or add an `.ochx` file under **Add .ochx timeline**, then **Compare selected**. On the home page, tick **Compare** on timeline cards and choose **Compare timelines**.

The comparison stacks the timelines on one shared time axis. Each track has a **Scale** and an **Offset** to line up timelines that count time differently; **Apply alignment** applies them. **Combine into one timeline** merges the tracks. A comparison is read-only and changes nothing; **Exit comparison** returns to your timeline. See [comparing timelines](comparison.md).

## Changing many times at once

Right-click (or press and hold) the timeline for two tools that change a whole stretch at once:

- **Shift or scale times…** moves, stretches or compresses times by a **Scale**, **Around** a time, plus an **Offset**. **Apply to** chooses every event, those with or without some tags, or what is related to the event you clicked. Use it to correct a timeline recorded against the wrong clock ([shifting and scaling](time-mapping.md)).
- **Delete everything in this view…** deletes every moment in view and the durations wholly inside it, after asking ([deleting a view](retention.md#deleting-everything-in-a-view)).

In the browser, one **Undo** reverts either. On the server, each is saved at once as one revision; save your other edits first.

## Plugins

**Plugins** opens **Timeline plugins**, the plugins installed on this timeline. **Add plugin** opens the **Plugin library**; **Add to timeline** installs one. Each installed plugin can be turned off with **Enabled**, reordered with **Move up** and **Move down**, or removed with **Remove**. Removing a plugin keeps the data it added.

Plugins belong to the timeline and are saved with it, so everyone who opens it sees the same thing. Official plugins include **Moment icons**, **Moment colors**, **Moment shapes**, **Moment stacks**, **Rich text notes**, **Headings**, **Sources**, **Focus on hover**, **Expand on hover**, **Duration backgrounds**, **Timeline background** and **Timeline theme** (the timeline's colors, fonts and text sizes, set under the plugin in the **Plugins** dialog). **Create / import plugin** makes your own, and suites add several at once. **Plugin library** in the header browses everything published. See [plugins](plugins.md).

## Large timelines

A timeline holds up to 200,000 moments, and as many durations and relationships (a server's operator can change this). How large a timeline stays comfortable depends on where you open it:

- **In the browser** the whole timeline is in the page: comfortable up to about 10,000 moments on a fast computer, or 1,000 on a phone.
- **In the desktop app and on the website** (saved to the server) only what is on screen is read, so they stay quick up to the limit.

A notice under the header suggests another way to open a timeline when it gets slow. See [timeline size and platforms](capacity.md).

## Keyboard shortcuts

| Keys                                | Does                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------- |
| Left and Right arrows               | Pan through time (timeline focused).                                       |
| Up and Down arrows                  | Move up and down (timeline focused).                                       |
| `+` or `=`, and `-`                 | Zoom in and out (timeline focused).                                        |
| `F`                                 | Enter or leave full screen (timeline focused).                             |
| `/`                                 | Open search.                                                               |
| Ctrl+Z (⌘Z)                         | Undo.                                                                      |
| Ctrl+Shift+Z or Ctrl+Y (⌘ on macOS) | Redo.                                                                      |
| Alt+Down                            | In a time field with the Gregorian display, open the date and time dialog. |
| Escape                              | Close the open menu, dialog or preview card, or leave full screen.         |
| Up, Down, Home and End              | Move through the timeline's right-click menu.                              |

Undo and redo work outside text fields; inside one, they undo your typing.

## Help in the app

- **The tour:** **Help** under the timeline lists its controls and offers **Take the tour**, which lights up the main controls one at a time. Use **Next** and **Back**, or the arrow keys; Escape ends it. On the website, **Take the tour of the editor** on the help page starts it too.
- **? buttons:** beside the harder settings, in dialogs and on the website's settings pages. Point at one, or move to it with the keyboard, to read a short tip; select it to open the help about it.
- **The help:** **Help** in the website's header has this guide, the [frequently asked questions](faq.md) and every topic in detail, with a search box. The desktop app opens its server's help in your browser (timescale.info's when it isn't connected), and the offline file opens timescale.info's.

## Where to go next

- [Frequently asked questions](faq.md)
- [Durations](durations.md), [relationships](relationships.md) and [tags](tags.md)
- [Time presentation](time-presentation.md), for displays, units and custom formats
- [Sharing timelines](sharing.md) and [collaboration](collaboration.md)
- [Plugins](plugins.md)
- [Importing log files](log-import.md), [syslog](syslog.md) and [the systemd journal](journald.md), to fill timelines automatically
- [The HTTP API](api.md), for programs
- [Docker deployment](docker.md) and [administration](administration.md), to run your own server
