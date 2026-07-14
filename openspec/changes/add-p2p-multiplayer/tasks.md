# Tasks: add-p2p-multiplayer

## 1. Session core (no networking yet — testable in-process)

- [ ] 1.1 Define the message envelope (`kind`, `payload`, `seq`) and `HostSession`/`GuestSession` in `src/network/`, wrapping `HeadlessGame`-style command execution on the host side
- [ ] 1.2 Implement `OwnershipGate`: activeTeamId for commands, `pendingDecision.chooserTeamId` for replies; host-side rejection with reasons
- [ ] 1.3 Broadcast path: host-initiated actions push responses to the guest; seq numbering + gap detection with snapshot resync
- [ ] 1.4 Tests: two in-process sessions over a loopback pipe play a scripted match; out-of-turn rejection; gap→resync; opponent-owned decision routing

## 2. WebRTC transport

- [ ] 2.1 `Signaler` interface + manual copy-paste implementation (compressed SDP offer/answer codes); WebRTC data channel transport with public STUN
- [ ] 2.2 Hello exchange: protocol version, team payloads, host seed; version-mismatch abort
- [ ] 2.3 Heartbeat + disconnect detection; rejoin flow re-pairing into the same `HostSession` with snapshot resync

## 3. UI

- [ ] 3.1 Host/Join lobby page: create offer code, paste answer code (and the joiner mirror), connection status, error surfaces
- [ ] 3.2 Input gating: HUD + `GameplayInteractionController` consult the ownership gate; waiting overlay naming whose action/decision is awaited
- [ ] 3.3 Live spectate rendering on the guest: events/snapshots animate the opponent's actions (reuse existing event-driven rendering)
- [ ] 3.4 Abandon/forfeit: grace-period prompt and clean match end

## 4. Resilience & wrap-up

- [ ] 4.1 Interval snapshot to localStorage both sides; document (or implement, stretch) restore-and-rehost from guest snapshot
- [ ] 4.2 Two-machine manual test across a real network (document STUN/NAT limitation without TURN)
- [ ] 4.3 Full suite green; single-machine play verified unaffected
