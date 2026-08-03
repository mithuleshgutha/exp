const serverless = require("serverless-http");
const app = require("../../server");

// The Excel export route streams a binary .xlsx — without this, Netlify
// treats the response body as UTF-8 text and corrupts the file.
module.exports.handler = serverless(app, {
    binary: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]
});
