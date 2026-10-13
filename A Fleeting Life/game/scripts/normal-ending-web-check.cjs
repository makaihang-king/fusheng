'use strict';
require('./ending-playback-check.cjs').main({ ids: ['morning', 'desk'] }).catch(error => { console.error(error); process.exitCode = 1; });
