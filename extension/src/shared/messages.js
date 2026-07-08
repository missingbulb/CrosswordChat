// Message vocabulary shared by content ⇄ background. Data only.

export const MSG = {
  // background → content (session control)
  START: 'cc:start',
  CLOSE: 'cc:close',
  // content → background: open an extension page from the in-page dropdown button
  OPEN_SETTINGS: 'cc:open-settings',
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
