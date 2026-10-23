# Getting the ORM app onto Google Play

**Why this document exists:** staff installing the app are shown two security
warnings, and in a hospital that is not a cosmetic problem. A clinician who
is told to override their phone's security advice in order to run a hospital
system is being asked to do the exact thing they are trained not to do, and
some of them will quietly decline. The warnings are not a defect in the app
and cannot be fixed in the app.

## What the warnings are, and why the domain did not fix them

There are two, and they come from different places.

1. **"Install unknown apps" / "Allow from this source"** — shown by Android
   before installing any APK that did not come from a store.
2. **"Unsafe app blocked" / "Scan app?"** — shown by Google Play Protect
   after installing, because Google has never seen this app's signature
   before.

Neither depends on where the file is hosted. Serving it from
`unth-theatre.link` instead of `github.com` makes the address recognisable —
worth doing, and done — but Android does not treat a hospital domain any
differently from any other. **The warnings go away when, and only when, the
app is installed from the Play Store.**

## The route to take: Play Console, internal testing track

Not a public listing. The **internal testing** track lets you add up to 100
staff by email address; they install from the Play Store app as normal, with
no warnings and with automatic updates, and the app never appears in search
results for the general public. If more than 100 people need it, closed
testing raises the limit.

### Read this before paying for anything

**The app is a WebView wrapper around a website, and Google rejects those.**

`capacitor.config.ts` sets `server.url` to the live site, so the Android app
does not contain the application at all — it opens
`unth-theatre.link/dashboard` in a full-screen browser. Play's **Minimum
Functionality** policy exists specifically to refuse apps that are "only a
website with no native capability", and a reviewer opening this app sees a
web page.

It is not hopeless — the app does register for FCM and receive native push
notifications, which is real native functionality and is the argument to
make. But it is a genuine rejection risk, and finding it out *after* two
weeks of D-U-N-S paperwork would be the worst order to discover it in.

There are three ways through, in increasing order of effort:

1. **Managed Google Play (private app)** — see the last section. Distributing
   privately within one organisation sidesteps the public-store policy
   entirely. If the hospital has Google Workspace, **start here, not with
   Step 1 below.**
2. **Argue the native case.** Submit with the push-notification integration,
   and describe it in the review notes as an internal tool for named hospital
   staff. Internal-testing review is lighter than production review.
3. **Bundle the app instead of pointing at it.** Remove `server.url` so
   Capacitor ships the built web assets inside the APK, as it normally does.
   This is the robust answer and also makes the app work on a bad connection
   — but it is a real piece of work: the app currently relies on being the
   live site, and offline behaviour, sync and auth would all need thought.

My recommendation: check whether the hospital has Google Workspace before
anything else. If it does, option 1 is both faster and a better fit for
clinical software that should never have been publicly listed anyway.

### Step 1 — Register the hospital, not a person

Go to the Play Console and register as an **organisation**, not an individual.

This matters more than it looks. The developer name is shown on the listing,
and "University of Nigeria Teaching Hospital" is the single strongest signal
of legitimacy available here — far stronger than anything the install page
can say. A personal account would show an individual's name.

- Registration fee: **$25, one-off**, not annual.
- An organisation account needs a **D-U-N-S number**. It is free from Dun &
  Bradstreet but is the long pole — allow a couple of weeks, and start it
  first.
- You will also need the hospital's legal name and address exactly as
  registered, a contact email **on the hospital's domain**, and the hospital
  website.
- Google then verifies the organisation. Its details appear publicly on the
  listing, which is the point.

### Step 2 — Satisfy what Play requires of the build

Check the exact current values in the Console rather than trusting this
list; Google raises them on a schedule.

- **An App Bundle, not an APK.** Play takes `.aab`. One is built and signed:
  `android/app/build/outputs/bundle/release/app-release.aab`, from
  `./gradlew bundleRelease`, using the same signing config as the APK.
- **Target API level.** The app targets **34**; Play requires a recent level
  (API 35 as of August 2025), so this will need bumping in
  `android/variables.gradle`. It is not a one-line change: compiling against
  35 needs **Android Gradle Plugin 8.6+**, and Capacitor 6 pins **8.2.1**, so
  the plugin has to move first. Targeting 35 also makes edge-to-edge drawing
  mandatory on Android 15, which affects a full-screen WebView directly —
  so it needs testing on a real handset, not just a successful build.
  This is **not** on the critical path: the Play account takes longer.
- **A privacy policy at a public URL.** It must be reachable without signing
  in. `unth-theatre.link/privacy` is the obvious home.
- **The Data safety form.** This app handles patient-identifiable data, so
  answer it carefully and truthfully; it is published on the listing.
- **Content rating questionnaire** and, because this is clinical software, a
  **health apps declaration**. Expect to state that it is an internal
  hospital operations tool and not a medical device.

### Step 3 — Understand the one-time cost to people who already installed

**Play App Signing re-signs the app with a Google-held key.** The signature
therefore changes, and Android will not upgrade an existing install across a
signature change.

Everyone who sideloaded the current app must **uninstall it first**, then
install from Play. It is a single disruption, it only happens on this
transition, and nothing is lost because the app holds no local data of its
own — but it must be communicated, or it looks like a failure. The SHA-1
fingerprint published on the download page will also change; update it.

## Until that is done

The install page now:

- serves the APK from `unth-theatre.link/downloads/android`, a hospital
  address that stays valid across releases, rather than a `github.com` URL;
- names **both** dialogs in advance, including Play Protect, which it
  previously did not mention. Being blindsided by a second, scarier warning
  after being promised one is what actually destroys confidence;
- frames the warnings as Android not recognising the hospital, rather than
  as a judgement about the app;
- offers staff the alternative of handing the phone to the theatre manager.

That is the most the page can honestly do. The rest is Step 1.

## The alternative, if the hospital uses Google Workspace

**Managed Google Play** (Android Enterprise) publishes the app privately to
one organisation — no public listing at all, and it can be pushed to staff
devices rather than requested. It needs Google Workspace and a device
management setup. If the hospital already has both, it is the better answer;
if not, the cost of acquiring them is far higher than the Play route above.
