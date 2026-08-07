# Changelog

All notable changes to YTC Entry are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/).

> Nothing has been tagged yet. `package.json` carries `0.1.0`, but no release
> was ever cut, so every change below is still unreleased. Production is
> deployed straight from `main` with `railway up` — see the deploy notes in the
> README.

## [Unreleased]

### Added

- Dashboard home shows live **door status**: connected / not connected / needs
  attention per door, with response time and how many enrollments are waiting
  on each. Probed on load, so it reflects the door right now.
- The Directory now lists people who were enrolled but **haven't reached the
  door yet**, marked "Waiting for door", with their photo. Previously the list
  was built from the door's own directory, so anyone added during an outage was
  invisible even though their photo was saved.
- Roster import accepts sheets that split a name across **First name / Last
  name** columns and joins them.
- An email whose attachment can't be read as a photo now appears in the Review
  Queue with the reason and what was attached, instead of being dropped
  silently. Only Reject is offered, since there's no photo to enrol.
- Emailed photos sent as a **PDF attachment** are now accepted — the embedded
  JPEG is lifted out of the PDF, so "Print to PDF" and scanner-app submissions
  work instead of being silently ignored.

### Fixed

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

### Changed

- Roster import reports how many rows were skipped for a blank name or ID.
