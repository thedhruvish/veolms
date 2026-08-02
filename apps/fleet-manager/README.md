# Fleet Manager

The fleet manager will be a separate, long-running, provider- and platform-agnostic service. It will observe demand from a future PostgreSQL-backed job system, calculate required worker capacity, and start, stop, drain, or terminate worker machines. It will manage media workers and may manage other worker types later.

Provider integrations will use adapters. Possible adapters include AWS EC2, Hetzner, DigitalOcean, local Docker, generic SSH-managed VPSs, and other programmable providers. Provider SDKs must not leak into the core reconciliation logic.

The public API will not manage infrastructure directly, and the fleet manager will not process video jobs. Implementation will be added later.
