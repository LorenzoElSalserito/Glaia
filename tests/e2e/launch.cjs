// Test-only entry: keep documents, provider sessions and logs away from real data.
const { app } = require('electron')
const path = require('node:path')
app.setPath('documents', process.env.GLAIA_TEST_DIR)
app.setPath('userData', path.join(process.env.GLAIA_TEST_DIR, 'profile'))
require(process.env.GLAIA_TEST_MAIN)
