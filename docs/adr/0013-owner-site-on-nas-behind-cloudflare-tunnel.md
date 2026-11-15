# The owner's copy serves the site and PocketBase from the NAS through a Cloudflare Tunnel to their own domain

Status: accepted (planned, stages 2, 4–5)

Decided with the owner on 2026-11-15 («Описание 2»). The owner's copy runs fully at home: PocketBase (ADR 0012) and also the built site. It is reached from outside through a Cloudflare Tunnel to a domain the owner buys (about 40 ₪ a year). The copy is used by the owner and the helpers, so access must work on any phone without a VPN app. PocketBase sign-in protects the data. GitHub Pages stays the site for everyone else (ADR 0001, ADR 0004).

Considered: keeping the site on GitHub Pages and putting only PocketBase on the NAS. That keeps the address and the icons, but the owner wants everything at home. Tailscale lost because every phone, the helpers' too, needs its app. Tailscale Funnel is free but gives a long address on a shared domain. Opening router ports lost on security, and the home line may sit behind the provider's NAT.

## Consequences

- A new address for the owner's copy: every iPhone installs the icon again and connects again. The domain and addresses never enter the public repo (ADR 0005). They live on devices and in the connect link, like the Firebase config.
- The site needs a second build with its own base path and a deploy to the NAS. Stage 2's spec decides how.
- The new origin goes into the Google OAuth client (Drive, Sheets, PocketBase's Google sign-in).
- Cloudflare's free-plan limits apply to every request: body size, idle time of realtime connections.
- New external dependencies: Cloudflare and the domain registrar.
