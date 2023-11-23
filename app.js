import dotenv from 'dotenv'
import fs from 'fs'
import http from 'http'
import { Octokit, App } from 'octokit'
import { createNodeMiddleware } from '@octokit/webhooks'

// Load environment variables from .env file
dotenv.config()

const appId = process.env.APP_ID
const privateKeyPath = process.env.PRIVATE_KEY_PATH
const privateKey = fs.readFileSync(privateKeyPath, 'utf8')
const secret = process.env.WEBHOOK_SECRET
const enterpriseHostname = process.env.ENTERPRISE_HOSTNAME

const app = new App({
  appId,
  privateKey,
  webhooks: {
    secret
  },
})

// Optional: Get & log the authenticated app's name
const { data } = await app.octokit.request('/app')

// Read more about custom logging: https://github.com/octokit/core.js#logging
console.log(`Authenticated as '${data.name}'`)

// Subscribe to the "pull_request.opened" webhook event
app.webhooks.on(['pull_request.opened','pull_request.reopened','pull_request.ready_for_review'], async ({ octokit, payload }) => {
  console.log(`Received a pull request event for #${payload.pull_request.number}`)
  try {
    const {data} = await octokit.rest.actions.listRepoWorkflows({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
    });
    // loop through array of workflows we got
    for (var i =0; i<data.workflows.length;i++){
      //check if disabled manually
      if(data.workflows[i].state == 'disabled_manually'){
        // send a request to enable them
        await octokit.rest.actions.enableWorkflow({
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          workflow_id: data.workflows[i].id
        });
        // create a comment to make sure they know the workflow was disabled by a user and then enabled by app 
        await octokit.rest.issues.createComment({
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          issue_number: payload.pull_request.number,
          body: `Disabled workflow ${data.workflows[i].name} was enabled, don't mess with workflows you bastards!`
        });
        console.log(`Disabled workflow ${data.workflows[i].name} was enabled`)
      }
    }
  } catch (error) {
    if (error.response) {
      console.error(`Error! Status: ${error.response.status}. Message: ${error.response.data.message}`)
    } else {
      console.error(error)
    }
  }
})

app.webhooks.onError((error) => {
  if (error.name === 'AggregateError') {
    console.log(`Error processing request: ${error.event}`)
  } else {
    console.log(error)
  }
})

const port = process.env.PORT || 3000
const path = '/api/webhook'
const localWebhookUrl = `http://127.0.0.1:${port}${path}`

const middleware = createNodeMiddleware(app.webhooks, { path })

http.createServer(middleware).listen(port, () => {
  console.log(`Server is listening for events at: ${localWebhookUrl}`)
  console.log('Press Ctrl + C to quit.')
})
