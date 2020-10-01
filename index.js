const functions = require('firebase-functions')
const admin = require('firebase-admin')

const { XeroClient, Invoice, TaxType } = require('xero-node')

const express = require('express')
const cors = require('cors')
const moment = require('moment')

//-------- FIREBASE INIT --------
admin.initializeApp()
let db = admin.database()

//-------- XERO Access Id and refresh token --------
const app = express()
app.use(cors())

let x_client_id = functions.config().xero.client_id
let x_client_sectet = functions.config().xero.client_secret

const xero = new XeroClient({
  clientId: x_client_id,
  clientSecret: x_client_sectet,
  //use localhost if developing with emulators and add the myapp uri list
  redirectUris: ['https://us-central1-yourfirebaseapp.cloudfunctions.net/xeroInit/callback'],
  scopes: ['openid', 'profile', 'email', 'accounting.transactions', 'accounting.settings', 'offline_access'],
  httpTimeout: 3000
})

const connect = () =>
  new Promise(async (res, rej) => {
    let snapshot = await db.ref('xero-config').once('value')
    let tokenSet = snapshot.val()
    try {
      xero.initialize()
      const newTokenSet = await xero.refreshWithRefreshToken(x_client_id, x_client_sectet, tokenSet.refresh_token)
      db.ref('xero-config').set(newTokenSet)
      xero.setTokenSet(newTokenSet)
      res()
    } catch (error) {
      rej(error)
    }
  })

app.get('/connect', async (req, res) => {
  try {
    await connect()
    res.send('Connection established, you can use the api now...')
  } catch (error) {
    let consentUrl = await xero.buildConsentUrl()
    res.redirect(consentUrl) //sends you to login to xero
  }
})

app.get('/callback', async (req, res) => {
  let TokenSet = await xero.apiCallback(req.url)
  db.ref('xero-config').set(TokenSet)
  res.send('Token updated 🎉')
})

exports.xeroInit = functions.https.onRequest(app)

//-------- XERO FUNCTIONS & TRIGGERS --------

exports.xeroTenants = functions.https.onRequest(async (req, res) => {
  await connect()
  await xero.updateTenants()
  res.json(xero.tenants)
})

exports.xeroCreateInvoices = functions.database.ref('/invoices/{pushId}/posted').onCreate(async (snapshot, context) => {
  const data = snapshot.val()
  await connect()
  let invoices = {
    //xero-node Invoices modules didnt work for some reason... this does however.
    invoices: [
      {
        type: Invoice.TypeEnum.ACCPAY,
        contact: { contactID: data.contactId },
        lineAmountTypes: 'Inclusive',
        lineItems: [
          {
            description: 'Portal invoice system',
            accountCode: '000',
            taxType: TaxType.INPUT,
            lineAmount: data.ammount
          }
        ],
        date: data.invoiceDate,
        dueDate: moment(data.invoiceDate).add(1, 'month').endOf('month').format('YYYY-MM-DD'), //end of next month
        reference: 'Firebase function',
        status: Invoice.StatusEnum.DRAFT
      }
    ]
  }
  try {
    const response = await xero.accountingApi.createInvoices(simconTenantId, invoices)
    //addes the invoice id to the db for reference if you want to update or delete from your app
    //As seen in xeroDeleteInvoice
    return snapshot.ref.child('xeroInvoiceId').set(response.body.invoices[0].invoiceID)
  } catch (err) {
    logError(err)
    return snapshot.ref.remove()
  }
})

exports.xeroDeleteInvoice = functions.database.ref('/invoices/{pushId}/posted').onDelete(async (snapshot, context) => {
  const data = snapshot.val()
  if (data.xeroInvoiceId) {
    await connect()
    try {
      await xero.accountingApi.updateInvoice(simconTenantId, data.xeroInvoiceId, {
        invoices: [{ status: Invoice.StatusEnum.DELETED }]
      })
    } catch (err) {
      logError(err)
    }
  }
})

const logError = (err) => {
  console.log(`There was an ERROR! \n Status Code: ${err.response.statusCode}.`)
  console.log(`ERROR: \n ${JSON.stringify(err.response.body, null, 2)}`)
}
