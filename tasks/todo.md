# Story text after goals (2026-10-20)

Plan: `~/.claude/plans/after-completing-an-objective-scalable-pine.md`

- [x] `StepDef.textOnCompletion` (string or function) + `TaskUpdate.stepCompletionTexts` (only for done goals)
- [x] Task panel shows the story under a done goal, before the next goal (`.step-body`, `.step-story`)
- [x] Homayoon: story text on the Hiroshima goal; example task uses the function form; docs §6
- [x] Tests: runtime + Homayoon; 743 pass, typecheck clean; checked in the browser (Homayoon preview)

## Review
- Result dialog and server progress are unchanged (no story text there).
- Eeman and Aleksander have no story texts yet. That copy is the owner's.

# Edits (2026-10-20)

- [x] Homayoon: `sjekk-opp-jente` at sofakrok (girl "Aaaaaaahhhhh" + runs out), `kake` dir from inngang and bar-omrade, `spis-kake` removes the cake tile
- [x] Eeman: step 2 done only when `money > 0`; `./dir` on mac no longer says "permission denied"
- [x] Tests updated; 740 pass, typecheck clean

## Review
- Cake = yellow slice at above-layer tile (16,10). The red/white dish at (9,10) was left alone.
- Placeholder ending `kake` added for `tiss` at the cake (copy is the owner's to edit).
- Eeman tests adapted to the owner's current copy (2 steps, new hint/feedback text).

# OpenStack Terraform (2026-10-20)

Plan: `~/.claude/plans/i-have-access-to-fuzzy-hoare.md`

- [x] Connection: application credential, region `TRD1`, key pair `Mads-MacOS` (owner verified)
- [x] Network, router, security group (80/443 open, 22 from `ssh_allowed_cidr`), port, server, floating IP (`infra/main.tf`)
- [x] cloud-init installs Docker + Caddy; `deploy.sh` copies the app and runs the container; outputs; `infra/README.md`
- [x] `fmt`, `validate`, static check, `terraform plan` (12 to add, 0 destroy, with placeholder domain/CIDR)
- [ ] Owner: fill in `domain` + `ssh_allowed_cidr`, `terraform apply`, DNS A record, `ADMIN_PASSWORD` in `.env`, `./infra/deploy.sh`
- [ ] Verify end to end: HTTPS, phone on eduroam, `/admin` starts a task, SSH refused from outside the CIDR

## Review
- Only static-check finding: local state (no remote backend). Intentional, to keep it simple; documented in `infra/README.md`.
- 80/443 open to `0.0.0.0/0` is intended (public site + Let's Encrypt challenge).
