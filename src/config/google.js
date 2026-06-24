const { OAuth2Client } = require('google-auth-library');

function getGoogleWebClientId() {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!id) {
    throw new Error('GOOGLE_CLIENT_ID is required in environment variables');
  }
  return id;
}

function getGoogleAudiences() {
  const audiences = [getGoogleWebClientId()];
  const androidId = process.env.GOOGLE_ANDROID_CLIENT_ID?.trim();
  if (androidId) audiences.push(androidId);
  return audiences;
}

let _googleClient;

function getGoogleClient() {
  if (!_googleClient) {
    _googleClient = new OAuth2Client(getGoogleWebClientId());
  }
  return _googleClient;
}

module.exports = {
  getGoogleWebClientId,
  getGoogleAudiences,
  getGoogleClient,
};
