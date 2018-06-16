# Email VCS

Keep Mandrill Templates in sync with a Github repo.

[![Build Status](https://travis-ci.com/coalharbourgroup/email-vcs.svg?token=5Any4pn1qkqcCmAtwrBa&branch=master)](https://travis-ci.com/coalharbourgroup/email-vcs)


## Requirements

Node >= v8.10.0


## Install

Create a template repo, see [https://github.com/coalharbourgroup/email-vcs-templates](https://github.com/coalharbourgroup/email-vcs-templates) for an example.

Copy `.env.default` to `.env` and set your config variables for use during testing and for the import script.

If needed, import your published templates from Mandrill to your local template repo with

```bash
node importInitialTemplatesFromMandrill.js
```

Structure and commit those templates as needed.  Directories are squashed into filenames with a dash as the separator when uploaded to Mandrill.  For example, "saas/onboarding/welcome.md" uploads to Mandrill as "saas-onboarding-welcome".  Dashes are supported in filenames as well, conflict will trigger a notification email.



## Setup
1. Create ZIP file

    * Clone repo locally
    * Run "npm install" from the command line of the project dir root
    * Run "zip -r emailVcs.zip index.js node_modules" from the command line to create the zip file for AWS Lambda


2. Create new AWS API Gateway

    * Create a "New API"
    * Enter the name of your API
    * Create API

![AWS API Gateway Setup 1](/docs/img/awsApiGatewaySetupOne.png?raw=true "AWS API Gateway Setup 1")


3. Create a [https://console.aws.amazon.com/lambda/home?region=us-east-1#/create](new AWS Lambda function).

    * Choose Author From Scratch
    * Enter the name of your function
    * Choose Node >= v8.x Runtime
    * Choose an Existing IAM Role or create a New Role from the "Basic Edge Lambda permissions"
    * Save the Lambda

![AWS Lambda Setup 1](/docs/img/awsLambdaSetupOne.png?raw=true "AWS Lambda Setup 1")


4. Finish API Gateway setup

    * Select Actions -> Create Method -> POST
    * Select Lambda Function
    * Select Use Lambda Proxy integration
    * Enter Lambda Function name
    * Save
    * Approve Permission
    * Select Resouces -> Actions -> Deploy API
    * Select a stage or create a new stage
    * Save
    * Copy the Invoke URL for later use

![AWS API Gateway Setup 2](/docs/img/awsApiGatewaySetupTwo.png?raw=true "AWS API Gateway Setup 2")

![AWS API Gateway Setup 3](/docs/img/awsApiGatewaySetupThree.png?raw=true "AWS API Gateway Setup 3")


5. Setup the Lambda trigger

    * Click your Lambda function name
    * Add API Gateway as a new trigger
    * Select the newly created API Gateway from the list
    * Select Deployment Stage
    * Set Security as Open (we'll verify the Github secret before processing) or select your preferred security mechanism
    * Add

![AWS Lambda Trigger Setup](/docs/img/awsLambdaTriggerSetup.png?raw=true "AWS Lambda Trigger Setup")


6. Setup the Lambda function

    * Click your function name
    * Select Upload a .ZIP File
    * Select to upload the emailVcs.zip file created in step 1
    * Set configuration variables (quotes are not needed in AWS fields):
        * DEBUG = true
        * LOCAL_TEMPLATE_DIR_PATH = '../email-vcs-templates/'
        * GITHUB_TEMPLATE_REPO = 'email-vcs-templates'
        * GITHUB_OWNER = 'coalharbourgroup'
        * GITHUB_SYNC_BRANCH = 'master'
        * GITHUB_API_TOKEN = 'yourGithubApiToken'
        * GITHUB_WEBHOOK_SECRET = 'uniqueSecretForGithubVerification'
        * MANDRILL_API_KEY = 'yourMandrillApiKey'
        * MANDRILL_DEFAULT_FROM_EMAIL = 'support@parkingmobility.com'
        * MANDRILL_DEFAULT_FROM_NAME = 'Parking Mobility'
        * NOTIFY_EMAILS = 'notifyme@domain.com'
    * Increase the timeout to 1 min, 0 sec
    * Click Save

![AWS Lambda Setup 2](/docs/img/awsLambdaSetupTwo.png?raw=true "AWS Lambda Setup 3")


7. Create Github Webhook

    * Enter the API Gateway Invoke URL from Step 4
    * Select Content Type of application/json
    * Enter Secret as the GITHUB_WEBHOOK_SECRET from your Lambda configuration variables
    * Select Send Me Everything
    * Select Active
    * Add Webhook

![Github Webhook Setup](/docs/img/githubWebhookSetup.png?raw=true "Github Webhook Setup")


8. Done
