// Message vocabulary shared by content ⇄ background. Data only.

export const MSG = {
  // background → content (session control)
  START: 'cc:start',
  CLOSE: 'cc:close',
  // content → background: open the voice-command reference from the in-page dropdown
  // button (Settings is an in-page modal now, so it needs no worker round-trip).
  OPEN_HELP: 'cc:open-help',
  // debugging via the service-worker console (MT-01; no user-facing UI)
  PING: 'cc:ping',
  SNAPSHOT: 'cc:snapshot',
  PROBE: 'cc:probe',
  // content ⇄ background port: session registration + chrome.tts relay
  SESSION_PORT: 'cc-session',
  SPEAK: 'cc:speak',
  SPEAK_DONE: 'cc:speak-done',
  TTS_CANCEL: 'cc:tts-cancel',
};
