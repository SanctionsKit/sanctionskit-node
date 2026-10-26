const sdk = require('sanctionskit');
const exercise = require('./exercise.cjs');

exercise(sdk, sdk.default).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
