'use strict';
// Seven films are checked through real playback, never by seeking the game clock.
require('./ending-playback-check.cjs').main().catch(error => { console.error(error); process.exitCode = 1; });
