# Chess-Publisher Web Engine

This Worker supplies the native operations that a static GitHub Pages application cannot execute itself.

## Production boundary

- Route: `https://web.chess-publisher.org/api/engine/*`
- Authentication: the same user-scoped Organizer Token already used by Chess-Publisher Web/Cloud.
- Token validation: Hub Cloud Workspace authentication endpoint.
- Allowed browser origin: `https://web.chess-publisher.org`.
- Authoritative pairing engine: protected upstream Gacrux 1.9.57 source copied from `engine/gacrux` only at CI/deploy time.
- No prototype or synthetic pairing fallback.
- Gacrux tie-break checker is also executed from the same protected source.
- The optional native BBP 6.0.0 independent pairing checker is reported as unavailable in the WebAssembly Worker runtime; it is never impersonated by another algorithm.

The `engine/gacrux` source tree remains unchanged and is the single source of truth.
