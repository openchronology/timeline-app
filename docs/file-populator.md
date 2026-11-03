# Timelines from files

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The desktop app can make a timeline from the files on your computer: a moment for each photo, video, recording or any other file, at the time you choose ([#433](https://github.com/openchronology/timeline-app/issues/433)). A folder of photos becomes an album you browse by when each was taken. Each moment's source is the file itself, so opening a moment's source opens the file in its own app, such as your photo viewer or video player. Nothing is copied: the timeline links to the files where they are.

This is only in the desktop app. A web browser can't read your folders, and a server never stores where your files are (see [Your file paths stay on your computer](#your-file-paths-stay-on-your-computer)).

## Making one

Choose **From files…** (on a phone-sized window it's in **File**). The dialog asks:

| Choice                                        | What it does                                                                                                                                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Folders and files**                         | **Add folders…** and **Add files…** pick them in your system's own dialog; only what you pick there is read. **Clear** empties the list.                                                                  |
| **Search subfolders too**                     | Includes the files in every folder inside the ones picked (on by default). Hidden files and folders, whose names start with a dot, are passed over, and links to other folders are never followed.        |
| **Which files**                               | **Photos, videos and sound** (by their file extension, listed below) or **Any file**.                                                                                                                     |
| **Date each moment by**                       | For any file, **when the file was created** or **when the file was last modified**. For photos, videos and sound, also **when it was taken or recorded**, from the file's own metadata.                   |
| **Times recorded without a time zone are in** | Most cameras record the time a photo was taken without its time zone. This says how to read it: as **this computer's time zone** at that date (the default) or as **UTC**. A time with its zone is exact. |
| **Metadata: Add where each was taken (GPS)**  | Off by default. When on, a photo or video that records its location gets a `location` in its metadata: `{ "latitude": 51.5, "longitude": -0.125 }`. Where a photo was taken is often where someone lives. |
| **Title**                                     | The new timeline's title; the first folder's name to begin with.                                                                                                                                          |

**Make timeline** reads the files, showing how many it has looked at, and opens the new timeline. **Stop** ends it early with what it has found so far. The new timeline isn't saved yet: **Save As…** writes it to an `.och` file. A message says how many moments were made and which files were left out, and why.

### What each moment holds

- **Time:** the date chosen, exact to the nanosecond the file system or the file records. The timeline shows dates in this computer's time zone.
- **Title:** the file's name, such as `IMG_0042.JPG`.
- **Source:** the file, as a `file:///` link (its path, with spaces and other characters written as `%20` and so on). The timeline has the **Sources** plugin, which lists it.
- **Tags:** the kind of file: `file:photo`, `file:video`, `file:audio`, or `file:other`.
- **Location:** only when chosen, as above.
- **Thumbnail:** a photo shows a small picture of itself as its marker (see [Thumbnails](#thumbnails)).

Each moment's ID comes from its file's path, so the same file gives the same ID each time.

### Which dates a file has

- **Taken or recorded** is read from EXIF for photos (when the photo was taken, or else when it was digitized) and from the creation date in a video's or recording's header. A file without one, such as a screenshot, a downloaded image or most MP3s, is left out and counted. A date of zero, which some cameras write when their clock isn't set, counts as none.
- **Created** is when the file was made on this disk, which for a copied photo is when it was copied, not when it was taken. Some Linux file systems don't keep it; then those files are left out and counted.
- **Modified** is when the file's contents last changed.

### Limits

One population makes at most 100,000 moments and looks at most at a million files and folders; past either it stops and says so. A timeline holds at most 200,000 moments.

Photos: `jpg`, `jpeg`, `heic`, `heif`, `avif`, `png`, `webp`, `tif`, `tiff`, `dng`, `cr2`, `cr3`, `nef`, `arw`, `raf`, `orf`, `rw2`, `iiq`. Videos: `mp4`, `m4v`, `mov`, `3gp`, `mkv`, `webm`, `avi`. Sound: `mp3`, `m4a`, `aac`, `flac`, `wav`, `ogg`, `opus`, `mka`. Recorded dates are read from JPEG, HEIC/HEIF, AVIF, PNG, WebP, TIFF and the raw formats listed, and from MP4, MOV, 3GP, MKV, WebM and MKA.

## Thumbnails

In the desktop app, a moment whose source is a photo on this computer shows a small picture of it as its marker, which grows on hover like any marker picture ([#440](https://github.com/openchronology/timeline-app/issues/440)). The **File thumbnails** plugin (`file-thumbnails`) does this, and a timeline made from files has it; add it in **Plugins** to any timeline whose moments have photos among their sources. A moment uses its first source that is a photo.

- **Where they come from:** the photo's own small preview, which most cameras and phones store in the photo's EXIF and many raw files carry too, or else the photo itself scaled down. Each is turned the way the photo was taken.
- **Where they are kept:** in the app's cache folder, at most 160 pixels a side, named by the photo's path, size and modification time, so a changed photo gets a new one. Deleting the folder only means they're made again. The page holds them while it shows them; they are never saved into the timeline or sent anywhere.
- **Which photos:** JPEG, PNG, WebP, TIFF, GIF and BMP are scaled down when they carry no preview of their own; HEIC, AVIF and raw files show one only when they carry their own JPEG preview. Photos over 256 MB without one aren't read. Videos and sound show no picture yet.
- **Elsewhere:** on the website and in the offline file, which can't read your files, these moments keep their usual markers.

## Opening a moment's file

A moment's source that is a file shows its name. In the desktop app:

- **Clicking the name** opens the file in your system's app for it. The first time you open a file from a timeline, the app asks first, naming the file: open files from a timeline only when you trust where the timeline came from.
- **Show in folder** opens the folder holding it in your file manager (on macOS and Windows with the file selected).

Some files are never opened from a timeline, because opening them would run something: programs, scripts, installers, shortcuts and launchers (such as `.exe`, `.bat`, `.sh`, `.app`, `.desktop`, `.lnk`, `.dmg`, `.jar` and `.py`), anything that is a link to one, and, on Linux and macOS, any executable file that isn't a photo, video or sound (photos on a memory card are often marked executable). **Show in folder** still works for them. A file that has been moved or deleted, or is on another computer, can't be opened.

A source can also be typed as a `file:///` path in the **Sources** field, one per line, alongside HTTPS links.

## Your file paths stay on your computer

A file's path says who you are and how your folders are arranged (`/home/someone/Pictures/…`, `C:\Users\someone\…`), so it never goes to a server:

- **The app leaves them out.** Saving to a server, sending a pull request or anything else sent to a server goes without `file://` links, and a message says how many stayed on this computer. The `.och` file on your computer keeps them.
- **The server refuses them.** A request holding a `file://` link anywhere is refused, so no other program can store one there either.

On the website, and in the offline file, a file source is shown by its name as text, noting it's a file on the computer that added it.
