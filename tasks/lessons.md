# Lessons

- **Don't invent scene content in mockups.** I added a dance floor to Homayoon Bar; the real bar only has tables and stools, and the user designs the layout. When sketching a scene, use only what the user named and label everything else as placeholder.
- **Check unlock/order rules for task actions.** I guessed `tiss` was always available; it only unlocks after drinking a Hiroshima. Ask about the order of a task's steps instead of assuming they're open.
- **Owner's edits to their own content are final.** I overrode the Aleksander `commands` list because it broke tests; the owner reverted my override and said it's always final. Never silently "fix" the owner's hand edits (task text, command lists, copy) — report the conflict and adapt code/tests around them instead.
