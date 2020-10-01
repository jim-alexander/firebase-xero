# firebase-xero

Just sharing my configuration for connecting firebase functions and xero-nodes OAuth 2.0 api

Wasn't as simple as just using a firebase https function as the call back because firebase silos its functions.

- Create your app in xeros developer dashboard

- Add your firebase xeroInit file to xeros redirectUri list in the developer dashboard: it should look like this `https://us-central1-yourfirebaseapp.cloudfunctions.net/xeroInit/callback`

- Set your config varaibles in firebase being your client id and client secret.

- Call your xeroInit connect function by going to this url for example `https://us-central1-yourfirebaseapp.cloudfunctions.net/xeroInit/connect`

- Once redirected and received the token updated message you can start using other firebase functions that call xero
  Just ensure you call await connect() first 
  You could keep using express to trigger functions if you wanted but that wouldnt be uniquly firebase so see my trigger example
  
 For example go to `https://us-central1-xero-example.cloudfunctions.net/xeroTenants` and you should see your organisation
 
 I have made an invoicing example that is caused by a realtime db trigger that creates and invoice in xero and saves the id for future reference
