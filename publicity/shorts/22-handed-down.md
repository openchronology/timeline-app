# OpenChronology — Short 22: Handed Down. Script and Storyboard

**Runtime:** ~0:44 · **Shape:** the line · **Look:** Archive · **Aspect:** 9:16
**For:** Marines, Marine veterans and their families in the days before 10 November, on the feeds where they share the birthday. They know the cake ceremony by heart; what stops them is seeing the whole line it stands for, 1775 to today, on a phone, and hearing why the oldest Marine hands the cake to the youngest.
**Purpose:** the first of the Marine Corps lessons series (Shorts 22–27), each built around one lesson for Marines to carry through their service. This one: **keep faith with those who came before you, and hand it on.** It is posted for the Corps' 251st birthday, 10 November 2026.
**Points to:** the Marine Corps timeline, `timescale.info/athan/usmc` (there is no tour video of it).

**Production notes:**

- About 96 words (the numbers spelled out), read at about 150 wpm, slower than the other shorts. The voice is a retired senior NCO talking to young Marines: warm and plain, not a recruiting advert and not a eulogy.
- **The timeline is the sample `publicity/video/samples/usmc.ochx`**, an export of `/athan/usmc` with this series' additions, shown in `phoneShot`. Views are given as dates (UTC); in `shots.json` they are stored seconds (Gregorian display).
- **Capture it narrow:** `"size": [360, 640], "scale": 3`, as in Short 20, with **Group within** lowered to 12 px in each shot's `setup`. Every `open` goes under the shot's `actions`, from a view that starts in an earlier year than the moment, so the reader shows its year.
- **New moments this short needs** (added to the timeline before capture):
  - "The first formal birthday ball" (1925; the day is not recorded, so the moment marks the year, as the timeline's Semper Fidelis moment does);
  - "The cake-cutting ceremony is made standard" (1952: Commandant Lemuel C. Shepherd Jr.; the first slice to the guest of honor, the second to the oldest Marine present, who passes it to the youngest; in the drill manual from 1956);
  - "The Corps turns 250" (10 November 2025).
- **The readouts and the quotation card are drawn by the infographic layer** beside or over the empty part of the frame, never over the app's own text.
- **Not affiliated:** the end card and the caption say "Not affiliated with or endorsed by the U.S. Marine Corps or the Department of Defense." No Eagle, Globe and Anchor, seal or recruiting artwork on the cover or the end card; the emblem appears only where the timeline already shows it, as the 1868 moment's picture.
- **Accuracy guardrails:** the founding is the Continental Congress's resolution of 10 November 1775 ("that two Battalions of Marines be raised"); the birthday as a Corps-wide observance dates from Lejeune's Marine Corps Order No. 47 (Series 1921), issued 1 November 1921 and to be read on 10 November "hereafter … of every year". The quotation is the order's own sentence, unchanged except that "the corps" is shortened away after "preceded us" (shown with an ellipsis on screen). "251st" is 2026 − 1775. Battles named in the narration are all moments or durations on the timeline.

---

## ACT 1 · THE CAKE (0:00 – 0:12)

### Scene 1 · 0:00 – 0:05 · The cover

**FRAME:** The phone, large in the frame, showing the whole timeline after **Fit all** (1775 → 2026): the chapter headings, the war bands with their pictures behind, the moments crowded along the line. Above it, the headline, already whole at frame 0; under it, in the look's serif, "10 November 1775 → 10 November 2026".

**MOTION:** None to start: the frame is the cover. A slow drift begins as the sentence ends.

**OST:** "251 years, handed down"

**VO:**
"Every tenth of November, the oldest Marine in the room hands a piece of cake to the youngest."

### Scene 2 · 0:05 – 0:12 · Where it starts

**FRAME:** The zoom runs in to 1 September – 31 December 1775: "The Continental Congress raises two battalions of Marines · 1775-11-10" and "Samuel Nicholas commissioned Captain of Marines · 11-28", under the Revolutionary War band. Then, from a view starting 1 January 1775, the founding opens in the reader, filling the phone: "1775-11-10", the Tun Tavern sketch, the resolution's words, Sources.

**MOTION:** A continuous zoom (log speed) easing to a stop on 10 November; the reader slides up.

**OST:** "10 November 1775"

**VO:**
"It started here, in 1775: two battalions of Marines."

---

## ACT 2 · THE LINE (0:12 – 0:32)

### Scene 3 · 0:12 – 0:21 · Every generation

**FRAME:** The reader closes; the view pulls back and runs along the line in one long pan: Derna (1805), Chapultepec (1847), Belleau Wood (1918), Iwo Jima (1945), the Chosin Reservoir (1950), Huế (1968), Fallujah (2004). Each one is held for a beat as it crosses the middle of the phone. Beside the phone, a readout counting the years from 1775: "30", "72", "143", "170", "175", "193", "229".

**MOTION:** A steady pan (about 8 s), the readout ticking with it; nothing pulses.

**OST:** "Every generation added to it"

**VO:**
"Every generation since has added to the line. Tripoli. Belleau Wood. Iwo Jima. Chosin. Huế. Fallujah."

### Scene 4 · 0:21 – 0:32 · The order

**FRAME:** The pan eases to a stop on 1921: "John A. Lejeune becomes Commandant · 1920-07" and "Lejeune's birthday message (Marine Corps Order No. 47) · 1921-11-01". From a view starting 1 January 1921 the order opens in the reader. Over the empty space above the phone, the quotation card, in the look's serif: "This high name of distinction and soldierly repute we who are Marines today have received from those who preceded us…", attributed "— John A. Lejeune, 1921".

**MOTION:** The reader slides up; the card's lines fade in with the narration.

**OST:** "Read every 10 November since 1921"

**VO:**
"In 1921, Commandant Lejeune ordered a message read on every birthday. It still is: 'This high name we have received from those who preceded us.'"

---

## ACT 3 · THE LESSON (0:32 – 0:44)

### Scene 5 · 0:32 – 0:40 · Hand it on

**FRAME:** The reader closes; the view runs to 1945 – 2030: "The cake-cutting ceremony is made standard · 1952", the moments of Korea, Vietnam, the Gulf and Afghanistan, and "The Corps turns 250 · 2025-11-10" at the right edge. The 1952 moment brightens, then the 2025 one. The lesson card rises over the empty space: "Keep faith with those who came before you. Then hand it on."

**MOTION:** A pan and zoom (about 2 s); the two moments brighten one after the other; the lesson card fades in and holds.

**OST:** "Keep faith. Hand it on."

**VO:**
"That's what the cake is. Nobody earns the title alone. Keep faith with the Marines who came before you, and hand it on."

### Scene 6 · 0:40 – 0:44 · The end

**FRAME:** The phone eases back to the whole line, then shrinks and lifts; `shortEnd` with "Happy 251st birthday, Marines", "timescale.info/athan/usmc", "Not affiliated with or endorsed by the U.S. Marine Corps or the Department of Defense", and the repository's address.

**MOTION:** The phone eases away; the end card rises and holds.

**OST:** ""

**VO:**
"Semper Fidelis. Happy birthday, Marines."

**[END · ~0:44]**

---

## Appendix A · Narration only (for the voice session)

> Every tenth of November, the oldest Marine in the room hands a piece of cake to the youngest.
>
> It started here, in 1775: two battalions of Marines.
>
> Every generation since has added to the line. Tripoli. Belleau Wood. Iwo Jima. Chosin. Huế. Fallujah.
>
> In 1921, Commandant Lejeune ordered a message read on every birthday. It still is: "This high name we have received from those who preceded us."
>
> That's what the cake is. Nobody earns the title alone. Keep faith with the Marines who came before you, and hand it on.
>
> Semper Fidelis. Happy birthday, Marines.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                                                                                                                                                                                                                                                            | Source                                                                                                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1, 5  | At the birthday the first slice goes to the guest of honor and the second to the oldest Marine present, who passes it to the youngest; Commandant Lemuel C. Shepherd Jr. standardized the ceremony in 1952, and it entered the drill manual in 1956                                                                              | [Marine Corps birthday ball](https://en.wikipedia.org/wiki/Marine_Corps_birthday_ball)                                                                                                                |
| 2     | On 10 November 1775 the Continental Congress resolved "that two Battalions of Marines be raised"                                                                                                                                                                                                                                 | [Tun Tavern](https://en.wikipedia.org/wiki/Tun_Tavern); [Continental Marines](https://en.wikipedia.org/wiki/Continental_Marines)                                                                      |
| 3     | Derna (27 April 1805, "the shores of Tripoli"), Chapultepec (13 September 1847), Belleau Wood (June 1918), Iwo Jima (February – March 1945), the Chosin Reservoir (November – December 1950), Huế (January – March 1968), Fallujah (April and November – December 2004) are on the timeline; the readout is each year minus 1775 | The timeline's own moments and durations, each with its source; our arithmetic                                                                                                                        |
| 4     | Lejeune issued Marine Corps Order No. 47 (Series 1921) on 1 November 1921, to be read on 10 November 1921 and "hereafter on the 10th of November of every year"; it is still read at birthday celebrations                                                                                                                       | [Marine Corps birthday ball](https://en.wikipedia.org/wiki/Marine_Corps_birthday_ball); [United States Marine Corps Birthday](https://en.wikipedia.org/wiki/United_States_Marine_Corps_Birthday)      |
| 4     | "This high name of distinction and soldierly repute we who are Marines today have received from those who preceded us in the corps." (the narration shortens it to "This high name we have received from those who preceded us")                                                                                                 | Marine Corps Order No. 47 (Series 1921), as quoted in [Marine Corps birthday ball](https://en.wikipedia.org/wiki/Marine_Corps_birthday_ball)                                                          |
| 5     | The Corps' 250th birthday, 10 November 2025                                                                                                                                                                                                                                                                                      | [250th anniversary of the United States Marine Corps](https://www.marines.mil/News/Messages/Messages-Display/Article/4000116/250th-anniversary-of-the-united-states-marine-corps/) (MARADMIN message) |
| 6     | 10 November 2026 is the 251st birthday: 2026 − 1775 = 251                                                                                                                                                                                                                                                                        | Our arithmetic                                                                                                                                                                                        |
| 6     | The app is free                                                                                                                                                                                                                                                                                                                  | [Licensing](../../docs/licensing.md)                                                                                                                                                                  |

## Appendix C · Posting

- **Post on:** 9 or 10 November 2026.
- **Title (Shorts):** Why the oldest Marine hands the cake to the youngest
- **Caption:** Every 10 November, the oldest Marine present hands a piece of birthday cake to the youngest. 251 years of the Corps on one line, from two battalions in 1775 to today, and the lesson the cake carries: keep faith with those who came before you, and hand it on. Semper Fi. Not affiliated with or endorsed by the U.S. Marine Corps or the Department of Defense. #marines #usmc #semperfi #marinecorpsbirthday #history
- **Cover:** frame 0 (the whole line and the headline).
- **Pinned comment:** "The founding: the Continental Congress's resolution of 10 November 1775. The birthday message: Commandant John A. Lejeune's Marine Corps Order No. 47, 1 November 1921, read every 10 November since. The cake ceremony was standardized in 1952. Every moment on the timeline has its source. The app is OpenChronology, free and open source: github.com/openchronology/timeline-app."
