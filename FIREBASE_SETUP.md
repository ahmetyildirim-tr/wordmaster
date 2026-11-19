# WordMaster 3.0 Firebase setup

1. Create a **separate** Firebase project for WordMaster at https://console.firebase.google.com/.
2. Register a Web app. Copy its public firebaseConfig fields into `firebase-config.js` as `window.WORDMASTER_FIREBASE_CONFIG = {apiKey:"...",authDomain:"...",projectId:"...",appId:"..."};`.
3. In Authentication > Sign-in method, enable Email/Password.
4. Create a Cloud Firestore database, then paste the contents of `firestore.rules` into Firestore > Rules and publish.
5. In Authentication > Settings > Authorized domains, add `ahmetyildirim-tr.github.io` if it is not already listed.
6. Open https://ahmetyildirim-tr.github.io/wordmaster/ and use the Topluluk tab.

## Data and security
- Existing `wordmaster-v1` localStorage data is not migrated or cleared.
- Published lists contain only category, title, author alias and word translations/examples, never review history.
- Copies are independent; the original publisher cannot modify imported copies.
- Publishing is opt-in. A published snapshot is immutable under the provided rules.
- Anonymous users can browse and copy; authenticated users can publish.
- Firebase's client-side API key is not a secret. Never put a service-account private key in the repo.
- Before going live, test security rules in the Firebase Rules Playground and review Firestore billing/quotas.
