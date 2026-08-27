# Changelog

All notable changes to YTC Entry are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/).

> Nothing has been tagged yet. `package.json` carries `0.1.0`, but no release
> was ever cut, so every change below is still unreleased. Production is
> deployed straight from `main` with `railway up` — see the deploy notes in the
> README.

## [Unreleased]

### Added

- **The phone app can now review and approve emailed photos.** A new Review tab
  lists everything waiting, shows the photo, offers the roster matches as
  one-tap approvals, and lets you add by name or reject — including picking the
  right picture when a signature logo came along with it.
- **The Roster page opens with how far along you are** — "29 / 82 have a photo
  on file", the percentage, a progress bar, and how many are still to come in.
  Updates as soon as you import, add, or remove someone.
- **Whoever emails a photo in now gets told when the person is live on the
  door** — a short reply, threaded under their original email, sent once the
  door actually has them. It fires however they got there, including hours later
  when a door outage clears and the queued enrollment finally lands. Door scans
  and people added by hand send nothing, since no address was ever given.
  Set `NOTIFY_ON_ENROLL=false` to turn it off.
- Dashboard home shows live **door status**: connected / not connected / needs
  attention per door, with response time and how many enrollments are waiting
  on each. Probed on load, so it reflects the door right now.
- The Directory now lists people who were enrolled but **haven't reached the
  door yet**, marked "Waiting for door", with their photo. Previously the list
  was built from the door's own directory, so anyone added during an outage was
  invisible even though their photo was saved.
- Roster import accepts sheets that split a name across **First name / Last
  name** columns and joins them.
- The Roster list shows each person's photo as a thumbnail, click to open it
  full size.
- The Review Queue lets you search the student list and attach a photo to the
  right person yourself, for emails the matcher couldn't match (an email with
  no subject line gives it no name to work with).
- An email whose attachment can't be read as a photo now appears in the Review
  Queue with the reason and what was attached, instead of being dropped
  silently. Only Reject is offered, since there's no photo to enrol.
- The sender is also **replied to automatically**, in English and Hebrew,
  asking them to resend the picture as a photo. One reply per email, never to
  automated senders. Set `REPLY_TO_UNUSABLE=false` to turn it off.
- Emailed photos sent as a **PDF attachment** are now accepted when the PDF
  wraps a JPEG, which is what phones and scanner apps produce — the JPEG is
  lifted out as-is. A PDF that stores the picture as a raw bitmap (some
  "Print to PDF" output) still can't be read; it lands in the Review Queue as
  unusable, naming the file, and the sender should be asked for a photo.

### Changed

- **The doors are polled far less.** Both the denied-scan pull and the full
  directory reconcile now run every 6 hours, down from every minute and every
  30 minutes respectively. Denied scans therefore reach the Review Queue in the
  next 6-hourly sweep rather than within the minute. The reconcile pages through all 931 users on every door, so its
  cost multiplies with each door added, and it only ever catches edits made on
  the reader's own screen — everything the dashboard does updates the cache
  instantly. Tunable with `DOOR_POLL_MS` and `DIRECTORY_SYNC_MS`.

### Added

- **Filter by door on the Roster and Temporary PINs pages.** The Roster shows
  who is enrolled on a chosen reader; Temporary PINs shows only that door's
  PINs. With three doors, "who has this" was otherwise unanswerable without
  reading every row.
- **Give or take away one person's access to one door, from the Directory.**
  Each managed person shows a chip per door: tick to push their stored photo to
  that reader, untick to delete them from it. This is how someone already
  enrolled gets kitchen access without being re-enrolled.

### Fixed

- **Enrolling no longer grants every door by default.** Both the Add Person
  form and the Review Queue pre-ticked every door, so a person added while more
  than one door exists silently got access to all of them — a real grant of
  kitchen access happened this way. Only doors marked "Receives emailed photos"
  start ticked; a restricted door has to be chosen deliberately, and the Review
  Queue now shows the same door checkboxes so it can be chosen there.
- **Approving an emailed photo no longer enrolls onto every door.** The per-door
  "Receives emailed photos" setting existed but was read nowhere, so approvals
  fell through to all active doors — harmless with one door, an access leak the
  moment a restricted one is added.
