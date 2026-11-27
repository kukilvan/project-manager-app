// google-auth-library for the job-script harness: a token that the stubbed fetch never checks.
export class GoogleAuth { async getAccessToken() { return 'stub-token'; } }
