# Sync false-conflict fix deployment marker

Deploy the validated repair that prevents ordinary one-sided Web edits (for example tournament name, venue, organizer or other setup fields) from being misclassified as a Desktop/Cloud + Web two-sided conflict after a fingerprint-content schema upgrade.

The repair treats an unchanged Cloud revision as the authoritative common base, validates `fingerprintContentSchema`, preserves explicit Pull/Push direction, and allows a stale false-positive conflict latch to be cleared through the pull-only provider path without uploading local edits.

Production retry: previous code/build/regression gates passed; retrying only because GitHub artifact finalization returned a transient HTTP 403 before the Pages upload step.