- **Loading the dashboard can no longer lock a door out.** Detecting a reader's
  password scheme costs a failed login, and readers lock after three — so a door
  on the newer firmware was spending a failed attempt on every single
  connection, including each door-status probe on the home page. The scheme is
  now learned once and remembered per door.
- **Doors running newer firmware can be added at all.** Readers ship three
  different password schemes and only the oldest was supported, so a correct
  password was reported as wrong. The login now detects which scheme a door
  uses — costing no failed attempt for the newest one, and never more than two
  for the others, so a door is never locked out by a single add.
- **Adding a door now says which thing went wrong.** "Couldn't log in — check
  the URL and password" covered both a door that never answered and a door that
  answered and rejected the password — different fixes, and it pointed at the
  URL when the URL was fine. The two are now reported separately.
- **Pasting a door's address from the browser works.** The reader's admin page
  is a hash route, so a copied address ends in `/#/`; that fragment survived
  into the saved URL and sent every request to the site root instead of `/web`.
- **Denied door scans now open on the most recent ones.** They were sorted
  oldest-first, so with 292 waiting the scans you actually care about sat on
  page 13. Denied scans now default to newest-first, either queue can be
  flipped between newest and oldest, and the pager gained jump-to-first and
  jump-to-last buttons. Asking for a page past the end also used to show an
  empty list instead of the last page.
- **Emails no longer enroll the sender's company logo.** An image in a signature
  arrives looking exactly like an attached photo, so the queue was showing a
  "VISTA PACIFIC" wordmark and a court seal while the real picture — sitting in
  the very same email — was thrown away. Every image from the email is now kept,
  the one most likely to be the person is used by default, and the Review Queue
  shows the rest as thumbnails so you can click the right one.
- **One stuck enrollment no longer holds back everyone waiting for the door.**
  The store-and-forward retry stopped the entire cycle at the first person whose
  push failed, and always started from the same one — so a backlog never drained
  even after the door came back. It now works through the whole backlog
  oldest-first, and only gives up early when several pushes in a row show the
  door is genuinely down.
- **Failed retries are no longer silent.** The push worker logged only its
  successes, so a backlog that was failing every two minutes looked exactly like
  a retry loop that wasn't running. Every failure is now logged with the person,
  the door, and the reason.
- **Roster import no longer merges people together.** With no unique ID column,
  every row was overwriting a handful of records: an 83-row upload reported
  "2 added, 78 updated" and left 2 rows. Student ID is now optional and a stable
  key is generated from the name; if a mapped ID column repeats a value the
  import stops and names the duplicates instead of silently overwriting.
- Roster column auto-detection no longer matches a "Grade" or "Year" column as
  Student ID, or a "Last Name" column as the full name.
- Roster page returned a 500 for every visitor.
- Adding someone from the **phone app failed with "bad_request"** whenever a
  photo was attached. The upload was fine; the server rejected the app's
  multipart encoding.
- Adding someone while a door is **offline no longer reports failure** in the
  phone app. They're saved and pushed automatically once the door returns, and
  the app now says so rather than prompting staff to add them again.
- **Enrollments queued during an outage are actually retried.** Only socket-level
  errors counted as temporary, so an outage seen as an HTTP 502/503/504/530 from
  the tunnel was treated as permanent and never retried.
- Enrollments created before any door existed are now picked up once a door is
  configured, instead of being stranded.
- Emailed photos with no usable image are no longer re-read on every poll cycle.
- Roster table and the manual-add form said "Name column" instead of "Name".
- Approving a photo by typing a name now links the matching student on the
  roster, so they stop showing as "Needs photo" once they're on the door.
  Matches regardless of name order ("Josefovic Dovi" = "Dovi Josefovic"), and
  leaves it alone if two students share a name.
- **Removing someone who is still waiting for the door now works.** Remove
  always went to the door first, so with the door offline — the only time these
  entries exist — it failed before deleting anything and the person stayed
  listed. Waiting entries are now removed locally and their pending sync is
  cancelled, so the pusher won't push someone you just removed.
- Names picked from the roster in the phone app no longer arrive with a "+"
  instead of a space ("Avromi+Franklin"). Needs a new app build to take effect.

### Changed

- Review Queue photos are shown whole instead of cropped to a square, and open
  full size when clicked.

- Roster import reports how many rows were skipped for a blank name or ID.
