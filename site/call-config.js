/* TheStarth — settings of the built-in video call (lesson-call.js).
 *
 * The call is peer-to-peer (WebRTC): video goes directly between participants, signalling goes through Firestore.
 * STUN (below) is free and is enough for most home networks. For strict networks (some mobile operators, corporate
 * Wi-Fi) add a TURN relay: create a free/paid account at e.g. Metered.ca, Cloudflare Calls TURN or Twilio and put the
 * credentials in TURN_SERVERS. Without TURN ~10-20% of connections may fail; with it - almost none.
 *
 *   TURN_SERVERS = [{ urls: ['turn:YOUR_HOST:443?transport=tcp', 'turns:YOUR_HOST:443?transport=tcp'], username: '…', credential: '…' }];
 */
window.STARTH_CALL_CONFIG = {
    STUN_SERVERS: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }],
    TURN_SERVERS: [],
    MAX_COMFORTABLE: 6          // above this many people a warning suggests the backup mode (Jitsi)
};
